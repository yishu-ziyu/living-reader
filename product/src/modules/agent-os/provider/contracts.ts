import type {
  AgentTurnActionId,
  AgentTurnCandidate,
  AgentTurnProviderInput,
  AgentTurnVisibleTurn,
  InvitationBasis,
  PendingIntent,
  RelationshipContext,
  RelationshipMemory,
  WorldBasis,
} from "@/modules/agent-os/turn";

export const AGENT_TURN_MAX_REQUEST_BYTES = 64 * 1024;
export const AGENT_TURN_MAX_RESPONSE_BYTES = 24 * 1024;
export const AGENT_TURN_MAX_FINAL_TEXT_LENGTH = 4_000;
export const AGENT_TURN_MAX_VISIBLE_TURN_LENGTH = 1_000;
export const AGENT_TURN_MAX_COMPANION_LINE_LENGTH = 240;
/** source_id (200) + `:` + content_hash (200), matching VoiceSourceSnapshot bounds. */
export const AGENT_TURN_MAX_SOURCE_SNAPSHOT_ID_LENGTH = 401;

const ACTION_IDS = new Set<AgentTurnActionId>([
  "deepen_specialization",
  "expand_market",
]);
const MODES = new Set<AgentTurnCandidate["mode"]>([
  "discuss",
  "clarify",
  "act",
  "stop",
  "invite_world",
]);
const INTENT_CLASSES = new Set<NonNullable<AgentTurnCandidate["intent_class"]>>([
  "source_question",
  "executable_action",
  "productive_detour",
  "emotion_personal",
  "obvious_off_topic_noise",
]);
const RELEVANCES = new Set<AgentTurnCandidate["relevance"]>([
  "directly_anchored",
  "mechanism_adjacent",
  "personal",
  "none",
  "unknown",
]);
const CONFIDENCES = new Set<AgentTurnCandidate["confidence"]>([
  "high",
  "medium",
  "low",
  "unknown",
]);
const TOPIC_KEYS = new Set<PendingIntent["topic_key"]>([
  "specialization_depth",
  "market_access",
]);
const MEMORY_KINDS = new Set<RelationshipMemory["kind"]>([
  "read_position",
  "confusion",
  "discussion_theme",
  "idea_ref",
]);
const MEMORY_ORIGINS = new Set<RelationshipMemory["origin"]>([
  "reader_confirmed",
  "agent_observed",
]);

const PROVIDER_INPUT_KEYS = new Set([
  "turn_id",
  "channel",
  "final_text",
  "source_snapshot_id",
  "active_source_ids",
  "world_basis",
  "invitation_basis",
  "recent_turns",
  "pending_intent",
  "invited_question_keys",
  "relationship_context",
]);
const PROVIDER_REQUIRED_INPUT_KEYS = new Set(
  [...PROVIDER_INPUT_KEYS].filter((key) => key !== "relationship_context"),
);
const CANDIDATE_KEYS = new Set([
  "mode",
  "intent_class",
  "relevance",
  "confidence",
  "target_source_ids",
  "evidence_refs",
  "open_question",
  "companion_line",
  "proposed_action_id",
  "pending_action_id",
  "recipe_id",
  "trigger_question",
  "reason",
  "reason_codes",
]);
const PENDING_KEYS = new Set([
  "action_id",
  "topic_key",
  "origin_turn_id",
  "source_snapshot_id",
  "source_ids",
  "basis",
]);
const BASIS_KEYS = new Set([
  "experience_id",
  "world_id",
  "graph_revision",
  "world_revision",
  "ruleset_id",
]);
const INVITATION_BASIS_KEYS = new Set([
  "experience_id",
  "graph_revision",
  "relation_id",
  "relation_basis_revision",
  "accepted_relation_ids",
  "source_snapshot_id",
]);
const RELATIONSHIP_CONTEXT_KEYS = new Set([
  "current_chapter_id",
  "memories",
  "active_recipe_ids",
  "invited_question_keys",
]);
const RELATIONSHIP_MEMORY_KEYS = new Set([
  "memory_id",
  "kind",
  "origin",
  "text",
  "source_locator",
  "reader_idea_id",
]);

export type AgentTurnProviderErrorCode =
  | "agent_turn_cross_origin_forbidden"
  | "agent_turn_invalid_request"
  | "agent_turn_source_unavailable"
  | "agent_turn_source_stale"
  | "agent_turn_not_configured"
  | "agent_turn_provider_unavailable"
  | "agent_turn_provider_rejected"
  | "agent_turn_invalid_response"
  | "agent_turn_internal_error";

