/**
 * Relation propose / review / accept+commit — EventStore-first.
 */
import type { DomainEventDraft } from "@/modules/reader-world/events/envelope";
import type { EventStore } from "@/modules/reader-world/event-store";
import { foldReadingGraph } from "@/modules/reader-world/projections/reading-graph";
import type { ReadingGraphView } from "@/modules/reader-world/projections/types";
import { createDomainEventDraftBrowser } from "@/modules/reader-thinking/draft";

function asDomainEventDraft(draft: unknown): DomainEventDraft {
  return draft as DomainEventDraft;
}
import {
  LIVE_EXPERIENCE_ID,
  LIVE_PRINCIPAL_ID,
  PRODUCER,
} from "@/modules/reader-thinking/constants";
import {
  thinkingErr,
  thinkingOk,
  type ThinkingResult,
} from "@/modules/reader-thinking/errors";
import type { ClockPort, IdPort } from "@/modules/reader-thinking/ports";
import { tryCanonicalConstrainedBy } from "./canonical";

export type RelationCommandPorts = {
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

function commonDraft(
  ports: RelationCommandPorts,
  experience_id: string,
  principal_id: string,
) {
  return {
    experience_id,
    correlation_id: ports.ids.nextId("corr"),
    producer: PRODUCER,
    security: {
      principal_id,
      authority: "reader" as const,
      integrity: "local" as const,
    },
    recorded_at: ports.clock.nowRfc3339(),
  };
}

export type RelationActionOutput = {
  graph: ReadingGraphView;
  committed_version: number;
  duplicate: boolean;
  relation_id?: string;
  graph_revision?: number;
};

/** Propose canonical constrained_by when both ideas present. */
export async function proposeCanonicalRelation(
  ports: RelationCommandPorts,
  input: { idempotency_key: string },
): Promise<ThinkingResult<RelationActionOutput>> {
  const experience_id = ports.experience_id ?? LIVE_EXPERIENCE_ID;
  const principal_id = ports.principal_id ?? LIVE_PRINCIPAL_ID;
  const state = await loadGraph(ports.store, experience_id);
  if (!state.ok) return state;

  const proposal = tryCanonicalConstrainedBy(state.value.graph);
  if (!proposal) {
    return thinkingErr(
      "MISSING_IDEAS",
      "需要分工段与市场范围段各一条有效 Idea",
    );
  }

  // Already has non-stale proposed/accepted of same id at same basis → idempotent skip via store
  const existing = state.value.graph.relations.find(
    (r) => r.relation_id === proposal.relation_id,
  );
  if (
    existing &&
    !existing.stale &&
    (existing.review_status === "proposed" ||
      existing.review_status === "accepted") &&
    existing.basis_revision === proposal.basis_revision
  ) {
    return thinkingOk({
      graph: state.value.graph,
      committed_version: state.value.version,
      duplicate: true,
      relation_id: proposal.relation_id,
    });
  }

  const base = commonDraft(ports, experience_id, principal_id);
  const draft = await createDomainEventDraftBrowser({
    ...base,
    message_name: "reader_world.relation.proposed.v1",
    message_id: ports.ids.nextId("msg"),
    payload: {
      relation_id: proposal.relation_id,
      from_id: proposal.from_id,
      to_id: proposal.to_id,
      relation_type: proposal.relation_type,
      evidence_refs: proposal.evidence_refs,
      basis_revision: proposal.basis_revision,
    },
  });

  const expected_version =
    state.value.version === 0 ? -1 : state.value.version;
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
    graph: after.value.graph,
    committed_version: append.value.committed_version,
    duplicate: append.value.duplicate,
    relation_id: proposal.relation_id,
  });
}

