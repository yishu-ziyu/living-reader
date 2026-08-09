import type { BookSourceBlock, SourceBlock } from "@/modules/book";

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
  /** Session + provider item identity, stable across SSE replay and AgentTurn retry. */
  turn_id: string;
  transcript: string;
  sourceSnapshot: VoiceSourceSnapshot;
  input: "voice" | "text";
  /** Omit when the realtime provider did not supply a reliable confidence. */
  asr_confidence?: number;
}>;

export type VoiceStopReason = "user" | "replay" | "source_change";

export type VoiceActiveStopper = (
  reason: VoiceStopReason,
) => Promise<void>;

/** Caller-owned seam used to stop voice before another product action runs. */
export type VoiceInputPort = Readonly<{
  registerActiveStopper: (stopper: VoiceActiveStopper) => () => void;
  stopActive: (reason: VoiceStopReason) => Promise<void>;
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
/**
 * Seals a canonical full-book paragraph. Physical PDF pages are intentionally
 * empty until that paragraph has a verified PDF mapping.
 */
export function snapshotManifestVoiceSource(
  block: BookSourceBlock,
  editionId: string,
  title: string,
): VoiceSourceSnapshot {
  return Object.freeze({
    sourceId: block.sourceId,
    editionId,
    title,
    quote: block.quote,
    contentHash: block.contentHash,
    pdfPages: Object.freeze([]),
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
