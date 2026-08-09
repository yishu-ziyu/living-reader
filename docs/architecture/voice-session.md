# VoiceSession 协议

> 状态：实施合同
> 版本：0.1 / 2026-08-07
> 适用范围：语音优先的阅读陪伴、`ReaderIdea` 捕获、`ActiveReadingGraph` 更新与 `ExecutableWorld` 交付
> 非目标：本文不规定具体 UI 样式、提示词内容、模型供应商价格或生产代码目录

## 1. 目的

读者阅读一个 `SourceBlock` 时，可以直接开口提问或提出想法。系统必须：

1. 在用户开始说话时冻结准确的阅读上下文；
2. 低延迟、可打断地回答当前问题或确认想法；
3. 只在最终转写明确后创建 `ReaderIdea`；
4. 让后台慢 Agent 基于该想法更新 `ActiveReadingGraph`，并构造 `ExecutableWorld`；
5. 世界真正可运行后，通过界面事件通知，并在安全条件满足时主动语音邀请读者进入。

这条链路的核心原则是：

> 语音模型负责实时理解和回应；后台 Agent 负责耗时推演；两者通过版本化领域对象交接，而不是共享一段模糊对话历史。

## 2. 模块与 seam

`ReadingCompanion` 是网页调用者面对的深模块。网页只负责：

- 标记可引用的 `SourceBlock`；
- 开关收听；
- 打断播放；
- 消费规范化事件。

权限、麦克风、SourceBlock 选择、WebRTC、供应商事件、打断、快慢 Agent、重连、图谱版本和主动邀请全部隐藏在模块内部。

```text
Reader page
  -> ReadingCompanion interface
      -> SourceTracker
      -> VoiceSession
          -> VoiceRuntimePort
              -> OmniWebRTCProductionAdapter
              -> CascadingFallbackAdapter
              -> DeterministicReplayAdapter
      -> FastAgent
      -> SlowWorldPort
          -> ActiveReadingGraph commit
          -> ExecutableWorld validation
      -> InvitationGate
```

真实 seam 有两个：

1. `VoiceRuntimePort`：第三方实时语音能力；生产、降级和确定性重放有三个 Adapter。
2. `SlowWorldPort`：自有后台 Agent；生产使用网络 Adapter，合同测试使用内存 Adapter。

这些 seam 属于模块 Implementation，不向普通网页 caller 暴露。

## 3. 网页标记合同

阅读根节点必须声明书籍与版本，每个可引用区块必须有稳定 ID：

```html
<article
  data-reading-root
  data-book-id="wealth-of-nations"
  data-edition-id="cannan-1904"
>
  <section data-source-block="book-1.chapter-1.paragraph-3">
    The greatest improvements in the productive powers of labour...
  </section>
</article>
```

约束：

- `book-id + edition-id + source-block` 在一个版本内唯一。
- 同一 ID 的正文发生变化时，模块计算出的 `contentHash` 必须变化。
- DOM 文本只是捕获来源；进入一轮语音后，以冻结的 `SourceSnapshot` 为准。
- 虚拟列表不得在区块离屏时复用同一个 ID 表示另一段内容。
- 页面不得把提示词、供应商 session 或原始音频塞进 DOM 属性。

## 4. ReadingCompanion 前端 Interface

```ts
export interface ReadingCompanionModule {
  attach(options: AttachReadingCompanionOptions): ReadingCompanion;
}

export interface AttachReadingCompanionOptions {
  root: HTMLElement;
  onEvent(event: ReadingCompanionEvent): void;
  invitationPolicy?: "visual-only" | "voice-when-safe";
}

export interface ReadingCompanion {
  /**
   * true：在用户手势中申请权限并进入持续收听。
   * false：停止采集；保留已提交的 turn、ReaderIdea 和后台任务。
   */
  setListening(active: boolean): Promise<void>;

  /**
   * 同步停止本地播放并作废当前 generation；远端取消异步完成。
   * 可重复调用。
   */
  interrupt(): void;

  /** 添加额外观察者。返回幂等退订函数。 */
  onEvent(listener: (event: ReadingCompanionEvent) => void): () => void;

  /**
   * 关闭采集、播放、传输与观察器。不会删除已经提交的领域对象。
   * 完成后实例不可恢复。
   */
  close(): Promise<void>;
}

export interface InvalidReadingRootError extends Error {
  name: "InvalidReadingRootError";
  code:
    | "missing_book_id"
    | "missing_edition_id"
    | "missing_source_block"
    | "duplicate_source_block_id"
    | "root_already_attached";
}
```