export async function rejectRelation(
  ports: RelationCommandPorts,
  input: { relation_id: string; idempotency_key: string },
): Promise<ThinkingResult<RelationActionOutput>> {
  const experience_id = ports.experience_id ?? LIVE_EXPERIENCE_ID;
  const principal_id = ports.principal_id ?? LIVE_PRINCIPAL_ID;
  const state = await loadGraph(ports.store, experience_id);
  if (!state.ok) return state;

  const rel = state.value.graph.relations.find(
    (r) => r.relation_id === input.relation_id,
  );
  if (!rel) {
    return thinkingErr("INVALID_STATE", "没有可拒绝的关系提议");
  }
  // Duplicate reject is a no-op success (idempotent).
  if (rel.review_status === "rejected" && !rel.stale) {
    return thinkingOk({
      graph: state.value.graph,
      committed_version: state.value.version,
      duplicate: true,
      relation_id: input.relation_id,
    });
  }
  if (rel.review_status === "accepted" && !rel.stale) {
    return thinkingErr("INVALID_STATE", "已确认的关系不能拒绝；请先修订 Idea 使其 stale");
  }
  if (rel.review_status !== "proposed") {
    return thinkingErr("INVALID_STATE", "只能拒绝 proposed 状态的关系");
  }
  if (rel.stale) {
    return thinkingErr("STALE_PROPOSAL", "关系依据已过期，请先重新提议");
  }

  const base = commonDraft(ports, experience_id, principal_id);
  const draft = await createDomainEventDraftBrowser({
    ...base,
    message_name: "reader_world.relation.reviewed.v1",
    message_id: ports.ids.nextId("msg"),
    causation_id: null,
    payload: {
      relation_id: input.relation_id,
      decision: "rejected",
      corrections: null,
      basis_revision: rel.basis_revision,
    },
  });

  const append = await ports.store.append({
    experience_id,
    principal_id,
    idempotency_key: input.idempotency_key,
    expected_version: state.value.version,
    events: [asDomainEventDraft(draft)],
  });
  if (!append.ok) {
    if (append.error.code === "EXPECTED_VERSION_MISMATCH") {
      return thinkingErr("VERSION_MISMATCH", append.error.message, {
        current_version: append.error.current_version,
      });
    }
    return thinkingErr("STORE_ERROR", append.error.message);
  }
  const after = await loadGraph(ports.store, experience_id);
  if (!after.ok) return after;
  return thinkingOk({
    graph: after.value.graph,
    committed_version: append.value.committed_version,
    duplicate: append.value.duplicate,
    relation_id: input.relation_id,
  });
}

export async function reviseRelation(
  ports: RelationCommandPorts,
  input: {
    relation_id: string;
    corrections: string;
    idempotency_key: string;
  },
): Promise<ThinkingResult<RelationActionOutput>> {
  const experience_id = ports.experience_id ?? LIVE_EXPERIENCE_ID;
  const principal_id = ports.principal_id ?? LIVE_PRINCIPAL_ID;
  const state = await loadGraph(ports.store, experience_id);
  if (!state.ok) return state;

  const rel = state.value.graph.relations.find(
    (r) => r.relation_id === input.relation_id,
  );
  if (!rel) {
    return thinkingErr("INVALID_STATE", "没有可修改的关系");
  }
  if (rel.review_status === "accepted" && !rel.stale) {
    return thinkingErr(
      "INVALID_STATE",
      "已确认的关系不能直接修改；请先修订 Idea 或拒绝后重提",
    );
  }
  if (rel.review_status !== "proposed" && rel.review_status !== "revised") {
    return thinkingErr("INVALID_STATE", "只能修改 proposed 关系");
  }
  if (rel.stale) {
    return thinkingErr("STALE_PROPOSAL", "关系依据已过期，请先重新提议");
  }

  const proposal = tryCanonicalConstrainedBy(state.value.graph);
  if (!proposal) {
    return thinkingErr("MISSING_IDEAS", "缺少有效 Idea，无法修订关系");
  }

  const base = commonDraft(ports, experience_id, principal_id);
  const reviewed = await createDomainEventDraftBrowser({
    ...base,
    message_name: "reader_world.relation.reviewed.v1",
    message_id: ports.ids.nextId("msg"),
    payload: {
      relation_id: input.relation_id,
      decision: "revised",
      corrections: input.corrections.trim() || null,
      basis_revision: rel.basis_revision,
    },
  });
  const proposed = await createDomainEventDraftBrowser({
    ...base,
    message_name: "reader_world.relation.proposed.v1",
    message_id: ports.ids.nextId("msg"),
    causation_id: reviewed.message_id,
    payload: {
      relation_id: proposal.relation_id,
      from_id: proposal.from_id,
      to_id: proposal.to_id,
      relation_type: proposal.relation_type,
      evidence_refs: proposal.evidence_refs,
      basis_revision: proposal.basis_revision,
    },
  });

  const append = await ports.store.append({
    experience_id,
    principal_id,
    idempotency_key: input.idempotency_key,
    expected_version: state.value.version,
    events: [asDomainEventDraft(reviewed), asDomainEventDraft(proposed)],
  });
  if (!append.ok) {
    if (append.error.code === "EXPECTED_VERSION_MISMATCH") {
      return thinkingErr("VERSION_MISMATCH", append.error.message, {
        current_version: append.error.current_version,
      });
    }
    return thinkingErr("STORE_ERROR", append.error.message);
  }
  const after = await loadGraph(ports.store, experience_id);
  if (!after.ok) return after;
  return thinkingOk({
    graph: after.value.graph,
    committed_version: append.value.committed_version,
    duplicate: append.value.duplicate,
    relation_id: proposal.relation_id,
  });
}

