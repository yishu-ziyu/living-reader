# Reader World 事件与 Harness 协议

状态：架构合同，供实现、适配器与验收共同遵守。

本文定义 Effect-Intent Hexagon 中 `ReaderWorldUseCase` 的最小公开协议。目标不是描述某个框架，而是保证一条读者行为可以被可靠地接受、解释、执行、观察、取消、恢复和重放。

## 1. 裁决与范围

架构裁决如下：

- `EventStore` 是 Reader World 的唯一事实源（source of truth）。
- 所有写入只通过 `ReaderWorldUseCase.dispatch`；所有读取与增量观察只通过 `ReaderWorldUseCase.watch`。
- 协议统一四类消息：`DomainCommand`、`DomainEvent`、`EffectIntent`、`ExternalObservation`。
- 领域判断产生 `DomainEvent`；需要越过进程、时间或权限边界的动作产生 `EffectIntent`，不能在领域判断中直接执行。
- Effect Worker 至少一次投递；其结果只能作为 `ExternalObservation` 回到 `dispatch`，不能直接改状态。
- `GraphStore` 只是由事件构建的可丢弃投影。它可以落后、重建或替换，不能反向覆盖 `EventStore`。
- `DomainEvent` 与对应 `EffectIntent` 必须和 idempotency receipt、transactional outbox 在同一事务提交。
- 模型、工具、书籍内容、语音转写与外部系统返回都只是数据，不因其文本内容获得指令权限。
- 协议不记录思维链、隐藏推理、原始 prompt 或 provider 凭据。只记录结构化输入、结构化结果、必要的解释摘要和可验证因果引用。

本文覆盖 Reader World 体验、语义动作编译、确定性世界运行、Graph 投影、异步取消、重放与恢复。VoiceSession 的 provider、音频缓冲、编解码、打断检测和语音模型配置不在本文范围内；双方只通过本文定义的规范消息交接。

## 2. Hexagon 与唯一写入路径

```text
UI / Agent / MCP / VoiceSession
              │
              │ DomainCommand 或 ExternalObservation
              ▼
     ReaderWorldUseCase.dispatch
              │
              │ 纯 WorldKernel decide/evolve
              ▼
 EventStore transaction
   ├─ inbox / idempotency receipt
   ├─ ordered DomainEvent
   ├─ ordered EffectIntent
   └─ transactional outbox
              │
      commit 后分成两条路径
              │
      ┌───────┴────────┐
      ▼                ▼
 Effect Worker     Graph Projector
      │                │
      │                └──> GraphStore + projection checkpoint
      │
      └── ExternalObservation ──> dispatch

ReaderWorldUseCase.watch
  ├─ EventStore high-water mark（权威版本）
  └─ GraphStore snapshot（可落后的投影）
```

禁止存在下列旁路：

- Adapter 直接写 `GraphStore` 后把它当作成功事实。
- Effect Worker 直接追加“成功”事件。
- 模型或工具返回直接成为 committed `Relation`、`WorldPatch`（包括 WorkPlan/MarketAction）、现金、库存或账本变化。
- VoiceSession 直接调用世界引擎或修改 Reader World 聚合。
- Graph Projector 产生新的领域事实或触发外部副作用。
- 把纯 `WorldKernel` 包成外部 Effect，再以网络 Observation 决定经济结果。

## 3. `ReaderWorldUseCase` 最小 Interface

语言无关合同如下；具体实现可映射到 TypeScript、Go 或其他语言。

```ts
interface ReaderWorldUseCase {
  dispatch(
    input: DomainCommandEnvelope | ExternalObservationEnvelope,
  ): Promise<DispatchResult>;

  watch(query: WatchQuery): AsyncIterable<WatchFrame>;
}
```

没有第三个写入口。后台任务完成、超时、取消确认和 VoiceSession 回传也走 `dispatch`。

### 3.1 `dispatch`

`dispatch` 的成功只表示相关事实已经提交到 `EventStore`，不表示尚未执行的 Effect 已经成功。

```ts
type DispatchResult =
  | {
      ok: true;
      receipt: {
        messageId: MessageId;
        experienceId: ExperienceId;
        previousVersion: StreamVersion;
        committedVersion: StreamVersion;
        emittedEventIds: readonly MessageId[];
        emittedEffectIds: readonly EffectId[];
        duplicate: boolean;
      };
    }
  | { ok: false; error: ProtocolError };
```

同一 idempotency key 与同一 canonical payload 重试时，返回第一次的 receipt，`duplicate: true`，不得产生新事件或新 Effect。相同 key 携带不同 payload 时返回 `IDEMPOTENCY_KEY_REUSED`。

### 3.2 `watch`

```ts
interface WatchQuery {
  experienceId: ExperienceId;
  afterVersion?: StreamVersion;
  minimumProjectedVersion?: StreamVersion;
  timeoutMs?: number;          // 0..25_000
  maxItems?: number;           // 默认 100，最大 500
}

interface WatchFrame {
  experienceId: ExperienceId;
  authoritativeVersion: StreamVersion;
  projectedVersion: StreamVersion;
  consistency: "current" | "catching_up";
  lag: number;
  snapshot: ReaderWorldGraphView;
  events: readonly PublicEventView[];
  nextVersion: StreamVersion;
}
```

约束：

- `authoritativeVersion` 来自 `EventStore`；`projectedVersion` 来自 Graph Projector checkpoint。
- `projectedVersion < authoritativeVersion` 时必须明确返回 `catching_up` 和 lag，不能把旧投影伪装成当前状态。
- `minimumProjectedVersion` 在 timeout 内未达到时，返回带当前投影的 `PROJECTION_STALE` frame/error；不得偷偷读取旧快照并声称满足强一致。
- `watch` 只返回公开事件视图和 Graph 投影，不返回原始 prompt、思维链、provider 响应或密钥。

## 4. 统一 Envelope

四类消息共享一个 envelope，以便追踪因果、验证来源和做版本迁移。字段名采用 snake_case；整数金额使用最小货币单位，数量和 tick 使用整数，禁止依赖浮点舍入。