const ERROR_CODES = new Set<AgentTurnProviderErrorCode>([
  "agent_turn_cross_origin_forbidden",
  "agent_turn_invalid_request",
  "agent_turn_source_unavailable",
  "agent_turn_source_stale",
  "agent_turn_not_configured",
  "agent_turn_provider_unavailable",
  "agent_turn_provider_rejected",
  "agent_turn_invalid_response",
  "agent_turn_internal_error",
]);

/** Typed, user-safe failure. Callers must leave the world unchanged. */
export class AgentTurnProviderError extends Error {
  constructor(
    readonly code: AgentTurnProviderErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AgentTurnProviderError";
  }
}

export function isAgentTurnProviderErrorCode(
  value: unknown,
): value is AgentTurnProviderErrorCode {
  return typeof value === "string" && ERROR_CODES.has(value as AgentTurnProviderErrorCode);
}

export type VerifiedAgentTurnSource = Readonly<{
  source_id: string;
  edition_id: string;
  content_hash: string;
  title: string;
  quote: string;
}>;

/**
 * A turn's source identity must carry the sealed content version, not merely
 * the active SourceBlock id. Both text and final-voice ingress use this helper.
 */
export function deriveAgentTurnSourceSnapshotId(
  sourceId: string,
  contentHash: string,
): string {
  return `${sourceId}:${contentHash}`;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: UnknownRecord, allowed: ReadonlySet<string>): boolean {
  return Object.keys(record).every((key) => allowed.has(key));
}

function hasEveryKey(record: UnknownRecord, required: ReadonlySet<string>): boolean {
  return [...required].every((key) =>
    Object.prototype.hasOwnProperty.call(record, key),
  );
}

function boundedString(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function boundedOriginalString(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    return null;
  }
  return value;
}

function optionalString(
  value: unknown,
  maxLength: number,
): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  return boundedString(value, maxLength);
}

function parseBoundedStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
  requireItem: boolean,
): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  if (requireItem && value.length === 0) return null;
  const parsed = value.map((item) => boundedString(item, maxLength));
  if (parsed.some((item) => item === null)) return null;
  const strings = parsed as string[];
  return new Set(strings).size === strings.length ? strings : null;
}

function parseBasis(value: unknown): WorldBasis | null {
  if (!isRecord(value) || !hasOnlyKeys(value, BASIS_KEYS)) return null;
  const experience_id = boundedString(value.experience_id, 200);
  const world_id = boundedString(value.world_id, 200);
  const ruleset_id = boundedString(value.ruleset_id, 200);
  if (
    !experience_id ||
    !world_id ||
    !ruleset_id ||
    !Number.isSafeInteger(value.graph_revision) ||
    (value.graph_revision as number) < 0 ||
    !Number.isSafeInteger(value.world_revision) ||
    (value.world_revision as number) < 0
  ) {
    return null;
  }
  return {
    experience_id,
    world_id,
    graph_revision: value.graph_revision as number,
    world_revision: value.world_revision as number,
    ruleset_id,
  };
}

function parseInvitationBasis(value: unknown): InvitationBasis | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, INVITATION_BASIS_KEYS) ||
    !hasEveryKey(value, INVITATION_BASIS_KEYS)
  ) {
    return null;
  }
  const experience_id = boundedString(value.experience_id, 200);
  const relation_id = boundedString(value.relation_id, 200);
  const source_snapshot_id = boundedString(
    value.source_snapshot_id,
    AGENT_TURN_MAX_SOURCE_SNAPSHOT_ID_LENGTH,
  );
  const accepted_relation_ids = parseBoundedStringArray(
    value.accepted_relation_ids,
    32,
    200,
    false,
  );
  if (
    !experience_id ||
    !relation_id ||
    !source_snapshot_id ||
    !accepted_relation_ids ||
    !Number.isSafeInteger(value.graph_revision) ||
    (value.graph_revision as number) < 0 ||
    !Number.isSafeInteger(value.relation_basis_revision) ||
    (value.relation_basis_revision as number) < 0
  ) {
    return null;
  }
  return {
    experience_id,
    graph_revision: value.graph_revision as number,
    relation_id,
    relation_basis_revision: value.relation_basis_revision as number,
    accepted_relation_ids,
    source_snapshot_id,
  };
}

function parseNullableBoundedString(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === null) return null;
  return boundedString(value, maxLength) ?? undefined;
}

