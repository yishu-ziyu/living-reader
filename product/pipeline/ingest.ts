import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type {
  BookChapter,
  BookManifestV2,
  BookSourceBlock,
  ManifestBookPart,
  ManifestSourceLocator,
  ManifestVolume,
  NeedsReviewItem,
  ParagraphSourceId,
} from "../src/modules/book/domain";
import { parseOllParagraphFragment } from "../src/infrastructure/book/oll/parseParagraphHtml";

type FixedSourceFile = ManifestVolume & {
  inputPath: string;
  compressedHash: string;
};

type FixedSourceMetadata = {
  schemaVersion: 1;
  bookId: string;
  editionId: string;
  revision: string;
  volumes: FixedSourceFile[];
};

type MutableChapter = Omit<BookChapter, "order">;
type MutableBook = Omit<ManifestBookPart, "order" | "chapters"> & {
  chapters: Map<number, MutableChapter>;
};

export type IngestWealthOfNationsOptions = {
  sourceDir?: string;
};

const EXPECTED_RAW_PARAGRAPHS = new Map([
  [1, 2_119],
  [2, 1_758],
]);

const LEGACY_FRAGMENT_ALIASES = {
  "smith.b1.c1.division": "Smith_0206-01_235",
  "smith.b1.c3.market_extent": "Smith_0206-01_251",
} as const;

export async function ingestWealthOfNations(
  options: IngestWealthOfNationsOptions = {},
): Promise<BookManifestV2> {
  const sourceDir =
    options.sourceDir ??
    path.join(process.cwd(), "pipeline/sources/wealth-of-nations");
  const metadata = await readSourceMetadata(sourceDir);
  const books = new Map<number, MutableBook>();
  const needsReview: NeedsReviewItem[] = [];
  let rawParagraphIdCount = 0;

  for (const volume of [...metadata.volumes].sort(
    (left, right) => left.volume - right.volume,
  )) {
    const compressed = await readFile(path.join(sourceDir, volume.inputPath));
    assertHash(compressed, volume.compressedHash, `${volume.inputPath} gzip`);
    const html = gunzipSync(compressed).toString("utf8");
    assertHash(html, volume.contentHash, volume.resource);

    const rawCount = countParagraphIds(html);
    const expectedCount = EXPECTED_RAW_PARAGRAPHS.get(volume.volume);
    if (
      expectedCount === undefined ||
      rawCount !== expectedCount ||
      rawCount !== volume.rawParagraphIdCount
    ) {
      throw new Error(
        `${volume.resource} raw paragraph count drift: expected ${expectedCount}, metadata ${volume.rawParagraphIdCount}, actual ${rawCount}`,
      );
    }
    rawParagraphIdCount += rawCount;
    ingestVolume(html, volume, books, needsReview);
  }

  const orderedBooks = finalizeBooks(books);
  assertFiveBookContinuity(orderedBooks);
  const allBlocks = orderedBooks.flatMap((book) =>
    book.chapters.flatMap((chapter) => chapter.sourceBlocks),
  );
  const aliases = Object.fromEntries(
    Object.entries(LEGACY_FRAGMENT_ALIASES).map(([alias, fragment]) => {
      const canonical = allBlocks.find(
        (block) => block.sourceLocator.fragment === fragment,
      )?.sourceId;
      if (!canonical) {
        throw new Error(`Legacy alias target missing: ${alias} -> ${fragment}`);
      }
      return [alias, canonical];
    }),
  ) as BookManifestV2["aliases"];

  assertUniqueBlocks(allBlocks);

  return {
    schemaVersion: 2,
    bookId: metadata.bookId,
    title: "An Inquiry into the Nature and Causes of the Wealth of Nations",
    author: "Adam Smith",
    edition: {
      editionId: metadata.editionId,
      revision: metadata.revision,
      language: "en",
      label: "Edwin Cannan edition (1904), official OLL volumes 1-2",
    },
    volumes: metadata.volumes.map(
      ({ inputPath: _inputPath, compressedHash: _compressedHash, ...volume }) =>
        volume,
    ),
    books: orderedBooks,
    aliases,
    needsReview,
    build: {
      adapter: "oll-cannan-two-volume-v1",
      rawParagraphIdCount,
      includedSourceBlockCount: allBlocks.length,
      filteredParagraphCount: rawParagraphIdCount - allBlocks.length,
      needsReviewCount: needsReview.length,
    },
  };
}

async function readSourceMetadata(sourceDir: string): Promise<FixedSourceMetadata> {
  const raw = JSON.parse(
    await readFile(path.join(sourceDir, "sources.json"), "utf8"),
  ) as FixedSourceMetadata;
  if (
    raw.schemaVersion !== 1 ||
    raw.bookId !== "wealth-of-nations" ||
    raw.editionId !== "oll-cannan-1904" ||
    !Array.isArray(raw.volumes) ||
    raw.volumes.length !== 2
  ) {
    throw new Error("Invalid fixed-source metadata");
  }
  return raw;
}