```json
{
  "protocol_version": "reader-world-protocol/v1",
  "message_id": "msg_...",
  "message_type": "domain_command | domain_event | effect_intent | external_observation",
  "message_name": "reader_world.reader_idea.proposed.v1",
  "schema_version": 1,
  "experience_id": "exp_...",
  "correlation_id": "corr_...",
  "causation_id": "msg_... | null",
  "recorded_at": "RFC3339 timestamp",
  "producer": {
    "module": "reader_world | voice_session | llm_proposer",
    "instance": "opaque instance id"
  },
  "security": {
    "principal_id": "authenticated principal or system identity",
    "authority": "reader | operator | system | external_data",
    "authentication_context": "opaque verified context",
    "integrity": "local | signed_remote"
  },
  "payload_hash": "sha256(canonical payload)",
  "payload": {}
}
```

共同约束：

- `message_id` 全局唯一且不可复用。
- `correlation_id` 串起一次用户意图到最终可见结果；同一 Effect 的 Intent、Observation 和派生 Event 使用同一 correlation。
- `causation_id` 必须指向直接原因：Event 指向 Command/Observation，EffectIntent 指向产生它的 Event；Effect 结果 Observation 指向 EffectIntent，Voice 输入 Observation 指向 canonical VoiceEnvelope message id。
- `recorded_at` 只用于审计，不参与领域计算和 exact replay hash。
- `payload_hash` 基于 canonical JSON；键排序、整数编码、Unicode 规范化规则必须固定。
- `producer` 和 `security` 由可信 Adapter 注入，不能接受客户端自报。
- 任何原始音频、完整模型 prompt、思维链、provider credential、内部网络地址均不得进入 envelope。

`EventStore` 是一个逻辑事实源，不限定为一张表。其最小持久结构为：

- inbox：保存已通过身份与基础 schema 校验的 canonical Command/Observation envelope、payload hash、处理状态和最终 receipt；
- stream：保存按 experience 排序的 DomainEvent，以及与 commit 关联的 EffectIntent；
- outbox：保存与 EffectIntent 同事务创建的投递记录、lease、attempt 和 terminal receipt；
- snapshot（可选）：仅加速 Event fold，必须携带 stream version，删除后可由 stream 重建。

因此 decision replay 所需的 Command/Observation 不依赖普通应用日志；日志丢失也不影响审计或恢复。身份验证前的垃圾流量可以进入独立安全审计系统，但不是 Reader World 的领域事实。

### 4.1 DomainCommand 扩展字段

```json
{
  "idempotency_key": "principal-scoped opaque key",
  "expected_version": 12,
  "deadline_at": "RFC3339 timestamp | null",
  "payload": {}
}
```

- `expected_version` 除 `reading_session.open` 外必填。
- `reading_session.open` 使用 `expected_version: -1`，表示 stream 必须不存在。
- key 的唯一域为 `(principal_id, experience_id-or-start-scope, idempotency_key)`。
- Command 只能由已授权 reader/operator/system Adapter 构造；公网客户端不能提交 Event 或 EffectIntent。

### 4.2 DomainEvent 扩展字段

```json
{
  "stream_version": 13,
  "event_index_in_commit": 0,
  "payload": {}
}
```

- 同一 experience 内 `stream_version` 严格单调递增、无空洞。
- 同一事务产生多个 Event 时，以 `event_index_in_commit` 定序。
- Event 使用过去式，只陈述已提交事实。

### 4.3 EffectIntent 扩展字段

```json
{
  "effect_id": "eff_...",
  "basis_version": 13,
  "relevance_hash": "sha256(relevant aggregate slice)",
  "dedupe_key": "effect-type + semantic input hash",
  "attempt": 1,
  "deadline_at": "RFC3339 timestamp",
  "cancel_mode": "best_effort | guaranteed_before_start",
  "expected_observation_schema": ".../v1",
  "payload": {}
}
```

- EffectIntent 使用命令式名称，但不是 DomainCommand；它只供匹配的 Effect Worker 消费。
- `basis_version` 是生成 Intent 时的聚合版本。
- `relevance_hash` 只覆盖该结果成立所依赖的状态片段，避免无关 Event 导致误判 stale。
- Adapter 必须使用 `effect_id` 或 `dedupe_key` 做下游幂等；仅依赖 outbox “恰好一次”是不成立的。

### 4.4 ExternalObservation 扩展字段

```json
{
  "observation_id": "obs_...",
  "effect_id": "eff_... | null",
  "intent_message_id": "msg_... | null",
  "basis_version": 13,
  "attempt": 1,
  "observed_at": "RFC3339 timestamp",
  "outcome": "completed | failed | cancelled | user_input",
  "payload": {}
}
```

- Effect 结果必须同时引用 `effect_id` 和 `intent_message_id`。
- VoiceSession 的读者输入不是某个 Effect 的结果时，两字段可为空，但必须携带可信 capture binding。
- Observation 永远是待验证数据。只有 `dispatch` 验证 schema、来源、相关性和领域 invariant 后，才能产生 DomainEvent。
- Observation 的到达顺序不等于发生顺序；领域排序以聚合提交顺序为准。

## 5. 最小消息集合

消息名包含 `v1` schema；增加可选字段不改变语义时可保持版本，改变 invariant 或含义时必须升版。

### 5.1 DomainCommand

