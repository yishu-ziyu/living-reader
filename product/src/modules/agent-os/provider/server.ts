import {
  assertKnownSourceId,
  getBookChapter,
  getSourceBlockById,
  loadBookManifest,
  loadWealthOfNationsBook,
} from "@/modules/book";
import {
  parseVoiceSourceSnapshot,
  snapshotManifestVoiceSource,
  snapshotVoiceSource,
  voiceSourceSnapshotsEqual,
  type VoiceSourceSnapshot,
} from "@/modules/voice";
import {
  AgentTurnProviderError,
  deriveAgentTurnSourceSnapshotId,
  type VerifiedAgentTurnSource,
} from "./contracts";

/** Server-only transport to the independent Bun Reading Agent runtime. */
export {
  createReadingAgentRuntimeProvider,
  type ReadingAgentRuntimeProviderOptions,
} from "./runtime-client";

export function parseAgentTurnSourceSnapshot(
  value: unknown,
): VoiceSourceSnapshot | null {
  return parseVoiceSourceSnapshot(value);
}

export function currentAgentTurnSourceSnapshotId(
  source: Pick<VerifiedAgentTurnSource, "source_id" | "content_hash">,
): string {
  return deriveAgentTurnSourceSnapshotId(source.source_id, source.content_hash);
}

export async function verifyAgentTurnSource(
  sourceSnapshot: VoiceSourceSnapshot,
): Promise<VerifiedAgentTurnSource> {
  const book = await loadWealthOfNationsBook();
  if (!book.ok) {
    throw new AgentTurnProviderError(
      "agent_turn_provider_unavailable",
      "原文暂不可用，世界先不动。",
      503,
    );
  }
  const source = getSourceBlockById(book.value.sourceBlocks, sourceSnapshot.sourceId);
  if (source.ok) {
    const currentSnapshot = snapshotVoiceSource(source.value);
    if (!voiceSourceSnapshotsEqual(sourceSnapshot, currentSnapshot)) {
      throw new AgentTurnProviderError(
        "agent_turn_source_stale",
        "原文已经变化，请重新进入当前段落。",
        409,
      );
    }
    return Object.freeze({
      source_id: source.value.sourceId,
      edition_id: source.value.editionId,
      content_hash: source.value.contentHash,
      title: source.value.title,
      quote: source.value.quote,
    });
  }

  const known = assertKnownSourceId(sourceSnapshot.sourceId);
  const chapterId =
    /^(smith\.b[1-5]\.c(?:0|[1-9]\d*))\.p[1-9]\d*$/u.exec(
      sourceSnapshot.sourceId,
    )?.[1];
  if (!known.ok || !chapterId) {
    throw new AgentTurnProviderError(
      "agent_turn_source_stale",
      "原文已经变化，请重新进入当前段落。",
      409,
    );
  }
  const manifest = await loadBookManifest("wealth-of-nations");
  if (!manifest.ok) {
    throw new AgentTurnProviderError(
      "agent_turn_provider_unavailable",
      "原文暂不可用，世界先不动。",
      503,
    );
  }
  const chapter = getBookChapter(manifest.value, chapterId);
  const manifestBlock = chapter.ok
    ? chapter.value.sourceBlocks.find(
        (block) => block.sourceId === sourceSnapshot.sourceId,
      )
    : undefined;
  if (!chapter.ok || !manifestBlock) {
    throw new AgentTurnProviderError(
      "agent_turn_source_stale",
      "原文已经变化，请重新进入当前段落。",
      409,
    );
  }
  const currentSnapshot = snapshotManifestVoiceSource(
    manifestBlock,
    manifest.value.edition.editionId,
    chapter.value.title,
  );
  if (!voiceSourceSnapshotsEqual(sourceSnapshot, currentSnapshot)) {
    throw new AgentTurnProviderError(
      "agent_turn_source_stale",
      "原文已经变化，请重新进入当前段落。",
      409,
    );
  }
  return Object.freeze({
    source_id: manifestBlock.sourceId,
    edition_id: manifest.value.edition.editionId,
    content_hash: manifestBlock.contentHash,
    title: chapter.value.title,
    quote: manifestBlock.quote,
  });
}

export function assertAgentTurnSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) {
    throw new AgentTurnProviderError(
      "agent_turn_cross_origin_forbidden",
      "语义接口仅接受同源请求。",
      403,
    );
  }
  try {
    if (new URL(origin).host !== host) {
      throw new AgentTurnProviderError(
        "agent_turn_cross_origin_forbidden",
        "语义接口仅接受同源请求。",
        403,
      );
    }
  } catch (error) {
    if (error instanceof AgentTurnProviderError) throw error;
    throw new AgentTurnProviderError(
      "agent_turn_cross_origin_forbidden",
      "语义接口仅接受同源请求。",
      403,
    );
  }
}
