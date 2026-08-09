import type { SourceBlock } from "@/modules/book";

export type VoiceSourceSnapshot = Readonly<{
  sourceId: string;
  editionId: string;
  title: string;
  quote: string;
  contentHash: string;
  pdfPages: readonly number[];
}>;

export type VoiceTranscript = Readonly<{
  id: string;
  role: "reader" | "companion";
  text: string;
  final: boolean;
}>;

export type VoiceFinalTurn = Readonly<{
  transcript: string;
  sourceSnapshot: VoiceSourceSnapshot;
  input: "voice" | "text";
}>;

/**
 * Seals the source identity and exact quote at the moment a voice turn starts.
 * The returned object contains no live SourceBlock reference.
 */
export function snapshotVoiceSource(block: SourceBlock): VoiceSourceSnapshot {
  return Object.freeze({
    sourceId: block.sourceId,
    editionId: block.editionId,
    title: block.title,
    quote: block.quote,
    contentHash: block.contentHash,
    pdfPages: Object.freeze(
      block.evidenceRefs.map((reference) => reference.pdfPage),
    ),
  });
}

export function cloneVoiceSourceSnapshot(
  snapshot: VoiceSourceSnapshot,
): VoiceSourceSnapshot {
  return Object.freeze({
    sourceId: snapshot.sourceId,
    editionId: snapshot.editionId,
    title: snapshot.title,
    quote: snapshot.quote,
    contentHash: snapshot.contentHash,
    pdfPages: Object.freeze([...snapshot.pdfPages]),
  });
}

/** Returns true exactly once for each provider item id in the current session. */
export function acceptReaderTranscriptItem(
  processedItemIds: Set<string>,
  itemId: string,
): boolean {
  if (processedItemIds.has(itemId)) return false;
  processedItemIds.add(itemId);
  return true;
}

export function voiceSourceSnapshotsEqual(
  left: VoiceSourceSnapshot,
  right: VoiceSourceSnapshot,
): boolean {
  return (
    left.sourceId === right.sourceId &&
    left.editionId === right.editionId &&
    left.title === right.title &&
    left.quote === right.quote &&
    left.contentHash === right.contentHash &&
    left.pdfPages.length === right.pdfPages.length &&
    left.pdfPages.every((page, index) => page === right.pdfPages[index])
  );
}