| 名称 | 最小 payload | 前置条件 | 结果 |
|---|---|---|---|
| `reader_world.reading_session.open.v1` | `book_id, book_revision, initial_source_id, scenario_id, locale, seed?` | stream 不存在 | `reading_session.opened` |
| `reader_world.source_focus.set.v1` | `source_ids[]` | 已开始；source IDs 属于当前书目版本 | `source_focus.changed` |
| `reader_world.idea.submit.v1` | `idea_kind, text, source_ids[], evidence_refs[]` | source 已激活；phase 允许该 idea kind | `reader_idea.proposed`，必要时开始 proposal generation |
| `reader_world.proposal.review.v1` | `proposal_id, proposal_kind, decision, corrections?` | proposal pending、basis 未 stale | `relation.reviewed` 或 `world_patch.reviewed` |
| `reader_world.graph.commit.v1` | `reviewed_relation_ids[], reviewed_patch_ids[], basis_graph_revision` | Relation/Patch 均已接受且证据完整 | `graph.committed` |
| `reader_world.world.run.v1` | `graph_revision, seed` | PlayabilityGate 通过；graph 内 patch 已提交 | 纯 Kernel 产生 `world.seeded`、`world.event.recorded*`、`evidence_snapshot.produced` |
| `reader_world.world.action.v1` | `world_id, action, expected_world_revision` | action allowlisted；当前世界允许 | 纯 Kernel 产生一个或多个 `world.event.recorded` |
| `reader_world.effect.cancel.v1` | `effect_id, reason?` | Effect 非 terminal | `effect.cancellation_requested` + cancel Intent |
| `reader_world.reconciliation.resolve.v1` | `case_id, resolution, evidence_refs[]` | operator 权限；当前 case 未解决 | `reconciliation.resolved` |

`idea.submit.idea_kind` 的最小枚举为：

- `prediction`：直接记录读者预测，不调用模型改写。
- `connection`：请求产生带 typed edge 与 evidence refs 的 `Relation` 候选。
- `work_plan`：产生 `WorldPatch(kind=work_plan)` 候选；其 operations 必须是 allowlist 中的组织动作。
- `market_action`：产生 `WorldPatch(kind=market_action)` 候选；必须已有 baseline run。
- `question`：可产生回答 Effect，但回答不能改世界事实。

`proposal.review.decision` 的最小枚举为 `accept | reject | revise`。`revise` 必须带结构化 corrections 或新文本；`accept` 不允许替换提案中的结构化对象。`graph.commit` 只提交已经 review 的 Relation/WorldPatch，不接受模型 JSON；同一 graph revision 因而同时固定 source graph 与本次可运行 patch 集。

### 5.2 DomainEvent

| 名称 | 事实与最小 payload |
|---|---|
| `reader_world.reading_session.opened.v1` | `book_id, book_revision, initial_source_id, scenario_id, locale, seed` |
| `reader_world.source_focus.changed.v1` | `source_ids[], added_source_ids[], removed_source_ids[]` |
| `reader_world.reader_idea.proposed.v1` | `idea_id, idea_kind, original_text, source_ids[], evidence_refs[], confidence` |
| `reader_world.proposal.generation_started.v1` | `proposal_kind: relation/world_patch/answer, effect_id, idea_id, basis_version` |
| `reader_world.relation.proposed.v1` | `relation_id, from_source_id, to_source_id, typed_edge, evidence_refs[], basis_version, confidence, ambiguities[]` |
| `reader_world.world_patch.proposed.v1` | `patch_id, patch_kind: work_plan/market_action, operations[], inverse_operations[], evidence_refs[], basis_version, ambiguities[]` |
| `reader_world.answer.ready.v1` | `answer_id, semantic_text, source_ids[], evidence_refs[], uncertainty_summary`；只读回答，不改变 graph/world |
| `reader_world.proposal.clarification_required.v1` | `idea_id, questions[], reason_code` |
| `reader_world.relation.reviewed.v1` | `relation_id, decision, reviewed_relation?, reviewer_id` |
| `reader_world.world_patch.reviewed.v1` | `patch_id, decision, reviewed_patch?, reviewer_id` |
| `reader_world.graph.committed.v1` | `graph_revision, source_ids[], relation_ids[], world_patch_ids[], typed_edges[], confirmed_by` |
| `reader_world.world.seeded.v1` | `world_id, graph_revision, applied_patch_ids[], seed, ruleset_version, initial_snapshot` |
| `reader_world.world.event_recorded.v1` | `world_id, world_revision, event_kind, deltas[], caused_by[], ledger_entry` |
| `reader_world.evidence_snapshot.produced.v1` | `evidence_id, graph_revision, world_revision, prediction_ref?, ledger_event_ids[], source_ids[], model_boundary` |
| `reader_world.operation.failed.v1` | `operation_kind, effect_id?, typed_error, retryable` |
| `reader_world.effect.cancellation_requested.v1` | `effect_id, reason?, cancel_effect_id` |
| `reader_world.effect.cancelled.v1` | `effect_id, terminal_status` |
| `reader_world.effect_result.ignored.v1` | `effect_id, observation_id, reason: duplicate/stale/cancelled/superseded` |
| `reader_world.reconciliation.required.v1` | `case_id, effect_id, reason, known_facts[], unknowns[], safe_actions[]` |
| `reader_world.reconciliation.resolved.v1` | `case_id, resolution, evidence_refs[], operator_id` |

规范主链因此是：

```text
ReadingSessionOpened
→ SourceFocusChanged
→ ReaderIdeaProposed
→ RelationProposed / WorldPatchProposed
→ RelationReviewed / WorldPatchReviewed
→ GraphCommitted
→ WorldSeeded
→ WorldEventRecorded*
→ EvidenceSnapshotProduced
```

说明：

- `relation.proposed`、`world_patch.proposed` 与 `answer.ready` 保存的是 schema-valid、domain-valid 结果，不是模型原始输出；answer 没有 commit 权限。
- `WorldKernel` 只接受已 review/commit 的 graph 与 patch；它是纯函数，不走 outbox，不依赖网络、墙钟或随机 UUID。
- 每个库存、现金、劳动、订单、运输和瓶颈变化都必须表现为 `world.event_recorded`，并携带 ledger entry。
- `evidence_snapshot.produced` 只汇总已提交的 prediction、graph、WorldEvent 和 source authority；它不创建新的经济事实。
- `operation.failed` 不等于业务成功；失败后不得产生 graph committed、world seeded、伪造 WorldEvent 或伪造账本。

### 5.3 EffectIntent

