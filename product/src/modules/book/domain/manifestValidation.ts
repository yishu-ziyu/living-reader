import { err, ok, type BookResult } from "./errors";
import { quoteFromBody, sourceContentHash } from "./hash";
import type { BodyNode } from "./types";
import type {
  BookChapter,
  BookManifestV2,
  ChapterTranslation,
  ManifestSourceLocator,
  ParagraphSourceId,
} from "./manifest";

export function validateBookManifestV2(
  raw: unknown,
): BookResult<BookManifestV2> {
  if (!isRecord(raw)) return err("invalid_manifest", "Manifest must be an object");
  if (
    raw.schemaVersion !== 2 ||
    !isNonEmptyString(raw.bookId) ||
    !isNonEmptyString(raw.title) ||
    !isNonEmptyString(raw.author)
  ) {
    return err("invalid_manifest", "Manifest v2 identity is invalid");
  }
  if (!isRecord(raw.edition) || raw.edition.language !== "en") {
    return err("invalid_manifest", "Manifest edition must be English");
  }
  for (const key of ["editionId", "revision", "label"] as const) {
    if (!isNonEmptyString(raw.edition[key])) {
      return err("invalid_manifest", `edition.${key} is invalid`);
    }
  }
  if (!Array.isArray(raw.volumes) || raw.volumes.length !== 2) {
    return err("invalid_manifest", "Manifest must describe exactly two volumes");
  }
  const volumeResources = new Map<string, { volume: number; volumeId: string }>();
  let rawParagraphCount = 0;
  for (const [index, value] of raw.volumes.entries()) {
    if (!isRecord(value)) {
      return err("invalid_manifest", `volumes[${index}] is invalid`);
    }
    if (!isPositiveInteger(value.volume)) {
      return err("invalid_manifest", `volumes[${index}].volume is invalid`);
    }
    const volume = value.volume;
    const expectedCount = volume === 1 ? 2_119 : volume === 2 ? 1_758 : undefined;
    if (
      expectedCount === undefined ||
      value.rawParagraphIdCount !== expectedCount ||
      !isNonEmptyString(value.volumeId) ||
      !isNonEmptyString(value.resource) ||
      !isNonEmptyString(value.sourcePageUri) ||
      !isNonEmptyString(value.sourcePackageUri) ||
      !isSha256(value.sourcePackageHash) ||
      !isSha256(value.contentHash) ||
      !isNonEmptyString(value.startsAt) ||
      !isNonEmptyString(value.endsAt)
    ) {
      return err("invalid_manifest", `volumes[${index}] metadata is invalid`);
    }
    if (volumeResources.has(value.resource)) {
      return err("duplicate_locator", `Duplicate volume resource: ${value.resource}`);
    }
    volumeResources.set(value.resource, {
      volume,
      volumeId: value.volumeId,
    });
    rawParagraphCount += expectedCount;
  }
  if (!Array.isArray(raw.books)) {
    return err("invalid_manifest", "books must be an array");
  }

  const sourceIds = new Set<string>();
  const locators = new Set<string>();
  const chapters = new Map<string, BookChapter>();
  let blockCount = 0;
  const bookNumbers: number[] = [];
  for (const [bookIndex, bookValue] of raw.books.entries()) {
    if (!isRecord(bookValue) || !Array.isArray(bookValue.chapters)) {
      return err("invalid_manifest", `books[${bookIndex}] is invalid`);
    }
    const bookNumber = bookValue.bookNumber;
    if (
      !isPositiveInteger(bookNumber) ||
      bookValue.bookId !== `smith.b${bookNumber}` ||
      bookValue.order !== bookIndex + 1 ||
      !isNonEmptyString(bookValue.label) ||
      !isNonEmptyString(bookValue.title)
    ) {
      return err("invalid_manifest", `books[${bookIndex}] identity is invalid`);
    }
    bookNumbers.push(bookNumber);
    let previousChapterNumber = -1;
    for (const [chapterIndex, chapterValue] of bookValue.chapters.entries()) {
      if (!isRecord(chapterValue) || !Array.isArray(chapterValue.sourceBlocks)) {
        return err(
          "invalid_manifest",
          `books[${bookIndex}].chapters[${chapterIndex}] is invalid`,
        );
      }
      const chapterNumber = chapterValue.chapterNumber;
      const chapterId = `smith.b${bookNumber}.c${chapterNumber}`;
      if (
        !isNonNegativeInteger(chapterNumber) ||
        chapterNumber <= previousChapterNumber ||
        chapterValue.chapterId !== chapterId ||
        chapterValue.bookNumber !== bookNumber ||
        !isPositiveInteger(chapterValue.order) ||
        !isNonEmptyString(chapterValue.label) ||
        !isNonEmptyString(chapterValue.title) ||
        chapterValue.sourceBlocks.length === 0 ||
        chapters.has(chapterId)
      ) {
        return err("invalid_manifest", `${chapterId} is invalid`);
      }
      previousChapterNumber = chapterNumber;
      let previousBlockOrder = 0;
      for (const [blockIndex, blockValue] of chapterValue.sourceBlocks.entries()) {
        if (!isRecord(blockValue) || !Array.isArray(blockValue.body)) {
          return err("invalid_manifest", `${chapterId} source block is invalid`);
        }
        const order = blockValue.order;
        const sourceId = `smith.b${bookNumber}.c${chapterNumber}.p${order}`;
        if (
          !isPositiveInteger(order) ||
          order <= previousBlockOrder ||
          blockValue.sourceId !== sourceId ||
          !isNonEmptyString(blockValue.quote) ||
          !isSha256(blockValue.contentHash) ||
          !isBody(blockValue.body)
        ) {
          return err(
            "invalid_manifest",
            `${chapterId} sourceBlocks[${blockIndex}] identity is invalid`,
          );
        }
        previousBlockOrder = order;
        if (!isLocator(blockValue.sourceLocator, volumeResources)) {
          return err("missing_locator", `${sourceId} locator is invalid`);
        }
        const locator = locatorKey(blockValue.sourceLocator);
        if (sourceIds.has(sourceId) || locators.has(locator)) {
          return err("duplicate_locator", `Duplicate source identity: ${sourceId}`, {
            locator,
          });
        }
        const body = blockValue.body as BodyNode[];
        if (
          quoteFromBody(body) !== blockValue.quote ||
          sourceContentHash(body, blockValue.quote) !== blockValue.contentHash
        ) {
          return err("quote_hash_drift", `${sourceId} body/hash drift`);
        }
        sourceIds.add(sourceId);
        locators.add(locator);
        blockCount += 1;
      }
      chapters.set(chapterId, chapterValue as unknown as BookChapter);
    }
  }
  if (bookNumbers.join(",") !== "1,2,3,4,5") {
    return err("invalid_manifest", "Manifest must contain formal Books I-V");
  }
  const bookFourChapterThree = chapters.get("smith.b4.c3");
  const bookFourChapterFour = chapters.get("smith.b4.c4");
  if (
    bookFourChapterThree?.sourceBlocks.at(-1)?.sourceLocator.volume !== 1 ||
    bookFourChapterFour?.sourceBlocks[0]?.sourceLocator.volume !== 2 ||
    bookFourChapterFour.order !== (bookFourChapterThree?.order ?? 0) + 1
  ) {
    return err("invalid_manifest", "Book IV volume boundary is not continuous");
  }

  if (!isRecord(raw.aliases)) {
    return err("invalid_manifest", "aliases must be an object");
  }
  const requiredAliases = [
    "smith.b1.c1.division",
    "smith.b1.c3.market_extent",
  ] as const;
  for (const alias of requiredAliases) {
    if (!isNonEmptyString(raw.aliases[alias]) || !sourceIds.has(raw.aliases[alias])) {
      return err("unknown_source", `Alias target is unavailable: ${alias}`);
    }
  }
  if (!Array.isArray(raw.needsReview)) {
    return err("invalid_manifest", "needsReview must be an array");
  }
  for (const [index, item] of raw.needsReview.entries()) {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.reason) ||
      !isLocator(item.sourceLocator, volumeResources)
    ) {
      return err("invalid_manifest", `needsReview[${index}] is invalid`);
    }
  }
  if (
    !isRecord(raw.build) ||
    raw.build.adapter !== "oll-cannan-two-volume-v1" ||
    raw.build.rawParagraphIdCount !== rawParagraphCount ||
    raw.build.includedSourceBlockCount !== blockCount ||
    raw.build.filteredParagraphCount !== rawParagraphCount - blockCount ||
    raw.build.needsReviewCount !== raw.needsReview.length
  ) {
    return err("invalid_manifest", "Manifest build report is inconsistent");
  }

  return ok(raw as unknown as BookManifestV2);
}

