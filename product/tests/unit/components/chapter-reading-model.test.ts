import { describe, expect, it } from "vitest";
import type {
  BookChapter,
  BookManifestV2,
  ChapterTranslation,
} from "@/modules/book";
import { buildChapterReadingModel } from "@/components/reading/buildChapterReadingModel";

const HASH = "a".repeat(64);

function chapter(bookNumber: number): BookChapter {
  return {
    chapterId: `smith.b${bookNumber}.c1`,
    bookNumber,
    chapterNumber: 1,
    label: `BOOK ${bookNumber} · CHAPTER I`,
    title: bookNumber === 1 ? "OF THE DIVISION OF LABOUR" : `BOOK ${bookNumber}`,
    order: 1,
    sourceBlocks: [
      {
        sourceId: `smith.b${bookNumber}.c1.p1`,
        order: 1,
        body:
          bookNumber === 1
            ? [
                { type: "text", text: "Source " },
                {
                  type: "footnote_ref",
                  marker: "1",
                  href: "#lf0206-01_footnote_nt001",
                  targetId: "lf0206-01_footnote_nt001",
                  id: "lf0206-01_footnote_nt001_ref",
                },
                { type: "text", text: "1" },
              ]
            : [{ type: "text", text: `Source ${bookNumber}` }],
        quote: `Source ${bookNumber}`,
        contentHash: HASH,
        sourceLocator: {
          provider: "OLL",
          volume: bookNumber < 4 ? 1 : 2,
          volumeId: bookNumber < 4 ? "vol-1" : "vol-2",
          resource:
            bookNumber < 4 ? "Smith_0206-01.html" : "Smith_0206-02.html",
          fragment: `Smith_0206-0${bookNumber < 4 ? 1 : 2}_${bookNumber}`,
        },
        printPage: String(bookNumber),
      },
    ],
  };
}

function manifest(): BookManifestV2 {
  const chapters = [1, 2, 3, 4, 5].map(chapter);
  return {
    schemaVersion: 2,
    bookId: "wealth-of-nations",
    title: "An Inquiry into the Nature and Causes of the Wealth of Nations",
    author: "Adam Smith",
    edition: {
      editionId: "oll-cannan-1904",
      revision: "1904",
      language: "en",
      label: "Cannan 1904",
    },
    volumes: [],
    books: chapters.map((item, index) => ({
      bookId: `smith.b${index + 1}`,
      bookNumber: index + 1,
      label: `BOOK ${["I", "II", "III", "IV", "V"][index]}`,
      title: `Book ${index + 1} title`,
      order: index + 1,
      chapters: [item],
    })),
    footnotes: [
      {
        id: "lf0206-01_footnote_nt001",
        marker: "1",
        text: "Canonical footnote target.",
        backRefId: "lf0206-01_footnote_nt001_ref",
        sourceLocator: {
          provider: "OLL",
          volume: 1,
          volumeId: "vol-1",
          resource: "Smith_0206-01.html",
          fragment: "lf0206-01_footnote_nt001",
        },
      },
    ],
    aliases: {
      "smith.b1.c1.division": "smith.b1.c1.p1",
      "smith.b1.c3.market_extent": "smith.b1.c3.p1",
    },
    needsReview: [],
    build: {
      adapter: "oll-cannan-two-volume-v1",
      rawParagraphIdCount: 3_877,
      includedSourceBlockCount: 5,
      filteredParagraphCount: 3_872,
      needsReviewCount: 0,
    },
  };
}

function translation(contentHash = HASH): ChapterTranslation {
  return {
    schemaVersion: 1,
    bookId: "wealth-of-nations",
    locale: "zh-CN",
    chapterId: "smith.b1.c1",
    translations: [
      {
        sourceId: "smith.b1.c1.p1",
        sourceLocator: chapter(1).sourceBlocks[0]!.sourceLocator,
        contentHash,
        text: "劳动分工提高了劳动生产力。",
        model: "fixture",
        promptRevision: "fixture-v1",
        reviewStatus: "machine",
        translatedAt: "2026-08-09T00:00:00.000Z",
      },
    ],
  };
}

describe("buildChapterReadingModel", () => {
  it("maps the canonical current chapter and all five book groups without guessing aliases", () => {
    const source = manifest();
    const result = buildChapterReadingModel(
      source,
      source.books[0]!.chapters[0]!,
      translation(),
    );

    expect(result).not.toBeNull();
    expect(result?.chapter.sourceBlocks[0]).toMatchObject({
      sourceId: "smith.b1.c1.p1",
      body: [
        { type: "text", text: "Source " },
        {
          type: "footnote_ref",
          targetId: "lf0206-01_footnote_nt001",
        },
        { type: "text", text: "1" },
      ],
      footnotes: [
        {
          id: "lf0206-01_footnote_nt001",
          text: "Canonical footnote target.",
        },
      ],
    });
    expect(result?.translation.entries["smith.b1.c1.p1"]).toEqual({
      text: "劳动分工提高了劳动生产力。",
      reviewStatus: "machine",
    });
    expect(result?.toc.books.map((book) => book.label)).toEqual([
      "Book I",
      "Book II",
      "Book III",
      "Book IV",
      "Book V",
    ]);
    expect(result?.toc.books[4]?.chapters[0]?.href).toBe(
      "/read/wealth-of-nations/smith.b5.c1",
    );
  });

  it("fails closed when a canonical footnote target is unavailable", () => {
    const source = manifest();
    source.footnotes = [];

    expect(
      buildChapterReadingModel(
        source,
        source.books[0]!.chapters[0]!,
        translation(),
      ),
    ).toBeNull();
  });

  it("fails closed when translation contentHash drifts from the source", () => {
    const source = manifest();
    expect(
      buildChapterReadingModel(
        source,
        source.books[0]!.chapters[0]!,
        translation("b".repeat(64)),
      ),
    ).toBeNull();
  });
});
