export type ThinkingErrorCode =
  | "EMPTY_TEXT"
  | "EMPTY_INFERENCE"
  | "INVALID_SOURCE"
  | "SOURCE_EVIDENCE_DRIFT"
  | "SOURCE_EVIDENCE_CONFLICT"
  | "SOURCE_UNAVAILABLE"
  | "GUARDIAN_REJECT"
  | "STALE_CANDIDATE"
  | "THOUGHT_NOT_FOUND"
  | "IDEA_NOT_FOUND"
  | "VERSION_MISMATCH"
  | "IDEMPOTENCY_KEY_REUSED"
  | "STORE_ERROR"
  | "STALE_PROPOSAL"
  | "RELATION_NOT_REVIEWED"
  | "MISSING_IDEAS"
  | "ALREADY_EXISTS"
  | "INVALID_STATE";

export type ThinkingError = {
  code: ThinkingErrorCode;
  message: string;
  current_version?: number;
};

export type ThinkingResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ThinkingError };

export function thinkingOk<T>(value: T): ThinkingResult<T> {
  return { ok: true, value };
}

export function thinkingErr(
  code: ThinkingErrorCode,
  message: string,
  extra?: { current_version?: number },
): ThinkingResult<never> {
  return {
    ok: false,
    error: { code, message, ...extra },
  };
}
