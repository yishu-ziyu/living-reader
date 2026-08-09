import {
  DOMAIN_SOURCE_IDS,
  err,
  validateFootnoteClosure,
  validateLocatorUniqueness,
  validateSourceBlock,
  type BookArtifact,
  type BookResult,
  type Edition,
  type Footnote,
  type SourceBlock,
  type SourceKey,
  type SourceLocator,
} from "@/modules/book/domain";
import { parseOllFootnoteFragment } from "./parseFootnoteHtml";
import { parseOllParagraphFragment } from "./parseParagraphHtml";

export type OllSourceSpec = {
  sourceKey: SourceKey;
  sourceId: (typeof DOMAIN_SOURCE_IDS)[SourceKey];
  readingOrder: number;
  title: string;
  chapterLabel: string;
  fragment: string;
  pdfPage: number;
  printPage: number;
  glossZh: string;
  expectedQuote: string;
  expectedContentHash: string;
};

export type WealthOfNationsManifest = {
  bookId: string;
  title: string;
  author: string;
  edition: Edition;
  sources: OllSourceSpec[];
  fragments: Record<string, string>;
  /** Raw HTML for footnote targets keyed by id. */
  footnoteHtml?: Record<string, string>;
  footnoteExpectedText?: Record<string, string>;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Full source-spec shape + type guard for compile entry.
 * Missing/wrong-type fields → invalid_manifest (never partial SourceBlock).
 */
export function validateCompileSourceSpec(
  raw: unknown,
  index: number,
): BookResult<OllSourceSpec> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return err("invalid_manifest", `sources[${index}] must be an object`, {
      index,
    });
  }
  const s = raw as Record<string, unknown>;

  const stringFields = [
    "sourceKey",
    "sourceId",
    "title",
    "chapterLabel",
    "fragment",
    "glossZh",
    "expectedQuote",
    "expectedContentHash",
  ] as const;

  for (const key of stringFields) {
    if (!isNonEmptyString(s[key])) {
      return err(
        "invalid_manifest",
        `sources[${index}].${key} missing or not a non-empty string`,
        { index, field: key },
      );
    }
  }

  if (!isFiniteNumber(s.readingOrder)) {
    return err(
      "invalid_manifest",
      `sources[${index}].readingOrder must be a finite number`,
      { index },
    );
  }
  if (!isFiniteNumber(s.pdfPage) || !isFiniteNumber(s.printPage)) {
    return err(
      "invalid_manifest",
      `sources[${index}].pdfPage/printPage must be finite numbers`,
      { index },
    );
  }

  const sourceKey = s.sourceKey as string;
  if (sourceKey !== "division" && sourceKey !== "market") {
    return err("invalid_manifest", `sources[${index}].sourceKey unknown`, {
      index,
      sourceKey,
    });
  }
  if (s.sourceId !== DOMAIN_SOURCE_IDS[sourceKey]) {
    return err(
      "invalid_manifest",
      `sources[${index}].sourceId does not match domain map`,
      { index, sourceId: s.sourceId },
    );
  }

  return {
    ok: true,
    value: {
      sourceKey,
      sourceId: s.sourceId as (typeof DOMAIN_SOURCE_IDS)[SourceKey],
      readingOrder: s.readingOrder as number,
      title: s.title as string,
      chapterLabel: s.chapterLabel as string,
      fragment: s.fragment as string,
      pdfPage: s.pdfPage as number,
      printPage: s.printPage as number,
      glossZh: s.glossZh as string,
      expectedQuote: s.expectedQuote as string,
      expectedContentHash: s.expectedContentHash as string,
    },
  };
}

/**
 * Compile a BookArtifact from official OLL paragraph HTML fragments + manifest.
 * Fail-closed: never invents SourceBlocks; never throws on bad shape.
 * On any invalid_manifest, no partial SourceBlock is returned.
 */