function parseRelationshipMemory(value: unknown): RelationshipMemory | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, RELATIONSHIP_MEMORY_KEYS) ||
    !hasEveryKey(value, RELATIONSHIP_MEMORY_KEYS)
  ) {
    return null;
  }
  const memory_id = boundedString(value.memory_id, 200);
  const text = boundedOriginalString(value.text, 240);
  const source_locator = parseNullableBoundedString(value.source_locator, 400);
  const reader_idea_id = parseNullableBoundedString(value.reader_idea_id, 200);
  if (
    !memory_id ||
    !text ||
    typeof value.kind !== "string" ||
    !MEMORY_KINDS.has(value.kind as RelationshipMemory["kind"]) ||
    typeof value.origin !== "string" ||
    !MEMORY_ORIGINS.has(value.origin as RelationshipMemory["origin"]) ||
    source_locator === undefined ||
    reader_idea_id === undefined
  ) {
    return null;
  }
  return {
    memory_id,
    kind: value.kind as RelationshipMemory["kind"],
    origin: value.origin as RelationshipMemory["origin"],
    text,
    source_locator,
    reader_idea_id,
  };
}

function parseRelationshipContext(value: unknown): RelationshipContext | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, RELATIONSHIP_CONTEXT_KEYS) ||
    !hasEveryKey(value, RELATIONSHIP_CONTEXT_KEYS)
  ) {
    return null;
  }
  const current_chapter_id = parseNullableBoundedString(
    value.current_chapter_id,
    200,
  );
  if (!Array.isArray(value.memories) || value.memories.length > 12) return null;
  const memories = value.memories.map(parseRelationshipMemory);
  const active_recipe_ids = parseBoundedStringArray(
    value.active_recipe_ids,
    32,
    200,
    false,
  );
  const invited_question_keys = parseBoundedStringArray(
    value.invited_question_keys,
    64,
    512,
    false,
  );
  if (
    current_chapter_id === undefined ||
    memories.some((memory) => memory === null) ||
    !active_recipe_ids ||
    !invited_question_keys
  ) {
    return null;
  }
  return {
    current_chapter_id,
    memories: memories as RelationshipMemory[],
    active_recipe_ids,
    invited_question_keys,
  };
}

function parseVisibleTurn(value: unknown): AgentTurnVisibleTurn | null {
  if (!isRecord(value) || !hasOnlyKeys(value, new Set(["turn_id", "role", "visible_text"]))) {
    return null;
  }
  const turn_id = boundedString(value.turn_id, 128);
  const visible_text = boundedString(
    value.visible_text,
    AGENT_TURN_MAX_VISIBLE_TURN_LENGTH,
  );
  if (
    !turn_id ||
    !visible_text ||
    (value.role !== "reader" && value.role !== "companion")
  ) {
    return null;
  }
  return { turn_id, role: value.role, visible_text };
}

function parsePendingIntent(value: unknown): PendingIntent | null {
  if (!isRecord(value) || !hasOnlyKeys(value, PENDING_KEYS)) return null;
  const action_id = value.action_id;
  const topic_key = value.topic_key;
  const origin_turn_id = boundedString(value.origin_turn_id, 128);
  const source_snapshot_id = boundedString(
    value.source_snapshot_id,
    AGENT_TURN_MAX_SOURCE_SNAPSHOT_ID_LENGTH,
  );
  const source_ids = parseBoundedStringArray(value.source_ids, 4, 200, true);
  const basis = parseBasis(value.basis);
  if (
    typeof action_id !== "string" ||
    !ACTION_IDS.has(action_id as AgentTurnActionId) ||
    typeof topic_key !== "string" ||
    !TOPIC_KEYS.has(topic_key as PendingIntent["topic_key"]) ||
    !origin_turn_id ||
    !source_snapshot_id ||
    !source_ids ||
    !basis
  ) {
    return null;
  }
  return {
    action_id: action_id as AgentTurnActionId,
    topic_key: topic_key as PendingIntent["topic_key"],
    origin_turn_id,
    source_snapshot_id,
    source_ids,
    basis,
  };
}