最常见调用者：

```ts
const companion = readingCompanion.attach({
  root: document.querySelector("[data-reading-root]")!,
  invitationPolicy: "voice-when-safe",
  onEvent: event => readingStore.accept(event),
});

micButton.onclick = () => companion.setListening(true);
muteButton.onclick = () => companion.setListening(false);
stopButton.onclick = () => companion.interrupt();
```

### 4.1 方法语义

`attach()`：

- 同步安装 SourceBlock 观察器，不申请权限、不连接供应商。
- 根节点缺少书籍元数据或没有合法 SourceBlock 时同步抛出 `InvalidReadingRootError`。
- 同一个 DOM root 同时只能有一个未关闭实例。

`setListening(true)`：

- 并发调用共享同一个初始化 Promise。
- Promise 只在麦克风可用、语音传输 ready、采集已 armed 后 resolve。
- 只通过用户手势触发；模块不得绕过浏览器权限模型。
- 初始化失败通过 Promise reject 返回类型化错误。

`setListening(false)`：

- 停止采集并释放麦克风 track。
- 不等同于 `interrupt()`；已经开始播放的回答可以继续。
- 若产品的“静音”按钮语义是完全安静，caller 必须先 `interrupt()`，再 `setListening(false)`。

`interrupt()`：

- 不等待网络；当前事件循环内切断本地播放。
- 若没有活动 generation，调用无副作用。
- 不撤销已经提交的 `ReaderIdea`，也不取消已启动的慢 Agent。

`close()`：

- 幂等。
- 等待本地资源释放和观察器退订，不等待后台世界任务完成。
- resolve 后不得再向该实例的 listener 交付事件。

## 5. 领域类型

### 5.1 SourceSnapshot

```ts
export interface SourceSnapshot {
  snapshotId: string;
  bookId: string;
  editionId: string;
  blockId: string;
  contentHash: string;
  text: string;
  selection?: {
    quote: string;
    start: number;
    end: number;
  };
  locator: {
    headingPath: string[];
    ordinal: number;
  };
  capturedAt: string;
}
```

SourceBlock 选择优先级：

1. 当前非空文本选区所在区块；
2. 最近十秒内被点击或键盘聚焦的区块；
3. 可见比例至少 55% 且最接近视口中心的区块；
4. 无合法候选时产生可恢复的 `source_unavailable`，不得让 Agent 猜测来源。

### 5.2 ReaderIdea

```ts
export interface ReaderIdea {
  ideaId: string;
  readerId?: string;
  turnId: string;
  transcript: string;
  source: SourceSnapshot;
  createdAt: string;
  status: "accepted" | "building" | "playable" | "failed";
}
```

`ReaderIdea` 只能由 final transcript 创建。partial transcript、模型猜测或被中止的 turn 不得创建它。

### 5.3 ActiveReadingGraph 与 ExecutableWorld 引用

```ts
export interface ActiveReadingGraphRef {
  graphId: string;
  revision: number;
}

export interface ExecutableWorldRef {
  worldId: string;
  revision: number;
  graphId: string;
  graphRevision: number;
  launchHref: string;
}
```

`ExecutableWorldRef.graphRevision` 必须指向已提交的 `ActiveReadingGraph` revision。世界不能引用草稿 patch 或被拒绝的 revision。

## 6. VoiceSession 与 VoiceEnvelope

`VoiceSession` 是 ReadingCompanion 内部的会话协调器。它把供应商、快 Agent 和慢 Agent 的原始事件规范化为一个有总序的输出流。

```ts
export interface VoiceEnvelope<TType extends string, TPayload> {
  protocolVersion: 1;
  type: TType;
  payload: TPayload;

  sessionId: string;
  seq: number;
  emittedAt: string;

  turnId?: string;
  generationId?: string;
  sourceSnapshotId?: string;
  readerIdeaId?: string;
  causationId?: string;
  correlationId?: string;
}
```

### 6.1 Envelope 不变量

