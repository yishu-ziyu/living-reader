# T017 · Apple 式阅读界面设计原则证据包

> 日期：2026-08-09
>
> 用途：为同内容、同状态的桌面 A/B 关键帧与移动召回样例提供可检查约束
> 边界：这是研究与原型输入，不是生产 UI 规范，也不代表 Apple 对 Living Reader 的背书

## 如何阅读本文

- **事实**：第一方规范或成熟阅读产品当前公开文档明确描述的行为。
- **Living Reader 推导**：把事实应用到本项目的设计判断，不冒充来源原话。
- **原型约束**：本轮用于比较方案的可测试假设；数值是项目试验值，不是 Apple 或 WCAG 的统一标准。

## 用户提供的本地设计输入

以下内容来自 `/Users/mahaoxuan/Downloads/私人与共享/Apple Design/`。它们是用户自己的 Apple Design 学习资料，作为项目意图和品味输入使用；其中这些 Markdown 文件本身**没有嵌入外部网页 URL 或明确来源字段**，但原始图片/视频引用仍保留在各文件内。因此本文保留文件直达链接，并把可验证的规范事实另行链接到 Apple/W3C 官方页面，不把本地整理稿自动冒充官方原文。

| 本地资料 | 对 T017 有效的输入 | 本文如何采用 |
|---|---|---|
| [Design Principles 设计原则概述](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/Design Principles 设计原则概述 382886bc60ff8083b3ecfd0522c47ed4.md>)、[Purpose](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/1 Purpose 目的 382886bc60ff80feb1edf47e27a4df7a.md>) | 设计原则是取舍工具；每加一项功能都会消耗时间、注意力与信任 | 用“是否让人更容易理解原文如何成为规律”筛掉无关常驻 UI |
| [Agency](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/2 Agency 自主权 382886bc60ff8039bd7ce4c814ba43ea.md>) | 选择、退出、撤销和错误宽容共同形成掌控感；打断只用于避免重大错误 | A/B 都必须保留停止、撤回、返回原文和未完成输入，不用强制流程换取整齐 |
| [Familiarity](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/4 Familiarity 熟悉感 382886bc60ff8074af51dc03e3a6c496.md>) | 借用已知概念；相同外观应有相同行为；不要为常见操作重新发明隐喻 | 操作层沿用按钮、抽屉、书签、展开和返回；独特表达集中在内容与世界 |
| [Simplicity](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/6 Simplicity 简单 382886bc60ff8036b3a6cb27b44045ad.md>) | 简单不等于把功能全藏起来；必要上下文有时应被增加；顺序、间距和对比建立层级 | 轨道保留当前步骤和下一动作，工程细节后置；“少卡片”不能以失去上下文为代价 |
| [Craft](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/7 Craft 匠心 382886bc60ff8062ba01d4918dac99e3.md>) | 响应延迟、滚动、对齐、旋转破版都会直接削弱结果可信度；工艺需要反复迭代 | 关键帧之后必须补鼠标、滚动、旋转/窄屏、状态恢复和动效中断走查 |
| [UI Layer and Content Layer Separation](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/UI Layer and Content Layer Separation UI层与内容层分离 380886bc60ff8059a855d1b1fef07582.md>)、[Content Layer as Brand Canvas](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/Content Layer as Brand Canvas 内容层作为品牌画布 380886bc60ff8060a22fd3f93e9727dd.md>) | 内容层承载产品价值与品牌；UI 层提供稳定、熟悉的导航操作；自定义投入优先给最能表达内容价值的区域 | 暖纸原文、关系和 Inline World 承担品牌；Agent 操作层保持克制、熟悉、可预测 |
| [Layout](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/Foundations 基础/Layout 布局设计 217886bc60ff816b8762f754b0fad031.md>)、[Typography](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/Foundations 基础/Typography 字体排版 217886bc60ff81f3af09ce5d09f48ca0.md>) | 相关内容分组、重要信息留足空间、渐进揭示、Safe Area、文本宽度与缩放适应 | 三个原型都先冻结正文 measure 与层级，再分配 rail/sheet；不靠缩小字号容纳系统信息 |
| [Motion](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/Foundations 基础/Motion 动效设计 217886bc60ff81ecb6cbc284969775dc.md>)、[Feedback](</Users/mahaoxuan/Downloads/私人与共享/Apple Design/Patterns 模式/Feedback 反馈 217886bc60ff813a899bdba0007f5fc8.md>) | 动效应有目的、简短、可被下一步打断；状态反馈靠近相关项，警告只在必要时中断 | 仅用动效解释原文→关系→世界；普通状态在原文附近非模态呈现，重大不可逆风险才打断 |

