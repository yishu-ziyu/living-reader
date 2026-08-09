/**
 * Node-only deterministic session hash (F28/F29).
 * Never import from client components or the production session barrel.
 */
import { createHash } from "node:crypto";
import type {
  ReaderSessionContext,
  SessionStateValue,
  SessionTransitionReceipt,
} from "./reader-session.types";
import {
  fingerprintContext,
  serializeSessionContract,
} from "./reader-session.types";

export function hashSessionContract(
  state: SessionStateValue,
  ctx: ReaderSessionContext,
): string {
  return createHash("sha256")
    .update(serializeSessionContract(state, ctx), "utf8")
    .digest("hex");
}

/** Stable JSON for one receipt (reason/effect/fingerprint all included). */
export function normalizeReceipt(r: SessionTransitionReceipt) {
  return {
    accepted: r.accepted,
    previous_state: r.previous_state,
    current_state: r.current_state,
    reason_code: r.reason_code,
    requested_effects: r.requested_effects,
    context_fingerprint: r.context_fingerprint,
  };
}

/**
 * F28: whole-run hash = normalized receipt sequence + final state/context.
 * Changing any receipt reason/effect/fingerprint or final snapshot changes the hash.
 */
export function hashReplaySequence(
  receipts: SessionTransitionReceipt[],
  finalState: SessionStateValue,
  finalCtx: ReaderSessionContext,
): string {
  const payload = JSON.stringify({
    receipts: receipts.map(normalizeReceipt),
    final: {
      state: finalState,
      context: fingerprintContext(finalCtx),
    },
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
