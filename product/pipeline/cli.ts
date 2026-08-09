import { randomUUID } from "node:crypto";
import { access, cp, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildWealthOfNationsAssets,
  validateBookAssets,
  validateManifestAsset,
  type ValidateBookAssetsReport,
} from "./build";
import {
  buildBookTranslations,
  CANNAN_ZH_CN_PROMPT_REVISION,
  createStepFunTranslationBatch,
  STEPFUN_MODEL_ID,
  type BuildBookTranslationsReport,
  type TranslationBatch,
} from "./translate";

const USAGE = `Usage: pnpm book:build [ingest|translate|validate|all]

  ingest     Build the canonical English manifest from the vendored OLL HTML
  translate  Translate only missing or invalidated paragraphs
  validate   Validate the manifest and all Chinese translation artifacts
  all        Run ingest, translate, and validate (default)`;

type BookBuildCommand = "ingest" | "translate" | "validate" | "all";

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  if (args.length > 1 || !isBookBuildCommand(args[0] ?? "all")) {
    throw new Error(USAGE);
  }

  const command = (args[0] ?? "all") as BookBuildCommand;
  if (command === "ingest") {
    const book = await buildWealthOfNationsAssets();
    print({ command, manifestPath: book.manifestPath, written: book.written });
    return;
  }
  if (command === "validate") {
    print({ command, ...(await validateBookAssets()) });
    return;
  }

  const assetDir = defaultBookAssetDir();
  if (command === "all") {
    const result = await buildAllBookAssets({
      assetDir,
      translate: translationBatch(),
      model: STEPFUN_MODEL_ID,
      promptRevision: CANNAN_ZH_CN_PROMPT_REVISION,
    });
    print({
      command,
      manifestPath: result.manifestPath,
      manifestWritten: result.manifestWritten,
      translationProviderWhenNeeded: "stepfun",
      translationModelWhenNeeded: STEPFUN_MODEL_ID,
      ...result.translations,
      validation: result.validation,
    });
    return;
  }

  const result = await buildStagedBookTranslations({
    assetDir,
    translate: translationBatch(),
    model: STEPFUN_MODEL_ID,
    promptRevision: CANNAN_ZH_CN_PROMPT_REVISION,
  });
  print({
    command,
    manifestPath: result.manifestPath,
    manifestWritten: false,
    translationProviderWhenNeeded: "stepfun",
    translationModelWhenNeeded: STEPFUN_MODEL_ID,
    ...result.translations,
    validation: result.validation,
  });
}

export type BuildStagedBookTranslationsOptions = Readonly<{
  assetDir?: string;
  translate: TranslationBatch;
  model: string;
  promptRevision: string;
  translatedAt?: string;
}>;

export type BuildStagedBookTranslationsReport = Readonly<{
  manifestPath: string;
  translations: BuildBookTranslationsReport;
  validation: ValidateBookAssetsReport;
}>;

