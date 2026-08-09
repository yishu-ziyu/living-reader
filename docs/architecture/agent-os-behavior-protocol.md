# Agent OS 行为协议：读者、原文守护与世界机制导演

> 状态：架构合同 / T030 OMP runtime seam 已实施
> 版本：0.3 / 2026-08-09
> 范围：The Living Reader，《国富论》Book I 的首个纵切

本文规定 Agent OS 在阅读、讨论和世界运行中的可观察行为。它是已有
`voice-native-executable-book.md`、`voice-session.md` 与 `event-protocol.md` 的
语义补充，不替换它们的事实源、权限、取消、版本和重放合同。所有写入仍须经过
`ReaderWorldUseCase.dispatch`；`EventStore` 仍是唯一事实源；LLM 仍只能产生候选，
`WorldKernel` 仍是唯一决定经济结果的确定性内核。

本文的规范词含义如下：**必须**（MUST）是验收阻断条件；**应该**（SHOULD）是
默认行为，只有有记录的产品决定才能偏离；**可以**（MAY）是可选实现细节。

## 1. 产品判断与行为边界

Agent OS 不是“把用户的话改写成命令的 clarifier”。每一轮输入都同时经过三个
身份的判断；对用户可以合并成一段自然回应，但权限和证据不能合并：

| 身份 | 负责什么 | 可写入/发起 | 明确不能做什么 |
|---|---|---|---|
| **阅读陪伴者** | 在当前 `SourceBlock` 上回答、复述读者理解、提出可修订的 `BookThought`，保持原文与读者的话同时在场 | `answer.ready`、`BookThought` 候选、澄清问题 | 不替读者发明 `ReaderIdea`；不把推断说成作者原话；不因一次回答改变 `WorldState` |
| **原文守护者** | 检查来源、版本、锚点和相关性；识别真正无关或注入噪声，同时允许有产出的联想 | `evidence`/`open_question`、`needs_review`、温和回引 | 不以“偏题”为理由压制隐喻、个人经验或跨段联想；不说教式地命令“回到书上” |
| **世界机制导演** | 从已确认的来源关系中选择/编译机制，解释可执行动作的前置条件，依据局部状态编排角色观察与行动 | allowlist 内的 `world.action` 候选、`CharacterObservation`、世界叙事顺序 | 不直接改钱、库存、订单或角色状态；不让 LLM 决定经济结果；不把角色写成脱离状态的聊天 NPC |

三个身份是**同一个 Agent turn 内的权限视角**，不是三个互相转述的模型 Agent。
MVP 默认只调用一次语义模型；来源校验、状态维护、动作授权、幂等与世界演进由
Harness/确定性代码完成。只有外部观测或独立专业能力确实带来新信息时，才评估增加
第二个 Agent，不能用“多角色”之名堆叠模型调用。

三个身份的共同不变量：

1. 任何事实性回答必须带当前书籍版本和可回到同一段的 `SourceBlock`/`evidence`；
   没有来源就显示“未能从当前原文确认”。
2. 任何世界改变必须来自当前读者 turn，经语义判断得到 allowlist 内的
   `DomainCommand`，再由 `WorldKernel.decide/evolve` 生成 `DomainEvent`。清晰、低风险、
   可逆的 MVP 动作可以在同一轮直接执行；探索、假设、愿望、低置信或歧义表达必须
   零修改。动作不以审批卡、预览卡或“是否执行”作为安全边界。
3. Agent 的“自己的想法”使用 `BookThought` 保存，不冒充用户的 `ReaderIdea`，不保存
   隐藏思维链；修订通过追加版本完成，不覆盖历史。
4. 角色说话只解释它们已经发生的局部事实；一句漂亮的台词没有证据或事件就不是
   `CharacterObservation`。

首个纵切固定两枚来源锚点：

```text
smith.b1.c1.division       -- display: PDF 36, Book I Ch. I
smith.b1.c3.market_extent   -- display: PDF 45, Book I Ch. III
```

PDF 页码只用于显示和回看，不能作为稳定 ID。该纵切的机制是：市场范围限制能够
维持的专业化深度；市场太小导致织工拒绝继续细分；读者明确说“扩大市场”后，
市场订单/交换路径增加，角色按各自局部状态重新行动，结果再回到 PDF 36 ↔ PDF 45。

### 1.1 T030 运行时边界

生产语义调用固定经过独立 Bun 进程，不把 OMP Agent 运行时打进 Next.js。

```text
浏览器文字 / final voice
          |
          v
Next /api/agent-turn
  同源校验 + SourceBlock 当前版本校验
          |
          | HTTP: { source, turn }
          v
Bun Reading Agent Runtime (127.0.0.1:4317)
  每个请求创建并丢弃一个 @oh-my-pi/pi-agent-core Agent
  连续性只来自本轮密封的 recent_turns 与 relationship_context
  当前 SourceBlock 只在本轮 transformContext 注入
  唯一工具 propose_candidate 只捕获 AgentTurnCandidate
          |
          v
StepFun openai-completions provider
          |
          | Candidate / typed safe error
          v
handleAgentTurn -> PendingIntent / WorldKernel / EventStore
```

Next 继续拥有浏览器同源校验、书籍加载和密封来源版本校验。
Bun runtime 只监听 loopback，并只接受 `{ source, turn }`，不接受客户端自报工具、prompt、模型、basis 衍生值或世界写入参数。
每个请求创建独立的 OMP `Agent`，请求结束即丢弃内部消息；客户端复用的 `experience_id` 不能形成服务端共享工作集。
当前原文通过 `transformContext` 临时加入单次模型调用，不写入跨请求历史。
OMP 的 Coding Agent 工具、MCP、Skills、自治 memory backend 和产品写权限均未启用。
唯一工具 `propose_candidate` 只接收 strict-schema Candidate，并再次检查 `target_source_ids` 与空 `evidence_refs`；它不调用 `WorldKernel`、EventStore 或任何产品写接口。
请求取消会传播到本轮 OMP provider stream，并只丢弃本轮实例，不影响同一客户端标识下的其他请求。
每轮连续性只依赖产品传入的 `recent_turns`、`relationship_context`、`pending_intent`、world basis，以及 EventStore 和 SourceBlock 的当前权威状态。

