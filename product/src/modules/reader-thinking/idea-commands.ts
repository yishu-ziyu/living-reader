/**
 * ReaderIdea submit / revise — EventStore-first application commands.
 * F33: evidence comes only from a sealed SourceEvidenceSnapshot (T002 SourceBlock).
 */
import type { DomainEventDraft } from "@/modules/reader-world/events/envelope";
import type { EventStore } from "@/modules/reader-world/event-store";
import { foldReadingGraph } from "@/modules/reader-world/projections/reading-graph";
import type { ReadingGraphView } from "@/modules/reader-world/projections/types";
import { createDomainEventDraftBrowser } from "./draft";
import {
  LIVE_EXPERIENCE_ID,
  LIVE_PRINCIPAL_ID,
  PRODUCER,
  isKnownSourceId,
} from "./constants";
import {
  evidenceIdentityKey,
  validateAndSealSourceEvidence,
  type SourceEvidenceInput,
  type SourceEvidenceSnapshot,
} from "./source-evidence";
import {
  thinkingErr,
  thinkingOk,
  type ThinkingResult,
} from "./errors";
import type { ClockPort, IdPort } from "./ports";

function asDomainEventDraft(draft: unknown): DomainEventDraft {
  return draft as DomainEventDraft;
}

export type IdeaCommandPorts = {
  store: EventStore;
  ids: IdPort;
  clock: ClockPort;
  experience_id?: string;
  principal_id?: string;
};

async function loadGraph(
  store: EventStore,
  experience_id: string,
): Promise<ThinkingResult<{ graph: ReadingGraphView; version: number }>> {
  const loaded = await store.load(experience_id);
  if (!loaded.ok) {
    return thinkingErr("STORE_ERROR", loaded.error.message);
  }
  const version = loaded.value.length
    ? loaded.value[loaded.value.length - 1]!.stream_version
    : 0;
  return thinkingOk({
    graph: foldReadingGraph(experience_id, loaded.value),
    version,
  });
}

export type SubmitIdeaInput = {
  text: string;
  /**
   * Live T002 SourceBlock-derived evidence (required).
   * Do not pass handwritten constants — build via evidenceFromSourceBlock.
   */
  source: SourceEvidenceInput | SourceEvidenceSnapshot;
  /** Optional fixed idea_id for Replay fixtures. */
  idea_id?: string;
  idempotency_key: string;
};

export type SubmitIdeaOutput = {
  idea_id: string;
  revision: number;
  graph: ReadingGraphView;
  committed_version: number;
  duplicate: boolean;
};

export async function submitIdea(
  ports: IdeaCommandPorts,
  input: SubmitIdeaInput,
): Promise<ThinkingResult<SubmitIdeaOutput>> {
  const text = input.text.trim();
  if (!text) return thinkingErr("EMPTY_TEXT", "Idea 文本不能为空");

  const sealed = validateAndSealSourceEvidence(input.source);
  if (!sealed.ok) return sealed;
  const meta = sealed.value;

  if (!isKnownSourceId(meta.source_id)) {
    return thinkingErr("INVALID_SOURCE", `未知来源: ${meta.source_id}`);
  }

  const experience_id = ports.experience_id ?? LIVE_EXPERIENCE_ID;
  const principal_id = ports.principal_id ?? LIVE_PRINCIPAL_ID;
  const state = await loadGraph(ports.store, experience_id);
  if (!state.ok) return state;

  const idea_id = input.idea_id ?? ports.ids.nextId("idea");

  // Fixed idea_id must not overwrite revision=1 with a different payload.
  const existingActive = state.value.graph.ideas
    .filter((i) => i.idea_id === idea_id && i.status === "active")
    .sort((a, b) => b.revision - a.revision)[0];
  if (existingActive) {
    if (existingActive.text === text) {
      const sameIdentity =
        evidenceIdentityKey(
          existingActive.source_ids[0] ?? "",
          existingActive.evidence_refs,
        ) === evidenceIdentityKey(meta.source_id, meta.evidence_refs);
      if (sameIdentity) {
        return thinkingOk({
          idea_id,
          revision: existingActive.revision,
          graph: state.value.graph,
          committed_version: state.value.version,
          duplicate: true,
        });
      }
      // Same text + different source/evidence → conflict (not silent duplicate).
      return thinkingErr(
        "SOURCE_EVIDENCE_CONFLICT",
        "相同 idea_id 与文本但 source/evidence 身份不同，拒绝覆盖",
      );
    }
    // Different text → append revision instead of clobbering r1.
    return reviseIdea(ports, {
      idea_id,
      text,
      idempotency_key: input.idempotency_key,
    });
  }

  const revision = 1;
  const correlation_id = ports.ids.nextId("corr");
  const draft = await createDomainEventDraftBrowser({
    message_name: "reader_world.reader_idea.proposed.v1",
    experience_id,
    correlation_id,
    producer: PRODUCER,
    security: {
      principal_id,
      authority: "reader",
      integrity: "local",
    },
    recorded_at: ports.clock.nowRfc3339(),
    message_id: ports.ids.nextId("msg"),
    payload: {
      idea_id,
      idea_kind: "reader_note",
      text,
      source_ids: [meta.source_id],
      evidence_refs: [...meta.evidence_refs],
      revision,
      supersedes: null,
    },
  });

  const expected_version = state.value.version === 0 ? -1 : state.value.version;
  const append = await ports.store.append({
    experience_id,
    principal_id,
    idempotency_key: input.idempotency_key,
    expected_version,
    events: [asDomainEventDraft(draft)],
  });

  if (!append.ok) {
    if (append.error.code === "EXPECTED_VERSION_MISMATCH") {
      return thinkingErr("VERSION_MISMATCH", append.error.message, {
        current_version: append.error.current_version,
      });
    }
    if (append.error.code === "IDEMPOTENCY_KEY_REUSED") {
      return thinkingErr("IDEMPOTENCY_KEY_REUSED", append.error.message);
    }
    return thinkingErr("STORE_ERROR", append.error.message);
  }

  const after = await loadGraph(ports.store, experience_id);
  if (!after.ok) return after;

  return thinkingOk({
    idea_id,
    revision,
    graph: after.value.graph,
    committed_version: append.value.committed_version,
    duplicate: append.value.duplicate,
  });
}

