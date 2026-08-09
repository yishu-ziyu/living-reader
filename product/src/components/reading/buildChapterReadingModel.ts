import type {
  BodyNode,
  BookChapter,
  BookManifestV2,
  ChapterTranslation,
  Footnote,
  ManifestSourceLocator,
} from "@/modules/book";
import type {
  ReadingChapter,
  ReadingChapterTranslation,
  ReadingSourceBlock,
  ReadingToc,
} from "./ChapterReadingShell";

export type ChapterReadingModel = Readonly<{
  chapter: ReadingChapter;
  toc: ReadingToc;
  translation: ReadingChapterTranslation;
}>;

/**
 * Converts validated book assets into the small client-facing chapter model.
 * Any source/translation drift returns null; the route can then fail closed.
 */
export function buildChapterReadingModel(
  manifest: BookManifestV2,
  chapter: BookChapter,
  translation: ChapterTranslation,
): ChapterReadingModel | null {
  const bookPart = manifest.books.find(
    (book) =>
      book.bookNumber === chapter.bookNumber &&
      book.chapters.some((candidate) => candidate.chapterId === chapter.chapterId),
  );
  if (
    !bookPart ||
    translation.bookId !== manifest.bookId ||
    translation.chapterId !== chapter.chapterId ||
    translation.locale !== "zh-CN"
  ) {
    return null;
  }

  const translations = new Map(
    translation.translations.map((entry) => [entry.sourceId, entry] as const),
  );
  if (
    translations.size !== translation.translations.length ||
    translations.size !== chapter.sourceBlocks.length
  ) {
    return null;
  }

  const footnotesById = new Map<string, Footnote>();
  for (const footnote of manifest.footnotes) {
    if (footnotesById.has(footnote.id)) return null;
    footnotesById.set(footnote.id, {
      id: footnote.id,
      marker: footnote.marker,
      text: footnote.text,
      ...(footnote.backRefId ? { backRefId: footnote.backRefId } : {}),
    });
  }

  const entries: Record<
    string,
    ReadingChapterTranslation["entries"][string]
  > = {};
  for (const block of chapter.sourceBlocks) {
    const translated = translations.get(block.sourceId);
    if (
      !translated ||
      translated.contentHash !== block.contentHash ||
      !sameLocator(translated.sourceLocator, block.sourceLocator) ||
      !translated.text.trim()
    ) {
      return null;
    }
    entries[block.sourceId] = {
      text: translated.text,
      reviewStatus: translated.reviewStatus,
    };
  }

  const sourceBlocks: ReadingSourceBlock[] = [];
  for (const block of chapter.sourceBlocks) {
    const footnotes = resolveBlockFootnotes(block.body, footnotesById);
    if (!footnotes) return null;
    sourceBlocks.push({
      sourceId: block.sourceId,
      locator: `${block.sourceLocator.resource}#${block.sourceLocator.fragment}`,
      contentHash: block.contentHash,
      body: block.body,
      footnotes,
      evidenceLabel: manifest.edition.label,
    });
  }

  return {
    chapter: {
      bookId: manifest.bookId,
      bookTitle:
        manifest.bookId === "wealth-of-nations" ? "国富论" : manifest.title,
      author: manifest.bookId === "wealth-of-nations" ? "亚当·斯密" : manifest.author,
      editionLabel: manifest.edition.label,
      bookPartId: bookPart.bookId,
      bookPartLabel: `第${chineseNumber(bookPart.bookNumber)}篇`,
      chapterId: chapter.chapterId,
      chapterLabel:
        chapter.chapterNumber === 0
          ? "导言"
          : `第${chineseNumber(chapter.chapterNumber)}章`,
      chapterTitle: chapter.title,
      sourceBlocks,
    },
    toc: {
      books: manifest.books.map((book) => ({
        id: book.bookId,
        label: `Book ${romanNumber(book.bookNumber)}`,
        title: book.title,
        chapters: book.chapters.map((item) => ({
          id: item.chapterId,
          label:
            item.chapterNumber === 0
              ? "导言"
              : `第${chineseNumber(item.chapterNumber)}章`,
          title: item.title,
          href: `/read/${encodeURIComponent(manifest.bookId)}/${encodeURIComponent(item.chapterId)}`,
        })),
      })),
    },
    translation: {
      locale: "zh-CN",
      entries,
    },
  };
}

function resolveBlockFootnotes(
  body: BodyNode[],
  footnotesById: Map<string, Footnote>,
): Footnote[] | null {
  const resolved: Footnote[] = [];
  const seen = new Set<string>();
  for (const node of body) {
    if (node.type !== "footnote_ref" || seen.has(node.targetId)) continue;
    const target = footnotesById.get(node.targetId);
    if (!target) return null;
    resolved.push(target);
    seen.add(node.targetId);
  }
  return resolved;
}

function sameLocator(
  left: ManifestSourceLocator,
  right: ManifestSourceLocator,
): boolean {
  return (
    left.provider === right.provider &&
    left.volume === right.volume &&
    left.volumeId === right.volumeId &&
    left.resource === right.resource &&
    left.fragment === right.fragment
  );
}

function romanNumber(value: number): string {
  return ["I", "II", "III", "IV", "V"][value - 1] ?? String(value);
}

function chineseNumber(value: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value < 10) return digits[value] ?? String(value);
  if (value < 20) return `十${digits[value - 10] ?? ""}`;
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${digits[tens] ?? tens}十${ones ? (digits[ones] ?? ones) : ""}`;
}