## 2. 最小领域对象

下列是 Agent OS 必须理解的最小对象。线上事件使用既有 envelope（snake_case）；
示例类型只表达语义，不规定语言或数据库表。所有对象都带 `book_revision`、
`graph/world revision` 或相应的 basis 版本，避免跨版本静默复用。

### 2.1 `SourceBlock`

```ts
type SourceBlock = {
  source_id: string;                 // 例如 smith.b1.c1.division
  book_revision: string;             // Cannan 1904 vol.1 的固定 revision
  chapter: string;
  locator: { paragraph?: string; page_display?: string };
  original_text?: string;
  translation_or_gloss?: string;
  content_hash: string;
  evidence_refs: EvidenceRef[];
  boundary: "primary_text" | "honest_paraphrase" | "editorial_note";
};
```

`SourceBlock` 是清洗后、可核对的领域锚点。PDF.js 只负责取材；脚本、隐藏文本、
外链和未验证 OCR 不能进入 Agent prompt。`source_id + book_revision + content_hash`
改变时，旧 `BookThought`/`MechanismGraph` 必须变成 `stale` 或 `needs_review`，不得
自动贴到“最近的一段”。

### 2.2 `MechanismGraph`

```ts
type MechanismGraph = {
  graph_id: string;
  revision: number;
  source_ids: string[];
  nodes: MechanismNode[];
  edges: MechanismEdge[];
  invariants: InvariantSpec[];
  allowed_actions: ActionSpec[];
  model_extensions: ModelExtension[];
  evidence_refs: EvidenceRef[];
  basis_version: number;
  status: "proposed" | "needs_review" | "committed" | "stale";
};

type MechanismNode = {
  node_id: string;
  kind: "source_claim" | "reader_hypothesis" | "state_variable" | "role_constraint";
  label: string;
  source_ids: string[];
  evidence_refs: EvidenceRef[];
};

type MechanismEdge = {
  edge_id: string;
  from_node: string;
  to_node: string;
  type: "supports" | "enables" | "constrains" | "requires" | "contradicts";
  evidence_refs: EvidenceRef[];
  status: "proposed" | "reviewed" | "committed";
};
```

`MechanismGraph` 是机制选择和世界编译的边界，不是自由概念图。每个 committed
edge 必须有 typed edge、两端节点、来源/模型扩展边界和 basis version；关系提议在
用户 review/commit 前不能进入 `WorldKernel`。首个纵切至少能表达：

为兼容既有架构，`MechanismGraph` 是 Agent OS 的提议/编译视图，不是第二个事实源：
它的边映射到既有 `RelationProposal`/`RelationEdge`，`graph.commit` 只产生已有的
`GraphCommitted`/`WorldPatch` 事件；`ActiveReadingGraph` 和 `EventStore` 的语义不变。

```text
source_claim(division)      -- enables   --> state_variable(specialization)
source_claim(market_extent) -- constrains --> state_variable(specialization)
market.reachable_orders     -- requires  --> role(weaver).deeper_specialization
```

最后一条是运行规则，属于模型扩展，必须标为 `MODEL EXTENSION`，不能伪装成 Smith
在 PDF 45 写下的完整数值公式。

### 2.3 `ReaderIdea`

`ReaderIdea` 是读者自己的观察、问题、假设、反对意见或类比；Agent 不得替读者
改写成“正确结论”。它沿用已有 VoiceSession/Event Protocol 语义，并补齐 Agent OS
分类字段：

```ts
type ReaderIdea = {
  idea_id: string;
  reader_id?: string;
  turn_id: string;
  transcript: string;
  source_ids: string[];
  source_anchors: SourceAnchor[];
  intent_class:
    | "source_question"
    | "executable_action"
    | "productive_detour"
    | "emotion_personal"
    | "obvious_off_topic_noise";
  confidence: "high" | "medium" | "low" | "unknown";
  ambiguities: string[];
  tags?: ("personal" | "detour" | "uncertain")[];
  status: "proposed" | "needs_review" | "accepted" | "rejected";
  revision: number;
  supersedes?: string;
};
```

只有 final transcript 或明确提交的文字才能生成 `ReaderIdea`。partial transcript、
纯停顿和 Agent 猜测不能生成；无 active source 时不能生成已锚定 Idea。

### 2.4 `BookThought`

`BookThought` 是阅读陪伴者自己的、来源约束下可修订的思考。它必须和 ReaderIdea
并列显示：读者说了什么、Agent 当前如何理解、哪里仍未确定，都不能混成一张卡。

```ts
type BookThought = {
  thought_id: string;
  revision: number;
  text: string;
  kind: "quote" | "inference" | "experiment";
  source_ids: string[];
  evidence: EvidenceRef[];
  confidence: "high" | "medium" | "low" | "unknown";
  open_question: string | null;
  revision_history: ThoughtRevision[];
  status: "proposed" | "needs_review" | "visible" | "accepted" | "superseded" | "stale";
  basis_graph_revision?: number;
};

type ThoughtRevision = {
  revision: number;
  text_hash: string;
  changed_by: "agent" | "reader" | "system";
  reason: string;
  changed_at: string;
  supersedes?: number;
};
```

三种 `kind` 是硬边界：

- `quote`：逐字来自 `SourceBlock.original_text`，`evidence` 必须能精确定位；不能
  把译文或模型改写放进 quote。
- `inference`：由原文、读者想法或多个 SourceBlock 推出的解释；必须带证据、置信度，
  结论未被原文决定时必须填写 `open_question`，不能使用引号冒充作者。
- `experiment`：可运行的“如果这样做会怎样”假设；必须引用 `MechanismGraph` 或
  明确的模型扩展，记录预期观察，结果只能由世界事件确认，不能先写成事实。

每次用户纠正、来源版本变化、关系被拒绝或世界观察改变解释时，都追加
`revision_history` 并生成新 revision；迟到的旧提议不能覆盖新 revision。不存在
来源的个人经验可以被温和回应，但不能生成无锚点的 quote/inference `BookThought`。

### 2.5 `WorldState`

