# T007 · 跑题边界与温和回引

## 角色

`IntentDecision` + `BoundarySession` 处理跑题 / 未知 / 拒绝 / 停止 / 继续。

- **不进 EventStore**（控制状态，非领域事实）
- **不保存 raw 用户文本**（trace 仅 turn_id / intent / reason）
- **第一次** off_topic：≤3 句中文 soft-return + 恰好 1 个「回到当前原文」CTA
- **decline**（「不用了」）：`soft_return_declined=true`，session 仍 `active.reading`
- **再次 off_topic**：无 soft-return / 无 CTA
- **continue**：清 declined；若 `paused` 则 T004 safe `RESUME`
- **explicit_stop**：T004 safe `STOP` → `paused`
- **source_question**：转交 T006 Companion / Guardian / BookThought 路径

## 优先级

`explicit_stop` > `continue` > `decline_return` > `source_question` > `off_topic` > `unknown`

## 路径

| 路径 | 说明 |
|------|------|
| `modules/agent-os/guardian/intent.ts` | 纯函数分类 |
| `modules/agent-os/boundary/**` | pure reducer |
| `SoftReturnCard.tsx` | UI |
| `SourceDiscussionComposer.tsx` | 提问 / 停止 / 继续 |
| `ReaderThinkingProvider.submitBoundaryInput` | 集成 T004 send |

## 非目标

真实 LLM、语音、ActionCandidate、WorldKernel、改 T003 schema、写 Idea/Thought/Relation 的 off-topic 路径。
