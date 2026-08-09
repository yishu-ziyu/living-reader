# The Living Reader v2

这是一个可验收的《国富论》阅读 + 语音 + 世界生长原型。它只在本目录内工作，不修改旧的 `living-ledger-shell`。

## 一键启动

在仓库根目录执行：

```bash
python3 -m http.server 4177
```

打开：<http://127.0.0.1:4177/prototypes/living-reader-v2/?variant=B>

停止服务器：在终端按 `Ctrl-C`。

## 验收路径

1. 默认 `variant=B`：页面会用本地 vendored PDF.js 读取 `assets/public-domain/wealth-of-nations-cannan-vol1.pdf`，实际绘制 PDF page 36（Book I Ch. I 分工）与 page 45（Book I Ch. III 市场范围）；如果 PDF 尚未放入仓库，页面会明确显示缺失分支，不会用手写摘录冒充原文。
2. 在左侧选择 `PDF page 36 · 分工`，点真实麦克风按钮。浏览器支持时会请求 `getUserMedia`、启动 `SpeechRecognition`/`webkitSpeechRecognition` 与 `MediaRecorder`；拒绝权限或不支持时仍可继续。
3. 为了稳定验收，可点 `Replay voice`：它会把一段已记录的转写作为 Idea 锚定到当前 PDF 段落。切换到 PDF page 45，再点一次 Replay voice。
4. 两条 Idea 出现后，Agent 提议 `constrained_by` 关系；确认关系，再点击“已经可以玩了”。世界块会在两段 PDF 视觉之间展开。
5. 在“粗呢外套小镇”中对比“小市场：每人兼做多工序”和“扩大市场：专业化”，观察切换损耗、产出和积压；再点“回到两段原文”，结果会回到两个 PDF 锚点。
6. 切换 `?variant=A`、`?variant=B`、`?variant=C` 对照布局：A 是旁注覆盖，B 是阅读器内上下分段插入，C 是展开式书页 spread。

## Agent OS MVP 纵切

- `agent-os.js` 是无 DOM、无网络的 deterministic fixture adapter；它只返回结构化意图、来源证据、可修订 `BookThought`、allowlist 动作和确定性 WorldEvent/CharacterObservation。
- 左侧 Agent OS 面板接收同一条文字、Replay voice 或真实麦克风 final transcript。可以问“分工会让人更熟练吗？”，修订/接受/拒绝 Thought；世界动作只能映射 `deepen_specialization`、`expand_market`、`constrain_market`。
- `window.__livingReader` 仅是原型测试 surface（用于浏览器验收 hooks），不是生产授权边界、后端 EventStore 或真实 LLM 接入。
- 小市场下“让织工进一步专业化”只产生拒绝观察，不改经济数值；“修路，把货卖到隔壁城”按 merchant → shepherd → spinner → weaver 产生局部状态观察。
- “我今天只想摸鱼，不想看经济学”只给一条软回引；选择“先停一下”后不再邀请，并保留“继续入口”。播报使用用户点击触发的 `speechSynthesis`，停止按钮会立即取消输入和输出。

纯函数合同测试（不需要安装依赖）：

```bash
cd prototypes/living-reader-v2
node --test agent-os.test.mjs
node --check app.js
node --check agent-os.js
```

## 资源边界

- 原文只来自 `assets/public-domain/wealth-of-nations-cannan-vol1.pdf`，不在 HTML 中复制原文作为阅读画面。
- 角色主资产固定为 `assets/art/characters/{shepherd,spinner,weaver,merchant}.png`；主视觉只使用这四张独立角色 PNG，不把场景关键帧当作世界主画面。PNG 加载后会替换轮廓占位；若资源缺失，页面只显示明确标注的加载失败占位，不能作为最终艺术资产验收。
- 世界数字是确定性模型扩展，页面明确标注 `MODEL EXTENSION`；不是 Smith 原文中的实验，也不是现代经济预测。
- 语音默认不自动播放；真实麦克风、Replay voice 和文字路径彼此独立。

## 浏览器提示

- 麦克风需要用户点击并通常要求 `localhost`/HTTPS。Safari 可能没有 SpeechRecognition，但仍可验证权限和 MediaRecorder 分支。
- PDF.js ESM 与 worker 已固定 vendored 在 `vendor/pdfjs/`（4.10.38，Apache-2.0），启动后断网仍可渲染本地 PDF。只有本地加载失败时才显示实际 PDF 的内嵌 fallback，并把原因显示在“PDF 状态”处。
