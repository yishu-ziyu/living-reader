# Teable 任务执行工作流（2026-08-09）

> 这是 2026-08-09 的历史执行快照，不是当前领取协议。所有 Agent 的现行入口见 [`docs/agents/task-routing.md`](../docs/agents/task-routing.md)。

## 目标

只处理 Teable `开发任务` 表中规范已完整、当前状态允许继续的任务；实现、验收、可见路径与 Teable 状态必须同步闭环。

## 本轮入口

- T008：`待验收`，执行独立合同验收；验收通过才能回写 `完成`。
- T011：`开发中` 且负责人为 Codex，继续盘点、补齐可本地交付的工程合同；真实 provider/设备路径缺少密钥或设备时必须保留阻塞。
- T009/T010/T012–T016：`待细化`，不进入实现。

## 阶段与停止条件

1. 筛选：重读 Teable 状态、完整合同、依赖与负责人。
   - 通过：任务不是 `待细化`，且范围/禁区/验收/回滚可执行。
2. 独立泳道：Subagent A 只读验收 T008；Subagent B 只读盘点 T011 缺口。
   - 通过：每条结论带可复现命令、精确缺口和未验项。
3. 主线处理：Codex 复核 subagent 证据，只修补任务合同内缺口。
   - 通过：`product/` 改动后 `pnpm --dir product check:quick` 绿；用户可见行为再跑对应 Playwright 路径。
4. 回写：先写验收证据，再更新状态，然后重读记录。
   - T008 通过：`完成`；失败：返回 `已就绪` 并写明精确缺陷。
   - T011 工程就绪但真实路径受阻：按表合同保留阻塞事实，不宣称完成。

## 本轮验证命令

- T008：`pnpm --dir product test:unit -- world`、`pnpm --dir product check:full`、客户端 Node hash/crypto 扫描。
- T011：语音 unit，`pnpm --dir product check:quick`，`pnpm --dir product exec playwright test tests/e2e/realtime-voice-ui.spec.ts`，前端密钥扫描；真人 Chrome 麦克风主链已记录，Safari 与主观听感另记。

## 当前状态

- 阶段 1：完成。
- 阶段 2：完成。T008 独立验收 PASS；T011 独立审计找到 Stop/Replay/迟到 final 等缺口。
- 阶段 3：完成工程收口。T011 新增 caller-owned `VoiceInputPort`，Stop 会封存迟到事件并释放轨道/播放/远端会话，Replay 与来源切换会先 Stop。
- 阶段 4：T008 已回写 `完成`，A004 `通过`。T011 本地门禁为 20 unit files / 175 tests、29 Playwright 全绿；真人 Chrome 麦克风主链已通过，Safari 设备矩阵与用户主观听感仍待验收，因此保持 `待验收`。

## T017 执行追加（2026-08-09）

### 问题

同一份真实阅读内容下，Agent 应采用哪种空间关系，才能让“书是主角、Agent 可召回、关系靠近原文”同时成立？

### 独立泳道

- 设计资产审计：只读盘点正式界面、现有截图与可安全新增的原型目录。
- T013 边界映射：只读确认恢复、migration 与 projection rebuild 的真实缺口，为下一任务做就绪判断。
- 设计原则研究：Apple 第一方资料、W3C 可访问性与用户本地 Apple Design 笔记，输出带来源的研究文件。

### 主线交付

- 仅新增 `prototypes/t017-reading-keyframes/`，不修改 `product/**`。
- 固定同一内容、同一状态、同一桌面视口，提供三种结构：安静常驻轨道、可折叠书签态、上下文内联。
- `?variant=A|B|C` 与底部切换器可分享、可重载；鼠标与左右方向键可切换。
- 默认折叠工程证据；关系与 Agent 回应保持在触发原文附近。

### 验收与停止条件

- HTML/CSS/JS 静态检查通过；本地一条命令可启动。
- 浏览器逐个检查 A/B/C、证据展开、书签打开/关闭、内联折叠、滚动与 console。
- 固定 1440×900 截图写入 `captures/`。
- 产物与证据回写 T017 后改为 `待验收`；用户选择品味轴之前，不进入 T018/T019/T020 生产实现。

### 当前结果

- T017 研究、三结构原型、1440×900 浏览器走查与四张截图已完成；Teable 已回写 `待验收`，下一责任人为用户。
- T013 依赖虽完成，但合同仍缺旧 schema fixture、world action 的 canonical 边界和 session manifest v1；Teable 已回写并保持 `待细化`，不制造实现方向。
