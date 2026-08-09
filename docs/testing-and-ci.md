# 测试与 CI：让 AI 快速而准确地交付

> 这是项目的执行规则，不要求产品负责人掌握测试工具。产品负责人定义 idea、体验和“什么算对”；AI 负责选择检查、运行检查并交付证据。

## 1. 先把 CI 说清楚

测试是检查题；CI 是代码变化后自动帮我们做检查题的流水线。

本项目不追求“每次改动做最多检查”，而追求：

> **当前改动先跑最小充分测试，跨模块、合并和发布边界再跑全量测试。**

“小改动”按可能影响的行为判断，不按代码行数判断。一行共享事件协议可能是高风险；一百行未进入产品的研究文字可能不需要产品测试。

## 2. 固定三层，不让 AI 临时发挥

| 层 | 什么时候跑 | 目的 | 当前命令 |
|---|---|---|---|
| Quick | 每次 `product/` 代码或配置改动 | 尽快发现语法、类型、单元行为和构建问题 | `pnpm --dir product check:quick` |
| Relevant path | 用户可见行为或模块行为改变 | 验证本次真正受影响的路径 | 下方映射中的 Playwright 命令 |
| Full | 共享合同、依赖/配置、跨模块、合并到 `main`、发布前 | 发现组合后才出现的问题 | `pnpm --dir product check:full` |

发布完成仍要按 [`acceptance.md`](acceptance.md) 验证公网新会话和完整用户链。Build、unit、E2E 和真实产品验收是四种不同证据，不能互相冒充。

## 3. 为什么 Quick 现在可以包含全部 unit

2026-08-09 初始本机基线（后续以 CI p95 为准）：

- 20 个 unit 文件、175 个断言：约 1.7 秒；
- lint：约 7.6 秒；
- typecheck：约 4.6 秒；
- production build：约 6.2 秒。

当前整条 Quick 实测约 13 秒。

所以当前每次运行全部 unit 比维护复杂的单元测试选择器更便宜、更可靠。只有当 unit p95 超过 5 分钟，才允许按模块拆分；事件 envelope、schema、immutability、debug/metrics allowlist 等安全不变量仍必须留在 Quick。

## 4. AI 如何选择 Relevant path

命中多行时取并集。AI 必须在交付时说明为什么这些测试足够。

| 改动范围 | 相关浏览器检查 |
|---|---|
| 首页、来源渲染、书籍 fragment、`SourceBody` | `pnpm --dir product test:e2e:smoke`；必要时加 `source-discussion.spec.ts` |
| ReaderSession、Stop/Retry/世界槽状态 | `pnpm --dir product exec playwright test tests/e2e/reader-session.spec.ts` |
| ReaderIdea、Relation 审阅 | `pnpm --dir product exec playwright test tests/e2e/relation-review.spec.ts` |
| 原文讨论、BookThought、Agent OS | `pnpm --dir product exec playwright test tests/e2e/source-discussion.spec.ts` |
| 跑题、回引、拒绝后不重复 | `pnpm --dir product exec playwright test tests/e2e/off-topic.spec.ts` |
| EventStore、投影、envelope、debug/metrics 安全 | `pnpm --dir product exec playwright test tests/e2e/event-store.spec.ts tests/e2e/event-store-conformance.spec.ts tests/e2e/f21-f25-security.spec.ts` |
| `package.json`、lockfile、Next/TS/Vitest/Playwright 配置、共享 contracts、跨模块行为 | `pnpm --dir product check:full` |
| 仅 `research/`、`prototypes/`、`素材管理/` 或未被产品引用的素材 | 默认不跑产品测试；若实际进入 `product/`，按真实消费者选择 |

UI 改动还必须在真实浏览器里执行“用户动作 → 可见结果”。截图好看、控制台干净或页面能打开，都不是完整路径证据。

## 5. CI 已执行的长期约束

仓库使用两条 GitHub Actions 流水线：

- `product-pr.yml`：只在产品、测试规则或自身 workflow 变化时触发；运行 Quick + 首页 smoke；
- `product-full.yml`：产品改动进入 `main` 后或人工触发时运行 Full + 依赖安全检查。

两条流水线都必须保留：

- 明确 `paths`，不让研究、原型和素材改动启动产品全套；
- `cancel-in-progress: true`，同一分支出现新提交时取消旧运行；
- PR job `timeout-minutes: 15`；Full job `timeout-minutes: 30`；
- 只读仓库权限；
- workflow 自身路径在触发列表中，避免修改门禁却不验证门禁。

GitHub workflow 只是自动兜底。AI 在本地交付前仍须执行 Quick 和相关路径；不能把失败推给合并后的 Full。

## 6. 防止测试体系自己膨胀

新增测试或 CI 闸之前，必须回答四个问题：

1. 它具体防止哪个用户行为、数据不变量或历史故障回归？
2. 哪些文件变化才应该触发它？
3. 它属于 Quick、Relevant path 还是 Full？
4. 它的时间预算是多少，现有测试是否已经覆盖同一风险？

回答不了，不新增。

CI 变慢时按这个顺序处理：先查无关触发、重复测试、外部网络、fixture 和缓存；再缩小范围或移动到 Full；最后才考虑并行资源。禁止把增加 timeout、无限 retry 或更多分片当作第一反应。

每月至少看一次 GitHub Actions 的运行次数、失败是否抓到真实问题、flake 和 p95 时间。七天零失败只是“可能降级”的信号；安全不变量和历史事故回归不能据此自动删除。

## 7. AI 的固定交付格式

每次实现完成后，AI 用五句话以内报告：

1. 改变了哪个用户行为或工程合同；
2. 运行了哪些精确命令；
3. 哪条真实用户路径已验证；
4. 哪些检查没有运行以及原因；
5. 剩余风险和下一道 Full/发布门。

用户不需要阅读测试日志，也不需要判断 CI 配置；只需要根据产品结果和明确风险做最终验收。
