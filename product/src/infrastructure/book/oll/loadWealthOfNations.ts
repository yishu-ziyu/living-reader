import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DOMAIN_SOURCE_IDS,
  err,
  ok,
  type BookArtifact,
  type BookResult,
} from "@/modules/book/domain";
import { compileWealthOfNationsFromFragments } from "./compileFromFragments";
import { validateManifestFileShape } from "./manifestShape";

/**
 * Load Wealth of Nations MVP sources from public manifest + official fragments.
 * Server / test only (uses filesystem). Never throws on malformed manifest.
 */
export async function loadWealthOfNationsBook(
  rootDir: string = process.cwd(),
): Promise<BookResult<BookArtifact>> {
  const base = path.join(rootDir, "public", "books", "wealth-of-nations");
  let raw: string;
  try {
    raw = await readFile(path.join(base, "manifest.json"), "utf8");
  } catch {
    return err("invalid_manifest", "Unable to read wealth-of-nations manifest", {
      base,
    });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return err("invalid_manifest", "Manifest JSON parse failed");
  }

  const shape = validateManifestFileShape(parsedJson);
  if (!shape.ok) return shape;
  const file = shape.value;

  const fragments: Record<string, string> = {};
  for (const spec of file.sources) {
    const fragPath = path.join(base, spec.fragmentPath);
    try {
      fragments[spec.fragment] = await readFile(fragPath, "utf8");
    } catch {
      return err("fragment_not_found", `Cannot read fragment file`, {
        fragPath,
        fragment: spec.fragment,
      });
    }
  }

  const footnoteHtml: Record<string, string> = {};
  const footnoteExpectedText: Record<string, string> = {};
  for (const fn of file.footnotes ?? []) {
    // Reject duplicate ids before any map overwrite.
    if (Object.prototype.hasOwnProperty.call(footnoteHtml, fn.id)) {
      return err(
        "duplicate_locator",
        `Duplicate footnotes.id before overwrite: ${fn.id}`,
        { id: fn.id },
      );
    }
    const fnPath = path.join(base, fn.path);
    try {
      footnoteHtml[fn.id] = await readFile(fnPath, "utf8");
    } catch {
      return err("source_unavailable", `Cannot read footnote file`, {
        path: fn.path,
        id: fn.id,
      });
    }
    if (fn.expectedText) {
      footnoteExpectedText[fn.id] = fn.expectedText;
    }
  }

  return compileWealthOfNationsFromFragments({
    bookId: file.bookId,
    title: file.title,
    author: file.author,
    edition: {
      editionId: file.edition.editionId,
      revision: file.edition.revision,
      language: "en",
      label: file.edition.label,
      sourceUri: file.edition.sourceUri,
      contentHash: file.edition.contentHash,
    },
    sources: file.sources.map((s) => ({
      sourceKey: s.sourceKey,
      sourceId: DOMAIN_SOURCE_IDS[s.sourceKey],
      readingOrder: s.readingOrder,
      title: s.title,
      chapterLabel: s.chapterLabel,
      fragment: s.fragment,
      pdfPage: s.pdfPage,
      printPage: s.printPage,
      glossZh: s.glossZh,
      expectedQuote: s.expectedQuote,
      expectedContentHash: s.expectedContentHash,
    })),
    fragments,
    footnoteHtml,
    footnoteExpectedText,
  });
}

/** Fail-closed lookup used by UI and tests. */
export function requireSourceBlocks(
  book: BookArtifact,
): BookResult<BookArtifact["sourceBlocks"]> {
  if (!book.sourceBlocks?.length) {
    return err("source_unavailable", "Book has no source blocks");
  }
  return ok(book.sourceBlocks);
}