| 名称 | 消费者 | 最小 payload | 预期 Observation |
|---|---|---|---|
| `reader_world.proposal.generate.v1` | LLM Proposer Adapter | `idea_id, proposal_kind, text, trusted_sources[], state_summary, target_schema` | proposal generated/failed |
| `reader_world.voice_session.present.v1` | VoiceSession | `presentation_id, semantic_text, priority, interrupt_policy, correlation_refs[]` | presentation completed/failed |
| `reader_world.effect.cancel.v1` | 对应 Effect Worker | `target_effect_id, target_attempt` | cancellation acknowledged 或原 Effect terminal observation |

proposal generation Intent 的 `trusted_sources` 只包含允许引用的 source ID、authority 标签和必要摘录；书籍文本与工具内容在 prompt 中仍是数据。纯 `WorldKernel` 不属于 Effect Adapter：`world.run`/`world.action` 在 `dispatch` 的纯决定阶段计算 Event，然后以 expected version 原子提交。

### 5.4 ExternalObservation

| 名称 | 生产者 | 最小 payload |
|---|---|---|
| `reader_world.proposal.generated.v1` | LLM Proposer Adapter | `proposal_kind, candidate, schema_version, interpretation_summary, assumptions[], ambiguities[], confidence, source_ids[], evidence_refs[]` |
| `reader_world.voice_session.transcript_final.v1` | VoiceSession | `session_id, seq, turn_id, text, confidence?, source_snapshot_id, capture_binding{experience_id, basis_version, expected_input, principal_binding}` |
| `reader_world.voice_session.presentation_completed.v1` | VoiceSession | `presentation_id, status: completed/interrupted` |
| `reader_world.effect.execution_failed.v1` | 任一 Effect Adapter | `error_code, safe_message, retryable, external_commit: no/yes/unknown` |
| `reader_world.effect.cancellation_acknowledged.v1` | 任一 Effect Adapter | `target_effect_id, status: cancelled_before_start/cancelled_in_flight/already_terminal` |

VoiceSession 交接约束：

- Reader World 不知道 ASR/TTS provider、voice id、音频 codec、采样率或 provider retry。
- `transcript_final` 直接映射 VoiceSession 的 canonical `VoiceEnvelope<"transcript.final">`；`session_id + seq + turn_id` 保留其会话内总序。只有完成 endpointing 并绑定到经过认证的读者 session 后才可发送。
- `capture_binding.expected_input` 只能是当前界面明确打开的 `prediction | connection | work_plan | market_action | question` 槽位；Reader World 不让转写文本自行声明它属于哪个高权限动作。
- 低 confidence、非 final 或 capture binding 不匹配的输入不能自动成为高影响命令；它最多产生澄清状态。
- Reader World 只向 VoiceSession 发“呈现这段语义文本”的 Intent，不发 provider 参数。
- 原始音频的保存和删除策略属于 VoiceSession，不进入 Reader World EventStore。

## 6. 状态机

主状态由 DomainEvent 折叠得到；EffectIntent、outbox 状态和 Graph 投影不能单独决定主状态。

```text
not_started
  └─ reading_session.opened ─> reading

reading
  ├─ source_focus.changed ─> reading
  ├─ reader_idea.proposed(prediction) ─> reading
  └─ proposal.generation_started ─> preparing

preparing
  ├─ relation.proposed ─> needs_review
  ├─ world_patch.proposed ─> needs_review
  ├─ proposal.clarification_required ─> reading
  ├─ operation.failed ─> reading / blocked（按 typed error）
  └─ effect.cancelled ─> reading

needs_review
  ├─ relation.reviewed(accept) ─> graph_draft_ready
  ├─ world_patch.reviewed(accept) ─> graph_draft_ready
  ├─ reviewed(reject) ─> reading
  └─ reviewed(revise) + proposal.generation_started ─> preparing

graph_draft_ready
  └─ graph.committed ─> playable

playable
  ├─ world.seeded + world.event_recorded* + evidence_snapshot.produced
  │    └─> evidence_ready
  ├─ proposal.generation_started(world_patch) ─> preparing
  └─ reconciliation.required ─> reconciliation_required

evidence_ready
  ├─ world.event_recorded* + evidence_snapshot.produced ─> evidence_ready
  ├─ proposal.generation_started(market_action) ─> preparing
  ├─ graph.committed(same relations/work plan, new market patch) ─> playable
  └─ source_focus.changed ─> reading

reconciliation_required
  └─ reconciliation.resolved ─> 由 resolution 指定的安全状态
```

全局规则：

- `reconciliation_required` 时除 `watch`、`effect.cancel` 和特权 `reconciliation.resolve` 外拒绝写命令。
- 同一 experience 同时最多一个会生成 Relation/WorldPatch 的活动外部 Effect。Voice presentation 可以并行，但不能改变主状态。
- source focus、proposal、review、graph revision 和 world action 都带所属 experience 与 basis version，不能跨体验复用。
- accepted market action 是带 inverse operations 的 allowlisted WorldPatch。对低风险、可逆的 MVP 动作，读者当前明确的行动句，或唯一命中有效 PendingIntent 的承接句，本身就是该次 action 的 review/commit 意图；不得再增加审批/预览 UI。重跑仍必须显式引用同一 graph/work-plan revision 与新的 market patch。
- `world.run` 与 `world.action` 通过纯 WorldKernel 一次决定并一次提交，不把“计算中”误建模为外部世界已经发生。

### 6.1 领域 invariant

- SourceBlock 使用稳定 source ID 与明确 book revision；页码只能用于显示。
- Relation 必须有 typed edge、双方 source IDs、evidence refs 和 basis version；未知自由文本 edge 不能 commit。
- GraphCommitted 只能引用已 review=accept 且仍基于当前 source/graph revision 的 Relation/WorldPatch。
- WorldPatch 只能包含 allowlisted operations，并必须带 inverse operations、evidence refs 和 basis version。
- LLM 只能产生候选 Relation/WorldPatch/answer。LLM 主动提出的 Relation/机制 WorldPatch 只有读者明确 review/commit 后才能进入 WorldKernel；由读者明确行动 turn 编译出的低风险 allowlisted runtime action，可把该 turn 作为同轮授权，不要求二次确认。歧义、低置信、stale 或不可逆动作仍不得进入 WorldKernel。
- 相同初始状态、confirmed Command、seed 和 ruleset version 必须产生相同 WorldEvent 序列。
- 每个库存、现金、劳动、订单、运输和瓶颈变化都必须对应一个 ledger entry；不得负库存、超额履约、无限劳动或无来源现金。
- 市场扩展必须显式包含运输成本和延迟；专业化只能改变 ruleset 声明的参数。
- EvidenceSnapshot 只能引用已提交的 source IDs、typed edges、读者预测和 WorldEvent IDs，并明确 `primary_text | honest_paraphrase | editorial/model_extension`。

