# HANDOFF · 1-bit 羊毛镇可玩样张（2026-08-10）

> 本文件记录 D007 裁决样张的当前增量。
> 设计结论归 `design.md`，任务状态归 Teable，代码与浏览器证据归当前分支。

## 目标

为 design.md **D007（世界最终美术，当前 Proposed）** 提供可裁决样张：验证“1-bit 像素游戏风”能否由产品已接受的 DOM/CSS + Web Animations + PNG 渲染路径承载，并且世界实时可玩而非预制样片。

## 当前状态

- 用户已经确认 1-bit 游戏风与实时可玩的工程路线成立。
- 用户退回了第一版 Pillow 几何原语占位美术，要求大改角色、物件与场景。
- T068 已完成原创像素美术重绘和工程自检，等待用户重新检查浏览器画面。
- D007 仍为 **Proposed**。
- 只有用户作出视觉裁决后，才能把 D007 写为 Accepted。

## 环境

- 工作树：`/Users/mahaoxuan/Desktop/一本书-world-rendering`。
- 分支：`explore/world-rendering`，已推送 `origin/explore/world-rendering`。
- Teable：T068，记录 `recwA1J4lpk1qfhsWh3`。
- 主工作树 `/Users/mahaoxuan/Desktop/一本书` 保持 `main`，其中先于本任务存在的 reading 组件未提交改动没有被触碰。

## 产物

| 路径 | 说明 |
|---|---|
| `index.html` / `styles.css` / `main.js` | 样张本体；DOM/CSS + WAAPI 渲染，无 SVG、canvas 或游戏引擎 |
| `sim.js` | 确定性 tick 模拟；SEED 42 与相同动作序列 exact replay |
| `assets/*.png` | 19 张原创 1-bit 位图；文件名与画布尺寸保持原合同 |
| `tools/make_sprites.py` | 可复现的手绘式像素矩阵源；每个 `#` 是墨色像素，每个 `.` 是透明像素 |
| `tools/contact-sheet.png` | 全量素材清单 |
| `tools/check-construction.png` | 四阶段建造中的浏览器证据 |
| `tools/check-actions.png` | 两个动作后的浏览器证据 |
| `tools/check-items.png` | 羊毛、纱线、粗呢与银币的放大检查 |
| `tools/e2e-check.js` | Playwright 路径：建造、两个动作、状态与控制台检查 |

## 本轮美术重做

1. 牧羊人以宽檐帽和长柄牧杖辨认，纺纱工以头巾、围裙和装有羊毛的纺杆辨认，织工以前倾姿态和横向梭子辨认，商人以三角帽、账册和钱袋辨认。
2. 羊毛、纱线、折叠粗呢与银币使用不同外轮廓和内部像素节奏，不依赖颜色或 tooltip。
3. 工坊改为陡坡茅顶、烟囱、木构斜撑、窗格和深门洞；市集改为补丁棚顶、秤、布匹和板条箱；纺车、织机、树、栅栏、草、云、太阳与烟雾统一为手刻木版式像素语言。
4. 全套资产只含透明像素与 `#101511`。
5. 本轮没有使用第三方图包，因此没有新增素材许可证风险。
6. `sim.js`、`main.js` 与 `styles.css` 均未修改。

## 已验证

- `python3 tools/make_sprites.py`：生成 19 张 PNG 和一张 contact sheet。
- 资产审计：19/19 文件名、画布尺寸、透明通道与 `#101511` 调色板符合合同。
- `node tools/e2e-check.js`：`REV 2`、`RUSHING`、cash `36`、orders `1`、console error `0`。
- 桌面真实浏览器：建造态、稳定态和两个动作后的角色、建筑、物件与材料流均加载成功，破图 `0`。
- 390px 真实浏览器：页面宽度与视口同为 390px，没有页面级横向溢出。
- reduced-motion 真实浏览器：直接落在 `LIVE`、stage `3`，行动可用，角色动画时长降为 `0.01ms`，破图 `0`。
- 未运行 `pnpm --dir product check:quick`，因为本轮没有修改 `product/**`。

## 权威归位

- D007 的最终状态归 `design.md`。
- 世界模拟语义归 `product/src/modules/world/`。
- 本轮范围、负责人和验收证据归 Teable T068。
- 本文件只保留可恢复增量，不代替上述权威。

## 剩余风险

- 390px 下四个站点仍保持桌面像素比例，画面密度较高。
- 本轮遵守“只换皮，不动骨”，没有修改响应式布局；不要把窄屏密度误判为已解决。
- 用户尚未作出最终品味判断，工程自检不能替代 D007 视觉验收。
- 本原型没有迁入 `product/**`。

## 下一最小动作

用户运行 `npm run dev`，在桌面浏览器检查 `http://127.0.0.1:7100/` 的建造态、稳定态和两个动作。
若用户接受，更新 `design.md` 的 D007 状态和依据，并完成 T068。
若用户不接受，把具体角色、物件或场景缺口写回 T068，再只调整对应像素资产。
