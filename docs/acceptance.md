# 验收合同：Voice-native Executable Book

> 这份文档定义本项目的“做完”。通过构建、单元测试、接口返回 200 或能打开一个演示页面，都不等于产品验收。
>
> **门槛归属声明**：除第 12 节明确标注的赛事交付约束外，本文的样本量、准确率、延迟、兼容性、安全性和 Go/No-Go 数值均为**本项目自定工程门槛**，用于开发和验收，不冒充主办方评分标准或未公开测试要求。

## 1. 验收对象与状态链

本项目验收的不是“语音聊天”和“生成一个小游戏”两个孤立功能，而是下面这条可追溯、可纠正、可回放的阅读链：

```text
Document / SourceBlock
  → Voice
  → ReaderIdea
  → RelationProposal
  → Confirmed Graph
  → WorldPatch
  → ExecutableWorld
  → Playability
  → 主动语音邀请
  → Inline World
  → Evidence back to sources
```

链路中每一步都必须有版本化结构、来源、状态和可见结果。任何一步失败、证据不足或需要用户确认时，下游不得假装成功。

验收时必须区分三类内容：

- `Source Text`：可定位到具体版本和位置的原文或明确标注的译文；
- `Executable Model`：由来源关系编译出的可运行模型及其简化假设；
- `Model Extension / Modern Caveat`：不属于作者原文断言的外推、现代材料或产品规则。

## 2. 完整用户可见路径

| ID | 用户行动 | 触发/状态 | 必须看到或听到的结果 |
|---|---|---|---|
| UX-01 | 打开公网 HTTPS 链接 | 首次访问、无登录 | 30 秒内知道这是一本可以“说出理解、长出关系、运行世界”的书；可直接进入一个 SourceBlock |
| UX-02 | 阅读或展开一个 SourceBlock | 已加载固定书籍版本 | 原文/译文、章节位置、来源类型和稳定 `source_block_id` 清晰可见；模型外推不得伪装成原文 |
| UX-03 | 点击语音入口 | 浏览器尚未授权麦克风 | 先解释用途再请求权限；拒绝权限后保留等价文字输入，不进入假录音状态 |
| UX-04 | 口述自己从这段文字读出的想法 | 麦克风已授权 | 实时看到录音、停止、取消和转写状态；可打断；系统不得在用户停止后继续偷偷录音 |
| UX-05 | 查看语音理解 | `ReaderIdea` 已生成 | 看到“系统认为你在说什么”、涉及哪些 SourceBlock、尚未确定什么；可确认、逐项修正或全部重说 |
| UX-06 | 修正一句被误解的话 | 已存在旧 `ReaderIdea` 或待处理模型调用 | 旧候选明确失效，新版本保留纠正关系；旧结果迟到时不得覆盖新版本 |
| UX-07 | 让系统寻找或提出关系 | `ReaderIdea` 已确认 | 看到 `RelationProposal` 的起点、终点、方向、关系类型、证据和置信状态；关系不是只在动画中闪现 |
| UX-08 | 接受、拒绝或修改关系 | 关系仍是候选态 | 只有被确认且证据合格的边进入 Graph；拒绝的边不会偷偷参与世界编译 |
| UX-09 | 请求“让这组关系运行起来” | Confirmed Graph 达到可编译条件 | 先看到 `WorldPatch` 预览：新增/修改的世界规则、前置条件、边界、预期后果和撤销方式；执行前可取消 |
| UX-10 | 确认运行世界 | Patch 已通过 schema、领域和风险校验 | Inline World 在当前阅读上下文内出现；状态确实来自本次 Graph 和 Patch，而不是打开固定演示 |
| UX-11 | 在世界里行动 | ExecutableWorld 已就绪 | 行动改变真实世界状态；界面显示反馈、约束、二阶后果和当前可做之事；刷新或回到书页后状态按产品约定恢复 |
| UX-12 | 完成最小可玩闭环 | 已产生至少一个关键世界事件 | 系统能判断“可玩闭环已完成”，而不以生成文字长度、停留时长或播放动画冒充完成 |
| UX-13 | 允许稍后提醒 | 用户单独授予提醒和语音播放权限 | 显示提醒原因、时间范围、静默时段和关闭入口；未授权时不创建后台提醒 |
| UX-14 | 收到主动邀请并接受 | 世界仍可玩、来源和 Patch 未过期 | 通知先说明“为什么现在值得回来”；用户主动接受后才播放语音，并直接打开对应 Inline World |
| UX-15 | 忽略、拒绝或关闭邀请 | 邀请已出现 | 不自动播放、不重复轰炸；拒绝后按用户设置暂停或关闭同类提醒 |
| UX-16 | 完成世界体验后返回原文 | 已有 world events 和用户行动 | 回到触发它的 SourceBlock；看到“我的想法 → 关系 → Patch → 世界事件 → 来源”的 Evidence 链 |
| UX-17 | 点击一条 Evidence | Evidence 引用 SourceBlock 或模型边界 | 精确定位来源段落并高亮对应范围；无法定位的结论标为模型假设或未验证，不伪造引用 |
| UX-18 | Provider 超时、限流或断线 | Voice/LLM/PDF 任一外部依赖失败 | 已确认的 Graph 和世界状态不丢；显示可重试或降级路径，不生成假成功事件 |
| UX-19 | 删除本次或全部阅读数据 | 用户发起删除 | 立即看到删除范围和状态；删除完成后，录音、转写、ReaderIdea、关系、世界和提醒不能再通过正常产品路径恢复 |