## 7. 提交、排序与 transactional outbox

### 7.1 Command 提交顺序

`dispatch(DomainCommand)` 必须依次执行：

1. 验证 envelope schema、payload hash、身份、权限和 deadline。
2. 在 EventStore inbox 中按 idempotency key 查询既有 receipt。
3. 读取 experience 当前 Event stream 并折叠状态。
4. 比较 `expected_version`；不匹配则零写入返回 `EXPECTED_VERSION_MISMATCH`。
5. 校验状态机、source authority、proposal freshness 和领域 invariant。
6. 用纯 `WorldKernel.decide(state, command, deterministicEnv)` 产生零个或多个 DomainEvent 与 EffectIntent；需要演进中间状态时只调用纯 `evolve`。
7. 在一个数据库事务中写入：inbox receipt、按序 Event、按序 Intent、每个 Intent 对应的 outbox row。
8. commit 后才返回成功 receipt。
9. outbox dispatcher 在 commit 后投递 Effect；Graph Projector 在 commit 后更新投影。

任何一步失败均不能留下部分 Event、孤儿 outbox 或“已成功”receipt。

对 `world.run`/`world.action`，`deterministicEnv` 只能含 Command 已固定的 seed、ruleset version 和确定性 ID 派生器；禁止读取网络、系统墙钟或随机 UUID。Kernel 计算可在数据库事务外完成，但 compare-and-append 必须仍使用原 expected version；若计算期间版本变化，丢弃计算结果并返回冲突，不能重基后静默提交。

### 7.2 Observation 提交顺序

`dispatch(ExternalObservation)` 必须依次执行：

1. 验证生产者身份或远程签名、schema、payload hash 与 observation idempotency。
2. Effect 结果解析对应 EffectIntent；Voice 输入则验证 canonical VoiceEnvelope 与 capture binding。两类都不允许彼此冒充。
3. 对 Effect 结果检查 attempt、terminal status、取消状态、basis version 和 relevance hash；对 Voice 输入检查 session seq、turn 唯一性、expected input 和 source snapshot basis。
4. 对 payload 做 schema 校验和领域 invariant 校验。
5. 分类为 `apply`、`ignore` 或 `reconcile`。
6. `apply`：由纯领域判断产生 DomainEvent；`ignore`：产生 `effect_result.ignored`；`reconcile`：产生 `reconciliation.required`。
7. 将 observation inbox receipt、DomainEvent 和后续 EffectIntent 原子提交。

### 7.3 outbox 语义

- outbox 是至少一次投递，不承诺网络上的 exactly-once。
- Worker 以 `effect_id` 作为主幂等键；同一 attempt 重投不得重复外部副作用。
- Worker 获得结果后先形成稳定 `observation_id`，再调用 `dispatch`。若 dispatch 超时，重试同一 Observation，不重新执行 Effect。
- outbox 标记 delivered 只能发生在 Observation 已被 EventStore 接受或被确定性判为 duplicate 之后。
- “外部动作可能已经发生但无法得到可信结果”不能伪造 completed；必须进入 `reconciliation_required`。

### 7.4 每个 experience 的总序

- EventStore 对单个 experience 提供 compare-and-append。
- stream version 决定领域总序；墙钟时间不能覆盖此顺序。
- 不同 experience 可并行。
- Graph Projector 按 stream version 应用，同一 Event 重投必须幂等。
- 跨 experience 不声明全局业务顺序；需要关联时只使用 correlation，而不假装分布式事务。

## 8. Idempotency 与 expected version

| 场景 | 结果 |
|---|---|
| 同 key、同 payload、第一次已提交 | 返回原 receipt，不新增任何消息 |
| 同 key、同 payload、第一次仍处理中 | 返回同一 pending receipt/状态，不启动第二份工作 |
| 同 key、不同 payload | `IDEMPOTENCY_KEY_REUSED` |
| 新 key、旧 expected version | `EXPECTED_VERSION_MISMATCH`，零写入 |
| 重复 Observation id | 返回原 receipt；Effect 结果不重复应用 |
| 同 Effect 的不同 Observation id、相同结果 hash | 记录或判定 duplicate，不重复领域变化 |
| 同 Effect 的冲突结果 | `reconciliation.required`，禁止选择“看起来更成功”的一个 |

Idempotency 不能代替 optimistic concurrency：前者防止同一意图重复执行，后者防止两个不同意图覆盖彼此。

## 9. Stale Observation

Observation 的 `basis_version` 早于当前版本不自动等于无效。`dispatch` 比较 `relevance_hash` 和 Effect terminal 状态：

1. **无关变化**：当前 relevant slice hash 仍相同，重新跑当前 schema/invariant 校验后可 apply。
2. **安全过期**：例如旧语义提案对应的 source focus 已变、任务已取消、proposal 已被替代。追加 `effect_result.ignored(reason=stale|superseded|cancelled)`，不应用结果。
3. **外部副作用不确定**：例如 Adapter 报告 `external_commit=unknown`，或得到两个冲突的 terminal Observation。追加 `reconciliation.required`，阻断后续有风险的写入。
4. **伪造或错配**：effect id、intent id、attempt、producer 或签名不匹配，返回 typed error，并进入安全审计；不追加成功事件。

stale Observation 绝不能“为了继续流程”被静默当作当前结果。

## 10. 异步取消

取消是一条新的领域意图，不是删除既有事件：

