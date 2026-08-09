# WorldKernel 合同（T008）

纯确定性纵切：与 UI、网络、LLM、墙钟、随机 UUID、EventStore 写入完全隔离。

## 公共边界

| 符号 | 作用 |
|------|------|
| `decide(state, command, env)` | 纯判定 → `WorldDecisionReceipt`（永不 throw） |
| `evolve(state, events, metricsPatch?)` | 纯演进 → `EvolveResult`（fail-closed） |
| `parseWorldState` / `parseWorldCommand` / `parseKernelEnv` | F42 严格解析 |
| `resolveCanonicalRuleset` / `FROZEN_WOOL_TOWN_RULESET` | F43 冻结 ruleset |
| `compileWorldMetricsToEventMetrics` | F44 内部 metrics → T003 allowlist |
| `validateKernelEventSpec` / `validateObservation` | 严格事件/观察合同 |
| `createWoolTownBaseline` / `woolTownEnv` | wool-town-v1 fixture |

**不导出**：Node hash、test harness、EventStore adapter。

## F42 / F43 / F44（fail-closed）

- **F42**：null/malformed/NaN/空 identity/非整数 revision → `INVALID_*`；seed 不匹配 → `SEED_MISMATCH`。
- **F43**：`wool-town-v1` 只解析到 deep-frozen 单例；同 ID 改 delta / actor 序 / 缺角 → `RULESET_MISMATCH`；expand 因果序固定 `merchant→shepherd→spinner→weaver`。
- **F44**：`event_kind` 白名单；metrics 仅 `supply|inventory|demand|cash`（T003 子集）；`causation_index` 非负整数；evolve 拒 evil actor / NaN patch。

## 命令

```ts
WorldCommand = {
  action, experience_id, world_id,
  graph_revision, expected_world_revision, ruleset_id
}
```

开放 action：`deepen_specialization` | `expand_market`。  
`constrain_market` 及未知 action → `ACTION_UNSUPPORTED`。

## Guard 顺序（fail-closed，内部 checkGuards，不导出）

1. `WORLD_NOT_READY`（phase ≠ playable）
2. `WORLD_IDENTITY_MISMATCH`
3. `GRAPH_REVISION_MISMATCH`
4. `EXPECTED_WORLD_REVISION_MISMATCH`
5. `RULESET_MISMATCH`（含未知 ruleset 字段 / 篡改 body）
6. `SEED_MISMATCH`（`env.seed !== state.seed`）
7. `ACTION_UNSUPPORTED`

解析失败另有：`INVALID_STATE` / `INVALID_COMMAND` / `INVALID_ENV`。

失败：`events=[]`、`observations=[]`、`next_state` 与输入语义相等（或 EMPTY 安全 fallback）、输入不突变。  
`evolve(null|非法)` → `{ ok:false, code:INVALID_STATE, state:EMPTY }`，**永不 throw**。

## wool-town-v1 数字

| | output | stock | reachable_orders | cash |
|--|--------|-------|------------------|------|
| baseline 小市场 | 12 | 8 | 2 | 24 |
| 一次 expand 后 | 17 | 11 | 4 | 28 |

数字只存在于 `fixtures/wool-town` + ruleset delta。

## deepen_specialization

- weaver local：`reachable_orders < minimum_orders_for_next_depth + outputs_pending` → `CHARACTER_REFUSAL`
- 恰好 1 个 weaver 拒绝事件 + observation
- metrics 深等不变；`world_revision` 严格 +1

## expand_market

- 一次命令、一次 `world_revision` +1
- KernelEventSpec / observation 因果序：`merchant → shepherd → spinner → weaver`
- 每条 observation 可用 `local_state` 重算 predicate

## 与 EventStore

`KernelEventSpec` 可被 T009 编译为 `reader_world.world.event_recorded.v1`。  
**T008 不写 Store、不改冻结 8 事件名、不改 IDB v1。**

## 路径

```
product/src/modules/world/domain/**
product/src/modules/world/kernel/**
product/src/modules/world/actors/**
product/src/modules/world/fixtures/wool-town/**
product/tests/unit/world/**   # hash-adapter 仅测试
```