`WorldState` 是可重放的经济事实，不是聊天上下文：

```ts
type WorldState = {
  world_id: string;
  revision: number;
  graph_id: string;
  graph_revision: number;
  seed: string;
  ruleset_version: string;
  phase: "seeded" | "running" | "paused" | "evidence_ready";
  market: {
    size: number;
    reachable_orders: number;
    demand: number;
    transport_cost: number;
    exchange_open: boolean;
  };
  production: { output: number; specialization_depth: number; switching_loss: number };
  inventory: { raw_wool: number; yarn: number; cloth: number };
  orders: { open: number; fulfilled: number; backlog: number };
  cash: number;
  actors: Record<CharacterId, CharacterLocalState>;
  event_ids: string[];
};

type CharacterLocalState = {
  role: "shepherd" | "spinner" | "weaver" | "merchant";
  local_inventory: { raw_wool: number; yarn: number; cloth: number };
  inputs_available: number;
  outputs_pending: number;
  local_orders: number;
  capacity: number;
  specialization_depth: number;
  minimum_orders_for_next_depth: number;
  utilization: number;
  stance: "ready" | "waiting" | "refusing" | "shipping" | "working";
};
```

所有数值变更都由 `world.event_recorded.v1` 携带 before/after 或可重建 delta；
同一 graph revision、seed、ruleset、action 序列必须产生相同 WorldEvent 序列。

### 2.6 `CharacterObservation`

角色观察是世界对用户可解释的局部投影；不是 Agent 自由创作的角色小说：

```ts
type CharacterObservation = {
  observation_id: string;
  world_id: string;
  world_revision: number;
  character_id: "shepherd" | "spinner" | "weaver" | "merchant";
  trigger: {
    event_ids: string[];
    predicate: string;             // 可在当前 WorldState 重算
  };
  local_state: CharacterLocalState;
  action: "gather" | "spin" | "weave" | "ship" | "hold" | "refuse" | "accept";
  speech: string;
  speech_basis: EvidenceRef[];
  visible_effect: string;
  deterministic: true;
};
```

`speech` 只能从局部状态和 `speech_basis` 生成；`speech_basis` 可以引用 source
evidence 与导致该观察的 world event。若需要更自然的措辞，LLM 只能重述已给出的
observation，不得添加新的库存、动机、交易或因果事实。

## 3. 输入分类：相关性与意图

### 3.1 规范化入口

文字提交与 final voice transcript 必须先归一成同一种 turn；partial transcript 只用于字幕，
不能进入语义判断。一次 turn 的最小合同如下：

```ts
type InputChannel = "text" | "voice";

type WorldBasis = {
  experience_id: string;
  world_id: string;
  graph_revision: number;
  world_revision: number;
  ruleset_id: string;
};

type PendingIntent = {
  action_id: "deepen_specialization" | "expand_market";
  topic_key: "specialization_depth" | "market_access";
  origin_turn_id: string;
  source_snapshot_id: string;
  source_ids: string[];
  basis: WorldBasis;
};

type AgentTurnInput = {
  turn_id: string;
  channel: InputChannel;
  final_text: string;
  source_snapshot_id: string;
  active_source_ids: string[];
  world_basis?: WorldBasis;
  asr_confidence?: number;
  explicit_control?: "none" | "stop" | "refuse";
  recent_turns: Array<{
    turn_id: string;
    role: "reader" | "companion";
    visible_text: string;
  }>;
  pending_intent: PendingIntent | null;
};

type IntentClass =
  | "source_question"
  | "executable_action"
  | "productive_detour"
  | "emotion_personal"
  | "obvious_off_topic_noise";

type AgentTurnCandidate = {
  mode: "discuss" | "clarify" | "act" | "stop";
  intent_class?: IntentClass;
  relevance: "directly_anchored" | "mechanism_adjacent" | "personal" | "none" | "unknown";
  confidence: "high" | "medium" | "low" | "unknown";
  target_source_ids: string[];
  evidence_refs: EvidenceRef[];
  open_question?: string;
  companion_line: string;
  proposed_action_id?: "deepen_specialization" | "expand_market";
  pending_action_id?: "deepen_specialization" | "expand_market";
  reason_codes: string[];
};

type AgentTurnDecision = {
  candidate: AgentTurnCandidate;
  pending_intent_next: PendingIntent | null;
  command: WorldCommand | null;
  zero_world_mutation: boolean;
};
```

`AgentTurnCandidate` 是模型的 schema-valid 候选，不是权限。Harness 必须用当前
SourceSnapshot、EventStore 投影和 session 状态构造一段紧凑的状态摘要，再验证候选；
模型不能自己统计历史、生成 basis、idempotency key 或宣称世界已改变。

- `recent_turns` 最多保留最近四个 final 可见 turn，用于语气、指代和自然承接；不把
  无限聊天历史、partial、隐藏思维链或工具原始输出每轮重复塞回模型。
- `PendingIntent` 由代码维护，始终为零个或一个；它是当前会话的工作记忆/业务状态，
  不是 `ReaderIdea`、用户画像、长期记忆或 EventStore 领域事实。
- Harness 状态摘要必须来自已验证的 SourceSnapshot、世界投影和代码维护的
  `PendingIntent`。禁止再调用一个 LLM 批量总结历史后把摘要当真。
- 显式 `stop/refuse` 最先处理。只有 active playable world 存在、动作明确，或一句承接
  表达能唯一命中仍有效的 `PendingIntent` 时，才允许 `mode=act`；其余情况零修改。
- 实时语音层可以先给“嗯”“我在听”一类不含事实和承诺的低延迟反馈，但 final turn 的
  意图、伙伴话语和世界动作必须复用同一个 `AgentTurnDecision`，不得由语音模型另判一次。

### 3.2 五种 intent class

