import type { DomainEventName } from "./names";

/**
 * Strict per-message_name payload schema (fail-closed).
 * Extra unknown keys → INVALID_PAYLOAD so secrets cannot enter the store.
 */

export type PayloadSchemaError = {
  code: "INVALID_PAYLOAD";
  message: string;
  details?: Record<string, unknown>;
};

export type PayloadSchemaResult =
  | { ok: true }
  | { ok: false; error: PayloadSchemaError };

function fail(
  message: string,
  details?: Record<string, unknown>,
): PayloadSchemaResult {
  return { ok: false, error: { code: "INVALID_PAYLOAD", message, details } };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

/** Top-level allowlisted payload keys per frozen event (public debug + schema). */
export const PAYLOAD_ALLOWLIST: Record<DomainEventName, readonly string[]> = {
  "reader_world.reading_session.opened.v1": [
    "book_id",
    "book_revision",
    "initial_source_id",
    "scenario_id",
    "locale",
    "seed",
  ],
  "reader_world.reader_idea.proposed.v1": [
    "idea_id",
    "idea_kind",
    "text",
    "source_ids",
    "evidence_refs",
    "revision",
    "supersedes",
  ],
  "agent_os.book_thought.proposed.v1": [
    "thought_id",
    "thought_kind",
    "text",
    "source_ids",
    "evidence_refs",
    "confidence",
    "open_question",
    "revision",
    "supersedes",
  ],
  "reader_world.relation.proposed.v1": [
    "relation_id",
    "from_id",
    "to_id",
    "relation_type",
    "evidence_refs",
    "basis_revision",
  ],
  "reader_world.relation.reviewed.v1": [
    "relation_id",
    "decision",
    "corrections",
    "basis_revision",
  ],
  "reader_world.graph.committed.v1": [
    "graph_revision",
    "accepted_relation_ids",
    "basis_graph_revision",
  ],
  "reader_world.world.seeded.v1": [
    "world_id",
    "graph_revision",
    "seed",
    "ruleset_id",
  ],
  "reader_world.world.seeded.v2": [
    "world_id",
    "graph_revision",
    "seed",
    "ruleset_id",
    "recipe_id",
    "recipe_fingerprint",
    "normalized_parameters",
  ],
  "reader_world.world.event_recorded.v1": [
    "world_id",
    "world_revision",
    "event_kind",
    "summary",
    "actor_id",
    "metrics",
  ],
  "reader_world.memory.noted.v1": [
    "memory_id",
    "kind",
    "origin",
    "text",
    "source_locator",
    "reader_idea_id",
  ],
  "reader_world.memory.retired.v1": ["memory_id"],
};

function rejectUnknownKeys(
  payload: Record<string, unknown>,
  allowed: readonly string[],
): PayloadSchemaResult {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(payload).filter((k) => !allowedSet.has(k));
  if (unknown.length > 0) {
    return fail("payload contains unknown keys", { unknown });
  }
  return { ok: true };
}

function requireString(
  payload: Record<string, unknown>,
  key: string,
): PayloadSchemaResult {
  if (!isString(payload[key])) {
    return fail(`payload.${key} must be a string`, { key });
  }
  return { ok: true };
}

function requireNumber(
  payload: Record<string, unknown>,
  key: string,
): PayloadSchemaResult {
  if (!isNumber(payload[key])) {
    return fail(`payload.${key} must be a finite number`, { key });
  }
  return { ok: true };
}

function requireSafeInteger(
  payload: Record<string, unknown>,
  key: string,
): PayloadSchemaResult {
  if (!Number.isSafeInteger(payload[key])) {
    return fail(`payload.${key} must be a safe integer`, { key });
  }
  return { ok: true };
}

function requireStringArray(
  payload: Record<string, unknown>,
  key: string,
): PayloadSchemaResult {
  if (!isStringArray(payload[key])) {
    return fail(`payload.${key} must be string[]`, { key });
  }
  return { ok: true };
}

function requireStringOrNull(
  payload: Record<string, unknown>,
  key: string,
): PayloadSchemaResult {
  if (!isStringOrNull(payload[key])) {
    return fail(`payload.${key} must be string or null`, { key });
  }
  return { ok: true };
}

function optionalStringOrNull(
  payload: Record<string, unknown>,
  key: string,
): PayloadSchemaResult {
  if (!(key in payload)) return { ok: true };
  return requireStringOrNull(payload, key);
}

function optionalNumber(
  payload: Record<string, unknown>,
  key: string,
): PayloadSchemaResult {
  if (!(key in payload)) return { ok: true };
  return requireNumber(payload, key);
}

function chain(...results: PayloadSchemaResult[]): PayloadSchemaResult {
  for (const r of results) {
    if (!r.ok) return r;
  }
  return { ok: true };
}

function validateReadingSessionOpened(
  payload: Record<string, unknown>,
): PayloadSchemaResult {
  return chain(
    rejectUnknownKeys(
      payload,
      PAYLOAD_ALLOWLIST["reader_world.reading_session.opened.v1"],
    ),
    requireString(payload, "book_id"),
    requireString(payload, "book_revision"),
    requireString(payload, "initial_source_id"),
    requireString(payload, "scenario_id"),
    requireString(payload, "locale"),
    optionalNumber(payload, "seed"),
  );
}

function validateReaderIdeaProposed(
  payload: Record<string, unknown>,
): PayloadSchemaResult {
  return chain(
    rejectUnknownKeys(
      payload,
      PAYLOAD_ALLOWLIST["reader_world.reader_idea.proposed.v1"],
    ),
    requireString(payload, "idea_id"),
    requireString(payload, "idea_kind"),
    requireString(payload, "text"),
    requireStringArray(payload, "source_ids"),
    requireStringArray(payload, "evidence_refs"),
    requireNumber(payload, "revision"),
    requireStringOrNull(payload, "supersedes"),
  );
}

function validateBookThoughtProposed(
  payload: Record<string, unknown>,
): PayloadSchemaResult {
  return chain(
    rejectUnknownKeys(
      payload,
      PAYLOAD_ALLOWLIST["agent_os.book_thought.proposed.v1"],
    ),
    requireString(payload, "thought_id"),
    requireString(payload, "thought_kind"),
    requireString(payload, "text"),
    requireStringArray(payload, "source_ids"),
    requireStringArray(payload, "evidence_refs"),
    requireNumber(payload, "confidence"),
    optionalStringOrNull(payload, "open_question"),
    requireNumber(payload, "revision"),
    requireStringOrNull(payload, "supersedes"),
  );
}

function validateRelationProposed(
  payload: Record<string, unknown>,
): PayloadSchemaResult {
  return chain(
    rejectUnknownKeys(
      payload,
      PAYLOAD_ALLOWLIST["reader_world.relation.proposed.v1"],
    ),
    requireString(payload, "relation_id"),
    requireString(payload, "from_id"),
    requireString(payload, "to_id"),
    requireString(payload, "relation_type"),
    requireStringArray(payload, "evidence_refs"),
    requireNumber(payload, "basis_revision"),
  );
}

const RELATION_DECISIONS = new Set(["accepted", "rejected", "revised"]);

function validateRelationReviewed(
  payload: Record<string, unknown>,
): PayloadSchemaResult {
  const base = chain(
    rejectUnknownKeys(
      payload,
      PAYLOAD_ALLOWLIST["reader_world.relation.reviewed.v1"],
    ),
    requireString(payload, "relation_id"),
    requireNumber(payload, "basis_revision"),
    optionalStringOrNull(payload, "corrections"),
  );
  if (!base.ok) return base;
  if (
    !isString(payload.decision) ||
    !RELATION_DECISIONS.has(payload.decision)
  ) {
    return fail(
      "payload.decision must be accepted|rejected|revised",
      { decision: payload.decision },
    );
  }
  return { ok: true };
}

function validateGraphCommitted(
  payload: Record<string, unknown>,
): PayloadSchemaResult {
  return chain(
    rejectUnknownKeys(
      payload,
      PAYLOAD_ALLOWLIST["reader_world.graph.committed.v1"],
    ),
    requireNumber(payload, "graph_revision"),
    requireStringArray(payload, "accepted_relation_ids"),
    requireNumber(payload, "basis_graph_revision"),
  );
}

function validateWorldSeeded(
  payload: Record<string, unknown>,
): PayloadSchemaResult {
  return chain(
    rejectUnknownKeys(
      payload,
      PAYLOAD_ALLOWLIST["reader_world.world.seeded.v1"],
    ),
    requireString(payload, "world_id"),
    requireNumber(payload, "graph_revision"),
    requireNumber(payload, "seed"),
    requireString(payload, "ruleset_id"),
  );
}

function validateNormalizedParameters(value: unknown): PayloadSchemaResult {
  if (!isPlainObject(value)) {
    return fail("payload.normalized_parameters must be an object");
  }
  for (const [key, parameter] of Object.entries(value)) {
    if (!key.trim()) {
      return fail("payload.normalized_parameters keys must be non-empty");
    }
    const type = typeof parameter;
    if (
      type !== "string" &&
      type !== "boolean" &&
      !(type === "number" && Number.isFinite(parameter as number))
    ) {
      return fail(
        "payload.normalized_parameters values must be JSON-safe scalars",
        { key },
      );
    }
  }
  return { ok: true };
}

function validateWorldSeededV2(
  payload: Record<string, unknown>,
): PayloadSchemaResult {
  return chain(
    rejectUnknownKeys(
      payload,
      PAYLOAD_ALLOWLIST["reader_world.world.seeded.v2"],
    ),
    requireString(payload, "world_id"),
    requireSafeInteger(payload, "graph_revision"),
    requireSafeInteger(payload, "seed"),
    requireString(payload, "ruleset_id"),
    requireString(payload, "recipe_id"),
    requireString(payload, "recipe_fingerprint"),
    validateNormalizedParameters(payload.normalized_parameters),
  );
}

const MEMORY_KINDS = new Set([
  "read_position",
  "confusion",
  "discussion_theme",
  "idea_ref",
  "invitation_question",
]);
const MEMORY_ORIGINS = new Set(["reader_confirmed", "agent_observed"]);

function validateMemoryNoted(
  payload: Record<string, unknown>,
): PayloadSchemaResult {
  const base = chain(
    rejectUnknownKeys(
      payload,
      PAYLOAD_ALLOWLIST["reader_world.memory.noted.v1"],
    ),
    requireString(payload, "memory_id"),
    requireString(payload, "kind"),
    requireString(payload, "origin"),
    requireString(payload, "text"),
    requireStringOrNull(payload, "source_locator"),
    requireStringOrNull(payload, "reader_idea_id"),
  );
  if (!base.ok) return base;
  if (!MEMORY_KINDS.has(payload.kind as string)) {
    return fail(
      "payload.kind must be read_position|confusion|discussion_theme|idea_ref|invitation_question",
    );
  }
  if (!MEMORY_ORIGINS.has(payload.origin as string)) {
    return fail("payload.origin must be reader_confirmed|agent_observed");
  }
  const text = payload.text as string;
  if (!text.trim() || [...text].length > 240) {
    return fail("payload.text must be non-empty and at most 240 characters");
  }
  if (payload.kind === "idea_ref" && !payload.reader_idea_id) {
    return fail("idea_ref memory requires reader_idea_id");
  }
  if (payload.kind === "read_position" && !payload.source_locator) {
    return fail("read_position memory requires source_locator");
  }
  return { ok: true };
}

function validateMemoryRetired(
  payload: Record<string, unknown>,
): PayloadSchemaResult {
  return chain(
    rejectUnknownKeys(
      payload,
      PAYLOAD_ALLOWLIST["reader_world.memory.retired.v1"],
    ),
    requireString(payload, "memory_id"),
  );
}

/**
 * Frozen world metrics keys (storage + public debug).
 * Unknown keys (incl. secret aliases / case variants) → INVALID_PAYLOAD.
 * Values: primitive number|string|boolean only — no nested object/array.
 */
export const WORLD_METRICS_ALLOWLIST = [
  "demand",
  "supply",
  "score",
  "label",
  "quantity",
  "price",
  "inventory",
  "cash",
] as const;

export const PUBLIC_METRICS_ALLOWLIST = WORLD_METRICS_ALLOWLIST;

/** Case-insensitive forbidden metric key aliases (never stored or exported). */
const FORBIDDEN_METRIC_KEY_ALIASES = new Set(
  [
    "user_prompt",
    "provider_credential",
    "rawaudio",
    "raw_audio",
    "prompt",
    "credential",
    "credentials",
    "api_key",
    "token",
    "authentication_context",
    "system_prompt",
    "thinking",
    "chain_of_thought",
  ].map((s) => s.toLowerCase()),
);

const WORLD_METRICS_ALLOW_SET = new Set<string>(WORLD_METRICS_ALLOWLIST);

function validateMetrics(metrics: unknown): PayloadSchemaResult {
  if (!isPlainObject(metrics)) {
    return fail("payload.metrics must be an object");
  }

  const unknown: string[] = [];
  const forbidden: string[] = [];

  for (const [k, v] of Object.entries(metrics)) {
    const lower = k.toLowerCase();
    if (FORBIDDEN_METRIC_KEY_ALIASES.has(lower)) {
      forbidden.push(k);
      continue;
    }
    if (!WORLD_METRICS_ALLOW_SET.has(k)) {
      unknown.push(k);
      continue;
    }
    const t = typeof v;
    if (t !== "number" && t !== "string" && t !== "boolean") {
      return fail(
        "payload.metrics values must be number|string|boolean (no nested object/array)",
        { key: k, value_type: t },
      );
    }
    if (t === "number" && !Number.isFinite(v as number)) {
      return fail("payload.metrics numbers must be finite", { key: k });
    }
  }

  if (forbidden.length > 0) {
    return fail("payload.metrics contains forbidden secret aliases", {
      forbidden,
    });
  }
  if (unknown.length > 0) {
    return fail("payload.metrics contains unknown keys", {
      unknown,
      allowed: [...WORLD_METRICS_ALLOWLIST],
    });
  }
  return { ok: true };
}

function validateWorldEventRecorded(
  payload: Record<string, unknown>,
): PayloadSchemaResult {
  const base = chain(
    rejectUnknownKeys(
      payload,
      PAYLOAD_ALLOWLIST["reader_world.world.event_recorded.v1"],
    ),
    requireString(payload, "world_id"),
    requireNumber(payload, "world_revision"),
    requireString(payload, "event_kind"),
    requireString(payload, "summary"),
    optionalStringOrNull(payload, "actor_id"),
  );
  if (!base.ok) return base;
  if ("metrics" in payload) {
    return validateMetrics(payload.metrics);
  }
  return { ok: true };
}

const VALIDATORS: Record<
  DomainEventName,
  (payload: Record<string, unknown>) => PayloadSchemaResult
> = {
  "reader_world.reading_session.opened.v1": validateReadingSessionOpened,
  "reader_world.reader_idea.proposed.v1": validateReaderIdeaProposed,
  "agent_os.book_thought.proposed.v1": validateBookThoughtProposed,
  "reader_world.relation.proposed.v1": validateRelationProposed,
  "reader_world.relation.reviewed.v1": validateRelationReviewed,
  "reader_world.graph.committed.v1": validateGraphCommitted,
  "reader_world.world.seeded.v1": validateWorldSeeded,
  "reader_world.world.seeded.v2": validateWorldSeededV2,
  "reader_world.world.event_recorded.v1": validateWorldEventRecorded,
  "reader_world.memory.noted.v1": validateMemoryNoted,
  "reader_world.memory.retired.v1": validateMemoryRetired,
};

/** Strict payload schema check for a frozen message_name. */
export function validateEventPayload(
  messageName: DomainEventName,
  payload: unknown,
): PayloadSchemaResult {
  if (!isPlainObject(payload)) {
    return fail("payload must be an object");
  }
  return VALIDATORS[messageName](payload);
}

/**
 * Project payload onto the public allowlist for debug export.
 * Metrics: only WORLD_METRICS_ALLOWLIST keys with primitive values.
 */
export function projectPublicPayload(
  messageName: DomainEventName,
  payload: unknown,
): Record<string, unknown> {
  if (!isPlainObject(payload)) return {};
  const allowed = PAYLOAD_ALLOWLIST[messageName];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in payload)) continue;
    const value = payload[key];
    if (key === "metrics") {
      if (!isPlainObject(value)) continue;
      const metrics: Record<string, number | string | boolean> = {};
      for (const mk of PUBLIC_METRICS_ALLOWLIST) {
        if (!(mk in value)) continue;
        const mv = value[mk];
        const t = typeof mv;
        if (t === "number" && Number.isFinite(mv as number)) {
          metrics[mk] = mv as number;
        } else if (t === "string" || t === "boolean") {
          metrics[mk] = mv as string | boolean;
        }
      }
      out.metrics = metrics;
      continue;
    }
    out[key] = value;
  }
  return out;
}