- `sessionId` 在一次 `attach()` 生命周期内稳定。
- `seq` 由 VoiceSession 在事件对外发布前分配，从 1 开始严格递增，无重复。
- 同一 `turnId` 最多有一个 `transcript.final`。
- 所有 Agent 文本和音频事件必须有 `generationId`。
- 所有问题回答和 `ReaderIdea` 必须能追溯到 `sourceSnapshotId`。
- `causationId` 指向直接触发当前事件的 command/event；`correlationId` 串起一次读者意图到世界交付的完整链路。
- Adapter 的原始供应商 ID 可保留在诊断元数据中，但不得替代 canonical ID。
- 未知 `protocolVersion` 必须停止消费并报告 fatal `protocol_violation`。

### 6.2 ReadingCompanionEvent

```ts
export type ReadingCompanionEvent =
  | VoiceEnvelope<"session.state", {
      transport: TransportState;
      capture: CaptureState;
      turn: TurnState;
    }>
  | VoiceEnvelope<"source.active", { source: SourceSnapshot }>
  | VoiceEnvelope<"speech.started", Record<string, never>>
  | VoiceEnvelope<"speech.ended", Record<string, never>>
  | VoiceEnvelope<"transcript.partial", { text: string }>
  | VoiceEnvelope<"transcript.final", { text: string; confidence?: number }>
  | VoiceEnvelope<"turn.aborted", { reason: AbortReason }>
  | VoiceEnvelope<"agent.output", {
      phase: "started" | "delta" | "final" | "cancelled";
      text: string;
    }>
  | VoiceEnvelope<"reader-idea.created", { idea: ReaderIdea }>
  | VoiceEnvelope<"world.progress", {
      jobId: string;
      stage: "interpreting" | "graphing" | "simulating" | "validating";
      message?: string;
    }>
  | VoiceEnvelope<"world.playable", {
      graph: ActiveReadingGraphRef;
      world: ExecutableWorldRef;
    }>
  | VoiceEnvelope<"invitation.state", {
      worldId: string;
      state: "eligible" | "deferred" | "spoken" | "suppressed";
      reason?: InvitationBlockReason;
    }>
  | VoiceEnvelope<"voice.error", { error: VoiceError }>;
```

## 7. 并行状态机

不得用一个笛卡尔积式 `status` 表示全部会话状态。以下状态机并行运行，由显式事件协调。

### 7.1 TransportState

```ts
type TransportState =
  | "detached"
  | "connecting"
  | "ready"
  | "reconnecting"
  | "failed"
  | "closed";
```

合法主路径：

```text
detached -> connecting -> ready
ready -> reconnecting -> ready
connecting/reconnecting -> failed
any -> closed
```

### 7.2 CaptureState

```ts
type CaptureState =
  | "disabled"
  | "requesting-permission"
  | "armed"
  | "capturing"
  | "muted"
  | "denied"
  | "unavailable";
```

`armed` 表示麦克风开放但尚无语音；`capturing` 表示本地 VAD 已检测到当前 turn；`muted` 必须对应已停止的 MediaStream track，不得只丢弃上传数据而继续亮着麦克风指示器。

### 7.3 TurnState

```ts
type TurnState =
  | "idle"
  | "user-speaking"
  | "finalizing-transcript"
  | "fast-agent-thinking"
  | "fast-agent-speaking"
  | "interrupted"
  | "aborted";
```

一个 turn 终止后回到 `idle`。被 `interrupted` 的 Agent generation 可以结束，但用户已经提交的 final transcript 和 `ReaderIdea` 仍有效。

### 7.4 SlowWorldState

```ts
type SlowWorldState =
  | "idle"
  | "queued"
  | "building-graph"
  | "building-world"
  | "validating"
  | "playable"
  | "failed";
```

SlowWorldState 以 `ReaderIdea.ideaId` 为键，不属于当前 voice turn。多个 ReaderIdea 可以并行处于不同慢状态。

### 7.5 InvitationState

```ts
type InvitationState =
  | "none"
  | "eligible"
  | "deferred"
  | "spoken"
  | "suppressed";
```

每个 `worldId + revision` 最多从 `eligible` 进入一次 `spoken`。

## 8. SourceSnapshot 冻结

规范时序：