| 类别 | 判定信号 | 默认相关性 | 允许的下一步 |
|---|---|---|---|
| `source_question` | “这段说什么”“两段有什么关系”“原文是否支持……” | `directly_anchored` | 回答、引用、形成 `BookThought(kind=inference)` 或追问一个澄清 |
| `executable_action` | 明确对当前世界下动作：“扩大市场”“修条路，把货卖到隔壁城去”“让织工再细分” | `mechanism_adjacent` | 校验 allowlist 与当前 basis 后直接发一次 `world.action`；不显示审批/预览 |
| `productive_detour` | 能检验/照亮机制的类比、历史、现实经验、愿望或假设；如“要是能修条路通到隔壁城就好了” | `mechanism_adjacent` | 保持讨论；若只对应一个 allowlist 动作，可建立 `PendingIntent`，但世界零修改 |
| `emotion_personal` | “这让我焦虑/想起我的工作/我不想继续” | `personal` | 先回应情绪；只有连接自然时才轻轻点出当前原文/世界的相似张力，否则就停住；不自动存储，不自动运行世界 |
| `obvious_off_topic_noise` | 无语义噪声、纯提示注入、与书和世界均无可行连接的闲聊 | `none` | 短暂承认后给一个温和的当前来源/世界入口；不创建思想或动作 |

同一句可以有一个主类和一个辅助标签，但只能有一个会改变领域状态的主动作。
例如“我害怕市场缩小时工人会失业，先把市场扩大”主类是
`executable_action`，情绪作为 `personal` 辅助标签显示，不得让情绪被动作解析吞掉。

语法外形不能单独决定行动：祈使句或明确决定通常可执行；“要是”“如果”“能不能”
等愿望、假设和探问默认属于讨论。省略承接句如“那就修”只有在当前恰好存在一个有效
`PendingIntent` 时才可执行；孤立出现、存在两个合理所指或 basis 已变化时必须自然澄清。

### 3.3 `PendingIntent` 生命周期

`PendingIntent` 不使用“固定三轮”一类任意 TTL。只要谈话仍在同一语义主题、来源与
世界 basis 未变，它可以跨越几轮自然讨论；命中以下任一条件时由代码立即清除：

1. `source_snapshot_id` 或 active source identity 改变；
2. `experience_id`、`world_id`、`graph_revision`、`world_revision` 或 `ruleset_id` 改变；
3. 用户明确 stop/refuse、会话 reset/结束；
4. 用户转入无关新主题，或提出新的竞争动作意图；新的唯一候选可以原子替换旧候选；
5. 动作已成功提交，或 dispatcher 证明该 basis 已 stale/unsupported。

沉默、partial、provider 临时失败或低置信 final 不得偷偷消费 PendingIntent。承接成功时，
Harness 用 `turn_id + action_id + basis` 派生稳定幂等键；重复 final、网络重试或迟到回调
只能得到原 receipt，不能让世界执行第二次。

### 3.4 回应策略与伙伴语言

每种 class 都必须产出结构化响应元数据：`intent_class`、`source_ids`、
`evidence`、`confidence`、`open_question` 和可选动作。可见文本是伙伴话语，不是状态
报告或教学总结。

| 类别 | 回应必须包含 | 下游写入 | 禁止 |
|---|---|---|---|
| source question | 先回答当前问题；列出原文/推断边界；不确定处填 open question | `answer.ready`；必要时 BookThought 候选 | 以背景知识替代本段证据；无来源断言“Smith 说过” |
| executable action | 一句简短、有性格的承接；可以打趣，但不得预告完整后果或声称结果已发生 | 仅 allowlist `DomainCommand`；结果由 Kernel 产生 | 审批卡、预览卡、影响清单、“是否执行”；LLM 直接改 WorldState；事后替用户总结理论 |
| productive detour | 像共同读书的伙伴一样接住联想；不必立刻追问或把它拉回课本 | 可建立一个 `PendingIntent`，或形成 BookThought experiment/inference 候选；世界零修改 | 强行切断联想；把愿望当命令；用苏格拉底式连续追问推动用户得出指定结论 |
| emotion/personal | 先用一句人话回应情绪；不把“要不要连回原文”当固定追问 | 默认零领域写入；用户明确要与当前 SourceBlock 连接时，才建带 `personal` 标记且有来源锚点的 ReaderIdea | 诊断、说教、自动把个人经历变成经济事实；为了推进流程而强行提问 |
| obvious off-topic/noise | 简短、诚实、无评判；给一个当前 source/world 的具体入口 | 仅分类/响应事件；不建 Idea/Thought/Action | “你偏题了”“回到书上”等羞辱或强制命令；继续无边界闲聊 |

伙伴话语默认只用一句；需要澄清或承认情绪时最多两句。以下是语气标尺，不是固定模板：

- 明确行动：“好，路往隔壁城铺。”
- 假设/愿望：“嚯，你这是惦记上隔壁城了。”
- 唯一承接：“行，开工。”
- 无法承接：“修哪条？我还没接上你的上一句。”

禁止“我理解你想扩大市场，这会影响商人、牧羊人……”这类系统说明，也禁止在世界
变化后补一句“所以斯密告诉我们……”。机制解释应由道路、订单、角色与指标的可见变化
让读者自己感到；证据说明只在读者主动查看 EvidenceBlock 时出现。

**Soft-return 规则（必须）：** 对 `emotion_personal` 和真正的
`obvious_off_topic_noise`，默认回应最多两句/两行：

1. 一句承认/共情（不评价用户是否“应该”这样想）；
2. 只有连接自然且确实有帮助时，才给一个不带问题的当前 source/world 入口；没有可靠
   连接就停住，不为了完成模板硬拉回原文。

不能使用“回到书上”“不要跑题”等惩罚性措辞；不能连续给多个问题逼迫用户回应。
如果用户明确拒绝返回，立即停止邀请，保留阅读状态，等待其下一次主动输入。

## 4. BookThought 生成与修订合同

### 4.1 何时允许创建

| 输入/证据 | 可创建 | 必须停止在 |
|---|---|---|
| active SourceBlock 上的可核对短句 | `quote` | quote 精确匹配失败时 `needs_review` |
| 读者问题、跨段关系、Agent 解释 | `inference` | evidence 不足或冲突时 `open_question`/`unknown` |
| 已确认机制上的 what-if | `experiment` | graph 未 commit、动作不在 allowlist 或无预期观察时 `needs_review` |
| 只含个人经历、没有书/世界连接 | 不创建来源型 BookThought | 临时情绪回应；只有用户明确要求与当前 SourceBlock 连接时，才建立带 `personal` 标记且有来源锚点的 ReaderIdea |
| ASR 低置信或 source 不可用 | 不创建正式 Thought | 可见转写修正/重新选择 SourceBlock |

