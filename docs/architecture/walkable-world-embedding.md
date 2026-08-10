# 可走世界与产品嵌入合同

> 状态：Proposed / T071  
> 版本：0.1 / 2026-08-10  
> 触发：用户驳回 T070（重叠遮挡 + 点击切地点不是可走世界）  
> 权威关系：补充 `design.md`、`realtime-agent-world-interaction.md`、`event-protocol.md`；不替换 EventStore / WorldKernel

## 1. 用户裁决（必须遵守）

1. **可走**：角色/读者化身要在空间里移动，不是点列表切换“我现在在哪”。
2. **可读**：1-bit 场景禁止人物、建筑、标签互相遮死；看不清 = 验收失败。
3. **先调研再造轮子**：可走/瓦片/嵌入方案必须先看开源。
4. **必须能进产品**：原型不是独立小游戏，最终要嵌进书页 `InlineWorldBlock`，并服从既有事实源。

## 2. 一句话结论

**经济事实仍由 WorldKernel + EventStore 独写；可走层只是 Presentation 适配器。**  
开源引擎可以负责“移动、碰撞、深度排序、镜头”；不能负责钱、库存、订单，也不能绕过 Agent/读者确认直接改世界边界。

```text
书页阅读流
  └─ InlineWorldBlock
       ├─ DOM 摘要 / 键盘等价 / 停止 / 回原文   ← 永远存在
       ├─ WalkView（可走呈现适配器）
       │    输入：PresentationPlan.places + avatar + blockers
       │    输出：move intent / enter-place intent / focus place
       └─ 不写 EventStore；只把“到达某地后的 allowlist 行动”交给既有 dispatch
```

## 3. T070 错在哪

| 现象 | 为什么错 |
|---|---|
| 左栏点“村落市集/工坊”切换焦点 | 这是面板导航，不是空间移动 |
| 多站角色建筑叠在同一条地平线 | 无占用格、无深度排序、无“单一焦点主体” |
| 仍保留罐头动作条当主交互 | 空间没有成为行动发生的地方 |
| 未调研可走开源就手搓 UI | 重复造移动/碰撞/瓦片轮子，且质量差 |

**点击地点列表最多只能做次要快捷方式，不能当主空间交互。**

## 4. “可走”的可验收定义

用户必须能完成：

1. 用键盘（方向键/WASD）或指针拖拽/点地，让化身在地图上**连续移动或网格移动**。
2. 化身走到不同地点附近时，**当前地点随位置变化**（不是先点列表）。
3. 走到锁定路/关闭门时，被挡住或得到可见原因，**不穿模、不瞬移标签**。
4. 任意时刻画面主主体清晰：化身与当前互动建筑不被不透明精灵盖住。
5. 同步 DOM 摘要始终能读出：在哪、能去哪、刚发生什么。

最小地图形态（首版）：

- 顶视角或 3/4 顶视角网格（参考用户视频，不做 FPS）。
- 地点是地图上的区域/门口，不是侧栏按钮。
- 首版 1 个可玩区域即可（羊毛镇外景 + 2–3 个可进入热点），不要一上来大世界。

## 5. 遮挡与美术硬规则

1. **占用**：同一地表格最多一个“主实体”占据前景；装饰层不得盖住主实体中心。
2. **深度排序**：按脚底 Y（或格子行号）排序；禁止固定 DOM 顺序硬叠。
3. **标签**：默认只标当前焦点/靠近的实体；全图常驻四五个大标签禁止。
4. **1-bit 负形**：建筑要留门口与空隙，角色要有独立剪影；看不清剪影就重画，不靠更小字硬塞。
5. **验收**：任意截图若用户 1 秒内分不清“人在哪、房在哪”，直接打回。

## 6. 开源候选比较（2026-08-10）

| 候选 | 许可/体量 | 可走能力 | 嵌入 Next/书页 | 与产品匹配 | 结论 |
|---|---|---|---|---|---|
| **Phaser 3/4** | MIT；生态最大；官方 React/Next 模板 | 瓦片、碰撞、镜头、顶视角成熟 | client-only 组件可嵌；需自管生命周期 | 强，但偏完整游戏运行时，包体与心智重 | **原型可选用**；产品默认需证明比薄适配器更值 |
| **melonJS** | MIT；~150KB gz；Tiled 一等公民；WebGL+Canvas fallback | 瓦片/碰撞/镜头适合顶视角镇区 | 可挂 parent DOM；零依赖 | 很适合“小地图可走” | **优先原型候选** |
| **Excalibur.js** | BSD；TS 优先；~300KB | 2D 场景/碰撞清晰 | TS 友好；社区小于 Phaser | 架构干净 | 备选 |
| **KAPLAY**（Kaboom 后继） | 开源；教学向 API | 快速做移动/碰撞 demo | 轻，但偏独立小游戏语法 | 适合尖兵 demo，不适合当书内长期内核 | 仅 throwaway spike |
| **LittleJS** | MIT；极小 | 能做顶视角 | 过裸，系统要自建多 | 不优先 | 备选微内核 |
| **RPG-JS** | 开源 RPG 框架 | 直接 RPG 地图/NPC | 太重、太像完整 RPG 产品 | **不选**：会反客为主 |
| **自研网格 WalkView** | 无新依赖 | 网格移动+占用+Y 排序可控 | 与 React/DOM 摘要最贴 | 工作量在移动手感与工具链 | **产品默认推荐方向**（可借鉴引擎算法，不整引擎进主路径） |

