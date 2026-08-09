# 阶跃星辰 Realtime 实时语音

## 结论

正式纵切使用 Step Plan 的 `stepaudio-2.5-realtime`，但 API Key 只存在于 Next.js Node 服务端。浏览器不会直连阶跃，也不会收到 Key；它通过同源 HTTP 上传 PCM16 音频，并通过 SSE 接收白名单化的转写与音频事件。

当前运行条件：**Node.js 22.23 或更新的 Node 22 版本、单一常驻 Next.js Node 进程**。代码使用 Node 22 的原生 WebSocket `WebSocketInit.headers` 扩展发出服务端 `Authorization` 请求头，并有真实本地 Upgrade 握手回归测试。当前实现不适合会随请求销毁内存的 serverless 函数，也尚未支持多实例间迁移会话。

## 官方合同

- [Step Plan 语音模型接入](https://platform.stepfun.com/docs/zh/step-plan/integrations/audio-api)
- [双向实时语音事件协议](https://platform.stepfun.com/docs/zh/api-reference/realtime/chat)
- [实时对话开发指南](https://platform.stepfun.com/docs/zh/guides/developer/realtime)
- [官方 Step-Realtime-Console](https://github.com/stepfun-ai/Step-Realtime-Console)

已核对的正式参数：

| 项目 | 值 |
| --- | --- |
| WebSocket | `wss://api.stepfun.com/step_plan/v1/realtime?model=stepaudio-2.5-realtime` |
| 鉴权 | 服务端握手头 `Authorization: Bearer $STEPFUN_API_KEY` |
| 输入 / 输出 | 单声道 PCM16，24 kHz |
| 会话 | `session.update`，显式开启 `turn_detection.type=server_vad` |
| 上行 | `input_audio_buffer.append` |
| 读者最终转写 | `conversation.item.input_audio_transcription.completed` |
| 陪读部分 / 最终转写 | `response.audio_transcript.delta` / `.done` |
| 陪读音频 | `response.audio.delta` / `.done` |

官方协议没有提供读者输入的增量转写事件。因此 UI 在 VAD 开始后显示“正在识别 / 正在完成转写”，收到 `conversation.item.input_audio_transcription.completed` 后显示最终文字；陪读回复则同时显示真正的 partial delta 和 final transcript。没有事件时不会生成占位转写或假成功。

## 本地配置

在 `product/.env.local` 设置服务端变量；不要使用 `NEXT_PUBLIC_` 前缀，也不要把真实值提交到仓库。

```dotenv
STEPFUN_API_KEY=在阶跃开放平台创建的Key
```

启动：

```bash
npm run dev
```

若未配置 Key，`POST /api/voice/session` 返回 `503 voice_not_configured`，界面明确提示继续使用文字提问。

## 用户路径

1. 页面先说明麦克风用途，并显示即将固定的原文锚点。
2. 只有点击“开始实时语音”后才调用 `getUserMedia`。
3. 权限通过后，复制当前 SourceBlock 的 source id、版本、hash、quote 和 PDF 页；服务端再次和书籍源文件核对，随后建立阶跃会话。
4. 收到 `session.created` 和 `session.updated` 之前，界面只显示“正在连接”，不会显示已连接。
5. 浏览器把输入降采样为 24 kHz PCM16，分片发送；界面显示读者最终转写、陪读部分 / 最终转写，并播放陪读 PCM 音频。
6. “取消当前回复”发送 `response.cancel` + `input_audio_buffer.clear`，保留通话；“停止通话”关闭远端会话、SSE、AudioContext 和所有麦克风 track。
7. denied、unsupported、配置缺失、上游错误和连接中断均保留“文字提问”降级入口；失败不会转成语音成功。

同一个读者 `item_id` 只触发一次 `onFinalTurn`。SSE 使用事件序号和 `Last-Event-ID` 恢复显示，同时组件按 provider item id 去重副作用，防止重连造成 Idea / 提问重复提交。

## 安全与部署边界

- Key 只由 `server-registry.ts` 读取，并只写入阶跃 WebSocket Upgrade 请求头；API 响应、SSE、浏览器状态、日志和测试都不包含真实 Key。
- 浏览器只能发送五类白名单事件：append / clear / commit / response.create / response.cancel，不能覆盖 `session.update` 或系统指令。
- 所有同源变更接口和 SSE 都检查 Origin；音频块、会话数、WebSocket buffered amount 和 30 分钟寿命均有限制。
- SourceBlock 不是只信浏览器 JSON：服务端会从正式书籍资源重新加载并逐字段比对快照。
- 会话表只存在当前 Node 进程。部署为多个实例前，需要把同一会话粘到创建它的实例，或替换为受控的常驻 WebSocket relay。
- 麦克风采集当前使用浏览器原生 `ScriptProcessorNode`，这是不新增静态 worklet/依赖的最小兼容实现。它已被 Web Audio 标记为 deprecated；后续若要降低主线程音频抖动，可在独立任务中迁移到 `AudioWorklet`，不改变服务端协议。

## 验证

聚焦测试覆盖：

- 官方事件名及 partial / final / audio 白名单映射；
- PCM16 降采样与 Base64 字节往返；
- SourceBlock 快照字段验证与防漂移比对；
- SSE 重放时读者 final 的 exactly-once 副作用门；
- Node 原生 WebSocket 对真实本地 Upgrade 请求附加 server-only Authorization sentinel。

没有真实 `STEPFUN_API_KEY` 时，可以验证安全边界、协议、构建和未配置降级，但不能声称阶跃云端通话已经验收。正式验收必须使用用户提供的 Key，实际走完：授权麦克风 → 连接成功 → 说一句话 → 看见读者 final → 看见并听见陪读回复 → 取消 → 再说一句 → 停止后麦克风指示消失。