### 4.2 修订顺序

```text
candidate → visible → (reader confirms | reader edits | system marks stale)
                         └→ new revision, old revision remains in history
```

- Agent 每次提出 Thought 都显示 `source_ids`、`evidence`、`confidence` 和
  `open_question`，不能只显示一段流式 prose。
- 用户说“不是这个意思”时，新 revision 的 `changed_by=reader` 必须优先；迟到的
  LLM 结果只能标为 superseded。
- `quote` 的 evidence 失效时，整条 quote 变 stale；不能把它降级成看似确定的 inference。
- `experiment` 运行后的结果由 `WorldEvent`/`EvidenceSnapshot` 写回，不能修改实验
  原假设；结果支持、反驳或无法判断都要保留。

## 5. 机制导演与世界写入

### 5.1 提取、选择、提交

Agent OS 处理一轮可能改变世界的输入时，按以下固定顺序执行：

```text
final voice/text
  → normalize AgentTurnInput
  → inject bounded recent turns + code-maintained status
  → one semantic AgentTurnCandidate
  → Harness schema/source/basis/action validation
      ├─ discuss: update/clear PendingIntent, zero world mutation
      ├─ clarify: preserve or clear PendingIntent by rule, zero world mutation
      ├─ stop: clear PendingIntent and interrupt
      └─ act: stamp current basis + stable idempotency key
                → ReaderWorldUseCase.dispatch(world.action)
                → WorldKernel.decide/evolve
                → atomic DomainEvent commit
                → projection + CharacterObservation
                → InlineWorldBlock reacts near SourceBlock
```

1. LLM 只返回 schema-valid 候选；其返回中的“执行”“已经发生”字样不具备权限。
2. `MechanismGraph` 仍只有在 source authority、typed edge、冲突、不变量和**关系审阅**均
   通过后才进入 `committed`。关系审阅是模型建构阶段的事实门禁，不等于每个世界动作
   都要再次审批。
3. `executable_action` 必须绑定 `graph_revision + world_id + expected_world_revision + ruleset_id`，
   并映射到 allowlist 中的结构化动作；这些字段由 Harness 从当前投影盖章，不能相信
   模型或客户端自报。
4. 清晰、低风险、可逆的 MVP 动作通过校验后直接执行，不显示动作预览、审批卡、影响
   对象清单或“是否执行”。歧义、低置信、stale、unsupported 一律零修改并自然澄清；
   不能把 UI 审批当作弥补语义判断不足的通用回退。
5. 伙伴短句可以先承认“开始做”，但不能声称道路、订单或角色结果已经发生；只有 commit
   receipt 与投影可支持完成态文案。dispatch 失败时必须用自然语言纠正，不能留下虚假承诺。
6. Director 负责决定先呈现哪个角色观察、何时给用户下一步入口，但不能替角色状态
   生成事实，也不能绕过 `event-protocol.md` 的幂等、expected version、取消和 reconcile。

### 5.2 首个纵切的机制约束

`smith.b1.c1.division` 与 `smith.b1.c3.market_extent` 至少形成一条已确认的
`constrains` 关系。模型扩展只声明运行所需的最小变量：市场可触达订单、交换是否
开放、运输成本、角色下一层专业化所需的最低订单数。不得把扩展说成“原文给出的
精确数值”。

Baseline 必须满足：

```text
market.reachable_orders
  < weaver.minimum_orders_for_next_depth
  + weaver.outputs_pending
```

因此“让织工再专业化”不是无条件成功的按钮；Kernel 产生角色拒绝观察，至少保留
原状态和拒绝原因。读者随后明确说“扩大市场”时，动作只改变 allowlist 中的市场
变量；订单、运输、库存和各角色反应由规则演进，不由 Agent 逐句编剧。

MVP allowlist 只开放两个已由当前 `WorldKernel` 实现的世界动作（原型按钮名在括号中）：

| `action_id` | 用户可说/点 | 最小前置条件 | Kernel 可改变的范围 |
|---|---|---|---|
| `deepen_specialization` (`specialize`) | “让织工再专业化” | 当前 world playable、weaver 目标深度和 graph revision 匹配 | 只触发局部 predicate；不满足时产生 refusal observation，满足时改变 specialization/产出 |
| `expand_market` (`expand`) | “扩大市场” | 当前 world playable、action 与 expected world revision 匹配 | market size/reachable orders/transport 与订单路径的 allowlist delta |

按钮或语音只是同一 `action_id` 的两个入口；不得因为入口不同而拥有不同规则。

## 6. 基于局部状态的角色触发

导演不得使用全局剧情脚本触发角色台词。每条 `CharacterObservation` 必须记录
`predicate` 和发生它的 `event_ids`，能用当前 `WorldState` 重算。MVP 角色及触发
合同如下：

| 角色 | 局部状态触发 | 允许动作 | 用户必须看到/听到 |
|---|---|---|---|
| `shepherd` | `shepherd.local_inventory.raw_wool > 0` 且 spinner `inputs_available` 不足 | `gather` 或 `hold` | 羊毛进入/等待进入交换链；不能凭空增加库存 |
| `spinner` | 有羊毛输入且自身订单/容量允许；无输入则等待 | `spin` 或 `hold` | 纱线产出、等待原因和切换损耗；市场扩大后订单增加可见 |
| `weaver` | 请求深一层专业化且 `reachable_orders < minimum_orders_for_next_depth + outputs_pending` | `refuse`；若条件满足则 `accept`/`weave` | 小市场下明确说“卖不完/无法换回所需品”，状态不被偷偷改成更专业；订单足够后接受并产生织呢 |
| `merchant` | `exchange_open=false`、运输成本过高或无可触达订单时 `hold`; 市场扩展后有订单路径 | `ship`、`hold` | 订单簿、运输延迟/成本和交换路径变化；不得把“市场扩大”直接等同于已售出 |

