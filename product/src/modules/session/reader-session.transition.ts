/**
 * Sole public mutation path for ReaderSession (F26/F29).
 * Does NOT import node:crypto / hash (F29) — keep client bundles free of crypto-browserify.
 */
import { createActor, type SnapshotFrom } from "xstate";
import { readerSessionMachine } from "./reader-session.machine";
import {
  fingerprintContext,
  flattenStateValue,
  type ReaderSessionContext,
  type ReaderSessionEvent,
  type ReasonCode,
  type SessionStateValue,
  type SessionTransitionReceipt,
} from "./reader-session.types";

export type SessionSnapshot = SnapshotFrom<typeof readerSessionMachine>;

/**
 * Internal actor factory. Not re-exported from production barrel (F29).
 * App code uses ReaderSessionProvider; unit tests use test-harness.
 */
export function createSessionActor(input?: {
  experience_id?: string;
  source_snapshot_ids?: string[];
}) {
  const actor = createActor(readerSessionMachine);
  actor.start();
  if (input?.experience_id && input.source_snapshot_ids?.length) {
    safeAttemptTransition(actor, {
      type: "SET_SOURCE_SNAPSHOT",
      experience_id: input.experience_id,
      source_snapshot_ids: input.source_snapshot_ids,
    });
  }
  return actor;
}

export type SessionActor = ReturnType<typeof createSessionActor>;

function reject(
  actor: SessionActor,
  reason: ReasonCode,
): SessionTransitionReceipt {
  const snap = actor.getSnapshot();
  const state = flattenStateValue(snap.value);
  const ctx = snap.context;
  return {
    accepted: false,
    previous_state: state,
    current_state: state,
    reason_code: reason,
    requested_effects: [],
    context_fingerprint: fingerprintContext(ctx),
  };
}

/**
 * Pre-validate chronology / completion basis before any mutation (F26/F27).
 * Returns reject receipt or null to proceed.
 */
function precheck(
  actor: SessionActor,
  event: ReaderSessionEvent,
): SessionTransitionReceipt | null {
  const state = getSessionState(actor);
  const ctx = getSessionContext(actor);

  // --- Completions: always require basis match (F26) ---
  if (event.type === "VOICE_FINAL") {
    if (
      !event.correlation_id ||
      event.effect_generation === undefined ||
      event.effect_generation === null
    ) {
      return reject(actor, "MISSING_COMPLETION_BASIS");
    }
    if (state === "paused") return reject(actor, "STALE_COMPLETION");
    if (state !== "active.capturing_voice") {
      return reject(actor, "STALE_COMPLETION");
    }
    if (
      event.correlation_id !== ctx.correlation_id ||
      event.effect_generation !== ctx.effect_generation
    ) {
      return reject(actor, "STALE_COMPLETION");
    }
  }

  if (event.type === "EVIDENCE_READY") {
    if (
      !event.correlation_id ||
      event.effect_generation === undefined ||
      event.effect_generation === null
    ) {
      return reject(actor, "MISSING_COMPLETION_BASIS");
    }
    if (state === "paused") return reject(actor, "STALE_COMPLETION");
    if (state !== "active.playable") {
      return reject(actor, "STALE_COMPLETION");
    }
    if (
      event.correlation_id !== ctx.correlation_id ||
      event.effect_generation !== ctx.effect_generation
    ) {
      return reject(actor, "STALE_COMPLETION");
    }
  }

  if (event.type === "WORLD_READY") {
    if (state === "paused") return reject(actor, "STALE_COMPLETION");
    if (state !== "active.preparing_world") {
      return reject(actor, "STALE_COMPLETION");
    }
    if (
      event.correlation_id !== ctx.correlation_id ||
      event.graph_revision !== ctx.graph_revision ||
      event.effect_generation !== ctx.effect_generation
    ) {
      return reject(actor, "STALE_COMPLETION");
    }
  }

  // --- Chronology: relation → graph → gate (F27) ---
  if (event.type === "GRAPH_COMMITTED") {
    if (!ctx.relation_reviewed || !ctx.relation_id) {
      return reject(actor, "CHRONOLOGY_VIOLATION");
    }
    if (!event.accepted_relation_ids?.includes(ctx.relation_id)) {
      return reject(actor, "RELATION_BASIS_MISMATCH");
    }
    // graph_revision ladder is independent of idea_basis_revision (reading basis).
    // Only require non-decreasing graph commits within the session.
    if (
      ctx.graph_revision !== null &&
      event.graph_revision <= ctx.graph_revision
    ) {
      return reject(actor, "RELATION_BASIS_MISMATCH");
    }
    if (event.graph_revision < 1) {
      return reject(actor, "RELATION_BASIS_MISMATCH");
    }
  }

  if (event.type === "PLAYABILITY_PASSED") {
    if (!ctx.relation_reviewed) {
      return reject(actor, "CHRONOLOGY_VIOLATION");
    }
    if (!ctx.graph_committed || ctx.graph_revision === null) {
      return reject(actor, "CHRONOLOGY_VIOLATION");
    }
    if (event.graph_revision !== ctx.graph_revision) {
      return reject(actor, "GRAPH_REVISION_MISMATCH");
    }
    if (
      ctx.relation_id &&
      !ctx.accepted_relation_ids.includes(ctx.relation_id)
    ) {
      return reject(actor, "RELATION_BASIS_MISMATCH");
    }
  }

  if (event.type === "WORLD_OPEN_REQUESTED") {
    if (!ctx.relation_reviewed) return reject(actor, "RELATION_NOT_REVIEWED");
    if (!ctx.graph_committed || ctx.graph_revision === null) {
      return reject(actor, "GRAPH_NOT_COMMITTED");
    }
    if (!ctx.playability_passed) {
      return reject(actor, "PLAYABILITY_NOT_PASSED");
    }
    if (
      ctx.graph_revision !== event.graph_revision ||
      ctx.playability_graph_revision !== event.graph_revision
    ) {
      return reject(actor, "GRAPH_REVISION_MISMATCH");
    }
    if (
      !ctx.relation_id ||
      !ctx.accepted_relation_ids.includes(ctx.relation_id)
    ) {
      return reject(actor, "RELATION_BASIS_MISMATCH");
    }
  }

  if (event.type === "START_VOICE") {
    if (!ctx.source_snapshot_ready) return reject(actor, "SOURCE_NOT_READY");
  }

  if (event.type === "RESUME" && state !== "paused") {
    return reject(actor, "NOT_PAUSED");
  }

  if (event.type === "RETRY") {
    if (state !== "recoverable_error") {
      return reject(actor, "INVALID_TRANSITION");
    }
    if (!ctx.error) return reject(actor, "NO_ERROR");
    if (!ctx.error.retryable) return reject(actor, "NOT_RETRYABLE");
    if (ctx.error.basis_generation !== ctx.effect_generation) {
      return reject(actor, "STALE_RETRY");
    }
  }

  return null;
}