function ingestVolume(
  html: string,
  volume: FixedSourceFile,
  books: Map<number, MutableBook>,
  needsReview: NeedsReviewItem[],
): void {
  const footnotesStart = html.search(
    /<div\b[^>]*class="[^"]*type-footnote\s+note[^"]*"/i,
  );
  const mainHtml = footnotesStart === -1 ? html : html.slice(0, footnotesStart);
  const firstBookIndex = mainHtml.search(/<h2\b[^>]*>\s*BOOK\s+[IVX]+\b/i);
  if (firstBookIndex === -1) {
    throw new Error(`${volume.resource} has no formal Book heading`);
  }

  const printPages = collectPrintPages(mainHtml);
  let printPageIndex = 0;
  let currentPrintPage: string | undefined;
  let currentBook: MutableBook | undefined;
  let currentChapter: MutableChapter | undefined;
  let paragraphOrdinal = 0;
  const tokenPattern = /<h2\b[^>]*>[\s\S]*?<\/h2>|<p\b[^>]*>[\s\S]*?<\/p>/gi;

  for (const match of mainHtml.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index < firstBookIndex) continue;
    while (
      printPageIndex < printPages.length &&
      printPages[printPageIndex].index < index
    ) {
      currentPrintPage = printPages[printPageIndex].page;
      printPageIndex += 1;
    }

    const token = match[0];
    if (/^<h2\b/i.test(token)) {
      const heading = textFromHtml(token);
      const bookMatch = heading.match(/^BOOK\s+([IVX]+)\b:?\s*(.*)$/i);
      if (bookMatch) {
        const bookNumber = romanToInteger(bookMatch[1]);
        const existing = books.get(bookNumber);
        currentBook =
          existing ??
          {
            bookId: `smith.b${bookNumber}`,
            bookNumber,
            label: `BOOK ${bookMatch[1].toUpperCase()}`,
            title: bookMatch[2].trim(),
            chapters: new Map(),
          };
        if (!currentBook.title && bookMatch[2].trim()) {
          currentBook.title = bookMatch[2].trim();
        }
        books.set(bookNumber, currentBook);
        currentChapter = undefined;
        paragraphOrdinal = 0;
        continue;
      }

      if (!currentBook) continue;
      const chapterMatch = heading.match(/^CHAPTER\s+([IVX]+)\b:?\s*(.*)$/i);
      const isIntroduction = /^INTRODUCTION\b/i.test(heading);
      if (!chapterMatch && !isIntroduction) continue;
      const chapterNumber = chapterMatch ? romanToInteger(chapterMatch[1]) : 0;
      if (currentBook.chapters.has(chapterNumber)) {
        throw new Error(
          `Duplicate chapter smith.b${currentBook.bookNumber}.c${chapterNumber}`,
        );
      }
      const chapterTitle = chapterMatch
        ? chapterMatch[2].trim()
        : "Introduction";
      currentChapter = {
        chapterId: `smith.b${currentBook.bookNumber}.c${chapterNumber}`,
        bookNumber: currentBook.bookNumber,
        chapterNumber,
        label: isIntroduction
          ? `${currentBook.label} · INTRODUCTION`
          : `${currentBook.label} · CHAPTER ${chapterMatch?.[1].toUpperCase()}`,
        title: chapterTitle,
        sourceBlocks: [],
      };
      currentBook.chapters.set(chapterNumber, currentChapter);
      paragraphOrdinal = 0;
      continue;
    }

    if (!currentBook || !currentChapter) continue;
    paragraphOrdinal += 1;
    const fragment = token.match(/<p\b[^>]*\bid="([^"]+)"/i)?.[1];
    const locator = makeLocator(volume, fragment ?? `html-offset:${index}`);
    if (!fragment) {
      needsReview.push({
        sourceLocator: locator,
        reason: "missing_paragraph_id",
      });
      continue;
    }
    const parsed = parseOllParagraphFragment(token);
    if (!parsed.ok) {
      needsReview.push({
        sourceLocator: locator,
        reason: parsed.error.code,
        detail: parsed.error.message,
      });
      continue;
    }
    const sourceId =
      `smith.b${currentBook.bookNumber}.c${currentChapter.chapterNumber}.p${paragraphOrdinal}` as ParagraphSourceId;
    const block: BookSourceBlock = {
      sourceId,
      order: paragraphOrdinal,
      body: parsed.value.body,
      quote: parsed.value.quote,
      contentHash: parsed.value.contentHash,
      sourceLocator: makeLocator(volume, parsed.value.fragmentId),
      ...(currentPrintPage ? { printPage: currentPrintPage } : {}),
    };
    currentChapter.sourceBlocks.push(block);
  }

  for (const match of mainHtml.slice(firstBookIndex).matchAll(
    /<li\b[^>]*\bid="(Smith_[^"]+)"[^>]*>[\s\S]*?<\/li>/gi,
  )) {
    needsReview.push({
      sourceLocator: makeLocator(volume, match[1]),
      reason: "unsupported_list_item",
      detail: textFromHtml(match[0]),
    });
  }
  for (const match of mainHtml.slice(firstBookIndex).matchAll(
    /<div\b[^>]*\bid="([^"]+)"[^>]*class="[^"]*table-wrap[^"]*"/gi,
  )) {
    needsReview.push({
      sourceLocator: makeLocator(volume, match[1]),
      reason: "unsupported_table",
    });
  }
}