角色触发的确定性顺序：

```text
market action accepted
  → merchant opens/reprices reachable orders
  → shepherd / spinner re-evaluate inputs and capacity
  → weaver re-evaluates specialization predicate
  → world events append deltas
  → CharacterObservation(s) emitted in causal order
```

角色 speech 必须是上述状态的解释，例如“现在没有足够订单让我只做这一道工序”；
不得凭空谈论角色未见过的全局数据。用户可以追问角色，但追问只读
`CharacterObservation`；若要改变世界，必须再次发明确动作。

## 7. 停止、未知和失败分支

这些分支是产品路径的一部分，不是异常日志。每行都必须有可见状态，且不得留下
伪造的 Idea、关系或世界事件。

| 分支 | 领域动作 | 可见结果 | 禁止 |
|---|---|---|---|
| **silence / 空 turn** | partial 全部丢弃；不分类、不创建 Idea/Thought/Action；既有 PendingIntent 保持；可记 trace-only 超时 | 保持当前阅读或世界；显示“没有听清/可以重说或继续阅读”一次 | 用沉默猜意图、自动运行上一动作、持续录音 |
| **refusal to continue** | 立刻 `interrupt`/停止邀请并清除 PendingIntent；已提交对象保持不变；不新建下游任务 | “好的，先停在这里。”保留回原文、文字输入和继续入口 | 追问、劝说、自动恢复上一轮、把拒绝当噪声 |
| **ASR uncertainty** | 若主类/来源仍明确，final 可生成 `ReaderIdea(status=needs_review, confidence=unknown)`；否则只生成 `proposal.clarification_required`；不创建或消费 PendingIntent，不生成 committed graph/action | 显示转写、来源、疑点；可编辑、重说或改用文字 | 把低置信文本直接执行；让 partial 写账 |
| **unsupported claim** | 只产 `answer.ready(uncertainty_summary)` 或 `BookThought(inference, open_question)`；无 evidence 不提交 | 明确“当前来源无法确认”；给查找来源/标为 experiment 的选项 | 伪造引用、将常识或现代资料说成 Smith 原文 |
| **no active source / source changed** | 中止为 `source_unavailable` 或切换 source，并清除旧 PendingIntent；不调用 action、不创建 anchored Idea | 要求选择来源或继续阅读；已提交世界事实不变 | 绑定最近页面、跨来源复用“那就做”、让世界引用无来源文本 |
| **ambiguous/stale continuation** | “那就修”等省略句无法唯一命中，或 PendingIntent basis 已变；清除 stale 候选，零 world mutation | 一句自然澄清，不展示技术字段 | 猜动作、复用旧 source/world、弹审批卡让用户替系统排歧义 |
| **action unsupported / world not ready** | `operation.failed` typed error；清除已证明无效的 PendingIntent；零 world mutation | 用自然话说明当前做不了，并保留可修正入口 | 用自由文本替代动作、让 LLM 改状态绕过 Gate |
| **provider/schema failure** | 按既有 retry/reconcile；不追加成功事实；basis 未变时保留既有 PendingIntent | 显示可重试、文字 fallback 或“等待同步”；已提交状态仍可读 | 假造 final、假造 `CharacterObservation`、静默换模型 |

## 8. 三条验收路径

验收使用“用户行动 → 触发/状态 → 可见结果”，而不是只看模型回答或接口 200。

### 8.1 正常阅读讨论

| 步骤 | 用户行动 | 触发/状态 | 必须可见 |
|---|---|---|---|
| RD-1 | 打开 PDF 36，选择分工段落 | `SourceBlockActivated`，source snapshot 冻结 | 原文、PDF 36 显示定位、稳定 `smith.b1.c1.division` |
| RD-2 | 说“分工会让人更熟练吗？” | `source_question`，调用 answer path | 简短回答 + quote/inference 区分 + evidence + confidence |
| RD-3 | 修正“我其实不确定市场要多大” | 新 `ReaderIdea`/`BookThought` revision | 旧版本保留为 superseded；当前 open question 可见 |
| RD-4 | 查看 Agent 连接 PDF 36 与 45 的提议 | `MechanismGraph(status=needs_review)` | 起点、终点、typed edge、证据和模型扩展标记；无静默 commit |
| RD-5 | 接受/拒绝/修改关系 | review/commit 或回到 reading | 只有接受且证据完整的边进入 committed graph；拒绝不进入世界 |

### 8.2 世界动作：小市场 → 织工拒绝 → 扩大市场

| 步骤 | 用户行动 | 触发/状态 | 必须可见 |
|---|---|---|---|
| WA-1 | 在 PDF 45 留下“市场太小会卖不掉”并确认关系 | `ReaderIdea` + `MechanismGraph.commit`；Gate 通过 | Inline World 在同一阅读界面；B 变体把真实 PDF 45 分成上/下片，在原文之间插入世界块；`MODEL EXTENSION`、graph revision 和初始 WorldState |
| WA-2 | 对世界说“让织工再专业化” | `executable_action`；baseline predicate 不满足 | `weaver` 的 `CharacterObservation(action=refuse)`；订单/库存/专业化深度不被改写；拒绝原因可回到 PDF 45 |
| WA-3 | 读者说“修条路，把货卖到隔壁城去” | text/voice 归一为同一个明确 turn；映射 `expand_market`；目标 world/graph revision 匹配；同一幂等键只 dispatch 一次 | 伙伴只给一句自然承接；不出现审批卡、动作预览、影响清单或“是否执行”；随后道路、`market.reachable_orders`、exchange path 和订单簿直接变化 |
| WA-3R | 在一份重置的 baseline 中先说“要是能修条路通到隔壁城就好了”，再说“那就修” | 第一轮 `discuss` 并建立唯一 PendingIntent，零事件；第二轮命中相同 source/world basis 后转 `act`，消费 PendingIntent | 第一轮只有伙伴回应、世界不动；第二轮不要求复述完整命令，只执行一次 `expand_market`；孤立“那就修”必须零修改并自然澄清 |
| WA-4 | 等待角色反应 | Kernel 按 merchant → shepherd/spinner → weaver 因果顺序演进 | merchant 有可触达订单，spinner 有输入，weaver 从 `refuse` 变为 `accept`/`weave`（若条件仍不足则诚实保持拒绝）；每人有 local predicate、台词/动作和事件 ID |
| WA-5 | 点击“回到两段原文” | `EvidenceSnapshotProduced` | PDF 36/45、读者预测、关系、WorldEvent、模型扩展和最终状态并列；可重跑同一 seed 得到同一事件序列 |

