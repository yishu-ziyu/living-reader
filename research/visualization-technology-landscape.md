# 「可运行的书」可视化技术景观

> 调研日期：2026-08-07  
> 目的：在动手之前，弄清同类作品如何呈现“活的世界”、各自使用什么渲染技术，以及它们在 2 分钟 Demo 中的真实代价。  
> 边界：本文不选最终方案，也不继续沿用 SVG 主视觉。来源优先使用官方仓库、论文和官方技术文档；无法核验的实现明确标为未知。

## 先给结论

目前主流不是“选 Godot 还是选 Canvas”这么简单，而是五种不同的呈现策略：

1. **像素／Tile 世界**：大量 Agent 在地图上行动，最容易让人相信“世界真的在运行”。
2. **插画／动态舞台**：用少量高质量场景、人物和状态转场，换取更强的审美控制。
3. **2.5D／等距沙盘**：兼顾城镇全貌和空间层次，但资产制作明显更重。
4. **浏览器或游戏引擎 3D**：镜头表现力最高，同时承担模型、动画、灯光、包体和兼容性成本。
5. **地图／关系图／数据可视化**：最能说明系统变化，却最容易变成研究面板，而不是让人想进入的世界。

调研里最稳定的技术规律是：**面向网页的“活世界”通常采用 DOM + Canvas/WebGL 混合架构**。自然语言输入、解释、字幕和可访问性留在 DOM；人物、建筑、环境变化交给 PixiJS、Three.js、Rive 或引擎画布。渲染层消费模拟事件，但不承载经济逻辑。

“高级感”主要来自美术方向、镜头、构图、动效节奏、声音和资产一致性，而不是 API 名称。PixiJS 可以很精致，Three.js 也可以很廉价。先前 SVG 样式已经证明不符合本项目的审美要求，因此下面只把 SVG 当作对照，不再作为主世界候选。

## 一、12 个代表案例