```text
local VAD speech start
  -> resolve active SourceBlock
  -> create immutable SourceSnapshot
  -> allocate turnId and correlationId
  -> emit speech.started(sourceSnapshotId)
  -> allow transcript events
```

必须使用本地 speech-start 时间点，不得等 final transcript 才读取 DOM。否则用户在说话时翻页会把问题绑定到错误段落。

冻结后：

- 页面滚动、选区变化、DOM 卸载不改变该 turn 的 snapshot。
- 快 Agent、`ReaderIdea`、慢 Agent、图谱 patch 和世界都携带同一 snapshot 引用。
- snapshot 正文应是必要的最小区块；不得默认复制整章或整本书。
- 若 speech start 时无合法 SourceBlock，该 turn 在上传语音前中止，并发出 `source_unavailable`。

## 9. Partial 与 final transcript

partial：

- 可以展示字幕、预热检索、提前准备快 Agent 输入。
- 可以被任意后续 partial 覆盖。
- 不持久化为 `ReaderIdea`，不写图谱，不启动世界任务。
- 不触发具有外部副作用的工具。

final：

- 每个 turn 恰好零或一个；零表示 turn 被中止。
- 一旦发布即不可修改；供应商迟到的“修正版 final”视为协议错误并忽略。
- final 后才做稳定意图分类：`question | idea | command | ambiguous`。
- `question` 进入快 Agent；`idea` 先持久化 `ReaderIdea`，再启动慢 Agent，同时由快 Agent即时确认。
- `command` 只执行白名单控制动作。
- `ambiguous` 由快 Agent请求澄清，不创建 `ReaderIdea`。

## 10. Generation fence 与 barge-in

每次 Agent 开始输出时分配新的 `generationId`。VoiceSession 维护：

```ts
interface GenerationFence {
  currentGenerationId?: string;
  cancelledGenerationIds: Set<string>;
}
```

当用户在 Agent 说话时开口，或 caller 调用 `interrupt()`：

1. 立即将当前 generation 加入 cancelled set；
2. 同步停止 AudioContext/HTMLMediaElement/Worklet 的当前播放并清空队列；
3. 向 Adapter 发出 `generation.cancel`；
4. 发布 `agent.output { phase: "cancelled" }`；
5. 若为用户开口，创建新 turn 并冻结新的 SourceSnapshot；
6. 丢弃该 generation 随后到达的全部文本、音频和 completion 事件。

不变量：

- 取消是 generation-scoped，不是 session-scoped。
- 新 generation 不得复用旧音频 buffer。
- Adapter 必须把供应商 response/item ID 映射到 canonical generationId。
- Cascading TTS 的每个音频 chunk 必须带 generationId；无 ID chunk 不允许进入播放队列。
- 服务器取消失败不能恢复旧播放，只产生可恢复诊断事件。

## 11. 回声、权限、静音与掉线

### 11.1 回声处理

生产采集至少请求：

```ts
{
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1
}
```

浏览器 AEC 是基础能力；播放缓冲 Worklet 不等于回声消除。合同要求：

- 播放音频必须走浏览器可识别的本地播放链路，给 AEC 提供参考。
- 连续两次检测到“Agent 自己的声音触发 speech start”时，停止自动 barge-in，显示耳机/音量建议，并记录 `echo_suspected`。
- 不得通过永久提高 VAD 阈值掩盖回声，因为这会损害轻声用户。

### 11.2 权限

- 首次麦克风权限只能由显式用户动作触发。
- `permission_denied` 后不得循环弹窗；界面给出浏览器设置指引。
- 权限被操作系统撤销时，CaptureState 进入 `denied`，TransportState 可以保持 `ready`。
- 无麦克风时仍允许查看已生成的 `ExecutableWorld`。

### 11.3 静音

- `setListening(false)` 必须停止 MediaStream track，不保存离线音频。
- 静音状态不接受 wake word 或后台采集。
- 静音时任何主动邀请只能显示视觉通知，不能播放语音。

### 11.4 掉线与恢复

