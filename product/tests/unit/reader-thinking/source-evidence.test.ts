import { describe, expect, it } from "vitest";
import { discussionSnapshotFromEvidence } from "@/modules/agent-os";
import {
  assertKnownSourceId,
  getBookChapter,
  loadBookManifest,
  type BookManifestV2,
  type BookSourceBlock,
} from "@/modules/book";
import {
  buildManifestSourceEvidenceMap,
  isKnownSourceId,
  parseSourceDiscussionSnapshot,
  validateAndSealSourceEvidence,
} from "@/modules/reader-thinking";

async function chapterFixture() {
  const manifest = await loadBookManifest("wealth-of-nations");
  expect(manifest.ok).toBe(true);
  if (!manifest.ok) throw manifest.error;
  const chapter = getBookChapter(manifest.value, "smith.b1.c1");
  expect(chapter.ok).toBe(true);
  if (!chapter.ok) throw chapter.error;
  return { manifest: manifest.value, chapter: chapter.value };
}

describe("full-book source evidence", () => {
  it("accepts canonical Books I-V paragraph IDs and keeps both legacy aliases", () => {
    for (const sourceId of [
      "smith.b1.c1.p2",
      "smith.b4.c0.p1",
      "smith.b5.c3.p10",
      "smith.b1.c1.division",
      "smith.b1.c3.market_extent",
    ]) {
      expect(isKnownSourceId(sourceId), sourceId).toBe(true);
      expect(assertKnownSourceId(sourceId).ok, sourceId).toBe(true);
    }

    for (const sourceId of [
      "smith.b0.c1.p1",
      "smith.b6.c1.p1",
      "smith.b1.c1.p0",
      "smith.b1.c1.other",
    ]) {
      expect(isKnownSourceId(sourceId), sourceId).toBe(false);
      expect(assertKnownSourceId(sourceId).ok, sourceId).toBe(false);
    }
  });

  it("seals a canonical manifest paragraph without inventing a PDF page", async () => {
    const { manifest, chapter } = await chapterFixture();
    const block = chapter.sourceBlocks[1]!;
    const sealed = buildManifestSourceEvidenceMap(
      [{ block }],
      manifest,
    );

    expect(sealed.ok).toBe(true);
    if (!sealed.ok) throw sealed.error;
    const source = sealed.value[block.sourceId]!;
    const volume = manifest.volumes.find(
      (candidate) => candidate.volume === block.sourceLocator.volume,
    )!;
    expect(source).toMatchObject({
      source_id: "smith.b1.c1.p2",
      print_page: Number(block.printPage),
      edition_content_hash: volume.contentHash,
      source_content_hash: block.contentHash,
    });
    expect(source).not.toHaveProperty("pdf_page");
    expect(source.evidence_refs).not.toContain(expect.stringMatching(/^pdf:/));

    const discussion = discussionSnapshotFromEvidence(source, block.quote);
    expect(discussion).not.toHaveProperty("pdf_page");
    expect(parseSourceDiscussionSnapshot(discussion).ok).toBe(true);

    const fullBookEntries = manifest.books.flatMap((book) =>
      book.chapters.flatMap((currentChapter) =>
        currentChapter.sourceBlocks.map((currentBlock) => ({
          block: currentBlock,
        })),
      ),
    );
    const fullBookEvidence = buildManifestSourceEvidenceMap(
      fullBookEntries,
      manifest,
    );
    expect(fullBookEvidence.ok).toBe(true);
    if (!fullBookEvidence.ok) throw fullBookEvidence.error;
    expect(Object.keys(fullBookEvidence.value)).toHaveLength(
      fullBookEntries.length,
    );
    expect(
      Object.values(fullBookEvidence.value).every(
        (snapshot) => snapshot.pdf_page === undefined,
      ),
    ).toBe(true);
  });

  it("keeps the verified PDF page for a legacy recipe anchor", async () => {
    const { manifest, chapter } = await chapterFixture();
    const block = chapter.sourceBlocks[0]!;
    const sealed = buildManifestSourceEvidenceMap(
      [
        {
          block,
          source_id: "smith.b1.c1.division",
          pdf_page: 36,
        },
      ],
      manifest,
    );

    expect(sealed.ok).toBe(true);
    if (!sealed.ok) throw sealed.error;
    expect(sealed.value["smith.b1.c1.division"]).toMatchObject({
      source_id: "smith.b1.c1.division",
      pdf_page: 36,
      print_page: 5,
    });
    expect(
      sealed.value["smith.b1.c1.division"]?.evidence_refs,
    ).toContain("pdf:36");
  });

  it("accepts volume-two OLL locators but fails closed on missing print pages", async () => {
    const direct = validateAndSealSourceEvidence({
      source_id: "smith.b5.c3.p1",
      fragment: "Smith_0206-02_123",
      print_page: 700,
      edition_id: "oll-cannan-1904",
      edition_revision: "oll-epub-2016-05-25",
      edition_content_hash: "a".repeat(64),
      source_content_hash: "b".repeat(64),
    });
    expect(direct.ok).toBe(true);

    const { manifest, chapter } = await chapterFixture();
    const volumeTwoChapter = getBookChapter(manifest, "smith.b4.c4");
    expect(volumeTwoChapter.ok).toBe(true);
    if (!volumeTwoChapter.ok) throw volumeTwoChapter.error;
    const volumeTwoBlock = volumeTwoChapter.value.sourceBlocks.find(
      (block) => block.sourceLocator.volume === 2,
    );
    expect(volumeTwoBlock).toBeDefined();
    if (!volumeTwoBlock) throw new Error("volume-two source unavailable");
    const volumeTwoEvidence = buildManifestSourceEvidenceMap(
      [{ block: volumeTwoBlock }],
      manifest,
    );
    expect(volumeTwoEvidence.ok).toBe(true);
    if (!volumeTwoEvidence.ok) throw volumeTwoEvidence.error;
    const volumeTwo = manifest.volumes.find(
      (candidate) =>
        candidate.volumeId === volumeTwoBlock.sourceLocator.volumeId &&
        candidate.resource === volumeTwoBlock.sourceLocator.resource,
    );
    expect(volumeTwoEvidence.value[volumeTwoBlock.sourceId]).toMatchObject({
      fragment: expect.stringMatching(/^Smith_0206-02_/),
      edition_content_hash: volumeTwo?.contentHash,
    });

    const missingPrint = {
      ...chapter.sourceBlocks[1]!,
      printPage: undefined,
    } as BookSourceBlock;
    const forgedManifest = {
      ...manifest,
      books: manifest.books.map((book) => ({
        ...book,
        chapters: book.chapters.map((candidate) =>
          candidate.chapterId === chapter.chapterId
            ? {
                ...candidate,
                sourceBlocks: candidate.sourceBlocks.map((block) =>
                  block.sourceId === missingPrint.sourceId ? missingPrint : block,
                ),
              }
            : candidate,
        ),
      })),
    } as BookManifestV2;
    const missing = buildManifestSourceEvidenceMap(
      [{ block: missingPrint }],
      forgedManifest,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("SOURCE_EVIDENCE_DRIFT");
  });
});