| 类别 | 案例 | 用户看到什么 | 已核验的实现 | 2 分钟 Demo 的优势 | 主要风险 |
|---|---|---|---|---|---|
| 像素／Tile | [AI Town](https://github.com/a16z-infra/ai-town) | 像素小镇、角色移动、对话与活动 | React + PixiJS + `pixi-viewport`；地图由 spritesheet 和图层绘制。见 [依赖](https://github.com/a16z-infra/ai-town/blob/main/package.json)、[Stage](https://github.com/a16z-infra/ai-town/blob/main/src/components/Game.tsx)、[地图渲染](https://github.com/a16z-infra/ai-town/blob/main/src/components/PixiStaticMap.tsx) | 一眼能看出“很多人正在生活”；网页交付直接 | 容易落入 AI Town 仿品；角色太小，政策的因果变化不容易聚焦 |
| 像素／Tile | [Generative Agents / Smallville](https://github.com/joonspk-research/generative_agents) | 俯视像素镇，Agent 在 Tiled 地图上行走 | Phaser 3.55.2 + Tiled JSON；见 [页面入口](https://github.com/joonspk-research/generative_agents/blob/main/environment/frontend_server/templates/home/home.html) 和 [Phaser 地图代码](https://github.com/joonspk-research/generative_agents/blob/main/environment/frontend_server/templates/home/main_script.html) | Agent 运动、地点和相遇关系非常清楚 | 视觉已形成“学术 Agent 小镇”刻板印象；地图和 walk cycle 资产量不小 |
| 像素／格网 | [NetLogo Web / Galapagos](https://github.com/NetLogo/Galapagos) | Patch 格网、Turtle、参数控件和图表 | 多层 Canvas 2D；Patch 先画到 scratch canvas 再缩放。见 [视图控制器](https://github.com/NetLogo/Galapagos/blob/main/app/assets/javascripts/beak/widgets/draw/view-controller.coffee)、[Patch layer](https://github.com/NetLogo/Galapagos/blob/main/app/assets/javascripts/beak/widgets/draw/patch-layer.coffee) | 涌现、拥堵、扩散、短缺等模式极易观察 | 像实验教学工具，人物情感和文学质感弱 |
| 插画／动态舞台 | [1001 Nights](https://arxiv.org/abs/2308.12915) | 像素插画世界；语言诱导出的概念变成武器；实时生成新的世界图像 | 论文确认 GPT-4 + Stable Diffusion + ControlNet + pixelization；生成世界以单张图像进入游戏。客户端引擎未披露 | “说一句话，世界立刻物化”非常适合短 Demo | 图像生成延迟、风格漂移和失败结果会破坏现场；它不是持续运行的多 Agent 空间 |
| 插画／卡片 | [Hidden Door](https://www.hiddendoor.co/press) | 互动图像小说、地点/人物/物品卡、词语块与插画 | 官方披露产品形态，但没有披露前端 renderer；因此技术栈未知。参见 [官方技术演示说明](https://www.hiddendoor.co/blog/techcrunch-demo) | 镜头集中、信息层级清楚，能在几十秒内建立 IP 氛围 | 系统性后果容易退化成卡片换图；看不出经济世界真的在演化 |
| 插画／全画布模拟 | [Half-Earth Socialism](https://github.com/frnsys/half_earth) | 高度统一的插画式政策模拟界面 | Rust + egui/eframe + `glow`/`three-d`，Web 版编译为 WASM 并挂到 Canvas。见 [工作区依赖](https://github.com/frnsys/half_earth/blob/main/Cargo.toml)、[游戏依赖](https://github.com/frnsys/half_earth/blob/main/game/Cargo.toml)、[WebRunner](https://github.com/frnsys/half_earth/blob/main/game/src/main.rs) | 强美术统一性和“政策拨动世界”感；模型与视觉层分离 | Rust/WASM 迭代与网页文本可访问性成本高；全画布 UI 不适合大量自然语言输入 |
| 2.5D／等距 | [OpenTTD](https://github.com/OpenTTD/OpenTTD) | 成熟的等距城市、交通流、建设和产业变化 | 原生 C++ 等距 sprite 模拟引擎；官方 [NewGRF sprite 文档](https://docs.openttd.org/source/d3/d4a/newgrf__commons_8h.html) 展示其资源布局体系 | 一屏同时显示个体行动与系统增长，因果关系天然可视化 | 建筑、地形、车辆、动画组成庞大资产体系；官方形态不是轻量浏览器产品 |
| 2.5D／程序化城市 | [City Tour](https://github.com/jstrait/city-tour) | 可旋转的低多边形程序化城市 | Three.js/WebGL；程序生成 terrain、roads、lots、buildings，再在浏览器中组成 3D 城市 | 不依赖大量手工城市模型也能迅速形成空间规模 | 缺少人物表演和经济反馈组件；镜头自由度太高反而可能分散 Demo 注意力 |
| 浏览器 3D | [World of ClaudeCraft](https://github.com/levy-street/world-of-claudecraft) | 3D 地形、小镇、天气、阴影、角色和动画 | Three.js；确定性 simulation 与 DOM/renderer/HUD 通过接口分离；程序化和 CC0 GLB 资产并用 | 证明浏览器里可以做真正的 3D 活世界，且世界模型与 renderer 可解耦 | 范围极易爆炸：地形、rig、动作、摄像机、碰撞、性能都成为独立工程 |
| 引擎 3D | [SimWorld](https://github.com/SimWorld-AI/SimWorld) | 写实城市、车辆、行人、天气和物理 | Unreal Engine 5 + Python communicator；支持程序化城市和 `.pak` 资产 | 视觉上限最高，特别适合“未来城市数字孪生”印象 | 浏览器交付、显卡、包体、资产与部署均不符合轻量比赛链接的风险边界 |
| 地理／数据地图 | [AgentSociety](https://github.com/tsinghua-fib-lab/AgentSociety) | 地图上的居民图标、点、文字、热力图、时间回放和统计图 | React 19 + Deck.gl + Mapbox GL + Plotly。见 [依赖](https://github.com/tsinghua-fib-lab/AgentSociety/blob/main/frontend/package.json) 与 [Replay layers](https://github.com/tsinghua-fib-lab/AgentSociety/blob/main/frontend/src/pages/Replay/Deck.tsx) | 政策影响的人群规模、迁移和空间分布一眼可读 | 更像城市治理分析台；很难让观众关心某一个面包师为什么关门 |
| 关系图／混合页面 | [BookWorld](https://github.com/alienet1109/BookWorld) | 地图底图、人物节点关系、资料卡和聊天面板 | 普通 DOM + D3 SVG force graph 覆盖在 raster 地图上。见 [页面](https://github.com/alienet1109/BookWorld/blob/main/index.html) 和 [map-panel.js](https://github.com/alienet1109/BookWorld/blob/main/frontend/js/left-section/map-panel.js) | 实现快，人物、地点和关系信息密度高 | 正是容易产生“信息仪表盘 + Chatbot”廉价感的路线；关系变化并不等于世界发生变化 |

补充判断：用户提供的 [EvolvingWorld](https://github.com/HKUST-KnowComp/EvolvingWorld) 对世界模型、角色状态和长期演化有研究价值，但当前公开仓库主要产出 JSON 轨迹与评测数据；在已发布代码中没有找到面向用户的世界 renderer。它适合参考后端状态结构，不是视觉答案。参见其 [simulation README](https://github.com/HKUST-KnowComp/EvolvingWorld/blob/main/simulation/README.md)。

## 用户给出的目标案例：野火深林 1BIT 挂机 RPG

本地材料：

- [视频](/Users/mahaoxuan/Desktop/一本书/素材管理/人到达有多懒才想起来要做这个功能%20%5B6a74629400000000210223c1%5D.mp4)
- [原帖元数据](/Users/mahaoxuan/Desktop/一本书/素材管理/人到达有多懒才想起来要做这个功能%20%5B6a74629400000000210223c1%5D.info.json)
- [原帖说明](/Users/mahaoxuan/Desktop/一本书/素材管理/人到达有多懒才想起来要做这个功能%20%5B6a74629400000000210223c1%5D.description)

### 可以确认的事实

- 作者在说明中明确使用 `#godot`、`#像素美术`，并称作品为“野火深林 1BIT 挂机 RPG”。
- 本段展示的更新重点是“战斗日志完全重写”“技能细节描述”和“UI 窗口浮动大小”。
- 视频呈现的是严格黑白、高对比的 1BIT 视觉：位图字体、逐像素图标、有限帧角色动画、颗粒/网点、粗细统一的面板边框和可改变占屏比例的日志窗口。
- 视频文件本身是 624×932、30 fps、15.8 秒的社交平台竖屏录制；这不是游戏内部逻辑分辨率的证据。

### 从画面推断的制作方式（不是作者披露）

下面是复刻这种视觉时最可能使用的 Godot 结构，不能表述成原作者源码事实：

- 世界和战斗角色：`Sprite2D` / `AnimatedSprite2D`，或小型 `TileMapLayer`；纹理使用 nearest-neighbor，按整数倍缩放，避免像素边缘发糊。
- 浮动、缩放和滚动面板：`Control` 节点体系，自定义标题区拖拽和边缘 resize handle；`NinePatchRect`/面板贴图维持边框像素不变形，`RichTextLabel` + `ScrollContainer` 承载日志。Godot 的 UI 本来就由 `Control` 节点构成，并通过锚点、offset 和 `_gui_input()` 处理尺寸与输入，见[官方 Control 文档](https://docs.godotengine.org/en/stable/classes/class_control.html)。
- 如果地图、战斗区和日志区需要各自独立渲染或改变内部逻辑尺寸，可用 `SubViewport` + `SubViewportContainer` 隔离；但仅凭视频不能确认作者用了它。见[官方 SubViewport 文档](https://docs.godotengine.org/en/stable/classes/class_subviewport.html)。
- 扫描线、网点和灰阶抖动可能是预画进 sprite，也可能是全屏 `CanvasItem` shader / 重复纹理叠层。严格 1BIT 风格更稳的做法是资产阶段就控制调色板，只用 shader 做轻量扫描线或过渡，避免运动时抖动图案闪烁。

### 它为什么不显廉价

关键不是“像素小人”，而是**极端一致的限制**：

1. 只有黑、白与抖动灰，场景、字体、图标和窗口完全同源。
2. 所有尺寸都落在像素网格上；边框、留白、字体基线和图标线宽没有混用现代 Web UI 的圆角、阴影和渐变。
3. 世界画面和信息面板不是两个设计系统。战斗日志、HP 条、角色 sprite 和鼠标反馈都像同一台机器的部件。
4. 可浮动/放大的日志窗口不只是装饰，它让“系统发生了什么”成为玩法本身，特别适合我们需要展示的因果账本。
5. 它用很少的动画建立反馈：血条变化、角色攻击帧、日志逐条写入、窗口重排。质感来自节奏和响应，不来自高面数。

### 对《国富论》项目可借什么

可以借的是“**1BIT 可运行经济机器**”这套视觉语言，不是照搬沙漠、鹿、战斗菜单或素材：

- 主窗口显示小镇或生产链持续运行；窗口可在“街道 / 工坊 / 市场 / 因果账本”之间放大聚焦。
- 经济事件用游戏反馈表达：价格牌翻转、库存格变空、烟囱停烟、人物排队、契约断裂；日志同步写出真实事件编号和原因。
- 一句自然语言政策进入后，界面先把它编译成几条 1BIT 规则卡，再让世界窗口重新排布，追踪一条二阶后果。
- 黑白可以对应早期印刷、账本、机械计算机和报纸网点，但必须重新设计资产，不能回到上一版“泛黄纸张 + SVG 关系线”。

### 它是否要求我们使用 Godot

**不要求。视觉语言和渲染引擎是两件事。**

- 如果作品是“游戏优先”，窗口拖拽、像素动画、音效、输入和场景切换都在同一画布里，Godot 2D 很合适。
- 如果作品是“AI Web 产品优先”，自然语言输入、流式反馈、来源引用和 Agent API 占核心，React DOM + PixiJS 也能复刻相同的 1BIT raster 世界，而且网页集成更直接。
- Godot 4 可以导出 Web，但使用 WebAssembly + WebGL 2.0 Compatibility renderer，并产生 `.wasm`、`.pck` 等启动文件；包体、首屏初始化和 Safari/移动端仍需专项验证。见[官方 Web export 文档](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html)。

因此，这个案例应加入候选视觉方向，但正确的问题不是“要不要抄它的 Godot 技术栈”，而是：**我们是否愿意用一整套严格的 1BIT 美术约束，把经济模拟做成一台可操作的游戏机器。**

## 二、这些案例真正说明了什么

### 1. 研究型多 Agent 世界偏爱 Pixel、Tile 和格网

这不是因为像素风天然更高级，而是因为它能同时容纳几十个 Agent、明确地点与路径、低成本复用动作，并让系统状态具象化。代价是观众已经非常熟悉 AI Town / Smallville 的样子。若选择像素风，必须有明显不同的时代、美术和镜头语言，否则技术深度会被看成复刻。

### 2. 消费级叙事产品用插画和卡片控制生成的不确定性

Hidden Door 把生成内容收在人物、地点和物品等“有边界的视觉容器”里；1001 Nights 让生成图像成为一次可见的世界变化。它们共同避免了“LLM 实时生成完整连续动画”这件目前很不稳定的事。

### 3. 社会模拟越追求规模，界面越像研究仪表盘

AgentSociety、Mesa、NetLogo 一类产品优先回答“系统发生了什么”，而不是“我身处其中是什么感觉”。这对《国富论》的机制解释很有用，但若照搬，作品会像经济学教学软件。需要把宏观图表压到次要层，把关键后果落在具体的人、店铺、队伍、货架和街道上。

### 4. 3D 不会自动带来惊艳，只会放大资产差距

World of ClaudeCraft 之所以完整，是因为它同时拥有程序化地形、GLB 资产、人物 rig、动作、天气、灯光和 HUD。SimWorld 的写实感来自 UE5 和大型资产体系。只搭一个 Three.js/Godot 场景、放几个默认低模，通常会比精心绘制的 2D 舞台更像技术样例。

### 5. 混合 DOM + Canvas/WebGL 是最稳的产品结构

世界画面需要高频绘制；文字输入、政策条款、来源、字幕和可访问性需要真实 DOM。把两者拆开，也使模拟内核可以在不改经济逻辑的情况下更换 renderer。

```text
自然语言政策（DOM）
        ↓
语义裁决器 → 结构化规则
        ↓
确定性经济模拟 → Event Log
        ↓
Renderer 消费事件（Pixi / Rive / Three / Godot）
        ↓
街道、店铺、人物、价格牌、队伍发生可见变化
```

## 三、技术路线对照

| 路线 | 最擅长 | 网页交付 | 资产与工程负担 | 关键限制 |
|---|---|---:|---:|---|
| DOM + SVG | 节点图、图表、线和标签 | 最轻 | 低 | 不再作为本项目主视觉；适合小型辅助图表 |
| React + PixiJS | Raster sprite、粒子、2D/2.5D 活世界 | 轻 | 中 | 高频 Text/复杂 Graphics 有成本；语义可访问层需另做 DOM。官方建议尽量使用 spritesheet，见 [性能](https://pixijs.com/8.x/guides/concepts/performance-tips) 与 [可访问性](https://pixijs.com/8.x/guides/components/accessibility) |
| Phaser | Tilemap、摄像机、寻路、碰撞和传统游戏循环 | 轻至中 | 中 | 如果没有大量地图和游戏系统，会比 Pixi 更重；官方 Tilemap 支持 orthogonal/isometric/hex 等，见 [Tilemap API](https://docs.phaser.io/api-documentation/3.90.0/class/tilemaps-tilemap) |
| React + Rive | 预先设计好的角色/场景动效、状态机转场 | 轻 | 中 | 适合“有限但精致”的状态，不擅长任意城市布局；运行时走 Canvas/WebGL2，不是把 SVG 扔进页面。见 [Web runtime](https://rive.app/docs/runtimes/web/canvas-vs-webgl)、[State Machine](https://rive.app/docs/runtimes/state-machines) |
| React Three Fiber / Three.js | 浏览器 3D 小镇、固定镜头 diorama | 中 | 高 | 模型、UV、rig、动画、灯光、压缩和移动端性能都是成本；R3F 是 Three.js 的 React renderer，见 [官方仓库](https://github.com/pmndrs/react-three-fiber) |
| Godot Web | 完整 2D/3D 游戏编辑器、场景树和动画系统 | 中至重 | 高 | Web 仅支持 Compatibility renderer；WASM/`.pck` 包体、Safari/移动端和线程配置需验证；Godot 4 C# 不能导出 Web。见 [Web export](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html) |
| Unity Web | 团队已有 Unity 管线时的完整 3D 游戏 | 重 | 很高 | WebGL2 + WebAssembly，数据与资产随 build 交付；浏览器线程、网络和平台限制需单独处理。见 [兼容性](https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-browsercompatibility.html) 与 [技术限制](https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-technical-overview.html) |
| Unreal Pixel Streaming | 写实 UE 场景通过浏览器串流 | 极重（服务端） | 极高 | 远端 GPU、编码、WebRTC、signalling、STUN/TURN 和并发成本；见 [官方架构](https://dev.epicgames.com/documentation/unreal-engine/overview-of-pixel-streaming-in-unreal-engine) |

Canvas/WebGL 没有天然的 HTML 语义。输入框、政策文本、解释、字幕、键盘路径应留在 DOM；画布需要平行的可访问描述、焦点管理和 reduced-motion。Pixi 的 accessibility overlay 也需要主动启用，并不是自动获得。

## 四、2 分钟 Demo 对视觉方案的约束

两分钟不允许观众“等世界慢慢有趣”。合格的视觉演示需要：

- 首屏 3 秒内建立“这是一个正在运作的小镇”，而不是先解释规则。
- 一次自然语言行为，在 5–10 秒内完成“被理解 → 变成制度 → 人群开始反应”。
- 镜头只追一条因果链，例如：价格上限落下 → 面包价格牌封顶 → 面包师停炉 → 货架变空 → 门外排队 → 黑市交易出现。
- 宏观指标只能作证，不能抢戏。先让观众看见店关门，再让曲线确认短缺。
- 模型推理期间也要有真实反馈，例如把输入拆成正在确认的制度条款；不能用假动画冒充模拟结果。
- Demo 使用确定性 seed 和预加载资产，保证同一句政策得到可复演结果；LLM 只负责语义裁决，经济后果由模拟器产生。

最大的失败不是“不够复杂”，而是**观众看不出哪一个变化是由刚才那句话造成的**。无论 2D 还是 3D，都必须支持镜头聚焦、因果高亮和时间压缩。

## 五、三条可进入视觉样片阶段的候选架构

下面三条都可以承载同一个经济模拟内核；此处不选赢家。

### A. 电影化 Raster 2.5D 小镇

**画面**：手绘或渲染成图的 18 世纪街区切面；前中后景有视差。人物不是廉价像素小人，而是统一画风的 raster sprite。政策发生时，招牌、货架、烟囱、队伍、暗巷和橱窗同步改变。

**技术**：React/Next DOM 外壳 + PixiJS WebGL Canvas；PNG/WebP/AVIF 分层场景、spritesheet、粒子和相机 tween。SVG 只允许用于不可见技术用途或极小辅助图标，不承担主画面。

**最小资产包**：1 条街、3 家店、6–10 个可辨认角色、每人 idle/walk/react、5 个经济状态物件、3 个环境状态、1 套声音。

**优势**：网页快、自然语言 UI 好做、视觉可以完全受美术控制；最容易把“因果链”排成镜头。

**风险／停测条件**：如果一张静态关键帧仍像通用 AI 小镇或素材拼贴，就不应继续做动画；先解决 art direction。

### B. 浏览器 3D 微缩 Diorama

**画面**：不是开放世界，而是固定 30–45 度镜头的微缩街区。镜头只在面包店、市场和暗巷之间推进；房屋可掀顶或切面，看到生产、库存和排队。

**技术**：React DOM + React Three Fiber/Three.js；GLB/glTF 资产、baked light、限制材质数量、固定摄像机、少量骨骼动画。经济模拟独立运行，Event Log 驱动场景。

**最小资产包**：3 栋建筑、1 条街、6 个角色共用 rig、6 个动画、10 个可变物件、2 个固定镜头运动。

**优势**：空间、深度、队伍和店铺内外变化有天然表现力；更接近“一个世界真的摆在桌上”。

**风险／停测条件**：如果首屏下载、移动端帧率或人物动作无法稳定，或者只能使用明显的默认低模，就应停止扩大 3D 范围。Godot Web 可实现同一画面，但只有在团队已有 Godot 场景/动画经验时才比 R3F 更划算。

### C. 插画式动态剧场

**画面**：一张高质量街区长卷或建筑剖面，人物像舞台演员一样进入不同区域。政策以“法令”进入世界，随后价格牌、炉火、门、队伍、表情和光线发生编排好的状态变化。

**技术**：React DOM + Rive Canvas/WebGL2 状态机；也可用分层 raster 图片与 Pixi 时间线实现，避免形成扁平矢量感。模拟传出的状态绑定到少量明确动画，而不是生成整段视频。

**最小资产包**：1 张主场景、4–6 个角色、8–12 个可组合状态、3 组过渡动画、声音与字幕。

**优势**：最适合 2 分钟的精确节奏与审美控制；资产总量比完整小镇低，人物可以画得更大、更有情绪。

**风险／停测条件**：如果每一种政策都只能对应一段预写动画，它会退化成互动演示片。必须证明多种自然语言规则能组合到同一组世界状态，而非 A/B/C 分支。

## 六、暂时不做的决定

现阶段不应该仅凭技术名拍板。下一步只需要用**同一个 8–10 秒因果脚本**做静态关键帧或极短动效对比：

> “面包不得超过 2 银币”落地 → 面包师停炉 → 货架空 → 队伍增长 → 暗巷出现高价交易。

分别测试 A、B、C 的视觉语言，评价四件事：首眼高级感、因果可读性、真实资产工时、网页首屏与帧率。样片通过后再锁 renderer；在此之前，不进入产品前端实现。