/**
 * Unique public transition entry (F26/F29).
 * Illegal / no-op events → typed reject, zero mutation.
 * Raw actor.send must not be used by app code — always go through this.
 */
export function safeAttemptTransition(
  actor: SessionActor,
  event: ReaderSessionEvent,
): SessionTransitionReceipt {
  const blocked = precheck(actor, event);
  if (blocked) return blocked;

  const prevSnap = actor.getSnapshot();
  const previous_state = flattenStateValue(prevSnap.value);
  const prevCtx = prevSnap.context;
  const prevFp = fingerprintContext(prevCtx);

  actor.send(event);

  const applied = actor.getSnapshot();
  const appliedState = flattenStateValue(applied.value);
  const appliedCtx = applied.context;
  const nextFp = fingerprintContext(appliedCtx);

  const stateChanged = previous_state !== appliedState;
  const contextChanged = JSON.stringify(prevFp) !== JSON.stringify(nextFp);
  const accepted = stateChanged || contextChanged;

  if (!accepted) {
    let reason: ReasonCode = "INVALID_TRANSITION";
    if (event.type === "START_VOICE" && !prevCtx.source_snapshot_ready) {
      reason = "SOURCE_NOT_READY";
    }
    return {
      accepted: false,
      previous_state,
      current_state: previous_state,
      reason_code: reason,
      requested_effects: [],
      context_fingerprint: prevFp,
    };
  }

  return {
    accepted: true,
    previous_state,
    current_state: appliedState,
    reason_code: appliedCtx.last_reason ?? "OK",
    requested_effects: [...appliedCtx.pending_effects],
    context_fingerprint: nextFp,
  };
}

/** @deprecated use safeAttemptTransition — kept for test alias clarity */
export const attemptTransition = safeAttemptTransition;

export function getSessionState(actor: SessionActor): SessionStateValue {
  return flattenStateValue(actor.getSnapshot().value);
}

export function getSessionContext(actor: SessionActor): ReaderSessionContext {
  return actor.getSnapshot().context;
}

export function getSessionFingerprint(actor: SessionActor) {
  return fingerprintContext(actor.getSnapshot().context);
}
