# Source Discussion + BookThought (T006)

## 边界

| 实体 | 持久化 | 归属 |
|------|--------|------|
| CompanionAnswer | 否（瞬时） | 陪读 |
| BookThoughtCandidate | 否（瞬时） | Agent 候选 |
| BookThought (`agent_os.book_thought.proposed.v1`) | 是 · EventStore | Agent |
| ReaderIdea | 是 | 读者显式提交（T005） |

## 主链

```text
active SourceBlock (T002)
  → SourceDiscussionSnapshot (quote + sealed evidence)
  → CompanionProviderPort.discuss (deterministic fixture)
  → Guardian (quote exact/unique + source/evidence)
  → transient candidate (React only; zero EventStore)
  → accept → book_thought.proposed.v1
  → fold BookThoughtView
```

## 硬约束

- ask 阶段：EventStore 版本 / ReaderIdea 数 / relation / graph / world 不变
- quote 必须是当前 `SourceBlock.quote` 的唯一连续英文子串
- inference 中文且明确为推断，不进入 quote
- 不新增 T003 事件名 / payload / IDB schema
- 不实现真实 LLM / 外网 / 语音 / off-topic（T007）

## 演示问题

- 分工段：`分工会让人更熟练吗？`
- 市场段：`市场范围如何限制分工？`
