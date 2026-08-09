/**
 * T004 frozen ReaderSession contracts.
 * Machine orchestrates what is allowed; EventStore remains sole fact source.
 */

/** Leaf / compound state values exposed on data-session-state. */
export type SessionStateValue =
  | "active.reading"
  | "active.capturing_voice"
  | "active.reviewing_graph"
  | "active.preparing_world"
  | "active.playable"
  | "active.evidence"
  | "paused"
  | "recoverable_error";

export type ReasonCode =
  | "OK"
  | "SOURCE_NOT_READY"
  | "RELATION_NOT_REVIEWED"
  | "GRAPH_NOT_COMMITTED"
  | "PLAYABILITY_NOT_PASSED"
  | "GRAPH_REVISION_MISMATCH"
  | "CHRONOLOGY_VIOLATION"
  | "RELATION_BASIS_MISMATCH"
  | "STALE_COMPLETION"
  | "PAUSED"
  | "NOT_PAUSED"
  | "RESUME_REVISION_STALE"
  | "RESUME_REQUIRES_RESTART"
  | "NOT_RETRYABLE"
  | "STALE_RETRY"
  | "INVALID_TRANSITION"
  | "NO_ERROR"
  | "ALREADY_IN_STATE"
  | "MISSING_COMPLETION_BASIS";

export type SessionError = {
  code: string;
  message: string;
  retryable: boolean;
  /** effect_generation when error was raised (for stale retry guard). */
  basis_generation: number;
};

/** Requests external adapters may fulfill; machine never executes them. */
export type SessionEffectRequest =
  | { kind: "start_voice"; experience_id: string; correlation_id: string; generation: number }
  | { kind: "stop_voice"; experience_id: string; generation: number }
  | {
      kind: "prepare_world";
      experience_id: string;
      correlation_id: string;
      graph_revision: number;
      generation: number;
    }
  | { kind: "cancel_world"; experience_id: string; generation: number }
  | { kind: "cancel_all"; experience_id: string; generation: number };

export type ReaderSessionContext = {
  experience_id: string | null;
  /** Frozen source snapshot IDs only — never full SourceBlock bodies. */
  source_snapshot_ids: string[];
  source_snapshot_ready: boolean;
  correlation_id: string | null;
  /** Bumped on STOP / cancel / source switch so late completions become STALE. */
  effect_generation: number;
  relation_id: string | null;
  /** basis_revision from RELATION_REVIEWED — gates later commit/gate. */
  relation_basis_revision: number | null;
  relation_reviewed: boolean;
  graph_revision: number | null;
  graph_committed: boolean;
  accepted_relation_ids: string[];
  playability_passed: boolean;
  playability_graph_revision: number | null;
  world_id: string | null;
  world_revision: number | null;
  /** Graph revision the current world was prepared for. */
  world_basis_graph_revision: number | null;
  /** Serializable path of state before pause. */
  paused_from: SessionStateValue | null;
  error: SessionError | null;
  last_reason: ReasonCode;
  /** Pending effect requests emitted by last accepted transition. */
  pending_effects: SessionEffectRequest[];
};

export type ReaderSessionEvent =
  | {
      type: "SET_SOURCE_SNAPSHOT";
      experience_id: string;
      source_snapshot_ids: string[];
    }
  | { type: "START_VOICE" }
  | {
      type: "VOICE_FINAL";
      correlation_id: string;
      effect_generation: number;
    }
  | { type: "ENTER_REVIEWING_GRAPH" }
  | { type: "RELATION_REVIEWED"; relation_id: string; basis_revision: number }
  | {
      type: "GRAPH_COMMITTED";
      graph_revision: number;
      accepted_relation_ids: string[];
    }
  | { type: "PLAYABILITY_PASSED"; graph_revision: number }
  | { type: "WORLD_OPEN_REQUESTED"; graph_revision: number }
  | {
      type: "WORLD_READY";
      correlation_id: string;
      graph_revision: number;
      world_id: string;
      world_revision: number;
      effect_generation: number;
    }
  | {
      type: "EVIDENCE_READY";
      correlation_id: string;
      effect_generation: number;
    }
  | { type: "STOP" }
  | { type: "RESUME" }
  | {
      type: "SESSION_FAILED";
      code: string;
      message: string;
      retryable: boolean;
    }
  | { type: "RETRY" }
  | { type: "DISMISS" }
  | { type: "COLLAPSE" }
  /** T005: committed graph basis invalidated by Idea revision. */
  | { type: "GRAPH_BASIS_INVALIDATED" };