- transport 掉线时立即停止播放，作废当前 generation，并进入 `reconnecting`。
- 默认不缓存、不中转未发送的原始音频；当前未 final 的 turn 以 `transport_lost` 中止。
- 重连采用带抖动退避，目标三秒内恢复；达到策略上限后进入 `failed`。
- 重连只恢复已提交的 transcript、ReaderIdea、图谱 revision 和世界任务引用，不恢复未提交音频。
- SlowWorldPort 的后台任务不因 WebRTC 掉线而取消；重连后用 `jobId + lastSeenSeq` 补取进度。
- 不允许在一个 turn 中间从 Omni 切到 Cascading。中途失败应中止该 turn，请用户重说；Adapter 只在 turn 之间切换。

## 12. 快 Agent 与慢 Agent

### 12.1 快 Agent

输入：

```ts
interface FastAgentInput {
  turnId: string;
  generationId: string;
  transcript: string;
  intent: "question" | "idea" | "command" | "ambiguous";
  source: SourceSnapshot;
  activeGraph?: ActiveReadingGraphRef;
}
```

职责：

- 回答当前 SourceBlock 上的问题；
- 复述系统对 ReaderIdea 的理解，并说明后台正在构建；
- 请求澄清歧义；
- 流式产生短回答以满足语音延迟预算。

不得：

- 声称 `ExecutableWorld` 已完成；
- 直接提交图谱 revision；
- 以 partial transcript 创建领域对象；
- 编造慢 Agent 的进度或结果。

### 12.2 慢 Agent

```ts
interface SlowWorldPort {
  build(
    request: BuildExecutableWorldRequest,
    signal: AbortSignal,
  ): AsyncIterable<SlowWorldUpdate>;

  resume(
    jobId: string,
    afterSeq: number,
    signal: AbortSignal,
  ): AsyncIterable<SlowWorldUpdate>;
}

interface BuildExecutableWorldRequest {
  jobId: string;
  idea: ReaderIdea;
  graphBaseRevision: number;
}

interface GraphOperation {
  operationId: string;
  kind: "node.upsert" | "node.remove" | "edge.upsert" | "edge.remove";
  targetId: string;
  value?: unknown;
}

interface PlayabilityReport {
  schemaValid: boolean;
  graphRevisionCommitted: boolean;
  smokeTestPassed: boolean;
  launchReachable: boolean;
  failures: string[];
}

type SlowWorldUpdate =
  | {
      seq: number;
      type: "progress";
      stage: "interpreting" | "graphing" | "simulating" | "validating";
      message?: string;
    }
  | {
      seq: number;
      type: "graph.patch";
      graphId: string;
      baseRevision: number;
      operations: GraphOperation[];
      evidenceSnapshotIds: string[];
    }
  | {
      seq: number;
      type: "world.candidate";
      world: ExecutableWorldRef;
      playability: PlayabilityReport;
    }
  | {
      seq: number;
      type: "failed";
      code: string;
      recoverable: boolean;
    };
```

慢链路：

```text
ReaderIdea accepted
  -> build request(graphBaseRevision)
  -> graph.patch
  -> validate evidence and baseRevision
  -> commit ActiveReadingGraph revision
  -> world.candidate referencing committed revision
  -> PlayabilityReport passes
  -> world.playable
```

图谱提交规则：

- patch 的 `baseRevision` 必须等于提交时当前 revision。
- 不匹配时返回 `stale_graph_revision`；不得静默覆盖或自动拼接语义冲突。
- patch 必须引用至少一个 `SourceSnapshot` 或已存在图谱节点作为证据。
- 一个世界只能引用已提交 revision。
- 慢 Agent 失败不影响 VoiceSession 继续回答问题。

## 13. world.playable 与主动邀请门

`world.playable` 只能在以下条件全部成立后发布：

- `ExecutableWorld` 可以通过正式入口加载；
- 引用的 ActiveReadingGraph revision 已提交；
- playability schema、领域约束和最小运行 smoke test 通过；
- `launchHref` 属于允许的同源或白名单目标；
- 失败重试不会创建重复 world revision。

视觉通知在 `world.playable` 后立即显示。语音邀请还必须通过 `InvitationGate`：

```ts
interface InvitationGateInput {
  policy: "visual-only" | "voice-when-safe";
  pageVisible: boolean;
  transportReady: boolean;
  captureArmed: boolean;
  muted: boolean;
  userSpeaking: boolean;
  agentSpeaking: boolean;
  activeGeneration: boolean;
  silenceForMs: number;
  alreadyInvited: boolean;
}
```

允许主动语音的必要条件：