/** User-explicit repropose after reject (not automatic). */
export async function reproposeRelation(
  ports: RelationCommandPorts,
  input: { idempotency_key: string },
): Promise<ThinkingResult<RelationActionOutput>> {
  return proposeCanonicalRelation(ports, input);
}

/**
 * Accept + GraphCommitted in one atomic append (same expected_version).
 */
export async function acceptAndCommitRelation(
  ports: RelationCommandPorts,
  input: { relation_id: string; idempotency_key: string },
): Promise<ThinkingResult<RelationActionOutput>> {
  const experience_id = ports.experience_id ?? LIVE_EXPERIENCE_ID;
  const principal_id = ports.principal_id ?? LIVE_PRINCIPAL_ID;
  const state = await loadGraph(ports.store, experience_id);
  if (!state.ok) return state;

  const rel = state.value.graph.relations.find(
    (r) => r.relation_id === input.relation_id,
  );
  if (!rel) {
    return thinkingErr("RELATION_NOT_REVIEWED", "找不到关系");
  }
  // Duplicate accept when already accepted & fresh.
  if (
    rel.review_status === "accepted" &&
    !rel.stale &&
    state.value.graph.accepted_relation_ids.includes(input.relation_id)
  ) {
    return thinkingOk({
      graph: state.value.graph,
      committed_version: state.value.version,
      duplicate: true,
      relation_id: input.relation_id,
      graph_revision: state.value.graph.graph_revision,
    });
  }
  if (rel.review_status !== "proposed") {
    return thinkingErr(
      "RELATION_NOT_REVIEWED",
      "只能确认处于 proposed 状态的关系",
    );
  }
  if (rel.stale) {
    return thinkingErr("STALE_PROPOSAL", "关系依据已过期，请重新提议");
  }
  if (rel.evidence_refs.length === 0) {
    return thinkingErr("STALE_PROPOSAL", "缺少 evidence，无法确认");
  }
  if (rel.basis_revision !== state.value.graph.idea_basis_revision) {
    return thinkingErr("STALE_PROPOSAL", "basis_revision 与当前 Idea 不一致");
  }

  const nextGraphRev = state.value.graph.graph_revision + 1;
  const base = commonDraft(ports, experience_id, principal_id);
  const reviewed = await createDomainEventDraftBrowser({
    ...base,
    message_name: "reader_world.relation.reviewed.v1",
    message_id: ports.ids.nextId("msg"),
    payload: {
      relation_id: input.relation_id,
      decision: "accepted",
      corrections: null,
      basis_revision: rel.basis_revision,
    },
  });
  const committed = await createDomainEventDraftBrowser({
    ...base,
    message_name: "reader_world.graph.committed.v1",
    message_id: ports.ids.nextId("msg"),
    causation_id: reviewed.message_id,
    payload: {
      graph_revision: nextGraphRev,
      accepted_relation_ids: [input.relation_id],
      basis_graph_revision: state.value.graph.graph_revision,
    },
  });

  const append = await ports.store.append({
    experience_id,
    principal_id,
    idempotency_key: input.idempotency_key,
    expected_version: state.value.version,
    events: [asDomainEventDraft(reviewed), asDomainEventDraft(committed)],
  });
  if (!append.ok) {
    if (append.error.code === "EXPECTED_VERSION_MISMATCH") {
      return thinkingErr("VERSION_MISMATCH", append.error.message, {
        current_version: append.error.current_version,
      });
    }
    return thinkingErr("STORE_ERROR", append.error.message);
  }
  const after = await loadGraph(ports.store, experience_id);
  if (!after.ok) return after;
  return thinkingOk({
    graph: after.value.graph,
    committed_version: append.value.committed_version,
    duplicate: append.value.duplicate,
    relation_id: input.relation_id,
    graph_revision: nextGraphRev,
  });
}
