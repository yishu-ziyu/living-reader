/**
 * Exact field allowlists for DomainEvent envelope / producer / security.
 * Unknown keys → structured INVALID_ENVELOPE (fail-closed).
 * Shared by Node validate.ts and IndexedDB browser validator (no crypto).
 */

export type EnvelopeShapeError = {
  code: "INVALID_ENVELOPE";
  message: string;
  details?: Record<string, unknown>;
};

export type EnvelopeShapeResult =
  | { ok: true }
  | { ok: false; error: EnvelopeShapeError };

/** Draft envelope keys (before stream assignment). */
export const ROOT_ENVELOPE_DRAFT_KEYS = [
  "protocol_version",
  "message_id",
  "message_type",
  "message_name",
  "schema_version",
  "experience_id",
  "correlation_id",
  "causation_id",
  "recorded_at",
  "hlc",
  "device_id",
  "producer",
  "security",
  "payload_hash",
  "payload",
] as const;

/** Legacy rows never carried HLC/device metadata. */
export const ROOT_ENVELOPE_V1_DRAFT_KEYS = ROOT_ENVELOPE_DRAFT_KEYS.filter(
  (key) => key !== "hlc" && key !== "device_id",
);

/** Stored event may also carry stream fields. */
export const ROOT_ENVELOPE_STORED_KEYS = [
  ...ROOT_ENVELOPE_DRAFT_KEYS,
  "stream_version",
  "event_index_in_commit",
] as const;

export const ROOT_ENVELOPE_V1_STORED_KEYS = [
  ...ROOT_ENVELOPE_V1_DRAFT_KEYS,
  "stream_version",
  "event_index_in_commit",
] as const;

export const HLC_KEYS = ["physical_ms", "logical"] as const;

/** Producer: only module + instance. */
export const PRODUCER_KEYS = ["module", "instance"] as const;

/**
 * Security protocol fields.
 * authentication_context is optional opaque; never exported in debug traces.
 */
export const SECURITY_KEYS = [
  "principal_id",
  "authority",
  "integrity",
  "authentication_context",
] as const;

export const AUTHORITIES = new Set([
  "reader",
  "operator",
  "system",
  "external_data",
]);

export const INTEGRITIES = new Set(["local", "signed_remote"]);

function fail(
  message: string,
  details?: Record<string, unknown>,
): EnvelopeShapeResult {
  return {
    ok: false,
    error: { code: "INVALID_ENVELOPE", message, details },
  };
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function rejectUnknownObjectKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): EnvelopeShapeResult {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(obj).filter((k) => !allowedSet.has(k));
  if (unknown.length > 0) {
    return fail(`${path} contains unknown keys`, {
      path,
      unknown,
      allowed: [...allowed],
    });
  }
  return { ok: true };
}

export function validateProducerShape(
  producer: unknown,
): EnvelopeShapeResult {
  if (!producer || typeof producer !== "object" || Array.isArray(producer)) {
    return fail("producer required");
  }
  const p = producer as Record<string, unknown>;
  const keys = rejectUnknownObjectKeys(p, PRODUCER_KEYS, "producer");
  if (!keys.ok) return keys;
  if (!nonEmptyString(p.module)) {
    return fail("producer.module required");
  }
  if (!nonEmptyString(p.instance)) {
    return fail("producer.instance required");
  }
  return { ok: true };
}

export function validateSecurityShape(
  security: unknown,
): EnvelopeShapeResult {
  if (!security || typeof security !== "object" || Array.isArray(security)) {
    return fail("security required");
  }
  const s = security as Record<string, unknown>;
  const keys = rejectUnknownObjectKeys(s, SECURITY_KEYS, "security");
  if (!keys.ok) return keys;
  if (!nonEmptyString(s.principal_id)) {
    return fail("security.principal_id required");
  }
  if (!nonEmptyString(s.authority) || !AUTHORITIES.has(s.authority)) {
    return fail(
      "security.authority must be reader|operator|system|external_data",
      { authority: s.authority },
    );
  }
  if (!nonEmptyString(s.integrity) || !INTEGRITIES.has(s.integrity)) {
    return fail("security.integrity must be local|signed_remote", {
      integrity: s.integrity,
    });
  }
  if (
    "authentication_context" in s &&
    s.authentication_context !== undefined &&
    typeof s.authentication_context !== "string"
  ) {
    return fail("security.authentication_context must be a string when present");
  }
  return { ok: true };
}

/**
 * Reject unknown root envelope keys.
 * Draft mode excludes stream_version / event_index_in_commit unless present
 * is ok for stored validation path.
 */
export function validateRootEnvelopeKeys(
  raw: Record<string, unknown>,
  mode: "draft" | "stored" = "draft",
): EnvelopeShapeResult {
  const legacy = raw.protocol_version === "reader-world-protocol/v1";
  const allowed = legacy
    ? mode === "stored"
      ? ROOT_ENVELOPE_V1_STORED_KEYS
      : ROOT_ENVELOPE_V1_DRAFT_KEYS
    : mode === "stored"
      ? ROOT_ENVELOPE_STORED_KEYS
      : ROOT_ENVELOPE_DRAFT_KEYS;
  // Stored events may be validated as drafts first; allow stored keys always
  // when any stream field is present.
  const hasStream =
    "stream_version" in raw || "event_index_in_commit" in raw;
  const keys = hasStream
    ? legacy
      ? ROOT_ENVELOPE_V1_STORED_KEYS
      : ROOT_ENVELOPE_STORED_KEYS
    : allowed;
  return rejectUnknownObjectKeys(raw, keys, "envelope");
}

export function validateHlcShape(hlc: unknown): EnvelopeShapeResult {
  if (!hlc || typeof hlc !== "object" || Array.isArray(hlc)) {
    return fail("hlc required");
  }
  const value = hlc as Record<string, unknown>;
  const keys = rejectUnknownObjectKeys(value, HLC_KEYS, "hlc");
  if (!keys.ok) return keys;
  if (
    !Number.isSafeInteger(value.physical_ms) ||
    (value.physical_ms as number) < 0
  ) {
    return fail("hlc.physical_ms must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(value.logical) || (value.logical as number) < 0) {
    return fail("hlc.logical must be a non-negative safe integer");
  }
  return { ok: true };
}