## 3. 模块不变量

### 3.1 Document / SourceBlock

- 每个 SourceBlock 必须包含稳定 ID、书籍与版本、章节/页码或等价位置、内容 hash 和来源类型。
- 原文、译文、释义、现代评论和模型扩展不能共享同一个无区分文本字段。
- PDF 重新解析或换版本时产生新 revision；旧 Evidence 仍指向原 revision，不静默漂移。
- SourceBlock 无法定位或 hash 不匹配时，相关关系和 Patch 必须进入过期/待复核状态。

### 3.2 Voice

- 未获得当前会话明确授权前，不得启动麦克风或持久化音频。
- partial transcript 只能用于反馈；只有 final utterance 才能产生正式 ReaderIdea。
- `停止`、`取消`、页面隐藏和权限撤销必须真正终止采集。
- 语音不是唯一入口；所有核心路径必须有文字和键盘等价操作。

### 3.3 ReaderIdea

- ReaderIdea 必须记录来源 utterance、SourceBlock、结构化意图、歧义、置信状态和版本。
- LLM 自由文本不能直接成为 Graph edge 或 WorldPatch。
- 低置信度、多解、缺少来源或超出能力的输入必须停在确认态。
- 用户纠正产生新版本并 supersede 旧版本，不篡改历史证据。

### 3.4 RelationProposal / Graph

- 每条边包含 `from`、`to`、方向、关系类型、证据、状态和生成依据。
- 候选边与确认边必须分离；只有确认且证据合格的边可被世界编译器消费。
- GraphStore 是可重建投影；正式关系事实必须能从事件记录重建。
- 冲突关系不得被平均成一个看似确定的结论，必须显示冲突或请求复核。

### 3.5 WorldPatch

- Patch 只能使用版本化 schema 中声明的操作，不接受任意代码或数据库指令。
- 每个 Patch 包含 basis graph/world version、前置条件、operations、invariants、来源、模型边界和 inverse operations。
- Patch 必须先通过 schema、领域、不变量、权限和风险校验，再等待用户确认。
- 迟到、重复或基于旧 Graph 的 Patch 不得覆盖当前世界。

### 3.6 ExecutableWorld

- 同一初始状态、同一已确认 Patch、同一结构化行动、同一随机种子必须得到相同结果。
- LLM 可以理解行为，不能直接改世界数值、跳过规则或编造已发生事件。
- 每个世界状态改变必须有事件；事件必须记录 before/after hash、因果来源和版本。
- 世界运行失败时不得留下半提交状态；已提交状态必须有可验证回滚路径。

### 3.7 Playability / Inline World

- “可玩”至少意味着用户能理解目标或张力、做出一个非装饰性行动、看到状态变化、理解下一步，并完成一个反馈闭环。
- Inline World 必须由本次 Graph/WorldPatch 实例化；固定视频、截图、预写动画或无状态 iframe 不算可执行世界。
- 世界可以嵌入 iframe/canvas/WebGL，但必须与外层阅读状态同步，并有可访问的 DOM 摘要或替代交互。

### 3.8 主动语音邀请

