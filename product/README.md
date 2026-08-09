# Living Reader 产品运行时

`product/` 是仓库内唯一正式应用入口。
它包含 Next.js 阅读应用、Bun Agent Runtime、整书数据管线、领域模块和验证套件。
`prototypes/`、`research/` 与素材目录不参与正式运行时构建。

## 用户路径

```text
/read/wealth-of-nations/smith.b1.c1
        |
        +-> 中文逐段阅读，可展开英文原文
        +-> 记录阅读位置、困惑和讨论主题
        +-> 与 Agent 围绕当前来源讨论
        +-> 重复问题触发世界邀请
        +-> 读者接受后编译受审核配方
        +-> WorldKernel 推进确定性世界
        +-> EvidenceBlock 返回对应原文
```

首页 `/` 从 EventStore 恢复最近阅读章节；没有记录或本地存储不可用时回到第一章。
目录可在 Books I-V 的 34 章之间跳转。
桌面端使用阅读栏和 Agent 栏，移动端使用可关闭的侧面板。

## 技术基线

- Next.js 16.3.0、React 19.1、TypeScript 5
- Bun Agent Runtime，基于 `@oh-my-pi/pi-agent-core` 与 `pi-catalog`
- XState 5 管理阅读会话状态
- IndexedDB 保存 EventStore、投影检查点和同步收据
- DOM/CSS/Web Animations 呈现世界，PNG/WebP 只作为视觉素材
- Vitest 与 Playwright 验证领域合同和用户可见闭环

## 架构

```text
OLL HTML 源文件
    |
    v
pipeline/ingest.ts -> manifest v2 -> 中文翻译资产
                                      |
                                      v
Next.js App Router -> ChapterReadingShell -> ReaderThinkingProvider
                                              |
                         +--------------------+--------------------+
                         |                                         |
                         v                                         v
                 Bun Agent Runtime                       ReaderWorldUseCase
                 只返回语义候选                         唯一世界写入入口
                                                                   |
                                                                   v
                                               EventStore -> 只读投影
                                                                   |
                                                                   v
                                     RecipeCompiler -> WorldKernel
                                                                   |
                                                                   v
                                      InlineWorldBlock + EvidenceBlock
```

关键不变量：

1. `sourceId`、OLL locator、英文正文和 `contentHash` 共同确定来源身份。
2. 中文译文逐段保存来源身份、模型、prompt revision、审核状态和时间。
3. LLM 只提出候选，不直接写入世界事实。
4. 世界邀请必须来自已确认关系中的重复问题，读者仍需主动接受。
5. `RecipeCompiler` 只接受仓库中 `status: reviewed` 的配方和动作 allowlist。
6. `ReaderWorldUseCase` 是世界创建、呈现、推进和恢复的统一应用层入口。
7. EventStore 是读者记忆与世界状态的唯一事实源，投影可以重建。
8. 刷新后从事件恢复同一个世界，不重新随机生成或暗中推进。

## 全书资产

正式样本位于 `public/books/wealth-of-nations/`：

- `manifest.json`：Books I-V、34 章、2,063 个 SourceBlock
- `translations/zh-CN/*.json`：与每个 SourceBlock 一一对应的中文译文
- `pipeline/sources/wealth-of-nations/`：固定的 OLL Cannan 两卷 HTML 输入
- `content/recipes/*.json`：通过 CI parser 校验的世界配方

构建命令：

```bash
pnpm book:build ingest
pnpm book:build translate
pnpm book:build validate
pnpm book:build all
```

`ingest` 从固定 OLL 输入重建 canonical manifest。
`translate` 只处理缺失、来源哈希变化或 prompt revision 变化的段落。
已有有效译文会保留其真实模型 provenance，不因切换生成模型而无谓重译。
当确实需要调用 StepFun 时，命令从 `.env.local` 读取 `STEPFUN_API_KEY`。
`validate` 会检查 manifest schema、正文哈希以及全部译文与来源的一一对应关系。
干净的 `all` 重跑不会改写任何资产。

## 本地运行

安装依赖：

```bash
pnpm install
```

启动阅读应用：

```bash
pnpm dev
```

如需真实 Agent 对话，在另一个终端启动：

```bash
pnpm agent:start
```

阅读应用默认访问 `http://127.0.0.1:3000`。
Agent Runtime 默认监听 `http://127.0.0.1:4317`，服务端路由会把浏览器请求转发到该运行时。
模型和供应商凭据由 OMP/pi-catalog 环境提供，客户端不会接触密钥。

## 验证

```bash
pnpm check:quick
pnpm check:full
```

`check:quick` 依次运行 lint、两个 TypeScript 配置、Vitest、Bun Agent 测试和生产构建。
`check:full` 在 quick check 之后运行全部 Playwright 路径。

针对当前完整阅读世界闭环，可单独运行：

```bash
pnpm exec playwright test tests/e2e/chapter-world-loop.spec.ts
```

## 目录

```text
product/
  agent-runtime/                 Bun Agent Runtime
  content/recipes/               受审核世界配方
  pipeline/                      整书导入、翻译和验证
  public/books/                  运行时书籍资产
  src/app/                       Next.js App Router
  src/components/reading/        正式阅读界面
  src/modules/book/              书籍领域模型与读取合同
  src/modules/reader-world/      事件、记忆、投影和 use case
  src/modules/world/             配方、kernel、呈现和证据
  tests/unit/                    领域与应用层回归测试
  tests/e2e/                     浏览器用户路径
```
