import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBookChapter,
  getSourceBlockById,
  loadBookManifest,
  loadChapterTranslation,
  loadWealthOfNationsBook,
} from "@/modules/book";
import {
  discussionSnapshotFromEvidence,
  type SourceDiscussionSnapshot,
} from "@/modules/agent-os";
import {
  buildManifestSourceEvidenceMap,
  type ManifestSourceEvidenceEntry,
} from "@/modules/reader-thinking";
import {
  snapshotManifestVoiceSource,
  snapshotVoiceSource,
  type VoiceSourceSnapshot,
} from "@/modules/voice";
import { ChapterReadingShell } from "@/components/reading/ChapterReadingShell";
import { buildChapterReadingModel } from "@/components/reading/buildChapterReadingModel";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>;
}) {
  const { bookId, chapterId } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bookId)) {
    notFound();
  }
  const manifest = await loadBookManifest(bookId);
  if (!manifest.ok) {
    if (manifest.error.details?.manifestPath) {
      notFound();
    }
    return (
      <ChapterUnavailable
        bookId={bookId}
        chapterId={chapterId}
        reason={manifest.error.message}
      />
    );
  }
  const chapter = getBookChapter(manifest.value, chapterId);
  if (!chapter.ok) {
    notFound();
  }
  const translation = await loadChapterTranslation(bookId, chapterId);
  if (!translation.ok) {
    return (
      <ChapterUnavailable
        bookId={bookId}
        chapterId={chapterId}
        reason={translation.error.message}
      />
    );
  }
  const model = buildChapterReadingModel(
    manifest.value,
    chapter.value,
    translation.value,
  );
  if (!model) {
    return (
      <ChapterUnavailable
        bookId={bookId}
        chapterId={chapterId}
        reason="译文与当前英文来源版本不一致。"
      />
    );
  }
  const agentBook = await loadWealthOfNationsBook();
  if (!agentBook.ok) {
    return (
      <ChapterUnavailable
        bookId={bookId}
        chapterId={chapterId}
        reason={agentBook.error.message}
      />
    );
  }
  const division = getSourceBlockById(
    agentBook.value.sourceBlocks,
    "smith.b1.c1.division",
  );
  const market = getSourceBlockById(
    agentBook.value.sourceBlocks,
    "smith.b1.c3.market_extent",
  );
  const divisionChapter = getBookChapter(manifest.value, "smith.b1.c1");
  const marketChapter = getBookChapter(manifest.value, "smith.b1.c3");
  const divisionCanonicalId =
    manifest.value.aliases["smith.b1.c1.division"];
  const marketCanonicalId =
    manifest.value.aliases["smith.b1.c3.market_extent"];
  const divisionManifestBlock = divisionChapter.ok
    ? divisionChapter.value.sourceBlocks.find(
        (block) => block.sourceId === divisionCanonicalId,
      )
    : undefined;
  const marketManifestBlock = marketChapter.ok
    ? marketChapter.value.sourceBlocks.find(
        (block) => block.sourceId === marketCanonicalId,
      )
    : undefined;
  const divisionPdfPage = division.ok
    ? division.value.evidenceRefs.find(
        (reference) => reference.kind === "pdf_page",
      )?.pdfPage
    : undefined;
  const marketPdfPage = market.ok
    ? market.value.evidenceRefs.find(
        (reference) => reference.kind === "pdf_page",
      )?.pdfPage
    : undefined;
  if (
    !division.ok ||
    !market.ok ||
    !divisionChapter.ok ||
    !marketChapter.ok ||
    !divisionManifestBlock ||
    !marketManifestBlock ||
    typeof divisionPdfPage !== "number" ||
    !Number.isSafeInteger(divisionPdfPage) ||
    typeof marketPdfPage !== "number" ||
    !Number.isSafeInteger(marketPdfPage)
  ) {
    return (
      <ChapterUnavailable
        bookId={bookId}
        chapterId={chapterId}
        reason="陪读锚点与当前来源版本不一致。"
      />
    );
  }

  type AgentSourceEntry = ManifestSourceEvidenceEntry &
    Readonly<{
      title: string;
      voiceSnapshot?: VoiceSourceSnapshot;
    }>;
  const legacyAnchors: readonly AgentSourceEntry[] = [
    {
      block: divisionManifestBlock,
      source_id: division.value.sourceId,
      pdf_page: divisionPdfPage,
      title: divisionChapter.value.title,
      voiceSnapshot: snapshotVoiceSource(division.value),
    },
    {
      block: marketManifestBlock,
      source_id: market.value.sourceId,
      pdf_page: marketPdfPage,
      title: marketChapter.value.title,
      voiceSnapshot: snapshotVoiceSource(market.value),
    },
  ];
  const sourceEntries: AgentSourceEntry[] = chapter.value.sourceBlocks.map(
    (block) => {
      const anchor = legacyAnchors.find(
        (candidate) => candidate.block.sourceId === block.sourceId,
      );
      return (
        anchor ?? {
          block,
          title: chapter.value.title,
        }
      );
    },
  );
  for (const anchor of legacyAnchors) {
    if (
      !sourceEntries.some(
        (entry) => entry.block.sourceId === anchor.block.sourceId,
      )
    ) {
      sourceEntries.push(anchor);
    }
  }

  const evidence = buildManifestSourceEvidenceMap(
    sourceEntries,
    manifest.value,
  );
  if (!evidence.ok) {
    return (
      <ChapterUnavailable
        bookId={bookId}
        chapterId={chapterId}
        reason={evidence.error.message}
      />
    );
  }
  const discussionSnapshots: Record<string, SourceDiscussionSnapshot> = {};
  const voiceSnapshots: Record<string, VoiceSourceSnapshot> = {};
  for (const entry of sourceEntries) {
    const sourceId = entry.source_id ?? entry.block.sourceId;
    const sourceEvidence = evidence.value[sourceId];
    if (!sourceEvidence) {
      return (
        <ChapterUnavailable
          bookId={bookId}
          chapterId={chapterId}
          reason={`陪读来源证据缺失: ${sourceId}`}
        />
      );
    }
    discussionSnapshots[sourceId] = discussionSnapshotFromEvidence(
      sourceEvidence,
      entry.block.quote,
    );
    voiceSnapshots[sourceId] =
      entry.voiceSnapshot ??
      snapshotManifestVoiceSource(
        entry.block,
        manifest.value.edition.editionId,
        entry.title,
      );
  }


  return (
    <ChapterReadingShell
      {...model}
      providerSourceEvidence={evidence.value}
      providerDiscussionSnapshots={discussionSnapshots}
      providerVoiceSnapshots={voiceSnapshots}
    />
  );
}

function ChapterUnavailable({
  bookId,
  chapterId,
  reason,
}: {
  bookId: string;
  chapterId: string;
  reason: string;
}) {
  return (
    <main data-testid="chapter-reading-error" style={{ padding: "3rem" }}>
      <p>译文暂不可用</p>
      <h1>{chapterId}</h1>
      <p>{reason}</p>
      <Link href={`/`}>返回《{bookId}》入口</Link>
    </main>
  );
}