export type ReviseIdeaInput = {
  idea_id: string;
  text: string;
  idempotency_key: string;
};

export async function reviseIdea(
  ports: IdeaCommandPorts,
  input: ReviseIdeaInput,
): Promise<ThinkingResult<SubmitIdeaOutput>> {
  const text = input.text.trim();
  if (!text) return thinkingErr("EMPTY_TEXT", "Idea 文本不能为空");

  const experience_id = ports.experience_id ?? LIVE_EXPERIENCE_ID;
  const principal_id = ports.principal_id ?? LIVE_PRINCIPAL_ID;
  const state = await loadGraph(ports.store, experience_id);
  if (!state.ok) return state;

  const active = state.value.graph.ideas.filter(
    (i) => i.idea_id === input.idea_id && i.status === "active",
  );
  const latest = active.sort((a, b) => b.revision - a.revision)[0];
  if (!latest) {
    return thinkingErr("IDEA_NOT_FOUND", `找不到 Idea: ${input.idea_id}`);
  }

  const source_id = latest.source_ids[0]!;
  if (!isKnownSourceId(source_id)) {
    return thinkingErr("INVALID_SOURCE", `未知来源: ${source_id}`);
  }
  const revision = latest.revision + 1;
  const correlation_id = ports.ids.nextId("corr");
  const draft = await createDomainEventDraftBrowser({
    message_name: "reader_world.reader_idea.proposed.v1",
    experience_id,
    correlation_id,
    producer: PRODUCER,
    security: {
      principal_id,
      authority: "reader",
      integrity: "local",
    },
    recorded_at: ports.clock.nowRfc3339(),
    message_id: ports.ids.nextId("msg"),
    payload: {
      idea_id: input.idea_id,
      idea_kind: latest.idea_kind,
      text,
      source_ids: [...latest.source_ids],
      // Revision freezes the original sealed evidence_refs.
      evidence_refs: [...latest.evidence_refs],
      revision,
      supersedes: input.idea_id,
    },
  });

  const expected_version = state.value.version === 0 ? -1 : state.value.version;
  const append = await ports.store.append({
    experience_id,
    principal_id,
    idempotency_key: input.idempotency_key,
    expected_version,
    events: [asDomainEventDraft(draft)],
  });

  if (!append.ok) {
    if (append.error.code === "EXPECTED_VERSION_MISMATCH") {
      return thinkingErr("VERSION_MISMATCH", append.error.message, {
        current_version: append.error.current_version,
      });
    }
    if (append.error.code === "IDEMPOTENCY_KEY_REUSED") {
      return thinkingErr("IDEMPOTENCY_KEY_REUSED", append.error.message);
    }
    return thinkingErr("STORE_ERROR", append.error.message);
  }

  const after = await loadGraph(ports.store, experience_id);
  if (!after.ok) return after;

  return thinkingOk({
    idea_id: input.idea_id,
    revision,
    graph: after.value.graph,
    committed_version: append.value.committed_version,
    duplicate: append.value.duplicate,
  });
}

export async function reloadGraph(
  ports: IdeaCommandPorts,
): Promise<ThinkingResult<ReadingGraphView>> {
  const experience_id = ports.experience_id ?? LIVE_EXPERIENCE_ID;
  const state = await loadGraph(ports.store, experience_id);
  if (!state.ok) return state;
  return thinkingOk(state.value.graph);
}
