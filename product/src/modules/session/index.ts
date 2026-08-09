/**
 * Production public session API (F29 sealed barrel).
 *
 * MUST NOT export:
 * - readerSessionMachine / createSessionActor / SessionActor (raw actor surface)
 * - sessionReplayHash / anything from reader-session.hash (node:crypto)
 * - reader-session.test-harness
 *
 * App mutations: ReaderSessionProvider.send → safeAttemptTransition only.
 * Unit tests: import from ./reader-session.test-harness
 */
export * from "./reader-session.types";
export * from "./reader-session.ports";
export {
  safeAttemptTransition,
  attemptTransition,
  getSessionState,
  getSessionContext,
  getSessionFingerprint,
} from "./reader-session.transition";
