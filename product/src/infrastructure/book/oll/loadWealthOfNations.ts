import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  collectFootnoteTargetIds,
  DOMAIN_SOURCE_IDS,
  err,
  ok,
  resolveSourceId,
  validateBookManifestV2,
  validateFootnoteClosure,
  validateSourceBlock,
  type BookArtifact,
  type BookManifestV2,
  type BookResult,
  type SourceBlock,
} from "@/modules/book/domain";

/**
 * Load the two legacy Agent aliases from the canonical public manifest v2.
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

  const manifest = validateBookManifestV2(parsedJson);
  if (!manifest.ok) return manifest;
  return loadAgentAliasBook(manifest.value);
}

function loadAgentAliasBook(
  manifest: BookManifestV2,
): BookResult<BookArtifact> {
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
  if (
    division.sourceLocator.resource !== "Smith_0206-01.html" ||
    market.sourceLocator.resource !== "Smith_0206-01.html"
  ) {
    return err("missing_locator", "Legacy alias source resource is unavailable");
  }
  const volumeOne = manifest.volumes.find((volume) => volume.volume === 1);
  if (!volumeOne) {
    return err("invalid_manifest", "Volume 1 metadata is unavailable");
  }

  const candidates: SourceBlock[] = [
    {
      sourceId: DOMAIN_SOURCE_IDS.division,
      sourceKey: "division",
      editionId: volumeOne.volumeId,
      readingOrder: 1,
      title: "Of the division of labour",
      chapterLabel: "BOOK I. CH. I.",
      body: division.body,
      quote: division.quote,
      contentHash: division.contentHash,
      sourceLocator: {
        provider: "OLL",
        resource: "Smith_0206-01.html",
        fragment: division.sourceLocator.fragment,
      },
      evidenceRefs: [{ kind: "pdf_page", pdfPage: 36, printPage: 5 }],
      glossZh: "分工与劳动生产力（释义，非译文）。",
    },
    {
      sourceId: DOMAIN_SOURCE_IDS.market,
      sourceKey: "market",
      editionId: volumeOne.volumeId,
      readingOrder: 2,
      title: "That the division of labour is limited by the extent of the market",
      chapterLabel: "BOOK I. CH. III.",
      body: market.body,
      quote: market.quote,
      contentHash: market.contentHash,
      sourceLocator: {
        provider: "OLL",
        resource: "Smith_0206-01.html",
        fragment: market.sourceLocator.fragment,
      },
      evidenceRefs: [{ kind: "pdf_page", pdfPage: 45, printPage: 19 }],
      glossZh: "分工受市场范围限制（释义，非译文）。",
    },
  ];
  const sourceBlocks: SourceBlock[] = [];
  for (const candidate of candidates) {
    const valid = validateSourceBlock(candidate);
    if (!valid.ok) return valid;
    sourceBlocks.push(valid.value);
  }

  const neededFootnoteIds = new Set(
    sourceBlocks.flatMap((block) => collectFootnoteTargetIds(block.body)),
  );
  const book: BookArtifact = {
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
    sourceBlocks,
    footnotes: manifest.footnotes
      .filter((footnote) => neededFootnoteIds.has(footnote.id))
      .map((footnote) => ({
        id: footnote.id,
        marker: footnote.marker,
        text: footnote.text,
        ...(footnote.backRefId ? { backRefId: footnote.backRefId } : {}),
      })),
  };
  return validateFootnoteClosure(book);
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