1. `effect.cancel` Command 带当前 `expected_version`。
2. 若目标 Effect 尚未 terminal，原子追加 `effect.cancellation_requested` 和新的 cancel EffectIntent。
3. Worker 在 claim 前、外部调用前、外部调用后提交 Observation 前都检查取消标记。
4. `guaranteed_before_start` 只能承诺未开始的任务不会执行；`best_effort` 必须向调用方暴露不能撤回的可能性。
5. 收到 cancellation acknowledged 后追加 `effect.cancelled`。
6. 原 Effect 结果若晚到：无外部副作用则 ignore；外部动作已发生或未知则进入 reconciliation。
7. UI/VoiceSession 只能在看到 committed cancellation Event 后显示“已停止”；收到请求不等于已经停止。

取消不回滚已提交的 DomainEvent。需要补偿时，应产生新的显式 Command、EffectIntent 和 Event，而不是改写历史。

## 11. `reconciliation_required`

该状态用于“系统无法从现有事实安全判断外部世界发生了什么”，不是普通 retry UI。

进入条件至少包括：

- 外部动作可能已提交，但 Observation 丢失或互相冲突。
- Adapter 无法证明取消发生在副作用之前。
- 已保存 Observation 与领域 invariant 冲突，却存在外部 commit 证据。
- EventStore receipt、outbox terminal 状态和外部查询结果无法一致化。

`reconciliation.required` 必须保存：已知事实、未知项、受影响 Effect、允许的安全动作和禁止动作；不得保存猜测为事实。

只有具有 operator 权限的 `reconciliation.resolve` 可以解除，resolution 最小枚举为：

- `confirm_applied`：有独立证据证明外部动作已发生，随后用规范 Observation 补齐领域事实。
- `confirm_not_applied`：有独立证据证明未发生，可安全 retry。
- `abandon`：保持外部结果未知，封存该 Effect 并恢复到不依赖它的安全状态。

resolution 必须引用 evidence refs 和 operator identity，不能直接手改 GraphStore。

## 12. GraphStore 投影合同

GraphStore 至少投影以下节点：

- `SourceNode`
- `ReaderIdea`
- `RelationProposal`
- `WorldPatch`
- `ActiveReadingGraphRevision`
- `ExecutableWorld`
- `LedgerEntry`
- `EvidenceClaim`

最小关系：

- `ReaderIdea -[ANCHORED_TO]-> SourceNode`
- `ReaderIdea -[PROPOSED]-> RelationProposal | WorldPatch`
- `RelationProposal -[FROM | TO]-> SourceNode`
- `ActiveReadingGraphRevision -[COMMITTED_RELATION]-> RelationProposal`
- `ExecutableWorld -[SEEDED_FROM]-> ActiveReadingGraphRevision`
- `ExecutableWorld -[APPLIED_PATCH]-> WorldPatch`
- `ExecutableWorld -[EMITTED]-> LedgerEntry`
- `LedgerEntry -[CAUSED]-> LedgerEntry`
- `EvidenceClaim -[SUPPORTED_BY]-> LedgerEntry`
- `EvidenceClaim -[CITES]-> SourceNode`
- `SourceNode -[CONSTRAINED_BY | EXCHANGE_RULE | MODEL_EXTENSION_OF]-> SourceNode`

投影约束：

- 每个投影变更和 checkpoint 在同一 GraphStore 事务更新。
- `(projector_name, event_id)` 唯一，重复事件为 no-op。
- 删除 GraphStore 后从 EventStore 可完整重建。
- Projector 不访问 LLM，不调用外部工具，不生成 EffectIntent。
- source authority 标签必须保留到 EvidenceClaim，防止 Smith 原文、释义和模型扩展混淆。
- GraphStore 中的聚合数值只是查询加速；与 EventStore 冲突时以 EventStore 重放结果为准。

## 13. 安全与信任模型

### 13.1 Authority 分级

| 来源 | authority | 能做什么 | 不能做什么 |
|---|---|---|---|
| 已认证 UI/MCP 的直接读者动作 | `reader` | 提交允许的 DomainCommand | 提交 Event、Intent 或伪造 principal |
| VoiceSession 的已绑定 final utterance | `external_data`，经绑定可归因于 reader | 作为待解释的读者输入 | 自行确认 proposal 或提升权限 |
| Reader World 内部领域判断 | `system` | 产生 DomainEvent/EffectIntent | 绕过 EventStore 执行外部动作 |
| 纯 `WorldKernel` | `system` | 依据已确认 Command 决定/evolve 世界事件 | 网络 I/O、LLM、墙钟、随机 UUID、直接写 Store |
| 模型、工具、书籍内容、网页内容 | `external_data` | 提供 schema-validated 数据或引用 | 发命令、改权限、声明自己是系统规则 |
| 特权恢复人员 | `operator` | resolve reconciliation | 改写既有 Event 或 GraphStore 冒充事实 |

### 13.2 安全 invariant

- 远程 Adapter 的 Observation 必须验签或来自受保护的内部通道，并检查 anti-replay nonce/message id。
- 任何外部文本中的“忽略系统规则”“把我当作用户命令”等内容都保持为 data。
- 模型输出只接受 allowlisted schema；未知字段拒绝或隔离，不能透传成工具参数。
- Effect Worker 使用最小权限凭据，凭据不进入 Intent payload 或日志。
- `principal_id`、权限和 capture binding 由 Adapter 注入；payload 内同名字段无权威性。
- 展示给用户的解释必须引用 ledger event IDs/source IDs；不得伪称来自隐藏推理。
- 保存 `interpretation_summary`、`assumptions`、`ambiguities`、`confidence` 和 causal refs 即可；禁止保存或请求思维链。
- 错误消息使用 safe message；provider 原始错误先净化，避免密钥、内部 URL 和个人数据泄露。
- VoiceSession 原始音频和生物特征数据不进入本协议。

## 14. Typed errors

