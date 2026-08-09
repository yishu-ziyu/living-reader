export type EventStoreErrorCode =
  | "INVALID_ENVELOPE"
  | "UNKNOWN_MESSAGE_NAME"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "PAYLOAD_HASH_MISMATCH"
  | "INVALID_PAYLOAD"
  | "EXPECTED_VERSION_MISMATCH"
  | "IDEMPOTENCY_KEY_REUSED"
  | "DUPLICATE_MESSAGE_ID"
  | "STORE_UNAVAILABLE"
  | "NOT_FOUND";

export class EventStoreError extends Error {
  readonly code: EventStoreErrorCode;
  readonly current_version?: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: EventStoreErrorCode,
    message: string,
    opts?: { current_version?: number; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "EventStoreError";
    this.code = code;
    this.current_version = opts?.current_version;
    this.details = opts?.details;
  }
}

export type StoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: EventStoreError };

export function storeOk<T>(value: T): StoreResult<T> {
  return { ok: true, value };
}

export function storeErr(
  code: EventStoreErrorCode,
  message: string,
  opts?: { current_version?: number; details?: Record<string, unknown> },
): StoreResult<never> {
  return { ok: false, error: new EventStoreError(code, message, opts) };
}
