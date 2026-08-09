# Living Reader

Living Reader 把一本完整的书变成持续生长的阅读关系。

读者先阅读可追溯的中文译文，随时核对英文原文，再与 Agent 讨论具体段落。
当同一个问题持续出现并且读者确认关系后，系统会邀请读者进入一个可执行世界，观察规则如何运行，再带着世界证据回到原文。

当前正式样本是亚当·斯密《国富论》1904 Cannan 版全书。
针厂和市场范围只是这本书生成的第一组经济世界，不是产品类别。

## 当前可运行闭环

```text
全书导入 -> 中文阅读 -> 原文核对 -> Agent 对话
                                  |
                                  v
原文返回 <- 世界证据 <- 可执行世界 <- 读者确认邀请
```

当前实现包括：

- Books I-V 共 34 章、2,063 个可追溯段落
- 中文优先、逐段展开英文原文的阅读界面
- 跨章节阅读位置、困惑、讨论主题和邀请问题记忆
- 受审核配方驱动的确定性经济世界
- 基于 EventStore 的世界推进、重放和刷新恢复
- 从世界证据返回对应原文段落的闭环

## 运行

```bash
cd product
pnpm install
pnpm dev
```

浏览器打开 `http://127.0.0.1:3000`。
首页会进入当前《国富论》阅读路径。

完整运行时、数据管线和验证命令见 [`product/README.md`](product/README.md)。

## 项目依据

- [产品说明](docs/product-brief.md)
- [产品设计宪法](design.md)
- [事件与重放架构](docs/architecture/event-protocol.md)
- [Agent 行为协议](docs/architecture/agent-os-behavior-protocol.md)
- [测试与 CI](docs/testing-and-ci.md)
- [任务路由](docs/agents/task-routing.md)