- policy 为 `voice-when-safe`；
- 页面可见，transport ready，capture armed；
- 未静音、用户未说话、Agent 未说话、没有活动 generation；
- 连续安静至少 1500 ms；
- 当前 `worldId + revision` 尚未邀请。

不满足时进入 `deferred` 或 `suppressed`，但不得延迟视觉通知。deferred 在十分钟内可重新评估；超过窗口后只保留视觉入口。

邀请文案只声明世界已可进入，不得提前总结世界结果。邀请本身获得独立 generationId，也受同一 barge-in fence 约束。

## 14. VoiceRuntimePort 与 Adapters

```ts
interface VoiceRuntimePort {
  connect(input: VoiceConnectInput): Promise<VoiceChannel>;
}

interface VoiceConnectInput {
  sessionId: string;
  locale: string;
  signal: AbortSignal;
}

interface VoiceChannel {
  dispatch(command: VoiceCommand): void;
  events(): AsyncIterable<VoiceRuntimeEvent>;
  close(): Promise<void>;
}

type VoiceCommand =
  | { type: "capture.set"; active: boolean }
  | {
      type: "turn.context";
      turnId: string;
      generationId: string;
      source: SourceSnapshot;
    }
  | { type: "response.create"; turnId: string; generationId: string }
  | { type: "generation.cancel"; generationId: string }
  | { type: "invitation.speak"; generationId: string; text: string };

type VoiceRuntimeEvent =
  | { type: "speech.started"; providerTurnId?: string }
  | { type: "speech.ended"; providerTurnId?: string }
  | { type: "transcript.partial"; text: string }
  | { type: "transcript.final"; text: string; confidence?: number }
  | { type: "response.text.delta"; generationId: string; text: string }
  | { type: "response.audio.chunk"; generationId: string; audio: ArrayBuffer }
  | { type: "response.completed"; generationId: string }
  | { type: "runtime.error"; code: string; recoverable: boolean };
```

### 14.1 OmniWebRTCProductionAdapter

生产默认 Adapter：

- 浏览器通过自有后端获取短时、单会话 ephemeral credential；长期供应商密钥绝不进入浏览器。
- WebRTC 承载实时音频，data channel 承载控制和规范化事件。
- 关闭供应商自动 response-create；VoiceSession 冻结 SourceSnapshot 并确认 final 后显式创建 response。
- 映射供应商 response/item ID 到 canonical `turnId/generationId`。
- 收到 `generation.cancel` 时同时取消远端 response、停止音频 track 消费并清空 Adapter buffer。
- 供应商私有事件不得直接穿透到 ReadingCompanion caller。

### 14.2 CascadingFallbackAdapter

降级 Adapter：

```text
local/browser VAD
  -> streaming ASR
  -> FastAgent text stream
  -> cancellable streaming TTS
```

合同：

- 与 Omni 实现同一 `VoiceRuntimePort`，上层不改业务逻辑。
- ASR final 后才能提交 ReaderIdea。
- FastAgent 文本可以早于首段 TTS 显示。
- TTS 请求和每个音频 chunk 都必须携带 generationId 和 AbortSignal。
- 句子切分不得等待完整回答，但也不得把未闭合的数字、URL 或引用切成误导音频。
- Omni 到 Cascading 的切换只发生在 turn 之间；切换原因通过 `voice.error` 可观察。

该 Adapter 是可用性降级，不保证达到 Omni 的语音首包延迟。超出预算时界面优先显示文本，不伪装实时语音已达标。

### 14.3 DeterministicReplayAdapter

测试 Adapter：

- 不访问麦克风、网络或真实模型。
- 使用虚拟时钟按 fixture 重放 VoiceRuntimeEvent。
- 可以注入权限拒绝、乱序、重复 final、断线、迟到音频、取消失败和慢 Agent revision 冲突。
- 记录所有 VoiceCommand，供合同测试断言。
- 相同 fixture、命令和虚拟时钟必须产生完全相同的 VoiceEnvelope 序列。

Replay 证明协议行为和状态机确定性，不证明真实声学、模型质量或公网延迟。

## 15. 错误合同

