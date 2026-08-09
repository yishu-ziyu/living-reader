import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  validateChapterTranslation,
  type BookChapter,
  type BookManifestV2,
  type ChapterTranslation,
  type ManifestSourceLocator,
  type ParagraphSourceId,
  type SourceBlockTranslation,
} from "../src/modules/book/domain";
import { writeJsonIfChanged } from "./build";

const MAX_BATCH_CHARACTERS = 20_000;
const MAX_PARALLEL_CHAPTERS = 4;
const STEPFUN_CHAT_COMPLETIONS_URL =
  "https://api.stepfun.com/v1/chat/completions";
export const STEPFUN_MODEL_ID = "step-3.5-flash";

export type TranslationInput = Readonly<{
  sourceId: ParagraphSourceId;
  text: string;
}>;

export type TranslationOutput = Readonly<{
  sourceId: ParagraphSourceId;
  text: string;
}>;

export type TranslationBatch = (
  blocks: readonly TranslationInput[],
) => Promise<readonly TranslationOutput[]>;

export const CANNAN_ZH_CN_PROMPT_REVISION =
  "cannan-zh-cn-v3+sol-bilingual-review-v1";
export const CANNAN_ZH_CN_SYSTEM_PROMPT = [
  "You are the Chinese translator for The Living Reader.",
  "Translate Adam Smith's 1904 Cannan English text into accurate, fluent modern Simplified Chinese.",
  "Preserve every proposition, qualification, comparison, number, proper name, and causal relationship.",
  "Do not summarize, omit, expand, explain, add notes, merge, split, reorder, or invent text.",
  "Use Chinese punctuation and readable paragraphs. Return only the requested structured translations.",
  "Keep terminology consistent: division of labour=劳动分工; labour=劳动; stock (as invested capital)=资本; wages=工资; profit=利润; rent=地租; effectual demand=有效需求; natural price=自然价格; market price=市场价格; commodity=商品; exchangeable value=交换价值; productive labour=生产性劳动; unproductive labour=非生产性劳动.",
  "Choose contextually correct Chinese when a glossary term has another ordinary meaning.",
  "The text field must contain only the complete Simplified Chinese translation, with no labels or source text.",
  'Return JSON matching this schema exactly: {"translations":[{"sourceId":"string from input","text":"complete Simplified Chinese translation"}]}',
  "Return every input sourceId exactly once, in input order, and no other sourceId.",
].join("\n");

export function createCannanZhCnTranslationPrompt(
  blocks: readonly TranslationInput[],
): Readonly<{ system: string; user: string }> {
  return {
    system: CANNAN_ZH_CN_SYSTEM_PROMPT,
    user: JSON.stringify({ paragraphs: blocks }),
  };
}

export type BuildBookTranslationsOptions = Readonly<{
  manifest: BookManifestV2;
  translate: TranslationBatch;
  model: string;
  promptRevision: string;
  outputDir?: string;
  translatedAt?: string;
}>;

export type BuildBookTranslationsReport = Readonly<{
  chapterCount: number;
  translatedBlockCount: number;
  reusedBlockCount: number;
  writtenChapterCount: number;
  artifactPaths: readonly string[];
}>;

type ChapterBuildReport = Readonly<{
  translatedBlockCount: number;
  reusedBlockCount: number;
  written: boolean;
  artifactPath: string;
}>;

