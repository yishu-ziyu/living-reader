# 《国富论》Cannan 1904 第一卷 PDF 来源与页码核验

> 核验日期：2026-08-07  
> 本地文件：`assets/public-domain/wealth-of-nations-cannan-vol1.pdf`

## 1. 来源、版本与权利

- 书目页：[Online Library of Liberty — *An Inquiry Into the Nature and Causes of the Wealth of Nations (Cannan ed.), vol. 1*](https://oll.libertyfund.org/titles/smith-an-inquiry-into-the-nature-and-causes-of-the-wealth-of-nations-cannan-ed-vol-1?html=true)
- 原始 PDF：[Smith_0206-01_EBk_v6.0.pdf](https://oll-resources.s3.us-east-2.amazonaws.com/oll3/store/titles/237/Smith_0206-01_EBk_v6.0.pdf)
- 书目版本：Adam Smith 著；Edwin Cannan 编，含导言、注释、边注摘要与扩充索引；London: Methuen, 1904；Vol. 1。
- OLL 对该下载的说明：这是由 HTML 版本生成、属于 Portable Library of Liberty 的文本型 PDF，不是影印扫描版。
- 权利证据：书目页的 `Copyright` 栏明确写明 **“The text is in the public domain.”**
- 权利边界：该声明证明本书文本为公版；不把 OLL 网站版式、标识或其他站点内容主张为公版。本仓库保留下载文件原貌及来源链接，便于溯源和署名。

## 2. 文件完整性

| 项目 | 核验值 |
|---|---|
| 文件名 | `wealth-of-nations-cannan-vol1.pdf` |
| 文件大小 | 1,999,233 bytes |
| SHA-256 | `bd6a38c77409afc3ca6be08ca67a80a397472d10cc54f75774c12a974839cbeb` |
| PDF 版本 | 1.4 |
| 页数 | 462 |
| 页面尺寸 | A4，595 × 842 pt |
| 加密 | 否 |
| JavaScript | 否 |
| 文本提取 | 成功；无需 OCR |
| 结构检查 | `qpdf --check` 未发现语法或流编码错误 |

下载端响应为 `application/pdf`，`Content-Length` 与本地文件大小一致。源文件响应头的 `Last-Modified` 为 2020-06-01 19:25:39 GMT；PDF 页脚标记为 `PLL v6.0 (generated September, 2011)`。这两个日期描述电子文件，不替代 1904 年书目版本信息。

复核命令：

```bash
pdfinfo assets/public-domain/wealth-of-nations-cannan-vol1.pdf
pdftotext -layout assets/public-domain/wealth-of-nations-cannan-vol1.pdf /tmp/wealth-of-nations-cannan-vol1.txt
shasum -a 256 assets/public-domain/wealth-of-nations-cannan-vol1.pdf
qpdf --check assets/public-domain/wealth-of-nations-cannan-vol1.pdf
```

## 3. Book I, Chapters I–III 目标页

下表页码均为 **PDF 从 1 开始的物理页码**，用 `pdftotext -f <页> -l <页>` 独立复核。该文件页脚显示的 PLL 页码恰好与 PDF 物理页码一致，可直接用于 PDF 阅读器跳页。

| 章节 | PDF 页 | 关键原文 | 对产品机制的约束 |
|---|---:|---|---|
| Book I, Chapter I — *Of the Division of Labour* | **36** | “The greatest improvement in the productive powers of labour … seem to have been the effects of the division of labour.” | 分工是生产力机制，不只是背景知识。 |
| Book I, Chapter I — 针厂数量例证 | **37** | 十名工人分工后每日可制成约 48,000 枚针；若各自独立完成，“could not each of them have made twenty, perhaps not one pin in a day.” | 模型需要显式呈现工序拆分后的产出差异。 |
| Book I, Chapter II — *Of the Principle Which Gives Occasion to the Division of Labour* | **42** | 分工不是预见公共富裕的智慧设计，而是 “the propensity to truck, barter, and exchange one thing for another” 的缓慢结果。 | 交换应驱动专业化形成，不能由系统无条件赠送。 |
| Book I, Chapter II — butcher / brewer / baker | **43** | “It is not from the benevolence of the butcher, the brewer, or the baker, that we expect our dinner, but from their regard to their own interest.” | 交互提议必须能表达对方利益，并受真实库存、成本与需求约束。 |
| Book I, Chapter III — *That the Division of Labour Is Limited by the Extent of the Market* | **45** | “the extent of this division must always be limited … by the extent of the market.” | 小市场下，过度专业化应产生滞销、闲置或无法换得所需品的后果。 |

章节起始范围也已核验：Chapter I 从 PDF 36 页开始，Chapter II 从 PDF 42 页开始，Chapter III 从 PDF 45 页开始。

## 4. 使用结论

该 PDF 可作为第一版“针厂分工 → 交换 → 市场范围”体验的公版英文原文底本。界面引用时必须显示具体章节和上述 PDF 页码；不要把 Cannan 1904 编本误写成 1776 初版，也不要把 OLL 的电子文件生成日期写成作品出版日期。