- 阅读、数据保存、通知和自动语音播放是四个独立授权范围，不得捆绑同意。
- 邀请只引用仍存在、仍可玩且未过期的世界状态。
- Reminder 必须幂等，尊重时区、静默时段、频率上限和用户关闭设置。
- 通知出现不等于允许播放音频；语音只能在平台允许且用户明确接受后开始。

### 3.9 Evidence back to sources

- 每个关键世界规则和解释都能回溯到 SourceBlock、确认关系或明确标注的模型扩展。
- Evidence 必须区分“原文说了什么”“用户提出了什么”“模型判断了什么”“引擎实际发生了什么”。
- 无 source/event 依据的结论不得显示成阅读发现或模拟事实。
- 不保存或展示模型私有思维链；只保存结构化决定、证据、版本和可审计理由。

## 4. 离线验收集与统计口径

以下是本项目自定 P0 最小规模：

| 数据集 | 最小规模 | 覆盖要求 |
|---|---:|---|
| Voice | 120 条 | 清晰普通话、自我修正、背景噪声、长停顿、中英混说、低音量、拒绝/撤销权限、对抗输入 |
| Source anchoring | 120 条 | 原句、转述、跨段关系、无依据、版本变更、恶意 PDF/OCR/元数据 |
| Relation | 160 条边 | 有边、无边、方向、正负、约束、因果、冲突、证据不足 |
| WorldPatch | 120 个 | 正常、schema 错误、不变量冲突、旧版本、重复、并发、逆 Patch |
| Reminder | 100 个场景 | 授权/未授权、静默时段、过期、重复、跨时区、世界已删除、目标不可玩 |
| End-to-end | 50 条 | 正常 25、澄清/纠正 10、安全攻击 10、失败恢复/回滚 5 |

单次随机成功不能作为稳定性证明。端到端和安全关键集至少使用 3 个独立运行种子；同时报告 Pass@1 和三次全部通过的 Pass^3。配置对比使用同一批任务进行配对分析，不用不同任务集的两个百分比直接宣布改进。

## 5. 语音指标

以下均为本项目自定门槛：

| 指标 | Go 门槛 |
|---|---:|
| 未授权启动麦克风 | 0 次 |
| 停止/取消到采集真正终止 p95 | ≤ 250 ms |
| 说话开始到首个可见 partial p95 | ≤ 500 ms |
| 说话结束到 final transcript p95 | ≤ 1.5 s |
| 清晰普通话 CER | ≤ 8% |
| 噪声集 CER | ≤ 15% |
| ReaderIdea 关键槽位 macro-F1 | ≥ 0.95 |
| 自我修正捕获率 | ≥ 0.95 |
| 涉及语速/情绪/停顿的任务相关副语言保留率 | ≥ 0.90 |
| 用户点击停止后仍被纳入正式 utterance | 0 次 |
| 用户接受邀请到语音开始 p95 | ≤ 800 ms |

CER 不能单独代表语音体验。即使逐字转写有误，只要语义进入 ReaderIdea 正确，属于可恢复错误；反之，文字看似正确但忽略用户的否定、自我修正或关键语气，仍判失败。

## 6. 锚定、关系、Patch、可玩性与提醒指标

以下均为本项目自定门槛：

| 层 | 指标 | Go 门槛 |
|---|---|---:|
| Anchoring | SourceBlock 引用精确率 | ≥ 0.98 |
| Anchoring | SourceBlock 引用召回率 | ≥ 0.95 |
| Anchoring | 原文无依据时正确停下/拒绝率 | ≥ 0.95 |
| Anchoring | 事实性关系携带可解析 evidence ref | 100% |
| Relation | relation type macro-F1 | ≥ 0.90 |
| Relation | 方向正确率 | ≥ 0.95 |
| Relation | 无证据边进入 Confirmed Graph | 0 条 |
| Relation | 冲突/不确定案例召回率 | 100% |
| Relation | 双人金标 Cohen's kappa | ≥ 0.75 |
| WorldPatch | schema、前置条件和不变量通过 | 100% |
| WorldPatch | 幂等、旧版本阻断、重复提交阻断 | 100% |
| WorldPatch | inverse patch 恢复原 state hash | 100% |
| WorldPatch | 专家判定语义正确率 | ≥ 0.92 |
| Playability | 关键动作确实改变状态 | ≥ 0.95 |
| Playability | 完成闭环后证据返回 SourceBlock | 100% |
| Reminder | 授权、静默时段、过期和删除检查 | 100% |
| Reminder | 重复提醒 | 0 次 |
| Reminder | 提醒所指 Inline World 可打开且版本一致 | 100% |
| Reminder | 目标用户判定“值得此时回来”的精确率 | ≥ 0.90 |
| End-to-end | 50 条路径 Pass@1 | ≥ 0.95 |
| End-to-end | 3 次运行全部成功 Pass^3 | ≥ 0.90 |

