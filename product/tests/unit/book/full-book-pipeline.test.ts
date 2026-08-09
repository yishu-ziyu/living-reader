import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getBookChapter,
  listBookSummaries,
  loadBookManifest,
  resolveSourceId,
  validateBookManifestV2,
} from "@/modules/book";
import { ingestWealthOfNations } from "../../../pipeline/ingest";
import {
  buildWealthOfNationsAssets,
  validateBookAssets,
} from "../../../pipeline/build";

const productRoot = process.cwd();
const sourceDir = path.join(
  productRoot,
  "pipeline/sources/wealth-of-nations",
);

describe("full-book OLL ingest", () => {
  it("compiles both official Cannan volumes into canonical Books I-V", async () => {
    const manifest = await ingestWealthOfNations({ sourceDir });

    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.build.rawParagraphIdCount).toBe(3_877);
    expect(manifest.volumes.map((volume) => volume.rawParagraphIdCount)).toEqual([
      2_119, 1_758,
    ]);
    expect(manifest.books.map((book) => book.bookNumber)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(manifest.books[0]?.chapters[0]?.title).toBe(
      "OF THE DIVISION OF LABOUR",
    );

    const bookFour = manifest.books.find((book) => book.bookNumber === 4);
    expect(bookFour).toBeDefined();
    const chapterThree = bookFour?.chapters.find(
      (chapter) => chapter.chapterId === "smith.b4.c3",
    );
    const chapterFour = bookFour?.chapters.find(
      (chapter) => chapter.chapterId === "smith.b4.c4",
    );
    expect(chapterThree?.sourceBlocks.at(-1)?.sourceLocator.resource).toBe(
      "Smith_0206-01.html",
    );
    expect(chapterFour?.sourceBlocks[0]?.sourceLocator.resource).toBe(
      "Smith_0206-02.html",
    );
    expect(chapterThree?.order).toBeLessThan(chapterFour?.order ?? 0);

    const allBlocks = manifest.books.flatMap((book) =>
      book.chapters.flatMap((chapter) => chapter.sourceBlocks),
    );
    expect(allBlocks).toHaveLength(2_063);
    expect(allBlocks[0]?.sourceId).toBe("smith.b1.c1.p1");
    expect(
      allBlocks.every((block) => /^smith\.b\d+\.c\d+\.p\d+$/.test(block.sourceId)),
    ).toBe(true);

    const locatorKeys = allBlocks.map(
      (block) =>
        `${block.sourceLocator.resource}#${block.sourceLocator.fragment}`,
    );
    expect(new Set(locatorKeys).size).toBe(allBlocks.length);
    expect(allBlocks.every((block) => /^[a-f0-9]{64}$/.test(block.contentHash))).toBe(
      true,
    );
    expect(chapterThree?.sourceBlocks.at(-1)?.sourceLocator.fragment).toBe(
      "Smith_0206-01_1292",
    );
    const bookFiveChapterThree = manifest.books
      .find((book) => book.bookNumber === 5)
      ?.chapters.find((chapter) => chapter.chapterId === "smith.b5.c3");
    expect(bookFiveChapterThree?.sourceBlocks.at(-1)?.sourceLocator.fragment).toBe(
      "Smith_0206-02_1047",
    );
    expect(
      allBlocks.every(
        (block) =>
          !block.quote.includes("Edition: current; Page:") &&
          !block.quote.toLowerCase().includes("aberdeen university press"),
      ),
    ).toBe(true);

    const footnoteRefs = allBlocks.flatMap((block) =>
      block.body
        .filter((node) => node.type === "footnote_ref")
        .map((node) => node.targetId),
    );
    const footnotesById = new Map(
      manifest.footnotes.map((footnote) => [footnote.id, footnote] as const),
    );
    expect(footnoteRefs).toHaveLength(1_508);
    expect(manifest.footnotes).toHaveLength(1_632);
    expect(footnotesById.size).toBe(manifest.footnotes.length);
    expect(
      footnoteRefs.every((targetId) => {
        const target = footnotesById.get(targetId);
        return (
          target !== undefined &&
          target.text.trim().length > 0 &&
          target.sourceLocator.fragment === target.id
        );
      }),
    ).toBe(true);
    expect(
      footnotesById.get("lf0206-01_footnote_nt554")?.text,
    ).toContain("£1,514,962");
  });

  it("keeps legacy semantic IDs as aliases of canonical paragraph identities", async () => {
    const manifest = await ingestWealthOfNations({ sourceDir });

    expect(manifest.aliases).toEqual({
      "smith.b1.c1.division": "smith.b1.c1.p1",
      "smith.b1.c3.market_extent": "smith.b1.c3.p1",
    });
  });

  it("is byte-stable and records skipped or unparseable anchors for review", async () => {
    const first = await ingestWealthOfNations({ sourceDir });
    const second = await ingestWealthOfNations({ sourceDir });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.needsReview.length).toBeGreaterThan(0);
    expect(
      first.needsReview.every(
        (item) =>
          item.sourceLocator.fragment.length > 0 &&
          item.reason.length > 0 &&
          !("sourceId" in item),
      ),
    ).toBe(true);
  });

  it("validates manifest identity and resolves chapters and aliases fail-closed", async () => {
    const manifest = await ingestWealthOfNations({ sourceDir });

    expect(validateBookManifestV2(manifest)).toEqual({
      ok: true,
      value: manifest,
    });
    expect(getBookChapter(manifest, "smith.b4.c4")).toMatchObject({
      ok: true,
      value: { chapterId: "smith.b4.c4", bookNumber: 4, chapterNumber: 4 },
    });
    expect(resolveSourceId(manifest, "smith.b1.c1.division")).toEqual({
      ok: true,
      value: "smith.b1.c1.p1",
    });
    expect(resolveSourceId(manifest, "smith.b1.c1.p1")).toEqual({
      ok: true,
      value: "smith.b1.c1.p1",
    });
    expect(resolveSourceId(manifest, "smith.b9.c9.p9")).toMatchObject({
      ok: false,
      error: { code: "unknown_source" },
    });

    const duplicate = structuredClone(manifest);
    duplicate.books[0].chapters[0].sourceBlocks[1].sourceLocator =
      duplicate.books[0].chapters[0].sourceBlocks[0].sourceLocator;
    expect(validateBookManifestV2(duplicate)).toMatchObject({
      ok: false,
      error: { code: "duplicate_locator" },
    });

    const drifted = structuredClone(manifest);
    drifted.books[0].chapters[0].sourceBlocks[0].quote += " forged";
    expect(validateBookManifestV2(drifted)).toMatchObject({
      ok: false,
      error: { code: "quote_hash_drift" },
    });

    const missingFootnote = structuredClone(manifest);
    missingFootnote.footnotes = missingFootnote.footnotes.filter(
      (footnote) => footnote.id !== "lf0206-01_footnote_nt114",
    );
    expect(validateBookManifestV2(missingFootnote)).toMatchObject({
      ok: false,
      error: { code: "source_unavailable" },
    });

    const duplicateFootnote = structuredClone(manifest);
    duplicateFootnote.footnotes.push(
      structuredClone(duplicateFootnote.footnotes[0]!),
    );
    expect(validateBookManifestV2(duplicateFootnote)).toMatchObject({
      ok: false,
      error: { code: "duplicate_locator" },
    });

    expect(
      validateBookManifestV2({ ...manifest, footnotes: "not-an-array" }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_manifest" },
    });
  });

  it("writes a validated manifest atomically and keeps clean reruns byte-identical", async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "living-reader-ingest-"));
    try {
      const first = await buildWealthOfNationsAssets({ sourceDir, outputDir });
      const firstBytes = await readFile(first.manifestPath);
      const second = await buildWealthOfNationsAssets({ sourceDir, outputDir });
      const secondBytes = await readFile(second.manifestPath);

      expect(firstBytes.equals(secondBytes)).toBe(true);
      expect(first.written).toBe(true);
      expect(second.written).toBe(false);
      expect(first.manifest.build.rawParagraphIdCount).toBe(3_877);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it("validates every checked-in translation against its canonical source block", async () => {
    await expect(validateBookAssets()).resolves.toMatchObject({
      chapterCount: 34,
      sourceBlockCount: 2_063,
      translatedBlockCount: 2_063,
    });
  });


  it("loads the manifest through the public book list/get interface", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "living-reader-books-"));
    try {
      await buildWealthOfNationsAssets({
        sourceDir,
        outputDir: path.join(
          rootDir,
          "public/books/wealth-of-nations",
        ),
      });

      const listed = await listBookSummaries(rootDir);
      expect(listed).toMatchObject({
        ok: true,
        value: [
          {
            bookId: "wealth-of-nations",
            bookCount: 5,
          },
        ],
      });
      const loaded = await loadBookManifest("wealth-of-nations", rootDir);
      expect(loaded).toMatchObject({
        ok: true,
        value: { schemaVersion: 2, bookId: "wealth-of-nations" },
      });
      expect(await loadBookManifest("../escape", rootDir)).toMatchObject({
        ok: false,
        error: { code: "invalid_manifest" },
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