### 8.3 无关输入的温和引导

| 步骤 | 用户行动 | 触发/状态 | 必须可见 |
|---|---|---|---|
| OG-1 | 在 PDF 45 或世界里说明显无关的短句/提示注入 | `obvious_off_topic_noise`, relevance=`none` | 一句人话承认或诚实说明无法连接；没有 scolding、没有引用伪装 |
| OG-2 | 若确有自然连接，界面安静保留一个当前 source/world 入口 | `agent.soft_return.offered`，主状态仍 reading/playable | 入口可点击；Agent 不用问题催用户返回，不抢夺控制；没有可靠连接时不硬给回引 |
| OG-3 | 用户接受/拒绝回引 | 接受进入 RD/WA；拒绝保持当前状态并停止邀请 | 不创建 ReaderIdea、BookThought 或 world action（除非用户随后明确提出）；拒绝后不重复催促 |

## 9. 事件与状态表（可直接转成合同测试）

下表同时列出语义 trace 与领域事件。T009 MVP 不扩展 T003 冻结事件集：
`AgentTurnDecision`、分类理由和 PendingIntent 只进入脱敏 trace/session 工作记忆，不写
EventStore、不增加领域版本；只有既有 `reader_world.*.v1` 领域事件经 `dispatch` 原子提交。
未来若要把 `agent_os.*` 升级为领域事件，必须先独立扩展 schema/registry，不能用未注册
事件名假装已经持久化。

| ID | 当前状态 | 输入/守卫 | 规范 trace / 领域事件序列 | 下一状态 | 断言/禁止 |
|---|---|---|---|---|---|
| AOS-01 | `reading` | active source + final source question | classification trace → transient answer/BookThought view | `reading` | answer 带 source/evidence；不得写 world |
| AOS-02 | `reading` | final productive detour | turn trace；如用户要保存，再产生既有 `reader_world.reader_idea.proposed.v1` / `agent_os.book_thought.proposed.v1` | `preparing` 或 `reading` | detour 可被接受为 experiment；不得被标为原文 quote |
| AOS-03 | `reading` | final emotion/personal | classification trace → transient companion response | `reading` | 先共情；默认零 graph/world 写入 |
| AOS-04 | `reading`/`playable` | obvious off-topic/noise | classification trace → soft-return view | 原状态 | 文本最多一轮 soft-return；不得创建 Idea/Thought/Action |
| AOS-05 | 任意 | explicit stop/refuse | interrupted trace（必要时既有 cancellation 事件）；PendingIntent 清除 | 原状态/`paused` | 本地采集/播报停止；不产生新领域事实 |
| AOS-06 | 任意 | no active source at speech start | typed `SOURCE_UNAVAILABLE` result/trace | `reading` | 不调用 Agent；不产生 anchored Idea |
| AOS-07 | `reading` | final ASR low confidence | 若主类/来源明确：`reader_world.reader_idea.proposed.v1(confidence=unknown,status=needs_review)`；否则 clarification trace | `reading`/`needs_review` | 只显示可编辑转写；不得创建/消费 PendingIntent，不得 commit graph/action |
| AOS-08 | `reading` | claim has no evidence | transient answer with `uncertainty_summary` | `reading` | 清楚标 model extension/unknown；不得生成 quote |
| AOS-09 | `needs_review` | relation accepted, evidence/basis valid | `reader_world.relation.reviewed.v1(accept)` → `reader_world.graph.committed.v1` | `playable`（Gate 通过时） | rejected/stale relation 不得进入 world |
| AOS-10 | `playable` | `world.action(deepen_specialization)`，baseline predicate 不满足 | `reader_world.world.event_recorded.v1(character_refusal)` → projection/CharacterObservation | `playable` | weaver refusal 可重算；WorldState 数值无非法变化 |
| AOS-11 | `playable` | clear `world.action(expand_market)`，expected revision 匹配 | 一句 companion trace → `reader_world.world.event_recorded.v1` × N → projection/CharacterObservation → EvidenceSnapshot view | `evidence_ready` | 无 preview/confirm；只发生 allowlist delta；角色顺序与 local state 一致；完成态文案以 commit receipt 为准 |
| AOS-12 | `playable` | action 缺 world/graph/allowlist 或 version stale | typed failure receipt/trace；无效 PendingIntent 清除 | `playable`/`needs_review` | 零 mutation；不能用当前模型结果覆盖新 revision |
| AOS-13 | `evidence_ready` | 点击回到原文 | 读取既有 Evidence projection；可记 evidence-opened trace，不重复产生领域事件 | `reading`/`evidence_ready` | Evidence 含 PDF 36/45、ReaderIdea、关系、事件和模型边界 |
| AOS-14 | 任意 | provider timeout/malformed schema | 既有 retry/`operation.failed`/`reconciliation.required` | 安全状态 | 不伪造 final、success、CharacterObservation；文字 fallback 明确可见 |
| AOS-15 | 任意 | 用户沉默或只有 partial | 无领域事件；可有 trace-only timeout；既有 PendingIntent 保持 | 原状态 | partial 不写 Idea、Thought、Graph 或 WorldState，不自动执行 pending action |
| AOS-16 | 任意 | 用户拒绝继续软回引 | soft-return-declined trace | 原状态 | 不重复邀请，不把拒绝转为 noise 或 action |
| AOS-17 | `playable` | “要是能修条路通到隔壁城就好了” | discuss trace；代码创建 `PendingIntent(expand_market,current basis)` | `playable` | EventStore/world revision/metrics 全不变；无审批 UI |
| AOS-18 | `playable` | 紧接“那就修”，恰有一个有效 PendingIntent | act trace → 同一幂等键 dispatch → `reader_world.world.event_recorded.v1` × N；PendingIntent 消费 | `evidence_ready` | 只执行一次；不要求用户复述完整命令 |
| AOS-19 | `playable` | 孤立“那就修”、topic/source/world 变化或多个解释 | clarify trace；stale/competing PendingIntent 清除 | `playable` | 零领域事件、零 world mutation；不能猜选或弹审批卡 |