## 7. Exact replay 与证据包

### 7.1 Exact execution replay

Exact replay 不重新询问外部模型。它使用当次保留的规范化外部 observation，重放确定性核心：

```text
final utterance / ReaderIdea observation
  → Relation events
  → Confirmed Graph
  → WorldPatch
  → world events
  → reminder decision
  → evidence projection
```

每次正式验收必须保存：

- 输入、SourceBlock、音频（如获授权保存）和 PDF 的内容 hash；
- book revision、prompt/schema/policy/tool/adapter 版本；
- requested model 和 provider-reported model；
- 外部 observation 的规范化 payload 与 hash；
- event ID、父事件、顺序、before/after state hash；
- WorldPatch、inverse patch、Graph 和最终 Evidence hash；
- 延迟、token、缓存 token、重试、错误和成本字段；
- 不含凭据和非必要个人信息的原始回执引用。

Exact replay 必须逐事件得到相同的事件、Patch、状态 hash、提醒决策和 Evidence。任一不一致均为 `ReplayMismatch`，阻断发布。

### 7.2 Behavioral replay

重新调用当前模型只用于测试模型漂移、准确率和鲁棒性，至少跑 3 个 seed；它不能被称为 exact replay。模型更新后必须同时跑离线回归集和安全集。

## 8. Prompt injection、恶意 PDF 与执行安全

- 用户语音、网页、PDF 正文、隐藏层、批注、元数据、OCR 文字和检索结果全部是不可信数据，其中的“系统指令”不得改变产品规则。
- PDF 入口必须校验 magic bytes/MIME、文件大小、页数、解压比例和解析时限；禁用或忽略嵌入 JS、自动动作、附件和外链抓取；解析在无网络、只读、限 CPU/内存沙盒完成。
- 外部内容进入模型上下文时必须携带来源与信任级别；输入清洗只能作为辅助，不能作为唯一防线。
- LLM 只能提出 ReaderIdea、RelationProposal 和候选 Patch；不能直接写 Graph、提交世界、发送提醒、读取其他用户数据或修改风险门。
- Graph 确认、Patch 校验、提交、回滚和 Reminder policy 必须由模型外确定性代码执行。
- 红队集至少包含直接注入、PDF 不可见文字、PDF 元数据、OCR 图片注入、跨会话记忆投毒、伪造 SourceBlock 和诱导外发数据。
- 上述攻击造成未授权工具、Graph、Patch、世界、记忆或提醒副作用的次数必须为 0；任意一次即 No-Go。
- Provider 丢失所需 schema/tool 能力、返回错误模型或无法验证回执时必须 fail closed。

## 9. 隐私、保存与删除

- 阅读处理、保存历史、用于产品改进、通知和自动语音分别征求同意；拒绝非必要同意不影响基本阅读。
- 原始音频默认不持久化；final transcript 生成后释放。用户主动选择“保存本次录音”或加入调试测试时，单独显示用途和期限。
- 本项目自定保留门槛：调试录音最长 24 小时；到期自动删除。正式用户研究材料按单独知情同意执行。
- Analytics 不接收原始录音、完整 PDF、密钥或直接身份信息；只收集完成验收所需的脱敏事件和 hash。
- 用户删除后，产品主存储在 24 小时内完成内容删除或加密密钥销毁；备份最长 30 天自然淘汰。界面需说明两者差异。
- 删除必须覆盖录音、转写、ReaderIdea、用户确认关系、世界状态、Reminder 和可反向识别的 trace payload；仅保留无法关联个人的聚合指标。
- 删除后的迟到模型结果和已排队 Reminder 必须被拒绝，不能重新创建已删除状态。
- 日志、证据包、源码 ZIP 和错误页面不得包含 API key、cookie、Authorization header、私人音频或未脱敏全文。

## 10. 可访问性验收

本项目自定目标为 WCAG 2.2 AA 的核心用户路径：