/** Strict parse of the only object a browser adapter may send to this provider. */
export function parseAgentTurnProviderInput(
  value: unknown,
): AgentTurnProviderInput | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, PROVIDER_INPUT_KEYS) ||
    !hasEveryKey(value, PROVIDER_REQUIRED_INPUT_KEYS)
  ) {
    return null;
  }
  const turn_id = boundedString(value.turn_id, 128);
  const final_text = boundedString(value.final_text, AGENT_TURN_MAX_FINAL_TEXT_LENGTH);
  const source_snapshot_id = boundedString(
    value.source_snapshot_id,
    AGENT_TURN_MAX_SOURCE_SNAPSHOT_ID_LENGTH,
  );
  const active_source_ids = parseBoundedStringArray(
    value.active_source_ids,
    4,
    200,
    true,
  );
  const world_basis = value.world_basis === null ? null : parseBasis(value.world_basis);
  const invitation_basis =
    value.invitation_basis === null
      ? null
      : parseInvitationBasis(value.invitation_basis);
  if (!Array.isArray(value.recent_turns) || value.recent_turns.length > 4) return null;
  const recent_turns = value.recent_turns.map(parseVisibleTurn);
  const pending_intent =
    value.pending_intent === null ? null : parsePendingIntent(value.pending_intent);
  const invited_question_keys = parseBoundedStringArray(
    value.invited_question_keys,
    64,
    512,
    false,
  );
  const relationship_context =
    value.relationship_context === undefined
      ? undefined
      : parseRelationshipContext(value.relationship_context);
  if (
    !turn_id ||
    !final_text ||
    !source_snapshot_id ||
    !active_source_ids ||
    (value.channel !== "text" && value.channel !== "voice") ||
    (value.world_basis !== null && !world_basis) ||
    (value.invitation_basis !== null && !invitation_basis) ||
    recent_turns.some((turn) => turn === null) ||
    (value.pending_intent !== null && !pending_intent) ||
    !invited_question_keys ||
    (value.relationship_context !== undefined && !relationship_context)
  ) {
    return null;
  }
  const turns = recent_turns as AgentTurnVisibleTurn[];
  if (new Set(turns.map((turn) => turn.turn_id)).size !== turns.length) return null;
  return {
    turn_id,
    channel: value.channel,
    final_text,
    source_snapshot_id,
    active_source_ids,
    world_basis,
    invitation_basis,
    recent_turns: turns,
    invited_question_keys,
    pending_intent,
    ...(relationship_context ? { relationship_context } : {}),
  };
}

function parseNullableEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T | undefined | null {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" && allowed.has(value as T)
    ? (value as T)
    : null;
}

/** Strict parse for a Candidate returned by the semantic runtime or same-origin route. */
export function parseAgentTurnCandidate(value: unknown): AgentTurnCandidate | null {
  if (!isRecord(value) || !hasOnlyKeys(value, CANDIDATE_KEYS)) return null;
  const mode = parseNullableEnum(value.mode, MODES);
  const intent_class = parseNullableEnum(value.intent_class, INTENT_CLASSES);
  const relevance = parseNullableEnum(value.relevance, RELEVANCES);
  const confidence = parseNullableEnum(value.confidence, CONFIDENCES);
  const target_source_ids = parseBoundedStringArray(
    value.target_source_ids,
    4,
    200,
    true,
  );
  const evidence_refs = parseBoundedStringArray(value.evidence_refs, 8, 200, false);
  const open_question = optionalString(value.open_question, 400);
  const companion_line = boundedString(
    value.companion_line,
    AGENT_TURN_MAX_COMPANION_LINE_LENGTH,
  );
  const proposed_action_id = parseNullableEnum(value.proposed_action_id, ACTION_IDS);
  const pending_action_id = parseNullableEnum(value.pending_action_id, ACTION_IDS);
  const recipe_id = optionalString(value.recipe_id, 200);
  const trigger_question = optionalString(value.trigger_question, 400);
  const reason = optionalString(value.reason, 400);
  const reason_codes = parseBoundedStringArray(value.reason_codes, 8, 80, true);
  if (
    !mode ||
    !relevance ||
    !confidence ||
    intent_class === null ||
    !target_source_ids ||
    !evidence_refs ||
    open_question === null ||
    !companion_line ||
    proposed_action_id === null ||
    pending_action_id === null ||
    recipe_id === null ||
    trigger_question === null ||
    reason === null ||
    !reason_codes
  ) {
    return null;
  }
  const isInvite = mode === "invite_world";
  if (
    isInvite !== Boolean(recipe_id && trigger_question && reason) ||
    (isInvite && (proposed_action_id || pending_action_id))
  ) {
    return null;
  }
  return {
    mode,
    ...(intent_class ? { intent_class } : {}),
    relevance,
    confidence,
    target_source_ids,
    evidence_refs,
    ...(open_question ? { open_question } : {}),
    companion_line,
    ...(proposed_action_id ? { proposed_action_id } : {}),
    ...(pending_action_id ? { pending_action_id } : {}),
    ...(recipe_id ? { recipe_id } : {}),
    ...(trigger_question ? { trigger_question } : {}),
    ...(reason ? { reason } : {}),
    reason_codes,
  };
}

/** OMP tool output must explicitly carry every nullable field. */
export function parseStrictAgentTurnCandidate(
  value: unknown,
): AgentTurnCandidate | null {
  if (!isRecord(value) || !hasEveryKey(value, CANDIDATE_KEYS)) return null;
  return parseAgentTurnCandidate(value);
}

export function sameWorldBasis(left: WorldBasis, right: WorldBasis): boolean {
  return (
    left.experience_id === right.experience_id &&
    left.world_id === right.world_id &&
    left.graph_revision === right.graph_revision &&
    left.world_revision === right.world_revision &&
    left.ruleset_id === right.ruleset_id
  );
}