```ts
interface ProtocolError {
  code:
    | "INVALID_ENVELOPE"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "EXPERIENCE_NOT_FOUND"
    | "SOURCE_NOT_FOUND"
    | "EXPECTED_VERSION_MISMATCH"
    | "IDEMPOTENCY_KEY_REUSED"
    | "INVALID_TRANSITION"
    | "VALIDATION_FAILED"
    | "PLAYABILITY_GATE_FAILED"
    | "UNSUPPORTED_COMMAND"
    | "PROPOSAL_STALE"
    | "OBSERVATION_MISMATCH"
    | "STALE_OBSERVATION"
    | "EFFECT_ALREADY_TERMINAL"
    | "CANCELLATION_NOT_GUARANTEED"
    | "RECONCILIATION_REQUIRED"
    | "PROJECTION_STALE"
    | "DEADLINE_EXCEEDED"
    | "STORE_UNAVAILABLE"
    | "CORRUPT_STREAM";
  safeMessage: string;
  retryable: boolean;
  currentVersion?: StreamVersion;
  reconciliationCaseId?: string;
  details?: Readonly<Record<string, unknown>>;
}
```

约束：

- 业务与协议错误通过 typed result 返回；程序缺陷可由最外层 Adapter 转为不泄密的内部错误。
- `retryable=true` 只表示允许用相同语义重试，不表示应该复用已经冲突的 expected version。
- `EXPECTED_VERSION_MISMATCH` 必须返回 current version，调用方先 `watch` 再决定是否重试。
- `STORE_UNAVAILABLE` 时不得生成本地“暂存成功”或更新 GraphStore 冒充提交。
- `CORRUPT_STREAM` 与 `RECONCILIATION_REQUIRED` 都默认阻断写入。
- 若某个 Observation 被成功归类并提交了 `reconciliation.required`，该次 dispatch 返回成功 receipt；之后被阻断的普通 Command 才返回带 case id 的 `RECONCILIATION_REQUIRED`。这避免调用方因误判失败而重复写 reconciliation case。

## 15. Exact replay 与 behavioral replay

两种 replay 解决不同问题，不能互相替代。

### 15.1 Exact replay

目的：证明已发生的历史可以精确恢复。

- 输入是 EventStore 中按 stream version 排序的 DomainEvent；不重新调用模型、VoiceSession 或其他外部系统，也不为恢复既有历史而重新运行 WorldKernel。
- 使用事件声明的 schema/ruleset version 和纯 upcaster。
- 重建后的 aggregate state、Graph 节点/边、ledger canonical hash、world snapshot canonical hash 必须与原结果一致。
- `recorded_at`、trace id、投递次数等非领域 metadata 不进入语义 hash。
- EffectIntent 与 ExternalObservation 用于审计因果和验证历史，但已提交领域状态只由 DomainEvent 折叠。
- exact replay 期间绝不重新投递 outbox。

可选的 decision replay 还可重放已保存的 Command/Observation，使用固定 clock、ID source、seed、schema/ruleset 和 scripted Adapter，断言产生相同的 canonical DomainEvent。它用于检测 decide 逻辑漂移，不代替 Event replay。

### 15.2 Behavioral replay

目的：证明新实现、新模型或新 Adapter 仍满足产品行为，而非复刻每个字节。

- 输入相同的语义 Command 场景，但允许新的 message IDs、时间、措辞和解释摘要。
- 可以使用新模型或 Adapter；所有外部结果仍必须经过相同 schema、确认门和领域 invariant。
- 断言用户可见状态、允许/拒绝分支、因果结构和经济 invariant。
- 必须保持：同初始世界 + 同 confirmed action + 同 seed + 同 ruleset version ⇒ 同经济账本与结果。
- 若 ruleset version 有意变化，则比较声明的迁移预期，而不是假装 exact。

## 16. Harness 执行协议

Harness 不拥有另一套领域接口。它只编排公开 `dispatch/watch`、测试 Adapter、EventStore fixture 与故障注入点。

```ts
interface HarnessScenario {
  scenarioVersion: "reader-world-harness/v1";
  caseId: string;
  mode: "exact_event" | "exact_decision" | "behavioral";

  fixtures: {
    bookRevision: string;
    sourceFixture: string;
    rulesetVersion: string;
    initialEventStream?: string;
    scriptedObservationSet?: string;
  };

  deterministicEnv: {
    seed: string;
    fixedClock: string;
    idNamespace: string;
  };

  allowLiveExternalEffects: false;
  steps: readonly HarnessStep[];
  assertions: readonly HarnessAssertion[];
}

type HarnessStep =
  | { kind: "dispatch"; envelopeRef: string }
  | { kind: "watch"; queryRef: string }
  | { kind: "deliver_effect"; effectIdRef: string; observationRef: string }
  | { kind: "duplicate_delivery"; messageIdRef: string; times: number }
  | {
      kind: "crash";
      at:
        | "before_eventstore_commit"
        | "after_commit_before_receipt"
        | "after_outbox_claim_before_effect"
        | "after_effect_before_observation_dispatch"
        | "after_projection_before_checkpoint";
    }
  | { kind: "restart"; modules: readonly string[] }
  | { kind: "pause_projector" }
  | { kind: "resume_projector" }
  | { kind: "advance_clock"; milliseconds: number };

type HarnessAssertion =
  | { kind: "receipt_equals"; actualRef: string; expectedRef: string }
  | { kind: "stream_hash"; expected: string }
  | { kind: "aggregate_hash"; expected: string }
  | { kind: "graph_hash"; expected: string }
  | { kind: "ledger_hash"; expected: string }
  | { kind: "world_hash"; expected: string }
  | { kind: "event_sequence"; expectedNames: readonly string[] }
  | { kind: "typed_error"; expectedCode: ProtocolError["code"] }
  | { kind: "invariant"; name: string }
  | { kind: "visible_behavior"; name: string };
```

Harness 约束：