function finalizeBooks(books: Map<number, MutableBook>): ManifestBookPart[] {
  let chapterOrder = 0;
  return [...books.values()]
    .sort((left, right) => left.bookNumber - right.bookNumber)
    .map((book, bookIndex) => ({
      bookId: book.bookId,
      bookNumber: book.bookNumber,
      label: book.label,
      title: book.title,
      order: bookIndex + 1,
      chapters: [...book.chapters.values()]
        .sort((left, right) => left.chapterNumber - right.chapterNumber)
        .map((chapter) => ({ ...chapter, order: (chapterOrder += 1) })),
    }));
}

function assertFiveBookContinuity(books: ManifestBookPart[]): void {
  const numbers = books.map((book) => book.bookNumber).join(",");
  if (numbers !== "1,2,3,4,5") {
    throw new Error(`Expected formal Books I-V, got ${numbers}`);
  }
  const bookFour = books[3];
  const chapters = bookFour.chapters.map((chapter) => chapter.chapterNumber);
  const chapterThree = bookFour.chapters.find((chapter) => chapter.chapterNumber === 3);
  const chapterFour = bookFour.chapters.find((chapter) => chapter.chapterNumber === 4);
  if (
    !chapterThree?.sourceBlocks.length ||
    !chapterFour?.sourceBlocks.length ||
    chapters.indexOf(4) !== chapters.indexOf(3) + 1 ||
    chapterThree.sourceBlocks.at(-1)?.sourceLocator.volume !== 1 ||
    chapterFour.sourceBlocks[0].sourceLocator.volume !== 2
  ) {
    throw new Error("Book IV volume boundary is not Chapter III -> Chapter IV");
  }
}

function assertUniqueBlocks(blocks: BookSourceBlock[]): void {
  const sourceIds = new Set<string>();
  const locators = new Set<string>();
  const locatorHashes = new Set<string>();
  for (const block of blocks) {
    const locator = `${block.sourceLocator.resource}#${block.sourceLocator.fragment}`;
    const locatorHash = `${locator}:${block.contentHash}`;
    if (
      sourceIds.has(block.sourceId) ||
      locators.has(locator) ||
      locatorHashes.has(locatorHash)
    ) {
      throw new Error(`Duplicate SourceBlock identity: ${block.sourceId} ${locator}`);
    }
    sourceIds.add(block.sourceId);
    locators.add(locator);
    locatorHashes.add(locatorHash);
  }
}

function makeLocator(
  volume: FixedSourceFile,
  fragment: string,
): ManifestSourceLocator {
  return {
    provider: "OLL",
    volume: volume.volume,
    volumeId: volume.volumeId,
    resource: volume.resource,
    fragment,
  };
}

function collectPrintPages(html: string): Array<{ index: number; page: string }> {
  const pages: Array<{ index: number; page: string }> = [];
  const pattern =
    /Edition: current; Page: <\/span><span class="bracket">\[<\/span>([\s\S]*?)<span class="bracket">\]<\/span>/gi;
  for (const match of html.matchAll(pattern)) {
    const page = textFromHtml(match[1]).replace(/^\((.*)\)$/, "$1").trim();
    if (page) pages.push({ index: match.index ?? 0, page });
  }
  return pages;
}

function countParagraphIds(html: string): number {
  return [...html.matchAll(/<p\b[^>]*\bid="[^"]+"/gi)].length;
}

function assertHash(
  content: string | Buffer,
  expected: string,
  label: string,
): void {
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expected) {
    throw new Error(`${label} content hash drift: expected ${expected}, got ${actual}`);
  }
}

function textFromHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 10)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function romanToInteger(roman: string): number {
  const values: Record<string, number> = { I: 1, V: 5, X: 10 };
  let total = 0;
  let previous = 0;
  for (const symbol of roman.toUpperCase().split("").reverse()) {
    const value = values[symbol];
    if (!value) throw new Error(`Unsupported Roman numeral: ${roman}`);
    total += value < previous ? -value : value;
    previous = value;
  }
  return total;
}