export function compileWealthOfNationsFromFragments(
  manifest: WealthOfNationsManifest,
): BookResult<BookArtifact> {
  if (!manifest || typeof manifest !== "object") {
    return err("invalid_manifest", "Manifest is not an object");
  }
  if (!isNonEmptyString(manifest.bookId)) {
    return err("invalid_manifest", "bookId missing");
  }
  if (!isNonEmptyString(manifest.title) || !isNonEmptyString(manifest.author)) {
    return err("invalid_manifest", "title/author missing");
  }

  if (
    !manifest.edition ||
    typeof manifest.edition !== "object" ||
    Array.isArray(manifest.edition)
  ) {
    return err("invalid_manifest", "Manifest edition missing or not an object");
  }

  const ed = manifest.edition as Edition & Record<string, unknown>;
  for (const key of [
    "editionId",
    "revision",
    "label",
    "sourceUri",
    "contentHash",
  ] as const) {
    if (!isNonEmptyString(ed[key])) {
      return err("invalid_manifest", `edition.${key} missing or empty`, {
        field: key,
      });
    }
  }
  // language must be the string "en" — never coerce.
  if (ed.language !== "en") {
    return err(
      "invalid_manifest",
      'edition.language must be exactly "en"',
      { language: ed.language },
    );
  }

  if (!Array.isArray(manifest.sources)) {
    return err("invalid_manifest", "sources must be an array");
  }
  if (manifest.sources.length === 0) {
    return err("invalid_manifest", "sources array is empty");
  }
  if (
    !manifest.fragments ||
    typeof manifest.fragments !== "object" ||
    Array.isArray(manifest.fragments)
  ) {
    return err("invalid_manifest", "fragments must be an object map");
  }

  // Validate ALL source specs before creating any SourceBlock.
  const specs: OllSourceSpec[] = [];
  for (let i = 0; i < manifest.sources.length; i++) {
    const checked = validateCompileSourceSpec(manifest.sources[i], i);
    if (!checked.ok) return checked;
    specs.push(checked.value);
  }

  const locators: SourceLocator[] = specs.map((s) => ({
    provider: "OLL" as const,
    resource: "Smith_0206-01.html" as const,
    fragment: s.fragment,
  }));

  const uniq = validateLocatorUniqueness(locators);
  if (!uniq.ok) return uniq;

  if (
    manifest.footnoteHtml !== undefined &&
    (typeof manifest.footnoteHtml !== "object" ||
      Array.isArray(manifest.footnoteHtml))
  ) {
    return err("invalid_manifest", "footnoteHtml must be an object map");
  }

  // Detect duplicate footnote map keys is impossible after object literal
  // overwrite; callers that build from arrays must reject duplicates first.
  // Still reject empty-string keys.
  const footnoteHtml = manifest.footnoteHtml ?? {};
  for (const key of Object.keys(footnoteHtml)) {
    if (!key.trim()) {
      return err("invalid_manifest", "footnoteHtml contains empty id key");
    }
  }

  const sourceBlocks: SourceBlock[] = [];

  for (const spec of specs) {
    const html = manifest.fragments[spec.fragment];
    if (typeof html !== "string" || !html) {
      return err("missing_locator", `Missing fragment HTML: ${spec.fragment}`, {
        fragment: spec.fragment,
      });
    }

    const parsed = parseOllParagraphFragment(html);
    if (!parsed.ok) return parsed;

    if (parsed.value.fragmentId !== spec.fragment) {
      return err("quote_hash_drift", "Fragment id mismatch after parse", {
        expected: spec.fragment,
        actual: parsed.value.fragmentId,
      });
    }

    if (parsed.value.quote !== spec.expectedQuote) {
      return err(
        "quote_hash_drift",
        "Quote does not match official expected quote",
        {
          fragment: spec.fragment,
          expectedQuote: spec.expectedQuote,
          actualQuote: parsed.value.quote,
        },
      );
    }

    if (parsed.value.contentHash !== spec.expectedContentHash) {
      return err(
        "quote_hash_drift",
        "Content hash drift against manifest expectation",
        {
          fragment: spec.fragment,
          expectedContentHash: spec.expectedContentHash,
          actualContentHash: parsed.value.contentHash,
        },
      );
    }

    const block: SourceBlock = {
      sourceId: spec.sourceId,
      sourceKey: spec.sourceKey,
      editionId: ed.editionId,
      readingOrder: spec.readingOrder,
      title: spec.title,
      chapterLabel: spec.chapterLabel,
      body: parsed.value.body,
      quote: parsed.value.quote,
      contentHash: parsed.value.contentHash,
      sourceLocator: {
        provider: "OLL",
        resource: "Smith_0206-01.html",
        fragment: spec.fragment,
      },
      evidenceRefs: [
        {
          kind: "pdf_page",
          pdfPage: spec.pdfPage,
          printPage: spec.printPage,
        },
      ],
      glossZh: spec.glossZh,
    };

    const valid = validateSourceBlock(block);
    if (!valid.ok) return valid;
    sourceBlocks.push(valid.value);
  }

  sourceBlocks.sort((a, b) => a.readingOrder - b.readingOrder);

  const needed = new Set<string>();
  for (const block of sourceBlocks) {
    for (const node of block.body) {
      if (node.type === "footnote_ref") {
        if (!node.targetId) {
          return err("missing_locator", "footnote_ref missing targetId", {
            sourceId: block.sourceId,
          });
        }
        needed.add(node.targetId);
      }
    }
  }

  const footnotes: Footnote[] = [];
  const seenFootnoteIds = new Set<string>();

  for (const targetId of needed) {
    if (seenFootnoteIds.has(targetId)) {
      return err("duplicate_locator", `Duplicate footnote id: ${targetId}`, {
        targetId,
      });
    }
    const html = footnoteHtml[targetId];
    if (typeof html !== "string" || !html) {
      return err(
        "source_unavailable",
        `Missing footnote target HTML: ${targetId}`,
        { targetId },
      );
    }
    const parsed = parseOllFootnoteFragment(html);
    if (!parsed.ok) return parsed;
    if (parsed.value.id !== targetId) {
      return err("quote_hash_drift", "Footnote id mismatch", {
        expected: targetId,
        actual: parsed.value.id,
      });
    }
    const expectedText = manifest.footnoteExpectedText?.[targetId];
    if (expectedText !== undefined && parsed.value.text !== expectedText) {
      return err("quote_hash_drift", "Footnote text drift", {
        targetId,
        expectedText,
        actualText: parsed.value.text,
      });
    }
    seenFootnoteIds.add(targetId);
    footnotes.push(parsed.value);
  }

  const book: BookArtifact = {
    bookId: manifest.bookId,
    title: manifest.title,
    author: manifest.author,
    edition: {
      editionId: ed.editionId,
      revision: ed.revision,
      language: "en",
      label: ed.label,
      sourceUri: ed.sourceUri,
      contentHash: ed.contentHash,
    },
    sourceBlocks,
    footnotes,
  };

  return validateFootnoteClosure(book);
}