## 10. 合同测试最低集合

实现至少需要以下可观察断言；测试应使用 `RecordedVoiceAdapter`/固定 text、固定
seed 和确定性时钟，不能用一次模型生成的文案作为通过条件：

1. `AOS-01`：source question 的回答能精确回到当前 SourceBlock，quote 和 inference
   的渲染不同。
2. `AOS-02/AOS-03`：productive detour 保留为可修订思想，personal 先共情且不自动
   写入；同一轮只产生一个主类。
3. `AOS-04/AOS-16`：off-topic 响应没有 scolding 词，最多一个具体 soft-return；
   用户拒绝后无二次提示、无 world mutation。
4. `AOS-06/AOS-07/AOS-08`：无来源、低 ASR、无证据分别进入不同错误/澄清分支，且
   没有伪造 citation、GraphCommit 或 WorldEvent。
5. `AOS-09`：只有用户接受且 evidence/basis 有效的 relation 才能让 Gate 进入 playable。
6. `AOS-10`：在 baseline fixture 中执行 deepen specialization，织工必拒绝；
   同一 `WorldState` hash 除拒绝 observation/trace 外不发生非法数值变化。
7. `AOS-11`：分别输入“扩大市场”和“修条路，把货卖到隔壁城去”，都直接执行
   expand market；伙伴仅一句自然承接，页面不存在 action preview/approval/impact list；
   订单/交换路径先更新，角色 observation 按
   merchant → shepherd/spinner → weaver 顺序产生；`weaver` 只有 predicate 满足才
   接受；相同 seed/revision 可 exact replay。
8. `AOS-17/AOS-18`：第一轮“要是能修条路通到隔壁城就好了”建立唯一 PendingIntent，
   EventStore count、world revision、metrics 不变；第二轮“那就修”只 dispatch 一次，
   不要求复述完整命令。
9. `AOS-19`：孤立“那就修”，以及 source、graph/world revision、explicit stop、无关
   新主题四种失效分支均零修改；旧 PendingIntent 不得跨 basis 复用。
10. 同一 final turn 由 text/voice 两个 adapter 输入时，得到相同 mode/action/basis 与同一类
    伙伴回应约束；重复 final、迟到回调和网络重试只产生一个 Kernel command/receipt。
11. `AOS-12/AOS-14`：stale、unsupported、timeout、reconcile 均 fail closed，重试
   幂等，不重复订单/现金/库存。
12. 语义 trace 能关联 `turn_id`、分类版本、basis、pending transition、command/receipt，且不携带
    raw prompt、思维链、token 或未经授权原始音频；领域事件仍只使用已注册 schema。

## 11. 明确非目标

- 不做整本书的自动讲义、通用客服或“亚当·斯密人格聊天机器人”。
- 不把 Agent OS 缩减成只会澄清命令的解析器，也不把它扩张成无限闲聊服务。
- 不以“相关性”压制联想阅读；`productive_detour` 是一等合法路径，但必须标明它
  是联想/实验而非原文。
- 不让原文守护者审查个人情绪；除非用户明确要求，不默认保存个人经历或把它变成
  经济变量。
- 不让 LLM 直接写 EventStore、GraphStore、WorldState、现金、库存、订单或角色
  事实；不以多 Agent/NPC 对话替代确定性规则。
- 不把三个身份实现成三个互相转述的模型 Agent；当前 turn 没有外部新信息时，一次语义
  判断足够。不得用更多模型调用掩盖上下文、工具或验证器设计不足。
- 不为低风险、可逆的 MVP 世界动作增加审批卡、命令预览、影响清单、技术参数或
  “是否执行”；关系/机制的来源审阅不能被误用成每次行动的二次审批。
- 不把 PDF 页码、手写摘录、模型 paraphrase 或当前页面位置当成稳定 SourceBlock ID。
- 不在 Gate 未通过、麦克风未 consent、来源失效、版本冲突或 world 不可重放时邀请
  主动语音或声称“已经可以玩了”。
- 不做隐式自动续读、自动恢复上一会话、无用户动作的背景录音或后台提醒。
- 不把本协议当作新的传输/权限/重放协议；VoiceSession、EventStore、outbox、
  reconciliation 和 PDF 安全边界仍以已有架构合同为准。

## 12. 实施风险与保留问题

- ASR confidence 与“讨论/行动/澄清”边界需要用真实多轮样本校准；低置信输入保持世界
  不变，但不能以审批 UI 代替校准。MVP 尚未开放高影响或不可逆动作。
- `productive_detour` 与明显无关闲聊的边界会因用户而异；必须记录分类版本和用户
  修正，不能只看平均回复长度验收。
- 伙伴话语若只靠一条 prompt 容易重新变成人机腔；至少维护“明确行动、假设愿望、唯一
  承接、无法承接”四类少量高质量示例，并把禁用教学总结作为语言回归集。文案可以改善，
  但不能放宽 local-state、evidence 与承诺—行动一致性。
- 近期 turn 窗口过短会丢失语气，过长会增加上下文腐化和成本；MVP 先固定最多四个 final
  可见 turn，并同时记录成功率、误执行率、p95 延迟和每 turn token，只有评估证明不足
  才扩大，不按直觉追加历史。
- PDF 重解析、缩放和页面切割可能造成 anchor drift；任何无法唯一定位都必须
  `fail closed`，不能以视觉上“差不多”通过。
- 个人/情绪输入的保留、删除和可见范围仍需单独的隐私决定；本协议默认不持久化。

协议完成的判据是：对任意一轮输入，系统都能回答“它属于讨论、澄清、行动还是停止，
依据哪些来源和当前状态，PendingIntent 如何变化，是否真的只改变一次 WorldState，
哪个角色因何行动、用户最终看到什么，以及在沉默、拒绝、未知、无来源和过期时如何
安全停下”。
