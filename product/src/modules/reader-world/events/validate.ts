import { isCanonicalUlid } from "./clock";
import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  isDomainEventName,
  schemaVersionForEventName,
} from "./names";
import type { DomainEventName } from "./names";
import type { DomainEvent, DomainEventDraft } from "./envelope";
import { payloadHash } from "./hash";
import { validateEventPayload } from "./payload-schema";
import {
  validateHlcShape,
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

type ValidatedEnvelope = {
  raw: Record<string, unknown>;
  messageName: DomainEventName;
  legacy: boolean;
};

function validateEnvelope(
  raw: unknown,
  options: { stored: boolean; allowLegacy: boolean },
): EventResult<ValidatedEnvelope> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("INVALID_ENVELOPE", "event must be an object");
  }
  const e = raw as Record<string, unknown>;
  const legacy = e.protocol_version === LEGACY_PROTOCOL_VERSION;

  const rootKeys = validateRootEnvelopeKeys(
    e,
    options.stored ? "stored" : "draft",
  );
  if (!rootKeys.ok) {
    return fail(
      rootKeys.error.code,
      rootKeys.error.message,
      rootKeys.error.details,
    );
  }

  if (legacy && !options.allowLegacy) {
    return fail(
      "INVALID_ENVELOPE",
      "protocol v1 is accepted only when loading stored history",
    );
  }
  if (!legacy && e.protocol_version !== PROTOCOL_VERSION) {
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
  if (!legacy && !isCanonicalUlid(e.message_id)) {
    return fail("INVALID_ENVELOPE", "message_id must be a canonical ULID", {
      message_id: e.message_id,
    });
  }
  if (!nonEmptyString(e.message_name) || !isDomainEventName(e.message_name)) {
    return fail("UNKNOWN_MESSAGE_NAME", "unknown or unfrozen message_name", {
      message_name: e.message_name,
    });
  }
  const messageName = e.message_name as DomainEventName;
  const expectedSchema = schemaVersionForEventName(messageName);
  if (e.schema_version !== expectedSchema) {
    return fail(
      "UNSUPPORTED_SCHEMA_VERSION",
      `message_name requires schema_version ${expectedSchema}`,
      { schema_version: e.schema_version, expected_schema_version: expectedSchema },
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
  const recordedAtMs = Date.parse(e.recorded_at);
  if (!Number.isSafeInteger(recordedAtMs) || recordedAtMs < 0) {
    return fail("INVALID_ENVELOPE", "recorded_at must be a valid RFC3339 timestamp");
  }

  if (!legacy) {
    const hlc = validateHlcShape(e.hlc);
    if (!hlc.ok) {
      return fail(hlc.error.code, hlc.error.message, hlc.error.details);
    }
    if (!nonEmptyString(e.device_id)) {
      return fail("INVALID_ENVELOPE", "device_id required");
    }
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

  if (e.payload_hash === undefined || e.payload_hash === null || e.payload_hash === "") {
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

  if (options.stored) {
    if (!Number.isSafeInteger(e.stream_version) || (e.stream_version as number) < 1) {
      return fail("INVALID_ENVELOPE", "stream_version must be a positive safe integer");
    }
    if (
      !Number.isSafeInteger(e.event_index_in_commit) ||
      (e.event_index_in_commit as number) < 0
    ) {
      return fail(
        "INVALID_ENVELOPE",
        "event_index_in_commit must be a non-negative safe integer",
      );
    }
  }

  return { ok: true, value: { raw: e, messageName, legacy } };
}

/**
 * Validate DomainEvent draft or stored event.
 * Exact allowlists on root / producer / security / payload keys → fail-closed.
 * payload_hash is required (no auto-fill).
 */
export function validateDomainEventDraft(
  raw: unknown,
): EventResult<DomainEventDraft> {
  const validated = validateEnvelope(raw, { stored: false, allowLegacy: false });
  if (!validated.ok) return validated;
  return { ok: true, value: validated.value.raw as unknown as DomainEventDraft };
}

export function validateStoredDomainEvent(
  raw: unknown,
): EventResult<DomainEvent> {
  const validated = validateEnvelope(raw, { stored: true, allowLegacy: true });
  if (!validated.ok) return validated;
  const e = validated.value.raw;
  if (!validated.value.legacy) {
    return { ok: true, value: e as unknown as DomainEvent };
  }

  const physicalMs = Date.parse(e.recorded_at as string);
  const logical =
    (e.stream_version as number) * 1_000 +
    (e.event_index_in_commit as number);
  if (!Number.isSafeInteger(logical) || logical < 0) {
    return fail("INVALID_ENVELOPE", "legacy HLC cannot be represented safely");
  }
  return {
    ok: true,
    value: {
      ...e,
      protocol_version: PROTOCOL_VERSION,
      hlc: { physical_ms: physicalMs, logical },
      device_id: "legacy-local",
    } as unknown as DomainEvent,
  };
}

/** Explicit name for adapter load paths. */
export const upcastStoredDomainEvent = validateStoredDomainEvent;