### 推荐策略（两段）

1. **产品主路径（推荐）**：自研薄 `WalkView`  
   - 数据：`places[]`、`tiles/blockers`、`avatarCell`、`hotspots[]`  
   - 渲染：Canvas2D **或** DOM 网格二选一做 spike；必须双轨 DOM 摘要  
   - 不引入完整游戏循环进阅读壳，只在 InlineWorld 展开时挂载/卸载  
2. **隔离原型验证**：用 **melonJS 或 Phaser** 在 `prototypes/` 先做出“可走 + 无遮挡 + 进门”手感  
   - 证明交互后，把**数据合同**迁回 `PresentationPlan`，不必把引擎一并迁进 `product/`  
3. **明确不选**：RPG-JS 全家桶、Godot 导出当长期书内世界（历史 placeholder 仅证明“能嵌”，不证明机制）

## 7. 与现有产品架构如何接

### 7.1 不变的权威

| 层 | 继续做什么 |
|---|---|
| Agent turn | 生成 WorldIntent/WorldPlan/补丁候选；不写状态 |
| Reader 接受 | 首次进入与改边界补丁仍需确认 |
| WorldKernel | 唯一算经济数值 |
| EventStore | 唯一事实源与回放 |
| PresentationPlan | 渲染输入合同；WalkView 只消费它 |

### 7.2 要扩展的呈现合同（最小字段）

```ts
// 概念合同，非最终代码
type WalkPresentation = {
  map: {
    cols: number;
    rows: number;
    tile_px: number;
    // 0 可行走 / 1 阻挡 / 2 装饰可走等
    blockers: readonly number[]; // length = cols*rows
  };
  avatar: { cell: { x: number; y: number }; facing: "n"|"s"|"e"|"w" };
  places: readonly {
    id: string;
    label: string;
    // 地点占用的格子或入口格
    entrance: { x: number; y: number };
    area?: readonly { x: number; y: number }[];
    status: "open" | "locked";
    occupants: readonly string[];
    pressure: string;
  }[];
  // 深度排序用的可绘制物（脚底锚点）
  drawables: readonly {
    id: string;
    kind: "avatar" | "actor" | "building" | "item" | "label";
    anchor: { x: number; y: number }; // 脚底或基点
    sprite_ref: string;
    place_id?: string;
  }[];
};
```

规则：

- `avatar` 移动若**只改变观察焦点**，可以是呈现状态（session-local），不必每步写 EventStore。  
- `avatar` 移动若触发**经济行动**（进门交易、开工、开通道路），必须变成 allowlist command → Kernel → Event。  
- 锁定地点可接近、不可进入；进入失败要有可见原因。

### 7.3 InlineWorld 嵌入

```text
ChapterReadingShell
  SourceBlock
  InlineWorldBlock (document flow, 推开后文)
     header: 机制标题 / 停止 / 收起 / 回原文
     WalkView host (fixed aspect, max height)
     side/bottom: 当前地点摘要 + ActionCandidate（仍可点，但是到达后解锁，不是空间主导航）
     details: DOM 摘要（a11y）
```

约束：

- 展开高度受控，避免书页被 全屏游戏 吃掉。  
- `prefers-reduced-motion`：可走改为“格子点选移动”或“逐步跳格”，终态仍可读。  
- Canvas/WebGL 失败时：降级为地点列表+摘要，**不能白屏**，但降级态不得冒充“已具备可走体验”。

## 8. 与 D015 的关系

D015（实时生成/开放）仍然成立，但**空间主交互定义修正**如下：

| 旧（错误执行） | 新（用户纠正后） |
|---|---|
| 地点拓扑 = 侧栏点击切换焦点 | 地点拓扑 = 地图上可走达的区域与连接 |
| 可生成行动可以挂在全局按钮 | 可生成行动优先出现在**到达的地点** |
| 先做面板再谈移动 | 先做可走+无遮挡，再叠加行动与连锁 |

靶心顺序重排：

1. **可走 + 无遮挡地图**（本文件）  
2. 到达地点后的可生成行动  
3. 一次连锁反馈  
4. 同世界补丁（例如走出路口后解锁邻镇）

## 9. 下一版原型边界（待用户点头再做）

**做：**

- 一张小网格羊毛镇外景  
- 化身可移动  
- 3 个可接近地点（市集/工坊/仓房）+ 1 条锁定路  
- Y 排序与占用，无重叠遮死  
- 进入热点后显示该地摘要（仍不是经济写入）  
- DOM 摘要与键盘移动  

**不做：**

- 完整 RPG 数值/战斗  
- 把 Phaser/RPG-JS 直接打进 `product/` 主包  
- 再做侧栏点击切地点当主交互  
- 重画全套精美像素前先过可走可读  

**建议原型技术：** `prototypes/walkable-wool-town` + melonJS 或自研网格二选一 spike（7 日内只留胜者）。

## 10. 用户需要裁决的点

1. 可走主交互定义是否正确（移动优先，列表仅快捷）？  
2. 产品主路径是否同意“薄 WalkView + 引擎只进原型”？  
3. 下一刀原型用 melonJS spike 还是直接自研网格？  

## 11. 变更记录

| 版本 | 日期 | 变化 |
|---|---|---|
| 0.1 | 2026-08-10 | T070 驳回后建立：可走定义、遮挡规则、开源比较、嵌入合同、靶心重排 |