证据边界：本轮未把 Notion 页面作为已读来源；Chrome 中的 Laws of UX 页面连续读取超时，也未用于任何结论或引用。

## 核心判断

这里的“Apple 式”首先是注意力、层级、熟悉性、反馈和工艺，不是毛玻璃、圆角、阴影或大留白的组合。Apple HIG 把目的、能动性、责任、熟悉性和工艺放在基础设计原则中，同时要求控件与界面层级突出内容；Materials 指南也把玻璃材料放在 controls/navigation 的功能层，而不是 content layer。因此，Living Reader 的判断标准应是：**书是否始终是第一视觉重心，Agent 是否只在需要时以熟悉、可预测、可撤回的方式出现。**

来源：[Apple Design Principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)、[Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)、[Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)

## 六条直接适用于 Living Reader 的原则

### 1. 内容先到，操作后到

**事实**

- Apple HIG 的层级原则要求控件和界面元素衬托、区分其下方的内容，而不是与内容争夺主位。[Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
- Apple Materials 把玻璃等界面材料用于 controls/navigation 功能层，并明确避免把它用于 content layer，以免混淆层级。[Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- Apple Books 在 Mac 阅读页中，把目录、搜索和翻页等控件放到指针移到页顶或页边时再出现；iPhone 阅读页也以书页为默认画面，点按页面后才召回菜单。[Apple Books for Mac](https://support.apple.com/en-ca/guide/books/-ibks5f526382/mac)、[Apple Books on iPhone](https://support.apple.com/en-gb/guide/iphone/iphc1af7c57/ios)
- Kobo 的阅读菜单默认不常驻；读者在阅读中点按屏幕中央后，字体、目录、进度、搜索和笔记等控件才出现。[Kobo Reading Menu](https://help.kobo.com/hc/en-us/articles/360020494854-About-the-Kobo-eReader-Reading-Menu)
- WCAG 要求有意义的阅读顺序和键盘焦点顺序可被确定并保持可操作性。[WCAG 2.2: Meaningful Sequence](https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence)、[WCAG 2.2: Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order)

**Living Reader 推导**

- 首屏只让章节、真实 SourceBlock、阅读位置和一个主要表达入口形成视觉顺序。Agent 的能力清单、provider、hash、revision 和调试状态都不能先于原文出现。
- “内容先到”不等于隐藏关键状态。权限、错误、正在执行和待确认应在触发动作附近出现；长期技术证据进入“查看依据”。
- 深绿轨道可作为品牌边缘，但不能成为另一张与书页等权的主画布。
- DOM 与键盘路径也要体现这个因果次序：当前原文 → 原文附近的回应/关系 → 次级轨道操作；具体顺序再用原型的键盘走查校准。

### 2. 侧栏用于导航；当前任务与证据按相关性渐进揭示

**事实**

- Apple 把 sidebar 定义为访问多个同级内容区域或模式的宽而平的信息层级；同时明确指出 sidebar 占用较多横向与纵向空间，空间有限或应把空间留给主要内容时，应采用更紧凑的控件。它也允许用户隐藏侧栏以留出内容空间，但要求使用熟悉的 show/hide 入口并避免以默认隐藏破坏可发现性。[Apple HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)
- Apple 的 disclosure control 指南建议把最常用、最重要的信息放在展开层级顶部并保持可见，把高级细节默认隐藏到相关时再展示。[Apple HIG: Disclosure Controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls)
- Readwise Reader 允许用户设置进入阅读页时默认隐藏一侧或两侧面板；其阅读侧栏是可召回的偏好，而不是不可取消的固定占用。[Readwise Reader: Navigation](https://docs.readwise.io/reader/docs/faqs/navigation)
- WCAG 对 hover/focus 附加内容要求可关闭、可把指针移入，并保持到触发解除、用户关闭或信息失效；关键召回不能依赖瞬时 hover。[WCAG 2.2: Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus)

**Living Reader 推导**

- Agent 轨道只保留“当前步骤、必要状态、下一动作、召回入口”四类信息；关系全文、陪读长回应和证据回到触发它们的 SourceBlock 附近。
- 常驻轨道与折叠书签态必须共享同一数据和同一行为，只比较注意力成本与召回效率，不能靠删功能让某一方案显得更安静。
- 展开顺序固定为：人类语言摘要 → 来源/推断/模型扩展的区分 → 技术证据。展开控件的标签应描述内容，例如“查看依据”，不用“更多”。

### 3. 长文排版优先连续阅读，不用微小字号制造信息密度

**事实**

- Apple Typography 指南强调可读字号、避免过轻字重、用有限字体建立稳定层级；长段或宽栏文字可用更宽松的行距帮助读者保持行位，并应支持文字缩放。[Apple HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- WCAG 2.2 的 Reflow 要求普通内容能在等效 320 CSS px 宽度中无信息或功能损失，且不需要二维滚动；Text Spacing 要求用户覆盖行距、段距、字距和词距后仍不丢失内容或功能。[WCAG 2.2: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)、[WCAG 2.2: Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing)
- WCAG 要求正文对比度至少 4.5:1、大字至少 3:1，表达 UI 控件或状态的非文字视觉信息至少 3:1；文字放大到 200% 时也不能丢失内容或功能。[WCAG 2.2: Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)、[WCAG 2.2: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)、[WCAG 2.2: Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text)
- Apple Books 让读者调整字号、字体、背景、亮度和滚动/翻页方式；这说明阅读排版是用户可调的核心体验，不是不可触碰的品牌装饰。[Apple Books on iPhone](https://support.apple.com/en-gb/guide/iphone/iphc1af7c57/ios)

**Living Reader 推导**

- 原文与人类可读回应使用长文级正文；技术元数据即使折叠后出现，也不能退化成 8px 调试字。
- 原型试验值：桌面正文 18–20px、行高 1.65–1.75、每行约 32–42 个汉字；移动正文 17–19px、行高不低于 1.6。它们是起始假设，最终以真实中文原文、200% 缩放和设备截图判断。
- 字体角色最多两套：内容层可保留有书感的正文体，操作层用熟悉、清晰的 UI 字体；层级主要靠字号、字重、间距和位置，不靠连续更换字体与颜色。

### 4. 反馈靠近动作，并同时回答结果与下一步

**事实**

- Apple Feedback 指南把反馈的职责概括为帮助人知道正在发生什么、下一步能做什么、动作结果如何以及怎样避免或纠正错误。[Apple HIG: Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)
- Apple Progress Indicators 指南要求进度反馈是暂态且位置一致；流程停滞时应解释问题和可采取的行动，可安全中止时应提供取消能力。[Apple HIG: Progress Indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)
- Readwise Reader 在许多动作后使用带撤销入口的确认 toast；同时把“最远阅读进度”和“最后所在位置”分开记录，并提供一键返回阅读进度的入口。[Readwise Reader: Basics](https://docs.readwise.io/reader/docs/faqs)
- WCAG Status Messages 要求成功、等待、进度和错误等不夺取焦点的状态变化能由辅助技术获知，让反馈不必打断当前工作。[WCAG 2.2: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages)

**Living Reader 推导**

- 保存想法、生成候选、接受/拒绝关系、停止语音、世界运行失败，都在触发点附近显示“发生了什么 + 现在能做什么”；轨道只保留摘要，不复制一份日志。
- 成功反馈不能只变颜色或显示勾；失败不能只显示 provider 错误。优先用人话说明结果、影响、重试/撤回路径。
- 位置恢复是反馈的一部分：从证据、搜索、Agent 或世界返回时，保留并显式提供回到原 SourceBlock 的动作。

### 5. 动效只解释因果；reduced motion 仍表达同一关系

**事实**

- Apple Motion 指南把动效用于传达状态、反馈和操作指导，而不是独立装饰；系统组件还会依据辅助功能设置调整运动。[Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- Apple Accessibility 指南要求在 Reduce Motion 开启时减少自动、重复、缩放和外围运动，并建议以淡入淡出替代大范围轴向移动。[Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- WCAG 2.2 的 Animation from Interactions 要求可关闭由交互触发的非必要运动动画。[WCAG 2.2 §2.3.3](https://www.w3.org/TR/WCAG22/#animation-from-interactions)
- WCAG 的 Pause, Stop, Hide 要求满足条件的自动移动、闪烁、滚动或更新内容可暂停、停止或隐藏。[WCAG 2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide)

**Living Reader 推导**

- 只为三类因果使用动效：SourceBlock 触发回应、两段原文形成关系、关系通过后世界在段间展开。加载 spinner、环境漂浮、边缘循环呼吸不能成为主要反馈。
- 原型试验值：局部反馈 160–220ms；关系连接与段间展开 240–360ms；不使用弹跳、连续视差或大面积 blur 进出。用户下一次输入必须能立刻中断动效。
- reduced-motion 版本不删除信息：用静态连接线、状态标签、焦点移动和即时布局切换表达相同因果；不能只把 duration 设为零后留下无法理解的跳变。

### 6. 移动端先给完整书页，Agent 作为可预测的底部召回层

**事实**

- Apple Sidebar 指南明确指出空间不足时应使用更紧凑的导航；Apple Books 与 Kobo 都通过点按书页召回阅读控件，而不是让固定侧栏挤压正文。[Apple HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)、[Apple Books on iPhone](https://support.apple.com/en-gb/guide/iphone/iphc1af7c57/ios)、[Kobo Reading Menu](https://help.kobo.com/hc/en-us/articles/360020494854-About-the-Kobo-eReader-Reading-Menu)
- Readwise Reader 在移动端通过底部 Views 导航访问内容区域，通过右上信息入口进入 Notebook；桌面侧栏结构没有原样压缩到窄屏。[Readwise Reader: Basics](https://docs.readwise.io/reader/docs/faqs)、[Readwise Reader: Highlights, Tags, and Notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes)
- Apple Buttons 指南建议按钮命中区域至少 44 × 44pt，并要求自定义按钮具有清楚的按下状态。[Apple HIG: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- WCAG 2.2 的 Target Size (Minimum) 要求大多数指针目标至少容纳 24 × 24 CSS px，或符合规定的间距例外；Focus Visible 要求键盘操作时焦点可见。[WCAG 2.2: Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)、[WCAG 2.2: Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)

**Living Reader 推导**

- 360/390px 宽度下只有一个正文列，不允许页面级横向滚动；Agent 不占首屏左侧，也不要求读者横移才能开始读书。
- 使用底部书签/陪读入口召回同一 Agent 内容，入口显示当前状态但不滚动播报；打开后采用底部层，关闭后把滚动位置和焦点还给原 SourceBlock。
- 参考 Apple 的 44 × 44pt 命中区域，Web 原型把主要移动操作目标设为至少 44 × 44 CSS px；这是项目对跨平台原型的换算约束，不宣称 pt 与 CSS px 物理等价。图标必须有可读名称，关键状态不能只靠颜色或动效。

## 三个原型结构的可操作约束

三个原型必须使用完全相同的两段 Smith 原文、同一 ReaderIdea、同一 RelationProposal、同一 Agent 回应和同一状态。只允许改变容器结构、默认显隐与转场，不允许改文案或删能力来影响偏好判断。

### A. 桌面：始终可见的安静轨道

- 基准视口：1440 × 900；书页始终占据第一视觉重心，轨道宽度试验区间 272–304px。
- 轨道默认只显示：当前 SourceBlock 的一句摘要、当前步骤、一个主动作、折叠的“查看依据”。Ideas 历史、完整回应和关系正文不常驻。
- 关系候选与长回应在触发原文附近展开；轨道只出现“有一条待确认关系”等召回摘要。
- 滚动正文时轨道可保持，但不得自动切换、闪烁或持续运动；正文与轨道分别滚动时必须有清楚边界。
- 失败条件：首眼先读到 Agent 而不是书；同时出现两个主动作；工程字段默认可见；轨道内容横向溢出。

### B. 桌面：可折叠书签态

- 使用与 A 相同的 1440 × 900 状态；展开态可使用 304–336px，折叠态只保留 48–64px 书签/轨迹，不出现截断文字。
- 折叠入口持续可发现，并用“待确认”“正在听”等人类状态显示必要变化；静默状态不做循环呼吸动画。
- 展开不能更换当前 SourceBlock、清空未提交输入或让读者失去正文位置；收起后焦点回到召回入口或原触发点。
- 关系、回应与世界仍在正文附近展开，折叠不等于把它们全部塞回轨道。
- 失败条件：必须试探才能找到 Agent；展开导致正文明显跳位；折叠后丢失错误/权限/待确认状态；仅靠 hover 才能召回。

### C. 移动：单栏正文 + 底部召回层

- 同时制作 360 × 800 与 390 × 844；正文从视口左边界起完整可读，页面级横向滚动为零。
- 固定底部召回区高度试验值 52–60px，主要目标至少 44 × 44 CSS px；给正文保留安全区与尾部 padding，不遮住最后一行。
- Agent 打开为 bottom sheet，初始高度不超过约 55% 视口；读者主动上拉后才能进入更高层级。主动作、关闭和回到原文在首层可见。
- 关闭、浏览器后退与完成动作都恢复原 SourceBlock 的滚动位置和焦点；键盘弹出时输入框与提交/停止仍可见。
- 失败条件：首屏只见 Agent；固定 `min-width` 导致横向滚动；底层遮挡原文又无法关闭；关闭后回到页面顶部；reduced motion 下来源连接消失。

## A/B 评价问题

视觉比较不问“哪个更像 Apple”，而问以下五件事：

1. 三秒内第一眼是否落在原文？
2. 不阅读系统说明，能否知道此刻唯一的主动作？
3. Agent 静默时是否退到边缘，有事时又能被稳定找回？
4. 接受关系后，是否能看懂两段原文为什么被接通，并能回到来源？
5. 关闭轨道或移动底层后，阅读位置、未完成输入和下一步是否都保留？

## 原型阶段的一票否决

- 用毛玻璃、圆角、阴影或大留白替代信息架构调整。
- A/B 使用不同文案、不同数据或不同功能范围。
- 默认展示 hash、revision、provider、内部 ID 等工程信息。
- 移动端正文不先出现、存在页面级横向滚动，或 Agent 无法关闭并返回原位置。
- 关键结果只靠颜色、声音或位移动画表达；没有 reduced-motion 和键盘等价状态。
- 把“截图好看”当成完成，而未验证鼠标、滚动、展开、返回与状态恢复。

## 第一方来源清单

- Apple：[Design Principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)、[HIG](https://developer.apple.com/design/human-interface-guidelines)、[Materials](https://developer.apple.com/design/human-interface-guidelines/materials)、[Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)、[Disclosure Controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls)、[Typography](https://developer.apple.com/design/human-interface-guidelines/typography)、[Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)、[Progress Indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)、[Motion](https://developer.apple.com/design/human-interface-guidelines/motion)、[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)、[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- Apple Books：[Mac 阅读](https://support.apple.com/en-ca/guide/books/-ibks5f526382/mac)、[iPhone 阅读](https://support.apple.com/en-gb/guide/iphone/iphc1af7c57/ios)
- W3C/WAI：[WCAG 2.2](https://www.w3.org/TR/WCAG22/)、[Meaningful Sequence](https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence)、[Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order)、[Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)、[Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing)、[Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)、[Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)、[Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text)、[Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages)、[Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)、[Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)、[Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus)、[Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide)
- Readwise Reader：[Basics](https://docs.readwise.io/reader/docs/faqs)、[Navigation](https://docs.readwise.io/reader/docs/faqs/navigation)、[Highlights, Tags, and Notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes)
- Rakuten Kobo：[Reading Menu](https://help.kobo.com/hc/en-us/articles/360020494854-About-the-Kobo-eReader-Reading-Menu)
