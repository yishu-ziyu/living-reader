import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadChapterTranslation, sourceContentHash } from "@/modules/book";
import { ingestWealthOfNations } from "../../../pipeline/ingest";
import {
  validateBookAssets,
  validateManifestAsset,
} from "../../../pipeline/build";
import {
  buildAllBookAssets,
  buildStagedBookTranslations,
} from "../../../pipeline/cli";
import {
  buildBookTranslations,
  createStepFunTranslationBatch,
  type TranslationBatch,
} from "../../../pipeline/translate";

const sourceDir = path.join(
  process.cwd(),
  "pipeline/sources/wealth-of-nations",
);
const checkedInAssetDir = path.join(
  process.cwd(),
  "public/books/wealth-of-nations",
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
      const switchedModel = await buildBookTranslations({
        manifest,
        outputDir,
        translate,
        model: "replacement-model",
        promptRevision: "test-prompt-v1",
        translatedAt: "2026-08-11T00:00:00.000Z",
      });
      expect(switchedModel.translatedBlockCount).toBe(0);
      expect(switchedModel.reusedBlockCount).toBe(
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

  it("leaves a complete chapter byte-identical when a later batch fails", async () => {
    const source = await ingestWealthOfNations({ sourceDir });
    const manifest = structuredClone(source);
    const sourceChapter = manifest.books[0]!.chapters[0]!;
    const chapter = {
      ...sourceChapter,
      sourceBlocks: sourceChapter.sourceBlocks.slice(0, 2).map((block) => ({
        ...block,
        quote: `${block.quote}${"x".repeat(20_000)}`,
      })),
    };
    manifest.books = [{ ...manifest.books[0]!, chapters: [chapter] }];
    const outputDir = await mkdtemp(
      path.join(os.tmpdir(), "living-reader-atomic-chapter-"),
    );
    const artifactPath = path.join(outputDir, `${chapter.chapterId}.json`);

    try {
      await buildBookTranslations({
        manifest,
        outputDir,
        translate: async (blocks) =>
          blocks.map((block) => ({
            sourceId: block.sourceId,
            text: `旧译：${block.text}`,
          })),
        model: "original-model",
        promptRevision: "original-prompt",
        translatedAt: "2026-08-09T00:00:00.000Z",
      });
      const originalBytes = await readFile(artifactPath, "utf8");
      let batchCount = 0;

      await expect(
        buildBookTranslations({
          manifest,
          outputDir,
          translate: async (blocks) => {
            batchCount += 1;
            if (batchCount === 2) {
              throw new Error("later provider batch failed");
            }
            return blocks.map((block) => ({
              sourceId: block.sourceId,
              text: `新译：${block.text}`,
            }));
          },
          model: "replacement-model",
          promptRevision: "replacement-prompt",
          translatedAt: "2026-08-10T00:00:00.000Z",
        }),
      ).rejects.toThrow("later provider batch failed");

      expect(batchCount).toBe(2);
      expect(await readFile(artifactPath, "utf8")).toBe(originalBytes);
      const preserved = await loadChapterTranslation(
        manifest.bookId,
        chapter.chapterId,
        outputDir,
      );
      expect(preserved.ok).toBe(true);
      if (!preserved.ok) throw preserved.error;
      expect(
        preserved.value.translations.every(
          (entry) => entry.promptRevision === "original-prompt",
        ),
      ).toBe(true);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("keeps all live chapters byte-identical when a later concurrent chapter fails", async () => {
    const rootDir = await mkdtemp(
      path.join(os.tmpdir(), "living-reader-atomic-translate-"),
    );
    const assetDir = path.join(rootDir, "wealth-of-nations");
    const liveTranslationDir = path.join(
      assetDir,
      "translations",
      "zh-CN",
    );

    try {
      await cp(checkedInAssetDir, assetDir, { recursive: true });
      const manifestPath = path.join(assetDir, "manifest.json");
      const manifest = await validateManifestAsset(manifestPath);
      const chapters = manifest.books
        .flatMap((book) => book.chapters)
        .slice(0, 2);
      const chapterPaths = chapters.map((chapter) =>
        path.join(liveTranslationDir, `${chapter.chapterId}.json`),
      );
      const artifacts = await Promise.all(
        chapterPaths.map(async (chapterPath) =>
          JSON.parse(await readFile(chapterPath, "utf8")) as {
            translations: Array<{
              promptRevision: string;
              reviewStatus: "machine" | "human_reviewed";
            }>;
          },
        ),
      );
      const promptRevision = artifacts[0]!.translations[0]!.promptRevision;
      for (const [index, artifact] of artifacts.entries()) {
        for (const entry of artifact.translations) {
          entry.promptRevision = promptRevision;
        }
        artifact.translations[0]!.promptRevision = "stale-prompt";
        artifact.translations[0]!.reviewStatus = "machine";
        await writeFile(
          chapterPaths[index]!,
          `${JSON.stringify(artifact, null, 2)}\n`,
          "utf8",
        );
      }
      await expect(validateBookAssets({ assetDir })).resolves.toMatchObject({
        manifestPath,
      });
      const originalManifestBytes = await readFile(manifestPath, "utf8");
      const translationNames = (
        await readdir(liveTranslationDir, { withFileTypes: true })
      )
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
      const originalTranslationBytes = await Promise.all(
        translationNames.map((name) =>
          readFile(path.join(liveTranslationDir, name), "utf8"),
        ),
      );
      let firstProviderSucceeded = false;
      let secondProviderFailed = false;
      let signalFirstProvider = (): void => undefined;
      const firstProviderCompletion = new Promise<void>((resolve) => {
        signalFirstProvider = () => resolve();
      });
      await expect(
        buildStagedBookTranslations({
          assetDir,
          translate: async (blocks) => {
            const sourceId = blocks[0]?.sourceId;
            if (sourceId?.startsWith(`${chapters[0]!.chapterId}.`)) {
              firstProviderSucceeded = true;
              signalFirstProvider();
              return blocks.map((block) => ({
                sourceId: block.sourceId,
                text: `新译：${block.text}`,
              }));
            }
            if (sourceId?.startsWith(`${chapters[1]!.chapterId}.`)) {
              await firstProviderCompletion;
              secondProviderFailed = true;
              throw new Error("later concurrent chapter failed");
            }
            throw new Error(`Unexpected translation batch: ${sourceId}`);
          },
          model: "replacement-model",
          promptRevision,
          translatedAt: "2026-08-10T00:00:00.000Z",
        }),
      ).rejects.toThrow("later concurrent chapter failed");

      expect(firstProviderSucceeded).toBe(true);
      expect(secondProviderFailed).toBe(true);
      expect(await readFile(manifestPath, "utf8")).toBe(originalManifestBytes);
      expect(
        await Promise.all(
          translationNames.map((name) =>
            readFile(path.join(liveTranslationDir, name), "utf8"),
          ),
        ),
      ).toEqual(originalTranslationBytes);
      await expect(validateBookAssets({ assetDir })).resolves.toMatchObject({
        manifestPath,
      });
      expect(await readdir(rootDir)).toEqual(["wealth-of-nations"]);
      expect(
        (await readdir(path.dirname(liveTranslationDir))).filter((name) =>
          name.startsWith(".zh-CN.backup-"),
        ),
      ).toEqual([]);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps the live manifest and translation set usable when all fails validation", async () => {
    const rootDir = await mkdtemp(
      path.join(os.tmpdir(), "living-reader-atomic-book-"),
    );
    const assetDir = path.join(rootDir, "wealth-of-nations");

    try {
      await cp(checkedInAssetDir, assetDir, { recursive: true });
      const manifestPath = path.join(assetDir, "manifest.json");
      const manifest = await validateManifestAsset(manifestPath);
      const chapterId = manifest.books[0]!.chapters[0]!.chapterId;
      const chapterPath = path.join(
        assetDir,
        "translations",
        "zh-CN",
        `${chapterId}.json`,
      );
      const chapter = JSON.parse(
        await readFile(chapterPath, "utf8"),
      ) as {
        translations: Array<{
          promptRevision: string;
          reviewStatus: "machine" | "human_reviewed";
        }>;
      };
      const promptRevision = chapter.translations[0]!.promptRevision;
      chapter.translations[0]!.promptRevision = "stale-prompt";
      chapter.translations[0]!.reviewStatus = "machine";
      await writeFile(
        chapterPath,
        `${JSON.stringify(chapter, null, 2)}\n`,
        "utf8",
      );
      await expect(validateBookAssets({ assetDir })).resolves.toMatchObject({
        chapterCount: manifest.books.flatMap((book) => book.chapters).length,
      });
      const originalManifestBytes = await readFile(manifestPath, "utf8");
      const originalChapterBytes = await readFile(chapterPath, "utf8");
      let providerCallCount = 0;
      let stagedManifestCorrupted = false;

      await expect(
        buildAllBookAssets({
          assetDir,
          sourceDir,
          translate: async (blocks) => {
            providerCallCount += 1;
            expect(await readFile(manifestPath, "utf8")).toBe(
              originalManifestBytes,
            );
            expect(await readFile(chapterPath, "utf8")).toBe(
              originalChapterBytes,
            );
            if (!stagedManifestCorrupted) {
              stagedManifestCorrupted = true;
              const stagingEntry = (
                await readdir(rootDir, { withFileTypes: true })
              ).find(
                (entry) =>
                  entry.isDirectory() &&
                  entry.name.startsWith(".wealth-of-nations.stage-"),
              );
              expect(stagingEntry).toBeDefined();
              const stagedManifestPath = path.join(
                rootDir,
                stagingEntry!.name,
                "manifest.json",
              );
              const stagedManifest =
                await validateManifestAsset(stagedManifestPath);
              const stagedBlock =
                stagedManifest.books[0]!.chapters[0]!.sourceBlocks[0]!;
              stagedBlock.body = [
                { type: "text", text: "Staged source identity drift" },
              ];
              stagedBlock.quote = "Staged source identity drift";
              stagedBlock.contentHash = sourceContentHash(
                stagedBlock.body,
                stagedBlock.quote,
              );
              await writeFile(
                stagedManifestPath,
                `${JSON.stringify(stagedManifest, null, 2)}\n`,
                "utf8",
              );
            }
            return blocks.map((block) => ({
              sourceId: block.sourceId,
              text: `新译：${block.text}`,
            }));
          },
          model: "replacement-model",
          promptRevision,
          translatedAt: "2026-08-10T00:00:00.000Z",
        }),
      ).rejects.toThrow("Translation source drift");

      expect(providerCallCount).toBeGreaterThan(0);
      expect(await readFile(manifestPath, "utf8")).toBe(originalManifestBytes);
      expect(await readFile(chapterPath, "utf8")).toBe(originalChapterBytes);
      await expect(validateBookAssets({ assetDir })).resolves.toMatchObject({
        manifestPath,
      });
      expect(await readdir(rootDir)).toEqual(["wealth-of-nations"]);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("does not retry a non-retryable StepFun 4xx response", async () => {
    let requestCount = 0;
    const fetchRequest: typeof fetch = async () => {
      requestCount += 1;
      return new Response("{}", { status: 402 });
    };
    const translate = createStepFunTranslationBatch("test-key", fetchRequest);

    await expect(
      translate([{ sourceId: "smith.b1.c1.p1", text: "English source" }]),
    ).rejects.toThrow("StepFun translation request failed with HTTP 402");
    expect(requestCount).toBe(1);
  });
});
