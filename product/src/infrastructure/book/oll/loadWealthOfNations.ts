import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DOMAIN_SOURCE_IDS,
  err,
  ok,
  resolveSourceId,
  validateBookManifestV2,
  type BookArtifact,
  type BookManifestV2,
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

  if (
    parsedJson !== null &&
    typeof parsedJson === "object" &&
    !Array.isArray(parsedJson) &&
    "schemaVersion" in parsedJson &&
    parsedJson.schemaVersion === 2
  ) {
    const manifest = validateBookManifestV2(parsedJson);
    if (!manifest.ok) return manifest;
    return loadLegacyAliasBook(base, manifest.value);
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

async function loadLegacyAliasBook(
  base: string,
  manifest: BookManifestV2,
): Promise<BookResult<BookArtifact>> {
  const divisionId = resolveSourceId(manifest, DOMAIN_SOURCE_IDS.division);
  const marketId = resolveSourceId(manifest, DOMAIN_SOURCE_IDS.market);
  if (!divisionId.ok) return divisionId;
  if (!marketId.ok) return marketId;
  const allBlocks = manifest.books.flatMap((book) =>
    book.chapters.flatMap((chapter) => chapter.sourceBlocks),
  );
  const division = allBlocks.find((block) => block.sourceId === divisionId.value);
  const market = allBlocks.find((block) => block.sourceId === marketId.value);
  if (!division || !market) {
    return err("source_unavailable", "Legacy alias targets are unavailable");
  }
  const volumeOne = manifest.volumes.find((volume) => volume.volume === 1);
  if (!volumeOne) {
    return err("invalid_manifest", "Volume 1 metadata is unavailable");
  }

  const fragments: Record<string, string> = {};
  for (const block of [division, market]) {
    const fragmentPath = path.join(
      base,
      "fragments",
      `${block.sourceLocator.fragment}.html`,
    );
    try {
      fragments[block.sourceLocator.fragment] = await readFile(fragmentPath, "utf8");
    } catch {
      return err("fragment_not_found", "Cannot read legacy fragment file", {
        fragmentPath,
      });
    }
  }
  const footnoteId = "lf0206-01_footnote_nt114";
  let footnoteHtml: string;
  try {
    footnoteHtml = await readFile(
      path.join(base, "footnotes", `${footnoteId}.html`),
      "utf8",
    );
  } catch {
    return err("source_unavailable", "Cannot read legacy footnote file", {
      footnoteId,
    });
  }

  return compileWealthOfNationsFromFragments({
    bookId: manifest.bookId,
    title: manifest.title,
    author: manifest.author,
    edition: {
      editionId: volumeOne.volumeId,
      revision: manifest.edition.revision,
      language: "en",
      label: "Cannan ed. Vol. 1 (OLL EPUB)",
      sourceUri: volumeOne.sourcePackageUri,
      contentHash: volumeOne.sourcePackageHash,
    },
    sources: [
      {
        sourceKey: "division",
        sourceId: DOMAIN_SOURCE_IDS.division,
        readingOrder: 1,
        title: "Of the division of labour",
        chapterLabel: "BOOK I. CH. I.",
        fragment: division.sourceLocator.fragment,
        pdfPage: 36,
        printPage: 5,
        glossZh: "分工与劳动生产力（释义，非译文）。",
        expectedQuote: division.quote,
        expectedContentHash: division.contentHash,
      },
      {
        sourceKey: "market",
        sourceId: DOMAIN_SOURCE_IDS.market,
        readingOrder: 2,
        title: "That the division of labour is limited by the extent of the market",
        chapterLabel: "BOOK I. CH. III.",
        fragment: market.sourceLocator.fragment,
        pdfPage: 45,
        printPage: 19,
        glossZh: "分工受市场范围限制（释义，非译文）。",
        expectedQuote: market.quote,
        expectedContentHash: market.contentHash,
      },
    ],
    fragments,
    footnoteHtml: { [footnoteId]: footnoteHtml },
    footnoteExpectedText: {
      [footnoteId]: "[Ed. 1 reads ‘improvements’.]",
    },
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