- `exact_event` 只加载 Event fixture 并 fold/project，禁止 dispatch、outbox delivery 和任何外部 Adapter。
- `exact_decision` 使用保存的 Command/Observation、固定 clock/IDs/seed、固定 ruleset 与 scripted Observation；禁止 live provider。
- `behavioral` 可以替换纯实现或 scripted proposal，但仍默认 `allowLiveExternalEffects: false`。若另建线上评测，必须使用不同协议和显式授权，不能污染确定性合同。
- `deliver_effect` 只交付与 EffectIntent schema 匹配的 scripted Observation；Harness 不把 fixture 直接写成 DomainEvent。
- crash/restart 后继续使用同 idempotency key、message id、effect id 和 observation id，验证恢复而非生成一条新历史。
- 每个报告必须包含 case id、mode、fixture/ruleset/schema versions、receipts、公开 Event 序列、canonical hashes、typed failures 和 invariant 结果。
- 报告不得包含思维链、原始 prompt、provider credential 或原始音频；失败解释只写结构化 mismatch、相关 message IDs 和安全摘要。

## 17. Contract tests

下列测试是实现交付的最低合同；测试通过公开 `dispatch/watch` 和测试 Adapter，不直接调用私有状态机。

### 17.1 Envelope 与权限

1. 缺少 message id、schema version、payload hash 或 producer 的 envelope 被拒绝。
2. payload 被篡改后 hash 校验失败。
3. reader 尝试提交 DomainEvent/EffectIntent 被拒绝。
4. forged VoiceSession capture binding 被拒绝。
5. 外部文本包含指令注入时仍仅作为 data，不能产生未授权 Command。
6. EventStore 中不存在思维链、原始 prompt、provider credential、原始音频或未净化错误。

### 17.2 Idempotency 与并发

7. 同 Command key/payload 两次 dispatch，receipt 相同且 Event/Intent 只出现一次。
8. 同 key 不同 payload 返回 `IDEMPOTENCY_KEY_REUSED`。
9. 两个 Command 使用同 expected version，只有一个成功，另一个返回 current version。
10. 重复 Observation 不重复 Relation/WorldPatch proposal 或任何后续 Effect。
11. 冲突 terminal Observation 进入 reconciliation，不选择任一“成功”结果。

### 17.3 Transactional outbox 与崩溃点

12. Event append 失败时 inbox receipt、Intent 和 outbox 都不存在。
13. commit 成功、响应前崩溃，重试 Command 返回原 receipt。
14. commit 成功、outbox 投递前崩溃，恢复后 Effect 被投递一次或幂等重投。
15. Effect 已成功、Observation dispatch 前崩溃，恢复时重发同一 Observation，不重做 Effect。
16. Graph Projector 崩溃重启后从 checkpoint 继续，重复 Event 为 no-op。

### 17.4 Order 与状态机

17. 未预测前提交 work-plan WorldPatch 被拒绝。
18. source graph 未 commit 或 PlayabilityGate 不通过时请求 world run 被拒绝。
19. 未 review、stale 或跨 experience 的 Relation/WorldPatch 不能进入 GraphCommitted 或 WorldKernel。
20. baseline run 前提交 market action 被拒绝。
21. `world.seeded`、本次 `world.event_recorded*` 与 `evidence_snapshot.produced` 按固定顺序在同一 compare-and-append 提交；每个经济 delta 都有 ledger entry。
22. Provider/Adapter 失败后不会出现 RelationReviewed、WorldPatchReviewed、GraphCommitted 或伪造成功话术。

### 17.5 Stale、取消与 reconcile

23. proposal generation 期间 source focus 改变，旧结果被标记 superseded，不成为待 review proposal。
24. 无关 Event 使 stream version 前进但 relevance hash 不变，Observation 可安全应用。
25. queued Effect 取消后 Worker 不执行，并提交 cancelled。
26. in-flight best-effort 取消后迟到的纯计算结果被忽略。
27. 外部 commit 状态 unknown 的迟到结果进入 `reconciliation_required`。
28. reconciliation 状态拒绝普通写命令；无 operator 权限不能 resolve。

### 17.6 GraphStore 与 watch

29. EventStore version 高于 Graph checkpoint 时 `watch` 明确返回 catching_up 和 lag。
30. `minimumProjectedVersion` 超时返回 `PROJECTION_STALE`，不伪装 current。
31. 删除 GraphStore 后可从 EventStore 重建相同 canonical graph hash。
32. Smith 原文、释义、模型扩展的 authority 标签在 Evidence projection 中保持不变。

### 17.7 Replay 与经济 invariant

33. Exact Event replay 重建相同 aggregate、Graph、ledger 和 world snapshot hash。
34. Decision replay 使用固定 IDs/clock/seed/scripted Adapter 与同版本纯 WorldKernel 产生相同 canonical Events。
35. Behavioral replay 允许解释措辞变化，但确认门、失败分支和可见因果链不变。
36. 同初始状态、confirmed action、seed、ruleset version 得到相同经济结果。
37. 每个库存、现金、劳动、订单变化都有 ledger event；库存非负、劳动有上限、订单不超额履约、瓶颈限制产量。
38. 同 WorkPlan 在扩大市场且包含运输成本/延迟后产生可解释的不同结果。

### 17.8 VoiceSession 交接

39. canonical `VoiceEnvelope<"transcript.final">` 经 capture binding 验证后可映射为 `idea.submit`；partial/non-final/低置信度输入只触发澄清。
40. `voice_session.present` 只含语义文本与打断策略，不含 provider/voice/codec 配置。
41. playback interrupted 只更新呈现状态，不回滚已提交 Reader World 事实。

## 18. 明确不做的事

- 不把 GraphStore 当写模型或事实源。
- 不追求网络层 exactly-once；采用 at-least-once + 幂等 + reconciliation。
- 不保存思维链来换取“可解释性”；可解释性来自结构化提案、确认记录、source authority、账本和 causal refs。
- 不让 LLM 维持状态或生成经济结果。
- 不在 Reader World 中复制 VoiceSession provider 逻辑。
- 不用 wall-clock、随机 UUID 或外部返回顺序决定经济结果。
- 不通过修改历史事件解决错误；使用补偿 Command/Event 或 reconciliation resolution。

该协议的完成标准不是“消息能发送”，而是任意一次读者意图都能回答：谁在什么版本发起了什么，系统据此提交了哪些事实、请求了哪些 Effect、接受或拒绝了哪个 Observation、用户最终看到了什么，以及在崩溃、重复、过期、取消和未知外部状态下如何安全恢复。
