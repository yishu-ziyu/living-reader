import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadChapterTranslation } from "@/modules/book";
import { ingestWealthOfNations } from "../../../pipeline/ingest";
import {
  buildBookTranslations,
  type TranslationBatch,
} from "../../../pipeline/translate";

const sourceDir = path.join(
  process.cwd(),
  "pipeline/sources/wealth-of-nations",
);

describe("traceable chapter translations", () => {
  it("translates missing blocks once, persists source identity, and reuses clean entries", async () => {
    const source = await ingestWealthOfNations({ sourceDir });
    const manifest = structuredClone(source);
    manifest.books = [
      {
        ...manifest.books[0]!,
        chapters: [manifest.books[0]!.chapters[0]!],
      },
    ];
    const outputDir = await mkdtemp(
      path.join(os.tmpdir(), "living-reader-translations-"),
    );
    const translatedBatches: string[][] = [];
    const translate: TranslationBatch = async (blocks) => {
      translatedBatches.push(blocks.map((block) => block.sourceId));
      return blocks.map((block) => ({
        sourceId: block.sourceId,
        text: `中文：${block.text}`,
      }));
    };

    try {
      const first = await buildBookTranslations({
        manifest,
        outputDir,
        translate,
        model: "test-model",
        promptRevision: "test-prompt-v1",
        translatedAt: "2026-08-09T00:00:00.000Z",
      });
      expect(first.translatedBlockCount).toBe(
        manifest.books[0]!.chapters[0]!.sourceBlocks.length,
      );
      expect(first.reusedBlockCount).toBe(0);
      expect(translatedBatches.flat()).toEqual(
        manifest.books[0]!.chapters[0]!.sourceBlocks.map(
          (block) => block.sourceId,
        ),
      );

      const chapterId = manifest.books[0]!.chapters[0]!.chapterId;
      const artifactPath = path.join(outputDir, `${chapterId}.json`);
      const firstBytes = await readFile(artifactPath, "utf8");
      translatedBatches.length = 0;

      const second = await buildBookTranslations({
        manifest,
        outputDir,
        translate,
        model: "test-model",
        promptRevision: "test-prompt-v1",
        translatedAt: "2026-08-10T00:00:00.000Z",
      });
      expect(second.translatedBlockCount).toBe(0);
      expect(second.reusedBlockCount).toBe(
        manifest.books[0]!.chapters[0]!.sourceBlocks.length,
      );
      expect(translatedBatches).toEqual([]);
      expect(await readFile(artifactPath, "utf8")).toBe(firstBytes);

      const loaded = await loadChapterTranslation(
        manifest.bookId,
        chapterId,
        outputDir,
      );
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) throw loaded.error;
      expect(loaded.value).toMatchObject({
        bookId: "wealth-of-nations",
        locale: "zh-CN",
        chapterId,
      });
      expect(loaded.value.translations[0]).toMatchObject({
        sourceId: manifest.books[0]!.chapters[0]!.sourceBlocks[0]!.sourceId,
        model: "test-model",
        promptRevision: "test-prompt-v1",
        reviewStatus: "machine",
      });

      await writeFile(artifactPath, "{}\n", "utf8");
      expect(
        await loadChapterTranslation(manifest.bookId, chapterId, outputDir),
      ).toMatchObject({
        ok: false,
        error: { code: "invalid_manifest" },
      });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
