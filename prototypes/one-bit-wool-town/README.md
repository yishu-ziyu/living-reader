# 羊毛镇 WOOL TOWN .01 — 1BIT Playable Study

> PROTOTYPE ONLY. D007 画风裁决样张：同一套 1-bit 游戏语言，但用产品已接受的
> 渲染路径实现（DOM/CSS + Web Animations + PNG sprites，无 SVG、无 canvas、
> 无游戏引擎）。

与 `one-bit-economy`（8 秒预制样片）的区别：这张样张**真的可玩**。

- `sim.js` 是确定性 tick 模拟：SEED 42 + 相同操作序列 => 相同事件流（exact replay）。
  基线镜像 `wool-town-v1`：供给 12 / 库存 8（原毛4+纱线3+粗呢1）/ 可触达订单 2 / 现金 24。
- 两个非装饰性动作：**开拓市集**（-8 银币，订单上限 +2、售价 +1、供给 +5）和
  **织工赶单**（15 拍全速，随后 10 拍疲惫停工——二阶后果）。
- 事件流即"战斗记录"：每个事件携带世界时钟，动作提交 REV 自增。
- `prefers-reduced-motion` 下直接落终态，`<details>` 提供无动画文字摘要。

Run:

```bash
npm run dev   # 默认 http://127.0.0.1:7100/
```

素材：`assets/*.png` 由 `tools/make_sprites.py` 从项目自有的手绘式 1-bit 像素矩阵生成；
字体为缝合像素字体（SIL OFL，许可证见 `assets/fonts/FUSION_PIXEL_OFL.txt`）。