export async function buildStagedBookTranslations(
  options: BuildStagedBookTranslationsOptions,
): Promise<BuildStagedBookTranslationsReport> {
  const assetDir = options.assetDir ?? defaultBookAssetDir();
  const parentDir = path.dirname(assetDir);
  const assetName = path.basename(assetDir);
  const nonce = `${process.pid}-${randomUUID()}`;
  const stagingDir = path.join(
    parentDir,
    `.${assetName}.translate-stage-${nonce}`,
  );
  const liveTranslationDir = path.join(
    assetDir,
    "translations",
    "zh-CN",
  );
  const stagedTranslationDir = path.join(
    stagingDir,
    "translations",
    "zh-CN",
  );
  const backupDir = path.join(
    path.dirname(liveTranslationDir),
    `.zh-CN.backup-${nonce}`,
  );
  await mkdir(parentDir, { recursive: true });

  try {
    await copyAssetSetIfPresent(assetDir, stagingDir);
    const manifest = await validateManifestAsset(
      path.join(stagingDir, "manifest.json"),
    );
    const stagedTranslations = await buildBookTranslations({
      manifest,
      translate: options.translate,
      model: options.model,
      promptRevision: options.promptRevision,
      outputDir: stagedTranslationDir,
      translatedAt: options.translatedAt,
    });
    const stagedValidation = await validateBookAssets({
      assetDir: stagingDir,
    });
    const manifestPath = path.join(assetDir, "manifest.json");
    const translations = {
      ...stagedTranslations,
      artifactPaths: stagedTranslations.artifactPaths.map((artifactPath) =>
        path.join(
          liveTranslationDir,
          path.relative(stagedTranslationDir, artifactPath),
        ),
      ),
    };
    const validation = {
      ...stagedValidation,
      manifestPath,
    };

    if (stagedTranslations.writtenChapterCount > 0) {
      await mkdir(path.dirname(liveTranslationDir), { recursive: true });
      await promoteAssetSet(
        stagedTranslationDir,
        liveTranslationDir,
        backupDir,
      );
    }
    return { manifestPath, translations, validation };
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

export type BuildAllBookAssetsOptions = Readonly<{
  assetDir?: string;
  sourceDir?: string;
  translate: TranslationBatch;
  model: string;
  promptRevision: string;
  translatedAt?: string;
}>;

export type BuildAllBookAssetsReport = Readonly<{
  manifestPath: string;
  manifestWritten: boolean;
  translations: BuildBookTranslationsReport;
  validation: ValidateBookAssetsReport;
}>;

export async function buildAllBookAssets(
  options: BuildAllBookAssetsOptions,
): Promise<BuildAllBookAssetsReport> {
  const assetDir = options.assetDir ?? defaultBookAssetDir();
  const parentDir = path.dirname(assetDir);
  const assetName = path.basename(assetDir);
  const nonce = `${process.pid}-${randomUUID()}`;
  const stagingDir = path.join(parentDir, `.${assetName}.stage-${nonce}`);
  const backupDir = path.join(parentDir, `.${assetName}.backup-${nonce}`);
  await mkdir(parentDir, { recursive: true });

  try {
    await copyAssetSetIfPresent(assetDir, stagingDir);
    const book = await buildWealthOfNationsAssets({
      sourceDir: options.sourceDir,
      outputDir: stagingDir,
    });
    const stagedTranslations = await buildBookTranslations({
      manifest: book.manifest,
      translate: options.translate,
      model: options.model,
      promptRevision: options.promptRevision,
      outputDir: path.join(stagingDir, "translations", "zh-CN"),
      translatedAt: options.translatedAt,
    });
    const stagedValidation = await validateBookAssets({
      assetDir: stagingDir,
    });
    const manifestPath = path.join(assetDir, "manifest.json");
    const translations = {
      ...stagedTranslations,
      artifactPaths: stagedTranslations.artifactPaths.map((artifactPath) =>
        path.join(assetDir, path.relative(stagingDir, artifactPath)),
      ),
    };
    const validation = {
      ...stagedValidation,
      manifestPath,
    };

    if (book.written || stagedTranslations.writtenChapterCount > 0) {
      await promoteAssetSet(stagingDir, assetDir, backupDir);
    }
    return {
      manifestPath,
      manifestWritten: book.written,
      translations,
      validation,
    };
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

async function copyAssetSetIfPresent(
  assetDir: string,
  stagingDir: string,
): Promise<void> {
  try {
    await access(assetDir);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    await mkdir(stagingDir, { recursive: true });
    return;
  }
  await cp(assetDir, stagingDir, { recursive: true });
}

async function promoteAssetSet(
  stagingDir: string,
  assetDir: string,
  backupDir: string,
): Promise<void> {
  let backedUp = false;
  try {
    await rename(assetDir, backupDir);
    backedUp = true;
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }

  try {
    await rename(stagingDir, assetDir);
  } catch (publishError) {
    if (!backedUp) throw publishError;
    try {
      await rename(backupDir, assetDir);
    } catch (rollbackError) {
      throw new AggregateError(
        [publishError, rollbackError],
        `Book asset publication failed; previous assets remain at ${backupDir}`,
      );
    }
    throw publishError;
  }

  if (backedUp) {
    await rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function defaultBookAssetDir(): string {
  return path.join(
    process.cwd(),
    "public",
    "books",
    "wealth-of-nations",
  );
}

function isMissingPath(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function translationBatch(): TranslationBatch {
  const apiKey = process.env.STEPFUN_API_KEY?.trim();
  if (apiKey) return createStepFunTranslationBatch(apiKey);
  return async () => {
    throw new Error(
      "STEPFUN_API_KEY is required when Chinese translations are missing or invalidated",
    );
  };
}

function isBookBuildCommand(value: string): value is BookBuildCommand {
  return (
    value === "ingest" ||
    value === "translate" ||
    value === "validate" ||
    value === "all"
  );
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main();
}
