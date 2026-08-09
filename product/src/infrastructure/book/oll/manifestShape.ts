import { err, ok, type BookResult } from "@/modules/book/domain";
import { DOMAIN_SOURCE_IDS, type SourceKey } from "@/modules/book/domain";

export type ManifestSourceFile = {
  sourceKey: SourceKey;
  sourceId: string;
  readingOrder: number;
  title: string;
  chapterLabel: string;
  fragment: string;
  pdfPage: number;
  printPage: number;
  glossZh: string;
  expectedQuote: string;
  expectedContentHash: string;
  fragmentPath: string;
};

export type ManifestFootnoteFile = {
  id: string;
  path: string;
  expectedText?: string;
};

export type ManifestFile = {
  bookId: string;
  title: string;
  author: string;
  edition: {
    editionId: string;
    revision: string;
    language: string;
    label: string;
    sourceUri: string;
    contentHash: string;
  };
  sources: ManifestSourceFile[];
  footnotes?: ManifestFootnoteFile[];
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Legacy compiler input guard retained for standalone fragment compilation.
 * Always returns BookResult and never throws on bad input.
 */
export function validateManifestFileShape(
  raw: unknown,
): BookResult<ManifestFile> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return err("invalid_manifest", "Manifest root must be an object");
  }
  const m = raw as Record<string, unknown>;

  if (!isNonEmptyString(m.bookId)) {
    return err("invalid_manifest", "bookId missing");
  }
  if (!isNonEmptyString(m.title) || !isNonEmptyString(m.author)) {
    return err("invalid_manifest", "title/author missing");
  }

  if (
    m.edition === null ||
    typeof m.edition !== "object" ||
    Array.isArray(m.edition)
  ) {
    return err("invalid_manifest", "edition missing or not an object");
  }
  const ed = m.edition as Record<string, unknown>;
  for (const key of [
    "editionId",
    "revision",
    "language",
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
  // language must be exactly "en" — never coerce other values.
  if (ed.language !== "en") {
    return err("invalid_manifest", 'edition.language must be exactly "en"', {
      language: ed.language,
    });
  }

  if (!Array.isArray(m.sources)) {
    return err("invalid_manifest", "sources must be an array", {
      sourcesType: typeof m.sources,
    });
  }
  if (m.sources.length === 0) {
    return err("invalid_manifest", "sources array is empty");
  }

  const sources: ManifestSourceFile[] = [];
  for (let i = 0; i < m.sources.length; i++) {
    const s = m.sources[i];
    if (s === null || typeof s !== "object" || Array.isArray(s)) {
      return err("invalid_manifest", `sources[${i}] must be an object`);
    }
    const row = s as Record<string, unknown>;
    const requiredStrings = [
      "sourceKey",
      "sourceId",
      "title",
      "chapterLabel",
      "fragment",
      "glossZh",
      "expectedQuote",
      "expectedContentHash",
      "fragmentPath",
    ] as const;
    for (const key of requiredStrings) {
      if (!isNonEmptyString(row[key])) {
        return err(
          "invalid_manifest",
          `sources[${i}].${key} missing or empty`,
          { index: i, field: key },
        );
      }
    }
    if (!isFiniteNumber(row.readingOrder)) {
      return err("invalid_manifest", `sources[${i}].readingOrder invalid`);
    }
    if (!isFiniteNumber(row.pdfPage) || !isFiniteNumber(row.printPage)) {
      return err(
        "invalid_manifest",
        `sources[${i}].pdfPage/printPage invalid`,
      );
    }
    const sourceKey = row.sourceKey as string;
    if (sourceKey !== "division" && sourceKey !== "market") {
      return err("invalid_manifest", `sources[${i}].sourceKey unknown`, {
        sourceKey,
      });
    }
    if (row.sourceId !== DOMAIN_SOURCE_IDS[sourceKey]) {
      return err(
        "invalid_manifest",
        `sources[${i}].sourceId does not match domain map`,
        { sourceId: row.sourceId },
      );
    }
    sources.push({
      sourceKey,
      sourceId: row.sourceId as string,
      readingOrder: row.readingOrder as number,
      title: row.title as string,
      chapterLabel: row.chapterLabel as string,
      fragment: row.fragment as string,
      pdfPage: row.pdfPage as number,
      printPage: row.printPage as number,
      glossZh: row.glossZh as string,
      expectedQuote: row.expectedQuote as string,
      expectedContentHash: row.expectedContentHash as string,
      fragmentPath: row.fragmentPath as string,
    });
  }

  let footnotes: ManifestFootnoteFile[] | undefined;
  if (m.footnotes !== undefined) {
    if (!Array.isArray(m.footnotes)) {
      return err("invalid_manifest", "footnotes must be an array when present");
    }
    footnotes = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < m.footnotes.length; i++) {
      const f = m.footnotes[i];
      if (f === null || typeof f !== "object" || Array.isArray(f)) {
        return err("invalid_manifest", `footnotes[${i}] must be an object`);
      }
      const row = f as Record<string, unknown>;
      if (!isNonEmptyString(row.id) || !isNonEmptyString(row.path)) {
        return err(
          "invalid_manifest",
          `footnotes[${i}].id/path missing or empty`,
        );
      }
      const id = row.id as string;
      if (seenIds.has(id)) {
        return err(
          "duplicate_locator",
          `Duplicate footnotes.id before map overwrite: ${id}`,
          { id, index: i },
        );
      }
      seenIds.add(id);
      footnotes.push({
        id,
        path: row.path as string,
        expectedText: isNonEmptyString(row.expectedText)
          ? (row.expectedText as string)
          : undefined,
      });
    }
  }

  return ok({
    bookId: m.bookId as string,
    title: m.title as string,
    author: m.author as string,
    edition: {
      editionId: ed.editionId as string,
      revision: ed.revision as string,
      language: ed.language as string,
      label: ed.label as string,
      sourceUri: ed.sourceUri as string,
      contentHash: ed.contentHash as string,
    },
    sources,
    footnotes,
  });
}