export async function buildBookTranslations(
  options: BuildBookTranslationsOptions,
): Promise<BuildBookTranslationsReport> {
  if (!options.model.trim() || !options.promptRevision.trim()) {
    throw new Error("Translation model and prompt revision are required");
  }
  const translatedAt = options.translatedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(translatedAt))) {
    throw new Error("translatedAt must be an ISO-compatible timestamp");
  }
  const outputDir =
    options.outputDir ??
    path.join(
      process.cwd(),
      "public",
      "books",
      options.manifest.bookId,
      "translations",
      "zh-CN",
    );
  await mkdir(outputDir, { recursive: true });

  const chapters = options.manifest.books.flatMap((book) => book.chapters);
  const reports = new Array<ChapterBuildReport>(chapters.length);
  let nextChapterIndex = 0;
  let failed = false;
  let failure: unknown;
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_PARALLEL_CHAPTERS, chapters.length) },
      async () => {
        while (!failed && nextChapterIndex < chapters.length) {
          const chapterIndex = nextChapterIndex;
          nextChapterIndex += 1;
          try {
            reports[chapterIndex] = await buildChapterTranslation({
              bookId: options.manifest.bookId,
              chapter: chapters[chapterIndex]!,
              outputDir,
              translate: options.translate,
              model: options.model,
              promptRevision: options.promptRevision,
              translatedAt,
            });
          } catch (error) {
            if (!failed) {
              failed = true;
              failure = error;
            }
          }
        }
      },
    ),
  );
  if (failed) throw failure;

  return {
    chapterCount: reports.length,
    translatedBlockCount: reports.reduce(
      (total, report) => total + report.translatedBlockCount,
      0,
    ),
    reusedBlockCount: reports.reduce(
      (total, report) => total + report.reusedBlockCount,
      0,
    ),
    writtenChapterCount: reports.filter((report) => report.written).length,
    artifactPaths: reports.map((report) => report.artifactPath),
  };
}

async function buildChapterTranslation(input: {
  bookId: string;
  chapter: BookChapter;
  outputDir: string;
  translate: TranslationBatch;
  model: string;
  promptRevision: string;
  translatedAt: string;
}): Promise<ChapterBuildReport> {
  const artifactPath = path.join(
    input.outputDir,
    `${input.chapter.chapterId}.json`,
  );
  const sourceBySourceId = new Map(
    input.chapter.sourceBlocks.map((block) => [block.sourceId, block] as const),
  );
  if (sourceBySourceId.size !== input.chapter.sourceBlocks.length) {
    throw new Error(
      `Chapter ${input.chapter.chapterId} contains duplicate sourceIds`,
    );
  }
  const existing = await readExistingTranslation(artifactPath);
  const existingBySourceId = new Map(
    existing?.translations.map((entry) => [entry.sourceId, entry] as const) ?? [],
  );
  const entries = new Map<ParagraphSourceId, SourceBlockTranslation>();
  const pending: TranslationInput[] = [];
  let reusedBlockCount = 0;

  for (const block of input.chapter.sourceBlocks) {
    const candidate = existingBySourceId.get(block.sourceId);
    // Model is provenance, not cache identity; prompt revisions explicitly invalidate machine output.
    const reusable =
      candidate &&
      candidate.contentHash === block.contentHash &&
      sameLocator(candidate.sourceLocator, block.sourceLocator) &&
      isChineseTranslation(candidate.text) &&
      (candidate.reviewStatus === "human_reviewed" ||
        candidate.promptRevision === input.promptRevision);
    if (reusable) {
      entries.set(block.sourceId, candidate);
      reusedBlockCount += 1;
    } else {
      pending.push({ sourceId: block.sourceId, text: block.quote });
    }
  }

  let translatedBlockCount = 0;
  for (const batch of splitTranslationBatches(pending)) {
    const translated = await input.translate(batch);
    const translatedBySourceId = new Map<ParagraphSourceId, string>();
    for (const value of translated) {
      if (
        !batch.some((block) => block.sourceId === value.sourceId) ||
        translatedBySourceId.has(value.sourceId) ||
        !isChineseTranslation(value.text)
      ) {
        throw new Error(`Invalid Chinese translation for ${value.sourceId}`);
      }
      translatedBySourceId.set(value.sourceId, value.text.trim());
    }
    if (translatedBySourceId.size !== batch.length) {
      throw new Error("Translation provider returned an incomplete batch");
    }

    for (const block of batch) {
      const source = sourceBySourceId.get(block.sourceId)!;
      entries.set(block.sourceId, {
        sourceId: block.sourceId,
        sourceLocator: source.sourceLocator,
        contentHash: source.contentHash,
        text: translatedBySourceId.get(block.sourceId)!,
        model: input.model,
        promptRevision: input.promptRevision,
        reviewStatus: "machine",
        translatedAt: input.translatedAt,
      });
      translatedBlockCount += 1;
    }
  }

  if (entries.size !== input.chapter.sourceBlocks.length) {
    throw new Error(
      `Chapter ${input.chapter.chapterId} translation is incomplete`,
    );
  }
  const artifact = chapterArtifact(input.bookId, input.chapter, entries);
  const validated = validateChapterTranslation(artifact);
  if (!validated.ok) throw validated.error;
  const written = await writeJsonIfChanged(artifactPath, validated.value);
  return {
    translatedBlockCount,
    reusedBlockCount,
    written,
    artifactPath,
  };
}

