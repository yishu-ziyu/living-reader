# T017 · 阅读界面品味关键帧

> **PROTOTYPE ONLY — 未修改正式产品代码。**

这个原型只回答一个问题：同一份真实阅读内容下，哪套桌面与移动端容器组合，能同时做到“书是主角、Agent 可召回、关系靠近原文、世界有因果地展开”？

## 一键启动

在仓库根目录执行：

```bash
python3 -m http.server 4177
```

打开：

- Draft 0.5（当前方向）：活页批注、冷白墨蓝、AgentOS 驱动的段间世界与 Thinking Orbs：<http://127.0.0.1:4177/prototypes/t017-reading-keyframes/draft-05.html>

- A：桌面安静常驻轨道；移动端底部层：<http://127.0.0.1:4177/prototypes/t017-reading-keyframes/?variant=A>
- B：桌面可折叠书签；移动端侧向抽屉：<http://127.0.0.1:4177/prototypes/t017-reading-keyframes/?variant=B>

旧 A/B 原型可用底部切换器或键盘 `←` / `→` 切换。输入框聚焦时不会拦截方向键。

## Draft 0.5 当前方向

- 正文是一张连续、可选择文字的书页；想法和关系通过页边批注、括号与短引线贴住来源。
- 关系确认后，世界在两段原文之间连续撑开，不覆盖正文，不强制滚动。
- Draft 0.5 直接使用真实 `LivingReaderAgentOS` reducer 驱动世界状态；结构、实时反馈与动效使用 DOM/CSS + Web Animations，允许“扩大市场”“加深专业化”“收缩市场”三种行动，并提供 Stop 和 Replay。
- PNG/WebP 只用于角色与场景美术，不承载静态世界截图；禁止 SVG。
- Agent 静止时以页边 20px Orb 召回；对话层直接挂载 `thinking-orbs` 0.2.0 的 64px 组件，并沿用 T024 的单轨道胶囊、待机、聆听、思考、说话、Stop、取消与 reduced-motion 合同；不再使用手绘 canvas 或整屏深色仿制界面。
- 页面采用冷白纸、石墨正文和低饱和墨蓝强调；不沿用参考图的深绿控制台配色。
- `draft-05-orbs-entry.jsx` 是真实 Thinking Orbs 的 React 入口，`draft-05-orbs.bundle.js` 是静态原型使用的浏览器包；`draft-05.html` 仍是隔离原型，不修改 `product/**`。

## 固定比较条件

- 桌面关键帧按 `1440 × 900` 验收。
- 两套方案使用相同的 PDF 36 / PDF 45 SourceBlock、两条 ReaderIdea、一条待确认关系和 closed world 状态。
- 默认不展示 hash、revision、provider 或内部 ID；来源依据需要主动展开。
- 每套只有一个主表达入口，关系与陪读回应都留在触发原文附近。
- 提交表达后可以确认“问题 / 观察 / 假设 / 类比”；视觉合并不改变领域身份。
- 确认关系后，规则预览在两段原文之间真实推开内容；支持 reduced motion。

## 三种结构

- **A 安静轨道 / 移动底部层**：桌面轨道只保留当前原文、当前步骤和下一动作；移动端从底部召回当前任务。
- **B 书签召回 / 移动侧抽屉**：正文占据视觉中心，Agent 缩为页边书签；桌面与移动都从右侧召回，并在关闭后恢复焦点。

原 C“全部上下文内联”已根据用户反馈退出比较，不继续修补。

## 设计依据

来自用户本地 Apple Design 笔记的判断：

- Purpose：每个元素都消耗注意力，先守住阅读目的。
- Agency：读者能跳过、停止、返回，不被固定流程锁住。
- Familiarity：使用熟悉的侧栏、抽屉、书签和展开模式。
- Simplicity：简洁不等于把功能藏起来，而是让必要上下文刚好出现。
- Content Layer：品牌与情绪由书、文字和因果连续性承载，不由操作层装饰承担。
- Motion / Feedback：动效只解释状态变化，反馈贴近触发对象，并支持 reduced motion。

用户选定方向前，本目录不进入生产实现。

## 固定证据

- [`captures/variant-a-quiet-rail-v2.png`](captures/variant-a-quiet-rail-v2.png)
- [`captures/variant-a-mobile-bottom-sheet.png`](captures/variant-a-mobile-bottom-sheet.png)
- [`captures/variant-b-bookmark-v2.png`](captures/variant-b-bookmark-v2.png)
- [`captures/variant-b-drawer-v2.png`](captures/variant-b-drawer-v2.png)
- [`captures/variant-b-mobile-side-drawer.png`](captures/variant-b-mobile-side-drawer.png)
- [`captures/relation-to-world-motion-v2.png`](captures/relation-to-world-motion-v2.png)

浏览器验收已覆盖：1440×900 与 360×800 的桌面/移动 A/B、URL 重载保持方案、输入框方向键不切换方案、输入提交与意图确认、Agent 打开/Escape 关闭/焦点恢复、关系确认→规则展开、两套移动方案无横向滚动，以及页面 console warning/error 为 0。移动软键盘顶起行为仍需真机或可模拟键盘的浏览器复核。