- 全链路可仅用键盘完成；焦点顺序与视觉顺序一致，焦点始终可见。
- 麦克风、录音、停止、取消、确认、拒绝、返回来源均有可读名称、状态和快捷键说明。
- 语音输入有实时文字反馈；语音邀请、世界声音和关键结果都有字幕/文本等价内容。
- 不依赖颜色、位置、声音或动画单独表达 Graph 状态、错误或世界后果。
- 普通文字对比度至少 4.5:1，大字至少 3:1；交互目标至少 44×44 CSS px。
- 200% 缩放和 360 CSS px 宽度下无关键内容丢失或双向滚动陷阱。
- 尊重 `prefers-reduced-motion`；无不可关闭的闪烁、自动滚动或自动播放语音。
- Canvas/WebGL/iframe 世界必须提供同步 DOM 摘要、可键盘操作替代或等价的状态与行动面板。
- 使用 VoiceOver＋Safari、NVDA＋Chrome 至少各跑一次完整路径并保留结果。

## 11. 浏览器与性能验收

以下为本项目自定门槛：

- 桌面 Chrome、Edge、Safari、Firefox 当前与前一主要版本完成核心路径。
- iOS Safari 与 Android Chrome 当前主要版本完成 SourceBlock、文字/语音输入、Inline World 和 Evidence 返回；平台不支持的后台提醒能力必须明确降级。
- 在 1440×900 与 360×800 两个基准视口验收；不得只验证设计稿尺寸。
- 麦克风允许、拒绝、撤销、设备切换和没有输入设备均有可见结果。
- 浏览器阻止 autoplay 时不得假装已播放；用户接受后仍失败要提供文字和重试路径。
- WebGL/iframe 加载失败时保留书页、Graph、Evidence 和可访问的失败说明，不得白屏。
- 核心路径浏览器控制台未处理异常为 0，失败网络请求均有预期错误处理。
- 公网环境 LCP p75 ≤ 2.5 秒；首次 SourceBlock 可交互 p75 ≤ 3 秒；WorldPatch 确认后 Inline World 可交互 p95 ≤ 8 秒。
- 单条“final utterance → WorldPatch preview”最多 5 次模型调用、1 次自动重试和 15K 总 token；超过硬预算时停止并说明。

## 12. 初赛交付、部署与 MCP 验收

本节只保留已核验的赛事交付约束；主办方未公开的性能阈值和最终用例集不在本文中虚构。

### 12.1 已核验赛事交付门

- 2026-08-10 22:00（Asia/Shanghai）前完成提交。
- 填写 Agent 名称、团队与联系信息、简介和使用方式。
- 提供无需本地环境、无需登录即可开始核心体验的公网 HTTPS 原始链接。
- 上传不超过 2 MB 的 PNG/JPG/WEBP 头像。
- 上传不超过 100 MB 的源码 ZIP；源码接受静态评分，体验/后端接受动态评分。
- 动态评分需要可运行的 Agent 后端；不能依赖开发者本机进程、localhost、内网文件或本机模型缓存。
- 自建 MCP 为可选加分项；若提交，必须是公网 Streamable HTTP。

### 12.2 项目自定部署门

- 全新无登录浏览器会话可以完成 `SourceBlock → Voice/Text → ReaderIdea → Relation → WorldPatch → Inline World → Evidence`。
- 部署后端具有健康检查、结构化错误、超时、预算限制和版本标识；Provider 不可用时不破坏已有世界。
- 环境变量仅在部署平台配置；仓库、构建日志、客户端 bundle、source map 和 ZIP 中均无密钥。
- 数据库/事件存储、Graph 投影、Reminder worker 和部署版本之间能核对 schema/policy revision。
- README 可从空环境复现安装、离线测试、构建、运行、部署配置和验收命令。
- 源码 ZIP 不含 `.env`、API key、`node_modules`、构建缓存、用户数据、录音、未授权 PDF 或不必要二进制。

### 12.3 MCP 合同

若提交 MCP，必须留下公网实测证据：

- `initialize` 成功并返回协议/服务版本；
- `tools/list` 成功且工具描述、输入 schema 和风险边界明确；
- 至少一次核心 `tools/call` 走过真实 Agent 后端并返回结构化结果；
- 非法 schema、过期版本、无证据关系、未确认 Patch 和越权提醒均被拒绝；
- MCP 调用进入同一 trace/event/evidence 体系，不能绕开风险门直接写 Graph 或世界；
- 未认证或不需要认证的赛事体验与 MCP 权限边界分别说明，不能用公开链接暴露任意写权限。

