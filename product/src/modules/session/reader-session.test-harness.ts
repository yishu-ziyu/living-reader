/**
 * Test-only session harness (F29).
 * Unit / Node tests import from here — never from production barrel.
 * Do not import this module from client components or app router code.
 */
import {
  createSessionActor,
  getSessionContext,
  getSessionState,
  safeAttemptTransition,
  type SessionActor,
} from "./reader-session.transition";
import {
  hashReplaySequence,
  hashSessionContract,
} from "./reader-session.hash";
import type {
  ReaderSessionEvent,
  SessionTransitionReceipt,
} from "./reader-session.types";

export {
  createSessionActor,
  getSessionContext,
  getSessionState,
  safeAttemptTransition,
  type SessionActor,
};
export { readerSessionMachine } from "./reader-session.machine";

/** Final state/context contract hash (Node crypto). */
export function sessionReplayHash(actor: SessionActor): string {
  const snap = actor.getSnapshot();
  return hashSessionContract(
    getSessionState(actor),
    snap.context,
  );
}

/**
 * F28 whole-run hash: play events via safeAttemptTransition, collect receipts,
 * hash normalized receipts + final snapshot.
 */
export function replaySequenceHash(
  events: ReaderSessionEvent[],
  seed?: { experience_id?: string; source_snapshot_ids?: string[] },
): { hash: string; receipts: SessionTransitionReceipt[]; actor: SessionActor } {
  const actor = createSessionActor(seed);
  const receipts: SessionTransitionReceipt[] = [];
  for (const event of events) {
    receipts.push(safeAttemptTransition(actor, event));
  }
  const hash = hashReplaySequence(
    receipts,
    getSessionState(actor),
    getSessionContext(actor),
  );
  return { hash, receipts, actor };
}

export function hashFromReceiptsAndActor(
  receipts: SessionTransitionReceipt[],
  actor: SessionActor,
): string {
  return hashReplaySequence(
    receipts,
    getSessionState(actor),
    getSessionContext(actor),
  );
}