```ts
type AbortReason =
  | "user_interrupted"
  | "transport_lost"
  | "source_unavailable"
  | "capture_stopped"
  | "protocol_violation";

type InvitationBlockReason =
  | "visual_only"
  | "page_hidden"
  | "muted"
  | "transport_not_ready"
  | "user_busy"
  | "already_invited"
  | "expired";

interface VoiceError {
  code:
    | "permission_denied"
    | "unsupported_browser"
    | "source_unavailable"
    | "transport_unavailable"
    | "provider_timeout"
    | "transcript_low_confidence"
    | "echo_suspected"
    | "world_build_failed"
    | "stale_graph_revision"
    | "protocol_violation";
  stage: "attach" | "capture" | "voice" | "agent" | "graph" | "world";
  recoverable: boolean;
  retryAfterMs?: number;
}
```

错误传播：

- 首次 `setListening(true)` 的权限、浏览器和连接错误通过 Promise reject。
- 建连后的错误全部作为 `voice.error` 事件发布。
- listener 自身抛错必须隔离，不能推动状态机；实现记录后继续通知其他 listener。
- `protocol_violation` 为 fatal：停止采集和播放，TransportState 进入 `failed`，等待 caller `close()` 或重新 attach。
- 可恢复错误不得伪造成功的 transcript、ReaderIdea、graph revision 或 world.playable。

## 16. p95 性能预算

在官方支持的浏览器、稳定宽带和生产区同地域网络下测量：

| 指标 | p95 预算 | 测量起止 |
|---|---:|---|
| partial transcript | 300 ms | 可用语音帧进入 Adapter → partial event |
| endpoint detection | 650 ms | 最后有效语音帧 → speech.ended |
| final transcript | 300 ms | speech.ended → transcript.final |
| FastAgent 首个文本 delta | 400 ms | transcript.final → agent.output delta |
| 首段可听音频 | 1500 ms | speech.ended → 首个实际播放 sample |
| 本地 barge-in 静音 | 120 ms | local speech start/interrupt 调用 → 无声 |
| 远端 cancel 发送 | 300 ms | interrupt 调用 → cancel command 已发送 |
| 迟到音频隔离 | 200 ms | interrupt 后 → 旧 generation 不再播放 |
| world 可操作 | 250 ms | world.playable → 可点击入口完成渲染 |
| 安全主动邀请 | 1000 ms | InvitationGate 首次通过 → 首个播放 sample |
| 短暂掉线恢复 | 3000 ms | transport lost → ready |

要求：

- 指标按 Adapter、浏览器、地区分别记录，不把 Replay 数据混入生产分位数。
- Cascading 超预算必须标注降级，不得与 Omni 汇总掩盖。
- 客户端记录单调时钟时间点；服务端跨度使用 trace/correlation ID 对齐。
- 音频首包以“实际进入扬声器播放”计，不以收到网络 chunk 计。

## 17. 隐私与安全

- 麦克风默认关闭，必须由明确用户动作开启。
- 默认不持久化原始音频；诊断录音必须另行明确同意并有自动过期时间。
- partial transcript 只在内存中存在，turn 结束后删除。
- final transcript 只有在形成问题历史或 ReaderIdea 所必需时才保存，并与 SourceSnapshot 一起可删除。
- SourceSnapshot 使用最小必要区块，不发送整本书。
- ephemeral credential 限定会话、短时有效、最小权限；日志不得记录 credential、SDP 私密内容或原始音频。
- `ReaderIdea`、ActiveReadingGraph 和 ExecutableWorld 的访问控制继承当前读者/匿名会话范围。
- `launchHref` 必须经过 allowlist 校验，防止慢 Agent 产生任意跳转。
- telemetry 只记录延迟、状态、错误码和匿名关联 ID；不默认记录正文、transcript 或 Agent 完整回答。
- 用户关闭会话后，浏览器必须停止 MediaStream track，并可从系统麦克风指示器观察到释放。

## 18. Contract tests

合同测试以 `ReadingCompanion` Interface 为测试面，默认使用 `DeterministicReplayAdapter` 与内存 SlowWorld Adapter。测试断言对外事件、命令和领域结果，不断言内部类或私有状态。

