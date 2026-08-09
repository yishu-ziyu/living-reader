import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateBookManifestV2,
  validateChapterTranslation,
  type BookManifestV2,
  type ManifestSourceLocator,
} from "../src/modules/book/domain";
import { ingestWealthOfNations } from "./ingest";

export type BuildWealthOfNationsAssetsOptions = {
  sourceDir?: string;
  outputDir?: string;
};

export async function buildWealthOfNationsAssets(
  options: BuildWealthOfNationsAssetsOptions = {},
): Promise<{
  manifest: BookManifestV2;
  manifestPath: string;
  written: boolean;
}> {
  const manifest = await ingestWealthOfNations({ sourceDir: options.sourceDir });
  const valid = validateBookManifestV2(manifest);
  if (!valid.ok) throw valid.error;
  const outputDir =
    options.outputDir ??
    path.join(process.cwd(), "public/books/wealth-of-nations");
  const manifestPath = path.join(outputDir, "manifest.json");
  await mkdir(outputDir, { recursive: true });
  const written = await writeJsonIfChanged(manifestPath, manifest);
  return { manifest, manifestPath, written };
}
export type ValidateBookAssetsOptions = {
  assetDir?: string;
};

export type ValidateBookAssetsReport = {
  manifestPath: string;
  chapterCount: number;
  sourceBlockCount: number;
  translatedBlockCount: number;
};

export async function validateBookAssets(
  options: ValidateBookAssetsOptions = {},
): Promise<ValidateBookAssetsReport> {
  const assetDir =
    options.assetDir ??
    path.join(process.cwd(), "public/books/wealth-of-nations");
  const manifestPath = path.join(assetDir, "manifest.json");
  const manifest = await validateManifestAsset(manifestPath);
  const chapters = manifest.books.flatMap((book) => book.chapters);
  let sourceBlockCount = 0;
  let translatedBlockCount = 0;

  for (const chapter of chapters) {
    const artifactPath = path.join(
      assetDir,
      "translations",
      "zh-CN",
      `${chapter.chapterId}.json`,
    );
    const raw = JSON.parse(await readFile(artifactPath, "utf8")) as unknown;
    const valid = validateChapterTranslation(raw);
    if (!valid.ok) throw valid.error;
    const translation = valid.value;
    if (
      translation.bookId !== manifest.bookId ||
      translation.chapterId !== chapter.chapterId ||
      translation.translations.length !== chapter.sourceBlocks.length
    ) {
      throw new Error(`Translation identity drift: ${chapter.chapterId}`);
    }

    for (const [index, block] of chapter.sourceBlocks.entries()) {
      const translated = translation.translations[index];
      if (
        translated?.sourceId !== block.sourceId ||
        translated.contentHash !== block.contentHash ||
        !sameLocator(translated.sourceLocator, block.sourceLocator)
      ) {
        throw new Error(`Translation source drift: ${block.sourceId}`);
      }
    }
    sourceBlockCount += chapter.sourceBlocks.length;
    translatedBlockCount += translation.translations.length;
  }

  return {
    manifestPath,
    chapterCount: chapters.length,
    sourceBlockCount,
    translatedBlockCount,
  };
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


export async function validateManifestAsset(
  manifestPath: string,
): Promise<BookManifestV2> {
  const raw = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  const valid = validateBookManifestV2(raw);
  if (!valid.ok) throw valid.error;
  return valid.value;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeJsonIfChanged(
  destination: string,
  value: unknown,
): Promise<boolean> {
  const next = stableJson(value);
  try {
    if ((await readFile(destination, "utf8")) === next) return false;
  } catch {
    // Missing destination is the normal first build.
  }

  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, next, { encoding: "utf8", flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return true;
}
