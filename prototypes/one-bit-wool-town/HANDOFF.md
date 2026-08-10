# HANDOFF · 1-bit 羊毛镇可玩样张（2026-08-10）

> 交接给下一位。本文件遵循 AGENTS.md 的检查点规则：只记录当前增量，权威结论各自归位。

## 目标

为 design.md **D007（世界最终美术，当前 Proposed）** 提供裁决样张：验证"1-bit 像素游戏风"
能否由产品已接受的渲染路径（DOM/CSS + Web Animations + PNG 精灵；禁 SVG）承载，
并且世界**实时可玩**而非预制样片。

## 用户最新判断（2026-08-10）

- 方向与工程："相当不错"——1-bit 游戏风 + 实时可玩的路子成立。
- **美术需要大改**：当前角色/场景精灵是 Pillow 原语拼的程序员美术，仅作占位。
  D007 保持 Proposed，等美术重做后由用户再次裁决。

## 环境

- 工作树：`/Users/mahaoxuan/Desktop/一本书-world-rendering`，分支 `explore/world-rendering`。
- 主工作树 `/Users/mahaoxuan/Desktop/一本书` 保持 `main`；其中
  `product/src/components/reading/ChapterReadingShell.tsx` 与同名 `.module.css`
  有**先于本次会话存在**的未提交改动，本分支未触碰。
- `codex/t053-full-stack` 分支已删除（本地+远端，删除前与 main 同指向 4439a7f，无丢失）。

## 产物（全部在本目录）

| 路径 | 说明 |
|---|---|
| `index.html` / `styles.css` / `main.js` | 样张本体：DOM/CSS + WAAPI 渲染，无 SVG/canvas/游戏引擎 |
| `sim.js` | 确定性 tick 模拟（SEED 42，exact replay）；基线镜像 `wool-town-v1`（12/8/2/24） |
| `assets/*.png` | **占位美术，待重做**。角色 24×24、物品 12×12、建筑 ≤48×36 |
| `assets/fonts/` | 缝合像素字体 + SIL OFL 许可证（复制自 `prototypes/one-bit-scenes-godot`） |
| `tools/make_sprites.py` | 占位素材生成器；美术重做后可仅保留作尺寸合同参考 |
| `tools/e2e-check.js` | Playwright 自检：建造 → 点两个动作 → 校验 REV/状态/现金/零报错 |
| `tools/check-*.png` `shot-*.png` | 验证截图（建造中 / 动作后 / 素材清单） |
| `dev-server.js` / `package.json` | `npm run dev`，默认 7100，转发 `--port` |

## 已验证（2026-08-10）

- `node tools/e2e-check.js`：REV 2、RUSHING、cash 36、orders 1、零控制台报错。
- 建造四阶段、动作演出（指标闪烁、材料飞行、赶单加速/停工降速）、镇志滚动、
  重置精确重演均可见。`prefers-reduced-motion` 落终态；`<details>` 有无动画摘要。

## 美术重做合同（给下一位）

**只换皮，不动骨。** `sim.js` 的确定性模拟与 `main.js` 的渲染结构已成立，
美术重做时保持以下合同，渲染层零改动：

1. 文件名与画布尺寸不变（如 `shepherd.png` 24×24、`workshop.png` 48×36）；
   需要新尺寸则同步改 `styles.css` 中对应 `width`。
2. PNG（或 WebP）位图，透明底，墨色 `#101511`；**禁止 SVG**（ADR 10 / design.md §8）。
3. 角色靠外轮廓、工具和动作辨认，不靠标签/颜色/tooltip（design.md §8）。
4. 想做逐帧动画：同名加帧后缀（如 `weaver@2.png`）后在 `main.js` 加换帧逻辑即可，
   WAAPI 循环已就位。
5. 素材来源：用户提供的参考是 `bobeff/open-source-games`（GitHub 列表，许可证逐个核对）；
   或自绘（Aseprite 等）。视频参考：`素材管理/人到达有多懒…mp4`（1-bit 放置 RPG）。

## 权威归位

- D007 裁决状态：归 `design.md`（本次未改动；美术裁决通过后按 §12 更新并保留原方案与反证）。
- 世界模拟语义：归 `product/src/modules/world/`（kernel/presentation 未改动，本原型只是同构镜像）。
- 任务状态：归 Teable（本会话无 Teable 访问，未登记）。

## 风险与未尽事项

- 原型**未推送远端**；`explore/world-rendering` 仅本地提交。
- 占位美术若直接展示会给"画风已定"的错误印象——演示时必须说明美术待重做。
- `prototypes/one-bit-economy`（canvas 样片）与 `one-bit-scenes-godot`（Godot 场景研究）
  是更早的探索，渲染路径与产品决策不一致，勿直接当产品依据。

## 下一最小动作

重做 `assets/*.png` 占位美术（自绘或挑选许可证干净的 1-bit 素材），
跑 `npm run dev` 对照检查，再请用户裁决 D007。