export function validateChapterTranslation(
  raw: unknown,
): BookResult<ChapterTranslation> {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== 1 ||
    !isNonEmptyString(raw.bookId) ||
    raw.locale !== "zh-CN" ||
    !isNonEmptyString(raw.chapterId) ||
    !Array.isArray(raw.translations)
  ) {
    return err("invalid_manifest", "Chapter translation identity is invalid");
  }

  const sourceIds = new Set<string>();
  for (const [index, value] of raw.translations.entries()) {
    if (
      !isRecord(value) ||
      !isNonEmptyString(value.sourceId) ||
      sourceIds.has(value.sourceId) ||
      !isTranslationLocator(value.sourceLocator) ||
      !isSha256(value.contentHash) ||
      !isNonEmptyString(value.text) ||
      !isNonEmptyString(value.model) ||
      !isNonEmptyString(value.promptRevision) ||
      (value.reviewStatus !== "machine" &&
        value.reviewStatus !== "human_reviewed") ||
      !isNonEmptyString(value.translatedAt) ||
      Number.isNaN(Date.parse(value.translatedAt))
    ) {
      return err(
        "invalid_manifest",
        `translations[${index}] is invalid`,
      );
    }
    sourceIds.add(value.sourceId);
  }

  return ok(raw as unknown as ChapterTranslation);
}

