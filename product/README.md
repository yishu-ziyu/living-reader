# product · 正式产品入口

本目录是仓库内**唯一正式应用入口**（Next.js + React + TypeScript）。

原型、研究与素材目录**不属于**本应用，也不在本任务中被移动或删除。

## 技术基线

- Next.js **16.3.0** + React 19 + TypeScript + pnpm
- Lint：ESLint CLI（`pnpm lint` → `eslint .`），**不用**已弃用的 `next lint`
- 依赖安全：`pnpm audit --registry=https://registry.npmjs.org --audit-level high` 须 exit 0

## 已实现合同

### T001 基线
- 中文阅读 shell 首页；闭合世界槽；lint/typecheck/build/e2e/audit

### T002 来源
- BookArtifact / SourceBlock / OLL adapter（见下方「来源」）

### T003 EventStore + 只读投影
- `src/modules/reader-world/events/**`：envelope、冻结 8 事件、canonicalize/hash、validate、exportDebugTrace
- `src/modules/reader-world/event-store/**`：EventStore port（append/load/version/idempotency）
- `src/infrastructure/event-store/memory/**`：InMemoryEventStore（合同参考）
- `src/infrastructure/event-store/indexeddb/**`：浏览器 IndexedDB schema v1 持久化
- `src/modules/reader-world/projections/**`：ReadingGraph / World 纯 fold + rebuild hash
- 测试：`tests/unit/event-store/**`、`tests/unit/projections/**`、`tests/e2e/event-store.spec.ts`
- 测试桥：`NEXT_PUBLIC_T003_BRIDGE=1` 时挂 `window.__T003_EVENT_STORE__`；默认生产不暴露

### T004 ReaderSession XState
- 依赖：`xstate@5.32.5`（core only，无 @xstate/react）
- `src/modules/session/**`：typed machine、transition receipt、effect port
- `ReaderSessionProvider` + `data-session-state` / world-slot `data-state`
- 文档：`docs/reader-session-statechart.md`
- 测试：`tests/unit/session/**`、`tests/e2e/reader-session.spec.ts`
- 测试桥：`NEXT_PUBLIC_T004_SESSION_BRIDGE=1` → `window.__T004_SESSION__`

### T005 ReaderIdea + Relation 审阅
- EventStore-first Idea / RelationProposal；SourceBlock sealed evidence（非手写表）
- 文档：`docs/reader-thinking-relation-contract.md`
- 测试：`tests/unit/reader-thinking/**`、`tests/e2e/relation-review.spec.ts`

### T006 原文讨论 + BookThought
- deterministic Companion fixture + OriginalGuardian（quote 唯一英文子串）
- ask 瞬时候选零写入；accept → `agent_os.book_thought.proposed.v1`
- 文档：`docs/source-discussion-book-thought.md`
- 测试：`tests/unit/agent-os/**`、`tests/unit/reader-thinking/book-thought.test.ts`、`tests/e2e/source-discussion.spec.ts`
- 演示问：分工段「分工会让人更熟练吗？」；市场段「市场范围如何限制分工？」

### T007 跑题边界与温和回引
- 纯函数 `IntentDecision` + `BoundarySession`（不进 EventStore、不存 raw 文本）
- 第一次 off_topic：≤3 句 soft-return + 1 CTA；decline 后不再邀请；stop/continue 走 T004 safe API
- 文档：`docs/off-topic-boundary.md`
- 测试：`tests/unit/agent-os/intent-boundary.test.ts`、`tests/e2e/off-topic.spec.ts`

**仍不在范围内（T008+）**

- 真实 LLM/外网、ASR/麦克风、WorldKernel、ActionCandidate
- 云同步、服务端库、schema v2 migration
- 删除、移动或重写 `prototypes/`、仓库级 `docs/`、`assets/`、`素材管理/`

## 与原型的关系

| 路径 | 角色 |
|------|------|
| `product/` | 正式入口；可提交构建与测试 |
| `prototypes/living-reader-reference-html/` | 视觉与交互**参考**；保持可单独用静态 server 打开 |
| 其他 `prototypes/*` | 历史实验；不并入生产逻辑 |

原型里的 fixture 状态机与硬编码世界**不会**复制进 `product/`。

## 启动

在仓库根目录：

```bash
pnpm --dir product install
pnpm --dir product dev
```

打开 <http://127.0.0.1:3000>。

旧原型（冻结基线，勿改）：

```bash
python3 -m http.server 4178
# → http://127.0.0.1:4178/prototypes/living-reader-reference-html/
```

## 验收命令

```bash
# 每次产品改动：快速、稳定的默认门
pnpm --dir product check:quick

# 共享合同、跨模块、合并和发布门
pnpm --dir product check:full

# T004 焦点
pnpm --dir product test:unit -- session
pnpm --dir product test:unit
pnpm --dir product lint
pnpm --dir product typecheck
pnpm --dir product build
pnpm --dir product exec playwright test tests/e2e/reader-session.spec.ts tests/e2e/home-smoke.spec.ts
pnpm --dir product test:e2e
pnpm --dir product audit --registry=https://registry.npmjs.org --audit-level high
```

## 来源（T002 / A014）

- 官方 OLL Cannan vol.1 EPUB → 两个 paragraph fragment + 引用脚注 target
- 领域 `source_id`：`smith.b1.c1.division` / `smith.b1.c3.market_extent`
- OLL locator：`Smith_0206-01_235` / `Smith_0206-01_251`（不是 domain id）
- PDF evidence：36 / 45；OLL 版本页（pb）：**5 / 19**
- Manifest：`public/books/wealth-of-nations/manifest.json`（运行时 shape 校验 → `invalid_manifest`）
- 脚注：`footnote_ref` 必须解析到唯一 `Footnote`（如 `lf0206-01_footnote_nt114`）
- 加载失败 fail-closed，不 throw、不伪造引文

## 目录

```text
product/
  src/
    app/                 # Next.js App Router
    components/          # 页面壳（ReadingShell）
    contracts/           # 跨模块类型与不变量说明
    infrastructure/book/oll/  # OLL adapter
    modules/
      book/domain/       # 纯 TS 领域对象
      reader-thinking/
      agent-os/
      world/
      evidence/
  public/books/wealth-of-nations/
  tests/unit/book/
  tests/e2e/
```

依赖方向：`app/components` → `modules/*` → `domain`；`infrastructure` → `domain`。  
禁止 domain 依赖 React/Next/fs。
