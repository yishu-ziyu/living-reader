# The Living Reader · HTML-first reference

**THROWAWAY PROTOTYPE / 仅用于视觉与交互验证**

这是一个中文用户可用的单页 HTML-first《国富论》阅读实验：左侧是 Agent OS 阅读栏，右侧是可直接拖选的 Cannan 英文原文；两条 source anchor 通过关系 Gate 后，在原文之间展开固定高度的铜版画经济世界。

## 启动

在仓库根目录执行：

```bash
python3 -m http.server 4178
```

然后打开：

<http://127.0.0.1:4178/prototypes/living-reader-reference-html/>

也可以在该目录用任意静态 HTTP server 打开；不要用 `file://`，否则真实 PDF iframe 与资源相对路径可能被浏览器阻止。

## 主路径

1. 左栏点两个原文锚点的 `Replay 语音`（这是真实 fixture，不冒充麦克风），或在文字框保存两条 Idea。
2. 确认关系。舞台会经历 `closed → loading → open`，loading 与 open 预留同一固定高度，事件只在内部滚动区/场景便签中追加。
3. 在世界里试 `让织工进一步专业化`：织工拒绝，四个可见数值不变；再试 `修路，把货卖到隔壁城`：确定性事件按 `merchant → shepherd → spinner → weaver` 顺序出现，产出、库存、订单与现金可见变化。
4. 点 `收起，回到原文` 回到触发世界的 source block；点顶部 `PDF 证据` 打开仓库中的真实 Cannan PDF 页级核对抽屉（PDF 36/45）。

实时语音会在开始前冻结 `sourceKey / source_id / source_locator / PDF page / book revision`。浏览器不支持 Web Speech 或用户拒绝权限时，会明确提示并保留 Replay / 文字 fallback。页面不会后台监听。

## 来源与限制

原文来自 [Online Library of Liberty 的 Cannan Vol. 1 条目](https://oll.libertyfund.org/titles/smith-an-inquiry-into-the-nature-and-causes-of-the-wealth-of-nations-cannan-ed-vol-1)；页面保留英文原文，不擅自伪造中文译本。source IDs 使用本原型自己的 `oll.smith_0206-01_235` 与 `oll.smith_0206-01_251`，对应 PDF 36 / print p.19 与 PDF 45 / print p.20。

`app.js` 内的 Agent OS、关系 Gate、世界 reducer、Replay 和语音接口都是 deterministic fixture；没有真实 LLM、后端 EventStore 或持久化。世界角色沿用 `living-reader-v2/assets/art` 中已有 PNG，故仍是 throwaway 视觉/交互验证而非生产架构。

验收截图保存在 `screenshots/`：初始阅读、世界 loading/open、PDF 证据抽屉。真实麦克风权限分支需在具备 Web Speech 的浏览器中手动授权后复测。