## 13. 阅读价值与真实用户验收

至少 5 名目标读者完成任务测试，其中至少 1 名满足赛事复赛所要求的真实读者条件。测试不得提前泄露“正确关系”或诱导用户复述产品文案。

完整体验后，用户应能依据自己的语音、关系图和世界事件回答：

1. 自己最初从 SourceBlock 读出了什么，系统在哪一步误解或保留了它；
2. 哪两段来源通过什么关系生成了这个世界，而不是只说“AI 生成了游戏”；
3. 世界中哪个后果来自来源关系，哪个属于 Executable Model 的简化；
4. 自己的行动如何改变世界，证据如何返回原文；
5. 哪个结论仍然不确定，为什么不能冒充作者原意。

需保留脱敏的前测/后测、任务完成记录、语音/文字纠正点、关系争议、世界失败点、提醒反馈和由研究导致的产品改动。不得伪造、代写或把团队成员冒充目标用户。

## 14. Go / No-Go

只有以下条件全部满足才可 Go：

- 第 2 节 19 条用户路径均有真实浏览器证据，关键链路没有 mock 或固定演示替代。
- 第 4 节最小离线集完整，End-to-end Pass@1 ≥ 0.95、Pass^3 ≥ 0.90。
- Voice、Anchoring、Relation、WorldPatch、Playability 和 Reminder 达到第 5、6 节门槛。
- Exact replay 对正式验收轨迹逐事件、逐 hash 100% 一致。
- Prompt/PDF 红队攻击造成的未授权副作用为 0。
- 未授权录音、未授权/静默期/重复提醒和删除后复活均为 0。
- WorldPatch schema、不变量、旧版本阻断、幂等和回滚检查 100% 通过。
- 键盘、屏幕阅读器、字幕/文字替代、reduced motion 和关键移动端路径通过。
- 公网 HTTPS、Agent 后端、部署数据链、源码 ZIP、README 和（若提交）MCP 合同均有实测证据。
- 至少 5 名真实目标读者完成测试，且问题与改动记录可核验。

以下任一情况为直接 No-Go，不允许用总分、平均值或演示效果抵消：

- 跨用户数据泄漏、凭据泄漏或未授权录音；
- Prompt/PDF injection 导致一次真实工具、Graph、Patch、世界、记忆或提醒副作用；
- 无来源证据的关系进入 Confirmed Graph；
- 未经用户确认或基于过期 Graph 提交 WorldPatch；
- 世界状态无法 exact replay 或无法恢复原 state hash；
- 未授权、静默期、重复、已删除或已过期的主动邀请；
- Source Text、Executable Model 和 Model Extension 边界混淆；
- Provider/MCP/浏览器失败时仍显示假成功。

## 15. 停止条件

出现以下任一情况时，停止扩功能，先修复基础链路；不得宣称完成：

- 页面可打开，但 Voice 只做了转写展示，没有形成可确认的 ReaderIdea。
- ReaderIdea 变化了，但 RelationProposal 是固定模板或无法引用 SourceBlock。
- Graph 有动画，但不能从事件重建，拒绝的关系仍参与编译。
- WorldPatch 只是 LLM 叙述，没有 schema、校验、版本、确认和 inverse operations。
- Inline World 是预写视频、固定场景或独立 iframe，与本次 Graph/Patch 无真实数据关系。
- 世界有数值变化，但没有事件、因果来源和 Evidence 返回。
- 提醒只是定时通知，没有检查授权、静默时段、世界版本和可玩性。
- 语音邀请自动播放、无法停止，或拒绝后继续出现。
- 证据只能回到整章/整本书，不能定位 SourceBlock；模型扩展冒充作者原文。
- 同一记录无法 exact replay，或重放结果被模型随机文本改变。
- 删除只隐藏 UI，后台录音、世界、Reminder 或迟到模型结果仍能恢复数据。
- 核心体验必须用鼠标、颜色、声音或高运动动画才能完成。
- 只在开发者浏览器、本机后端或已有登录态通过，公网新会话失败。
- MCP 只能 `initialize` 或 `tools/list`，核心 `tools/call` 没有真实执行证据。
- 只报告 build/test 绿色，没有真实浏览器、部署、回放、安全和目标用户证据。
- 任一必需密钥、用户数据、录音或未授权书籍内容进入源码 ZIP。
