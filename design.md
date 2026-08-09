# 设计基线：针厂的边界

> 状态：当前项目设计基线（Draft 0.1）  
> 日期：2026-08-09  
> 产品形态：Executable Reading / 鲜活阅读器  
> 首版文本：亚当·斯密《国富论》Book I, Chapters I–III

这份文档回答四个问题：产品要让读者经历什么、界面应该如何呈现、系统允许谁改变什么，以及什么才算完成。它是总设计基线，不替代更详细的产品、架构和验收合同。

## 1. 一句话设计

**不要把一本书变成一个故事，而是把一本书变成一套可以运行的规律。**

读者从原文中的 `SourceBlock` 出发，说出自己的 `ReaderIdea`，确认思想关系；关系经过证据和可玩性审阅后，在同一阅读界面内长出一个受边界约束的世界。读者在世界里行动、看到确定性的后果，再回到触发它的原文和证据。

主体验链：

`SourceBlock → ReaderIdea → RelationProposal → Review/Commit → PlayabilityGate → Inline World → DomainEvent → Evidence → SourceBlock`

## 2. 首版要证明的事情

首版只围绕《国富论》Book I–III 的一条窄问题展开：

- 分工为什么可能提高生产率？
- 交换怎样让分工继续发生？
- 为什么分工受市场范围限制？

核心演示使用两个思想块：

- `smith.b1.c1.division`：分工通过熟练、减少切换和机器提高生产率。
- `smith.b1.c3.market_extent`：市场范围限制分工能够继续细化的程度。

`smith.b1.c2.exchange` 是首版的第三个稳定来源块，用来补足交换语境。PDF 页码（如 36、45）只是显示位置，不能作为永久身份。

## 3. 用户主路径

每一步都必须有用户可见的状态和可恢复的下一步：

1. **进入阅读**：真实书籍原文占主位，显示章节、来源版本和稳定 `source_block_id`；不先弹麦克风授权。
2. **留下想法**：读者用文字或主动语音表达自己的理解。只有 final turn 才能形成 `ReaderIdea`；partial、取消和未确认的转写不写入领域状态。
3. **理解可核对**：读者看到系统理解了什么、依据哪些原文、哪里仍不确定，并可确认、修改或重说。
4. **接通关系**：系统提出带方向、类型、证据和置信状态的 `RelationProposal`。读者可以接受、拒绝、修改或暂缓；候选关系不等于事实。
5. **预览运行**：确认关系后，先展示 `WorldPatch` 的规则、前置条件、预期后果、模型扩展和撤销方式。
6. **世界生长**：只有 `PlayabilityGate` 通过，`Inline World Block` 才从当前原文之间展开。世界不是旁挂游戏，也不是固定视频。
7. **行动与反馈**：读者执行受 allowlist 约束的行动；状态变化、约束、失败原因和二阶后果都可见。读者可以停止、重试或换方案。
8. **回到证据**：世界结束后，按“我的想法 → 关系 → Patch → 世界事件 → 原文”的顺序回放，明确区分来源结论、读者推断和模型简化。

## 4. 不可混淆的内容层

| 层 | 代表对象 | 必须表达的来源 | 不允许做什么 |
|---|---|---|---|
| 书籍 | `BookArtifact` / `SourceBlock` / `SourceAnchor` | 原文版本、稳定语义锚点、可定位证据 | 用页码代替稳定 ID；把释义冒充引文 |
| 读者 | `ReaderIdea` | 读者自己的观察、问题、假设或类比 | Agent 替读者发言或改写成自己的事实 |
| Agent 思考 | `BookThought` | quote / inference / experiment 的类型、证据、置信度和修订记录 | 把推断写成作者原话；保存隐藏思维链 |
| 关系 | `RelationProposal` / `RelationEdge` | 提议与确认状态、方向、类型、证据 | 未经确认就参与世界编译 |
| 模型 | `WorldPatch` / `ModelExtension` | 哪些规则来自来源，哪些是为运行而增加的假设 | 把模型扩展伪装成 Smith 的主张 |
| 世界 | `WorldState` / `DomainEvent` | 确定性规则、版本、种子、事件因果 | 让 LLM 直接写钱、库存、订单或角色状态 |
| 回放 | `EvidenceBlock` / `ReadingTrace` | 用户行动、世界事件、来源和边界 | 只给总结，不给可核对的因果链 |

## 5. 世界的最小边界

首版世界是一间小工坊/针厂，不是宏观经济模拟器，也不是开放世界编辑器。

最小可观察角色为：

`牧羊人 / 原毛 → 纺纱工 / 纱线 → 织工 / 粗呢 → 商人 / 更大的市场`

最小状态包括：市场可触达订单、交换是否开放、运输成本、库存、订单、现金、专业化深度和角色局部状态。首版必须让读者看见“专业化可能提高产出，但市场过小时也可能造成等待、积压、现金压力或断供”。

世界输出是一个有明确简化条件的思想实验，不是现代经济预测。每个关键数字必须来自确定性的 `WorldKernel`，并由 `EventStore` 记录；同一 graph revision、seed、ruleset 和行动序列必须能够 exact replay。

## 6. Agent、语音与权限边界

Agent OS 在用户界面上可以是一段自然回应，但内部职责保持可区分：

- **阅读陪伴者**：围绕当前 `SourceBlock` 回答、复述理解、提出可修订 `BookThought`。
- **原文守护者**：核对来源、锚点、证据和相关性；允许有产出的联想，对真正无关输入最多一次温和回引。
- **世界机制导演**：从已确认关系编译机制，解释动作前置条件，安排有证据的局部角色观察。