function chapterArtifact(
  bookId: string,
  chapter: BookChapter,
  entries: ReadonlyMap<ParagraphSourceId, SourceBlockTranslation>,
): ChapterTranslation {
  return {
    schemaVersion: 1,
    bookId,
    locale: "zh-CN",
    chapterId: chapter.chapterId,
    translations: chapter.sourceBlocks.flatMap((block) => {
      const entry = entries.get(block.sourceId);
      return entry ? [entry] : [];
    }),
  };
}

async function readExistingTranslation(
  artifactPath: string,
): Promise<ChapterTranslation | null> {
  try {
    const parsed = JSON.parse(await readFile(artifactPath, "utf8")) as unknown;
    const validated = validateChapterTranslation(parsed);
    return validated.ok ? validated.value : null;
  } catch {
    return null;
  }
}

function splitTranslationBatches(
  blocks: readonly TranslationInput[],
): TranslationInput[][] {
  const batches: TranslationInput[][] = [];
  let current: TranslationInput[] = [];
  let currentCharacters = 0;
  for (const block of blocks) {
    if (
      current.length > 0 &&
      currentCharacters + block.text.length > MAX_BATCH_CHARACTERS
    ) {
      batches.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(block);
    currentCharacters += block.text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
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

function isChineseTranslation(value: string): boolean {
  return value.trim().length > 0 && /[\u3400-\u9fff]/u.test(value);
}

class StepFunHttpError extends Error {
  readonly retryable: boolean;

  constructor(status: number) {
    super(`StepFun translation request failed with HTTP ${status}`);
    this.name = "StepFunHttpError";
    this.retryable =
      status >= 500 ||
      status === 408 ||
      status === 409 ||
      status === 425 ||
      status === 429;
  }
}

export function createStepFunTranslationBatch(
  apiKey: string,
  fetchRequest: typeof fetch = fetch,
): TranslationBatch {
  if (!apiKey.trim()) throw new Error("STEPFUN_API_KEY is required");

  return async (blocks) => {
    const prompt = createCannanZhCnTranslationPrompt(blocks);
    const body = {
      model: STEPFUN_MODEL_ID,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      temperature: 0,
      max_tokens: 16_000,
    };

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetchRequest(STEPFUN_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(180_000),
        });
        if (!response.ok) {
          throw new StepFunHttpError(response.status);
        }
        const payload = (await response.json()) as unknown;
        const content = readStepFunContent(payload);
        const parsed = JSON.parse(content) as unknown;
        return readTranslationOutputs(parsed, "StepFun");
      } catch (error) {
        if (error instanceof StepFunHttpError && !error.retryable) {
          throw error;
        }
        lastError = error;
        if (attempt < 3) {
          const { promise, resolve } = Promise.withResolvers<void>();
          setTimeout(resolve, attempt * 1_000);
          await promise;
        }
      }
    }
    throw new Error("StepFun translation failed after three attempts", {
      cause: lastError,
    });
  };
}

function readStepFunContent(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    throw new Error("StepFun response is malformed");
  }
  const choice = value.choices[0];
  if (
    !isRecord(choice) ||
    choice.finish_reason !== "stop" ||
    !isRecord(choice.message) ||
    typeof choice.message.content !== "string"
  ) {
    throw new Error("StepFun response did not finish with complete content");
  }
  return choice.message.content;
}

function readTranslationOutputs(
  value: unknown,
  providerName: string,
): TranslationOutput[] {
  if (!isRecord(value) || !Array.isArray(value.translations)) {
    throw new Error(`${providerName} JSON output is malformed`);
  }
  return value.translations.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.sourceId !== "string" ||
      typeof entry.text !== "string"
    ) {
      throw new Error(
        `${providerName} translation output ${index} is malformed`,
      );
    }
    return {
      sourceId: entry.sourceId as ParagraphSourceId,
      text: entry.text,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
