import type { WorldCommand, WorldDecisionReceipt } from "@/modules/world";

export type InputChannel = "text" | "voice";

export type AgentTurnActionId =
  | "deepen_specialization"
  | "expand_market";

export type WorldBasis = {
  experience_id: string;
  world_id: string;
  graph_revision: number;
  world_revision: number;
  ruleset_id: string;
};

export type PendingIntent = {
  action_id: AgentTurnActionId;
  topic_key: "specialization_depth" | "market_access";
  origin_turn_id: string;
  source_snapshot_id: string;
  source_ids: readonly string[];
  basis: WorldBasis;
};

export type AgentTurnVisibleTurn = {
  turn_id: string;
  role: "reader" | "companion";
  visible_text: string;
};

/** Input is assembled from sealed source/world projections by the app layer. */
export type AgentTurnInput = {
  turn_id: string;
  channel: InputChannel;
  final_text: string;
  source_snapshot_id: string;
  active_source_ids: readonly string[];
  world_basis: WorldBasis | null;
  asr_confidence?: number;
  explicit_control?: "none" | "stop" | "refuse";
  recent_turns: readonly AgentTurnVisibleTurn[];
  pending_intent: PendingIntent | null;
};

export type IntentClass =
  | "source_question"
  | "executable_action"
  | "productive_detour"
  | "emotion_personal"
  | "obvious_off_topic_noise";

export type AgentTurnCandidate = {
  mode: "discuss" | "clarify" | "act" | "stop";
  intent_class?: IntentClass;
  relevance: "directly_anchored" | "mechanism_adjacent" | "personal" | "none" | "unknown";
  confidence: "high" | "medium" | "low" | "unknown";
  target_source_ids: readonly string[];
  evidence_refs: readonly string[];
  open_question?: string;
  /** Acknowledgement only; it is never treated as a committed completion claim. */
  companion_line: string;
  proposed_action_id?: AgentTurnActionId;
  pending_action_id?: AgentTurnActionId;
  reason_codes: readonly string[];
};

export type AgentTurnProviderInput = {
  turn_id: string;
  channel: InputChannel;
  final_text: string;
  source_snapshot_id: string;
  active_source_ids: readonly string[];
  world_basis: WorldBasis | null;
  recent_turns: readonly AgentTurnVisibleTurn[];
  pending_intent: PendingIntent | null;
};

export type AgentTurnProviderPort = {
  /** Exactly one semantic Candidate call for a non-control final turn. */
  decide: (input: AgentTurnProviderInput) => Promise<unknown>;
};

export type AgentTurnDispatchCode =
  | WorldDecisionReceipt["code"]
  | "STALE"
  | "UNSUPPORTED"
  | "TEMPORARY_FAILURE"
  | "COMMIT_FAILED";

/**
 * Application-layer receipt: the adapter owns Kernel + atomic EventStore append.
 * A Kernel decision alone is not a committed fact.
 */
export type AgentTurnDispatchReceipt = {
  ok: boolean;
  committed: boolean;
  duplicate: boolean;
  code: AgentTurnDispatchCode;
  world_revision: number | null;
  event_count: number;
};

export type AgentTurnDispatchPort = (request: {
  turn_id: string;
  command: WorldCommand;
  idempotency_key: string;
}) => Promise<AgentTurnDispatchReceipt>;

export type AgentTurnPorts = {
  provider: AgentTurnProviderPort;
  /** Must check the derived key before invoking the Kernel on a retry. */
  dispatch: AgentTurnDispatchPort;
};

export type AgentTurnDecision = {
  mode: "discuss" | "clarify" | "act" | "stop";
  candidate: AgentTurnCandidate | null;
  companion_line: string;
  pending_intent_next: PendingIntent | null;
  command: WorldCommand | null;
  dispatch_receipt: AgentTurnDispatchReceipt | null;
  idempotency_key: string | null;
  /** True means this turn has no committed world mutation. */
  zero_world_mutation: boolean;
};