export function getBookChapter(
  manifest: BookManifestV2,
  chapterId: string,
): BookResult<BookChapter> {
  const chapter = manifest.books
    .flatMap((book) => book.chapters)
    .find((candidate) => candidate.chapterId === chapterId);
  return chapter
    ? ok(chapter)
    : err("source_unavailable", `Chapter not available: ${chapterId}`, {
        chapterId,
      });
}

export function resolveSourceId(
  manifest: BookManifestV2,
  sourceIdOrAlias: string,
): BookResult<ParagraphSourceId> {
  const canonical = manifest.aliases[
    sourceIdOrAlias as keyof BookManifestV2["aliases"]
  ] ?? sourceIdOrAlias;
  const exists = manifest.books.some((book) =>
    book.chapters.some((chapter) =>
      chapter.sourceBlocks.some((block) => block.sourceId === canonical),
    ),
  );
  return exists
    ? ok(canonical as ParagraphSourceId)
    : err("unknown_source", `Unknown source_id: ${sourceIdOrAlias}`, {
        sourceId: sourceIdOrAlias,
      });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isBody(value: unknown[]): value is BodyNode[] {
  return value.every((node) => {
    if (!isRecord(node) || typeof node.type !== "string") return false;
    if (node.type === "text" || node.type === "margin_note") {
      return typeof node.text === "string";
    }
    if (node.type === "footnote_ref") {
      return (
        typeof node.marker === "string" &&
        typeof node.href === "string" &&
        typeof node.targetId === "string" &&
        (node.id === undefined || typeof node.id === "string")
      );
    }
    return false;
  });
}

function isLocator(
  value: unknown,
  volumeResources: Map<string, { volume: number; volumeId: string }>,
): value is ManifestSourceLocator {
  if (
    !isRecord(value) ||
    value.provider !== "OLL" ||
    !isPositiveInteger(value.volume) ||
    !isNonEmptyString(value.volumeId) ||
    !isNonEmptyString(value.resource) ||
    !isNonEmptyString(value.fragment)
  ) {
    return false;
  }
  const expected = volumeResources.get(value.resource);
  return expected?.volume === value.volume && expected.volumeId === value.volumeId;
}

function isTranslationLocator(
  value: unknown,
): value is ManifestSourceLocator {
  return (
    isRecord(value) &&
    value.provider === "OLL" &&
    isPositiveInteger(value.volume) &&
    isNonEmptyString(value.volumeId) &&
    isNonEmptyString(value.resource) &&
    isNonEmptyString(value.fragment)
  );
}

function locatorKey(locator: ManifestSourceLocator): string {
  return `${locator.provider}:${locator.resource}#${locator.fragment}`;
}