/** Full serializable session contract for receipts + deterministic replay. */
export type SessionContextFingerprint = {
  experience_id: string | null;
  source_snapshot_ids: string[];
  source_snapshot_ready: boolean;
  correlation_id: string | null;
  effect_generation: number;
  relation_id: string | null;
  relation_basis_revision: number | null;
  relation_reviewed: boolean;
  graph_revision: number | null;
  graph_committed: boolean;
  accepted_relation_ids: string[];
  playability_passed: boolean;
  playability_graph_revision: number | null;
  world_id: string | null;
  world_revision: number | null;
  world_basis_graph_revision: number | null;
  paused_from: SessionStateValue | null;
  error_code: string | null;
  error_retryable: boolean | null;
  error_basis_generation: number | null;
};

export type SessionTransitionReceipt = {
  accepted: boolean;
  previous_state: SessionStateValue;
  current_state: SessionStateValue;
  reason_code: ReasonCode;
  requested_effects: SessionEffectRequest[];
  context_fingerprint: SessionContextFingerprint;
};

export function initialSessionContext(): ReaderSessionContext {
  return {
    experience_id: null,
    source_snapshot_ids: [],
    source_snapshot_ready: false,
    correlation_id: null,
    effect_generation: 0,
    relation_id: null,
    relation_basis_revision: null,
    relation_reviewed: false,
    graph_revision: null,
    graph_committed: false,
    accepted_relation_ids: [],
    playability_passed: false,
    playability_graph_revision: null,
    world_id: null,
    world_revision: null,
    world_basis_graph_revision: null,
    paused_from: null,
    error: null,
    last_reason: "OK",
    pending_effects: [],
  };
}

/** Map XState state value object → dotted SessionStateValue. */
export function flattenStateValue(value: unknown): SessionStateValue {
  if (typeof value === "string") {
    if (value === "paused" || value === "recoverable_error") {
      return value;
    }
    return "active.reading";
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("active" in obj) {
      const leaf = obj.active;
      if (typeof leaf === "string") {
        return `active.${leaf}` as SessionStateValue;
      }
    }
    if ("paused" in obj) return "paused";
    if ("recoverable_error" in obj) return "recoverable_error";
  }
  return "active.reading";
}

/** World slot data-state derived from session snapshot. */
export function worldSlotStateFromSession(
  state: SessionStateValue,
): "closed" | "loading" | "open" {
  if (state === "active.preparing_world") return "loading";
  if (state === "active.playable" || state === "active.evidence") return "open";
  return "closed";
}

/** Full normalized context for acceptance + hash (F28). */
export function fingerprintContext(
  ctx: ReaderSessionContext,
): SessionContextFingerprint {
  return {
    experience_id: ctx.experience_id,
    source_snapshot_ids: [...ctx.source_snapshot_ids].sort(),
    source_snapshot_ready: ctx.source_snapshot_ready,
    correlation_id: ctx.correlation_id,
    effect_generation: ctx.effect_generation,
    relation_id: ctx.relation_id,
    relation_basis_revision: ctx.relation_basis_revision,
    relation_reviewed: ctx.relation_reviewed,
    graph_revision: ctx.graph_revision,
    graph_committed: ctx.graph_committed,
    accepted_relation_ids: [...ctx.accepted_relation_ids].sort(),
    playability_passed: ctx.playability_passed,
    playability_graph_revision: ctx.playability_graph_revision,
    world_id: ctx.world_id,
    world_revision: ctx.world_revision,
    world_basis_graph_revision: ctx.world_basis_graph_revision,
    paused_from: ctx.paused_from,
    error_code: ctx.error?.code ?? null,
    error_retryable: ctx.error?.retryable ?? null,
    error_basis_generation: ctx.error?.basis_generation ?? null,
  };
}

export function serializeSessionContract(
  state: SessionStateValue,
  ctx: ReaderSessionContext,
): string {
  return JSON.stringify({
    state,
    context: fingerprintContext(ctx),
  });
}