| ID | 场景 | 必须断言 |
|---|---|---|
| VS-01 | attach 合法书页 | 不申请权限；source observer 生效；无网络调用 |
| VS-02 | attach 非法 root | 同步失败；没有半初始化实例 |
| VS-03 | 首次允许麦克风 | `setListening(true)` 在 transport ready 且 capture armed 后 resolve |
| VS-04 | 权限拒绝 | Promise reject `permission_denied`；不自动重试；无音频上传 |
| VS-05 | SourceSnapshot 冻结 | speech start 后翻页，final/回答/ReaderIdea 仍引用原区块 |
| VS-06 | 无 active SourceBlock | turn 中止为 `source_unavailable`；不调用 Agent |
| VS-07 | partial 多次修正 | 字幕更新；零 ReaderIdea、零图谱 patch、零外部工具副作用 |
| VS-08 | final question | 仅一个 final；快 Agent收到冻结 source；不自动创建 ReaderIdea |
| VS-09 | final idea | 先 `reader-idea.created`，后 `world.progress`；只启动一个慢任务 |
| VS-10 | 重复 final | 第二个 final 被忽略并记录协议错误；无重复 ReaderIdea |
| VS-11 | caller interrupt | 120 ms 预算内本地静音；发出 generation.cancel；旧事件被 fence |
| VS-12 | 用户 barge-in | 取消 Agent generation，冻结新 SourceSnapshot，开始新 turn |
| VS-13 | 迟到 TTS chunk | cancelled generation 的 chunk 永不进入播放队列 |
| VS-14 | mute | MediaStream track stopped；无后台采集；视觉功能仍可用 |
| VS-15 | transport 中断于 speech | 未 final turn aborted；不缓存音频；重连不伪造 transcript |
| VS-16 | transport 中断于慢任务 | 慢任务继续；按 jobId/lastSeenSeq 恢复进度且不重复事件 |
| VS-17 | Omni turn 间降级 | 当前 turn 完整终止后才换 Cascading；业务事件形状不变 |
| VS-18 | stale graph patch | patch 被拒绝；旧 graph 不被覆盖；world.playable 不发布 |
| VS-19 | world 候选未通过 gate | 只有 progress/failure；无 world.playable 和语音邀请 |
| VS-20 | world 真正 playable | 引用已提交 graph revision；视觉入口先可用 |
| VS-21 | 邀请安全门通过 | 安静 1500 ms 后最多说一次；邀请有独立 generationId |
| VS-22 | 页面隐藏/静音/用户说话 | 视觉通知保留；语音邀请 deferred 或 suppressed |
| VS-23 | 关闭实例 | 释放 track、播放、连接与 observer；resolve 后零事件 |
| VS-24 | listener 抛错 | 其他 listener 与状态机继续；异常被隔离 |
| VS-25 | Replay 确定性 | 相同 fixture 和命令得到逐字节相同 Envelope 序列 |
| VS-26 | 隐私 | partial 和原始音频不落盘；日志无 credential 和正文 |
| VS-27 | 性能预算 | 用虚拟时钟验证门限逻辑，用真实环境单独验证生产 p95 |

### 18.1 关键事件序列 fixture

成功的 ReaderIdea 到世界链路必须满足：

```text
source.active
speech.started
transcript.partial*
speech.ended
transcript.final
reader-idea.created
agent.output(started/delta*/final)
world.progress*
world.playable
invitation.state(eligible)
invitation.state(spoken | deferred | suppressed)
```

`agent.output` 与 `world.progress` 可以并行交错，但以下 happens-before 不可破坏：

- `transcript.final` 在 `reader-idea.created` 之前；
- `reader-idea.created` 在该 idea 的首个 `world.progress` 之前；
- graph revision commit 在 `world.playable` 之前；
- `world.playable` 在任何邀请之前；
- generation cancelled 在旧 generation 的所有丢弃事件之前。

## 19. 完成条件

VoiceSession 只有在以下证据齐全时才可称为 production-ready：

- ReadingCompanion Interface contract tests 全部通过；
- Omni、Cascading 和 Replay 三个 Adapter 通过同一 Adapter conformance suite；
- 真实浏览器完成权限、收听、提问、ReaderIdea、打断、掉线恢复、world.playable 和主动邀请完整路径；
- 真实环境 p95 分 Adapter 报告，未用 Replay 或本地单次数据冒充；
- 麦克风释放、原始音频不落盘、ephemeral credential 和日志脱敏经过检查；
- ActiveReadingGraph revision 冲突与 ExecutableWorld playability gate 有可复现测试证据。
