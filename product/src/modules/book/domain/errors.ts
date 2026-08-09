/**
 * Fail-closed error codes for book ingestion / lookup.
 * Callers must not invent fallback SourceBlocks.
 */

export type BookErrorCode =
  | "source_unavailable"
  | "unknown_source"
  | "missing_locator"
  | "duplicate_locator"
  | "quote_hash_drift"
  | "invalid_manifest"
  | "fragment_not_found"
  | "invalid_fragment";

export class BookError extends Error {
  readonly code: BookErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: BookErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BookError";
    this.code = code;
    this.details = details;
  }
}

export type BookResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: BookError };

export function ok<T>(value: T): BookResult<T> {
  return { ok: true, value };
}

export function err(
  code: BookErrorCode,
  message: string,
  details?: Record<string, unknown>,
): BookResult<never> {
  return { ok: false, error: new BookError(code, message, details) };
}
