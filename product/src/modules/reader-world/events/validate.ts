import { PROTOCOL_VERSION, isDomainEventName } from "./names";
import type { DomainEventName } from "./names";
import type { DomainEvent, DomainEventDraft } from "./envelope";
import { payloadHash } from "./hash";
import { validateEventPayload } from "./payload-schema";
import {
  validateProducerShape,
  validateRootEnvelopeKeys,
  validateSecurityShape,
} from "./envelope-allowlist";

export type EventValidationErrorCode =
  | "INVALID_ENVELOPE"
  | "UNKNOWN_MESSAGE_NAME"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "PAYLOAD_HASH_MISMATCH"
  | "INVALID_PAYLOAD";

export class EventValidationError extends Error {
  readonly code: EventValidationErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: EventValidationErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EventValidationError";
    this.code = code;
    this.details = details;
  }
}

export type EventResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: EventValidationError };

function fail(
  code: EventValidationErrorCode,
  message: string,
  details?: Record<string, unknown>,
): EventResult<never> {
  return { ok: false, error: new EventValidationError(code, message, details) };
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Validate DomainEvent draft or stored event.
 * Exact allowlists on root / producer / security / payload keys → fail-closed.
 * payload_hash is required (no auto-fill).
 */
export function validateDomainEventDraft(
  raw: unknown,
): EventResult<DomainEventDraft> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("INVALID_ENVELOPE", "event must be an object");
  }
  const e = raw as Record<string, unknown>;

  // Exact root envelope allowlist first (blocks raw_audio, etc.)
  const rootKeys = validateRootEnvelopeKeys(e, "draft");
  if (!rootKeys.ok) {
    return fail(
      rootKeys.error.code,
      rootKeys.error.message,
      rootKeys.error.details,
    );
  }

  if (e.protocol_version !== PROTOCOL_VERSION) {
    return fail("INVALID_ENVELOPE", "protocol_version mismatch", {
      protocol_version: e.protocol_version,
    });
  }
  if (e.message_type !== "domain_event") {
    return fail("INVALID_ENVELOPE", "message_type must be domain_event");
  }
  if (!nonEmptyString(e.message_id)) {
    return fail("INVALID_ENVELOPE", "message_id required");
  }
  if (!nonEmptyString(e.message_name) || !isDomainEventName(e.message_name)) {
    return fail("UNKNOWN_MESSAGE_NAME", "unknown or unfrozen message_name", {
      message_name: e.message_name,
    });
  }
  const messageName = e.message_name as DomainEventName;

  if (e.schema_version !== 1) {
    return fail(
      "UNSUPPORTED_SCHEMA_VERSION",
      "only schema_version 1 is supported",
      { schema_version: e.schema_version },
    );
  }
  if (!nonEmptyString(e.experience_id)) {
    return fail("INVALID_ENVELOPE", "experience_id required");
  }
  if (!nonEmptyString(e.correlation_id)) {
    return fail("INVALID_ENVELOPE", "correlation_id required");
  }
  if (e.causation_id !== null && !nonEmptyString(e.causation_id)) {
    return fail("INVALID_ENVELOPE", "causation_id must be string or null");
  }
  if (!nonEmptyString(e.recorded_at)) {
    return fail("INVALID_ENVELOPE", "recorded_at required");
  }

  const producerCheck = validateProducerShape(e.producer);
  if (!producerCheck.ok) {
    return fail(
      producerCheck.error.code,
      producerCheck.error.message,
      producerCheck.error.details,
    );
  }

  const securityCheck = validateSecurityShape(e.security);
  if (!securityCheck.ok) {
    return fail(
      securityCheck.error.code,
      securityCheck.error.message,
      securityCheck.error.details,
    );
  }

  if (e.payload === null || typeof e.payload !== "object" || Array.isArray(e.payload)) {
    return fail("INVALID_PAYLOAD", "payload must be an object");
  }

  const payloadCheck = validateEventPayload(messageName, e.payload);
  if (!payloadCheck.ok) {
    return fail(
      payloadCheck.error.code,
      payloadCheck.error.message,
      payloadCheck.error.details,
    );
  }

  // payload_hash REQUIRED: missing → INVALID_ENVELOPE; present but wrong → PAYLOAD_HASH_MISMATCH
  if (
    e.payload_hash === undefined ||
    e.payload_hash === null ||
    e.payload_hash === ""
  ) {
    return fail("INVALID_ENVELOPE", "payload_hash required");
  }
  if (!nonEmptyString(e.payload_hash)) {
    return fail("INVALID_ENVELOPE", "payload_hash must be a non-empty string");
  }

  const expectedHash = payloadHash(e.payload);
  if (e.payload_hash !== expectedHash) {
    return fail("PAYLOAD_HASH_MISMATCH", "payload_hash does not match payload", {
      expectedHash,
      payload_hash: e.payload_hash,
    });
  }

  return {
    ok: true,
    value: e as unknown as DomainEventDraft,
  };
}

export function validateStoredDomainEvent(
  raw: unknown,
): EventResult<DomainEvent> {
  const draft = validateDomainEventDraft(raw);
  if (!draft.ok) return draft;
  const e = raw as Record<string, unknown>;
  if (typeof e.stream_version !== "number" || !Number.isInteger(e.stream_version)) {
    return fail("INVALID_ENVELOPE", "stream_version must be integer");
  }
  if (
    typeof e.event_index_in_commit !== "number" ||
    !Number.isInteger(e.event_index_in_commit)
  ) {
    return fail("INVALID_ENVELOPE", "event_index_in_commit must be integer");
  }
  return { ok: true, value: e as unknown as DomainEvent };
}