共同限制：LLM 只产生 schema-valid 候选，不直接提交关系、不直接改变世界、不直接执行外部副作用。

语音是可选入口，不是入场券：

- 麦克风、语音播放、文字阅读和后台提醒分别授权。
- Gate 通过前不主动邀请语音；拒绝权限后仍可完整使用文字路径。
- `停止` 必须真正停止采集或播报；已提交的想法和世界事实保留。
- 超时、断线、低置信、未知和版本冲突必须停在可见的待确认/可重试状态，不制造假成功。

## 7. 视觉与交互方向

### 阅读界面

- 真实 PDF/文本层是主画面，不用截图或复制一份不可选择的伪书页替代。
- 原文、译文/释义、读者便签、Agent 思考和模型扩展分层显示。
- 世界展开后仍保留两端原文、来源锚点和关系；目标段落后的内容应真实下移，不能只在 PDF 上盖一层固定面板。
- 关闭世界后回到同一段原文，不跳回首页或错误位置。

### 世界画面

当前方向是严格二值、低分辨率的原创像素视觉：墨黑 `#151515` 与纸色 `#F6F1DF`，最近邻缩放，角色依靠外轮廓、工具和动作识别，而不是职业标签、颜色或 tooltip。

主世界不使用现代 dashboard 的 KPI 卡、玻璃拟态、渐变按钮或 Emoji/SVG 人物作为最终资产。场景应优先让人看懂原毛、纺线、织布和交易的因果顺序；角色是经济状态机的可观察环节，不是装饰性 NPC。

视觉方向仍需真实用户盲测和浏览器验收，原型截图、固定视频和视觉 placeholder 不能单独证明世界已可玩。

### 可访问性

核心链路必须有文字和键盘等价路径；关键状态不能只依赖颜色、位置、声音或动画表达。Canvas/WebGL 世界需要同步 DOM 摘要或等价的行动面板，并支持 reduced motion。

## 8. 当前产品边界

正式应用入口是 `product/`。`prototypes/` 用于视觉和交互验证，不把其中的 fixture 状态机或硬编码世界复制进正式产品。

当前工程合同已经覆盖 T001–T007：来源、事件存储与只读投影、ReaderSession、ReaderIdea/Relation 审阅、原文讨论、BookThought 和跑题边界。T008 之后的真实 LLM、真实 ASR/麦克风、WorldKernel、ActionCandidate、云同步和服务端持久化仍需单独实现和验收。

初赛交付另有公网 HTTPS、可部署 Agent 后端和自建 MCP 的约束；这些是交付约束，不改变产品的来源、权限和确定性边界。

## 9. 完成定义

以下全部成立，才算完成核心产品链路：

- 读者能从真实 `SourceBlock` 开始，并留下归属于自己的 `ReaderIdea`。
- 关系在用户确认前始终是候选态，确认后有版本和证据。
- 世界确实由本次关系和 `WorldPatch` 实例化，不是固定演示。
- 至少一个非装饰性行动改变 `WorldState`，并产生可解释、可回放的事件。
- 失败、停止、权限拒绝、重试和未知分支都有可见结果。
- 世界结束后能回到原文，并显示完整 Evidence 链和模型扩展。
- 文字、键盘和语音（可用时）都不绕过同一套领域合同。
- 浏览器、构建、测试和 exact replay 证据与当前实现版本一致；“页面能打开”不算验收。

详细验收以 [`docs/acceptance.md`](docs/acceptance.md) 和 [`docs/prototype-v2-acceptance.md`](docs/prototype-v2-acceptance.md) 为准。

## 10. 文档权威关系

发生冲突时按下面的范围判断：

1. 本文：产品体验、视觉方向、边界和设计决策的总览。
2. [`CONTEXT.md`](CONTEXT.md)：术语、身份和核心不变量。
3. [`docs/product-brief.md`](docs/product-brief.md)：产品方向和首版体验合同。
4. [`docs/architecture/agent-os-behavior-protocol.md`](docs/architecture/agent-os-behavior-protocol.md)：Agent OS 的语义权限。
5. [`docs/architecture/event-protocol.md`](docs/architecture/event-protocol.md)：事件、写入路径、投影、幂等和回放。
6. [`docs/architecture/voice-native-executable-book.md`](docs/architecture/voice-native-executable-book.md)：语音、Inline World、PlayabilityGate 和演进路线。
7. [`docs/acceptance.md`](docs/acceptance.md)：什么算做完、什么一票否决。
8. [`product/README.md`](product/README.md)：正式入口、当前实现切片和运行命令。

若产品方向改变，先更新本文和对应的详细合同，再开始实现；若只是实现状态变化，更新 `product/README.md` 和验收证据，不把实现现状倒写成设计原则。

## 11. 尚待明确的决策

- 最终对外名称：`针厂的边界`、`Executable Reading` 或二者的层级关系。
- PDF compositor 的生产实现是否固定采用“段间真实展开”这一变体，以及各视口的排版门槛。
- `WorldKernel` 首个正式动作 allowlist、规则版本和可重放事件 schema。
- 真实 Agent 后端、MCP 和语音 provider 的部署形态与故障降级方案。

这些问题未裁决前，不应擅自扩大首版世界、增加 NPC 聊天或把原型能力写成生产能力。

## 相关文档

- [项目说明](README.md)
- [产品简报](docs/product-brief.md)
- [验收合同](docs/acceptance.md)
- [交付约束](docs/delivery-constraints.md)
- [职业美术方向](research/role-art-direction.md)
