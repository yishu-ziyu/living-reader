import { classifyIntent } from "@/modules/agent-os/guardian/intent";
import type { WorldCommand } from "@/modules/world";
import type {
  AgentTurnActionId,
  AgentTurnCandidate,
  AgentTurnDecision,
  AgentTurnDispatchReceipt,
  AgentTurnInput,
  AgentTurnPorts,
  AgentTurnProviderInput,
  PendingIntent,
  WorldBasis,
} from "./types";

const ACTIONS = new Set<AgentTurnActionId>([
  "deepen_specialization",
  "expand_market",
]);
const MODES = new Set<AgentTurnCandidate["mode"]>([
  "discuss",
  "clarify",
  "act",
  "stop",
]);
const CONFIDENCES = new Set<AgentTurnCandidate["confidence"]>([
  "high",
  "medium",
  "low",
  "unknown",
]);
const RELEVANCES = new Set<AgentTurnCandidate["relevance"]>([
  "directly_anchored",
  "mechanism_adjacent",
  "personal",
  "none",
  "unknown",
]);
const INTENT_CLASSES = new Set<NonNullable<AgentTurnCandidate["intent_class"]>>([
  "source_question",
  "executable_action",
  "productive_detour",
  "emotion_personal",
  "obvious_off_topic_noise",
]);
const INVALIDATING_DISPATCH_CODES = new Set<string>([
  "STALE",
  "UNSUPPORTED",
  "WORLD_NOT_READY",
  "WORLD_IDENTITY_MISMATCH",
  "GRAPH_REVISION_MISMATCH",
  "EXPECTED_WORLD_REVISION_MISMATCH",
  "RULESET_MISMATCH",
  "SEED_MISMATCH",
  "ACTION_UNSUPPORTED",
]);

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isBasis(value: unknown): value is WorldBasis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const basis = value as Record<string, unknown>;
  return (
    nonEmpty(basis.experience_id) &&
    nonEmpty(basis.world_id) &&
    nonEmpty(basis.ruleset_id) &&
    Number.isSafeInteger(basis.graph_revision) &&
    (basis.graph_revision as number) >= 0 &&
    Number.isSafeInteger(basis.world_revision) &&
    (basis.world_revision as number) >= 0
  );
}

function sameBasis(left: WorldBasis, right: WorldBasis): boolean {
  return (
    left.experience_id === right.experience_id &&
    left.world_id === right.world_id &&
    left.graph_revision === right.graph_revision &&
    left.world_revision === right.world_revision &&
    left.ruleset_id === right.ruleset_id
  );
}

function sameSourceIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function cloneBasis(basis: WorldBasis): WorldBasis {
  return { ...basis };
}

function clonePending(pending: PendingIntent): PendingIntent {
  return {
    ...pending,
    source_ids: [...pending.source_ids],
    basis: cloneBasis(pending.basis),
  };
}

function pendingMatchesInput(
  input: AgentTurnInput,
  pending: PendingIntent | null,
): pending is PendingIntent {
  if (!pending || !isBasis(pending.basis) || !ACTIONS.has(pending.action_id)) {
    return false;
  }
  return (
    isBasis(input.world_basis) &&
    nonEmpty(input.source_snapshot_id) &&
    input.active_source_ids.length > 0 &&
    pending.source_snapshot_id === input.source_snapshot_id &&
    sameSourceIds(pending.source_ids, input.active_source_ids) &&
    sameBasis(pending.basis, input.world_basis)
  );
}

function parseCandidate(raw: unknown): AgentTurnCandidate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const allowed = new Set([
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
    "reason_codes",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  if (typeof value.mode !== "string" || !MODES.has(value.mode as AgentTurnCandidate["mode"])) {
    return null;
  }
  if (
    typeof value.relevance !== "string" ||
    !RELEVANCES.has(value.relevance as AgentTurnCandidate["relevance"])
  ) {
    return null;
  }
  if (
    typeof value.confidence !== "string" ||
    !CONFIDENCES.has(value.confidence as AgentTurnCandidate["confidence"])
  ) {
    return null;
  }
  if (
    value.intent_class !== undefined &&
    (typeof value.intent_class !== "string" ||
      !INTENT_CLASSES.has(value.intent_class as NonNullable<AgentTurnCandidate["intent_class"]>))
  ) {
    return null;
  }
  if (
    !stringArray(value.target_source_ids) ||
    !stringArray(value.evidence_refs) ||
    !stringArray(value.reason_codes) ||
    !nonEmpty(value.companion_line)
  ) {
    return null;
  }
  if (
    value.open_question !== undefined &&
    typeof value.open_question !== "string"
  ) {
    return null;
  }
  if (
    value.proposed_action_id !== undefined &&
    (typeof value.proposed_action_id !== "string" ||
      !ACTIONS.has(value.proposed_action_id as AgentTurnActionId))
  ) {
    return null;
  }
  if (
    value.pending_action_id !== undefined &&
    (typeof value.pending_action_id !== "string" ||
      !ACTIONS.has(value.pending_action_id as AgentTurnActionId))
  ) {
    return null;
  }
  return {
    mode: value.mode as AgentTurnCandidate["mode"],
    intent_class: value.intent_class as AgentTurnCandidate["intent_class"],
    relevance: value.relevance as AgentTurnCandidate["relevance"],
    confidence: value.confidence as AgentTurnCandidate["confidence"],
    target_source_ids: [...value.target_source_ids],
    evidence_refs: [...value.evidence_refs],
    open_question: value.open_question as string | undefined,
    companion_line: value.companion_line.trim(),
    proposed_action_id: value.proposed_action_id as AgentTurnActionId | undefined,
    pending_action_id: value.pending_action_id as AgentTurnActionId | undefined,
    reason_codes: [...value.reason_codes],
  };
}

function candidateMatchesSource(
  candidate: AgentTurnCandidate,
  input: AgentTurnInput,
): boolean {
  return (
    candidate.target_source_ids.length > 0 &&
    candidate.target_source_ids.every((id) => input.active_source_ids.includes(id))
  );
}

function makePending(
  action_id: AgentTurnActionId,
  input: AgentTurnInput,
): PendingIntent | null {
  if (!isBasis(input.world_basis) || !nonEmpty(input.source_snapshot_id)) return null;
  if (input.active_source_ids.length === 0) return null;
  return {
    action_id,
    topic_key:
      action_id === "expand_market" ? "market_access" : "specialization_depth",
    origin_turn_id: input.turn_id,
    source_snapshot_id: input.source_snapshot_id,
    source_ids: [...input.active_source_ids],
    basis: cloneBasis(input.world_basis),
  };
}

function providerInput(
  input: AgentTurnInput,
  pending_intent: PendingIntent | null,
): AgentTurnProviderInput {
  return {
    turn_id: input.turn_id,
    channel: input.channel,
    final_text: input.final_text.trim(),
    source_snapshot_id: input.source_snapshot_id,
    active_source_ids: [...input.active_source_ids],
    world_basis: isBasis(input.world_basis) ? cloneBasis(input.world_basis) : null,
    recent_turns: input.recent_turns.slice(-4).map((turn) => ({ ...turn })),
    pending_intent: pending_intent ? clonePending(pending_intent) : null,
  };
}

function decision(
  mode: AgentTurnDecision["mode"],
  companion_line: string,
  pending_intent_next: PendingIntent | null,
  candidate: AgentTurnCandidate | null = null,
  command: WorldCommand | null = null,
  dispatch_receipt: AgentTurnDispatchReceipt | null = null,
  idempotency_key: string | null = null,
): AgentTurnDecision {
  return {
    mode,
    companion_line,
    pending_intent_next,
    candidate,
    command,
    dispatch_receipt,
    idempotency_key,
    zero_world_mutation: !newWorldMutation(dispatch_receipt),
  };
}

function committedWorldAction(receipt: AgentTurnDispatchReceipt): boolean {
  return (
    receipt.ok &&
    receipt.committed &&
    receipt.world_revision !== null &&
    receipt.event_count > 0
  );
}

function newWorldMutation(receipt: AgentTurnDispatchReceipt | null): boolean {
  return Boolean(receipt && committedWorldAction(receipt) && !receipt.duplicate);
}

/** Stable but non-authoritative; no provider/client key is accepted. */
export function deriveWorldActionIdempotencyKey(
  turn_id: string,
  action_id: AgentTurnActionId,
  basis: WorldBasis,
): string {
  return `agent-turn:${JSON.stringify([
    turn_id,
    action_id,
    basis.experience_id,
    basis.world_id,
    basis.graph_revision,
    basis.world_revision,
    basis.ruleset_id,
  ])}`;
}

function commandFor(action: AgentTurnActionId, basis: WorldBasis): WorldCommand {
  return {
    action,
    experience_id: basis.experience_id,
    world_id: basis.world_id,
    graph_revision: basis.graph_revision,
    expected_world_revision: basis.world_revision,
    ruleset_id: basis.ruleset_id,
  };
}

function receiptLooksValid(value: unknown): value is AgentTurnDispatchReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  return (
    typeof receipt.ok === "boolean" &&
    typeof receipt.committed === "boolean" &&
    typeof receipt.duplicate === "boolean" &&
    typeof receipt.code === "string" &&
    (receipt.world_revision === null || Number.isSafeInteger(receipt.world_revision)) &&
    Number.isSafeInteger(receipt.event_count) &&
    (receipt.event_count as number) >= 0
  );
}

function clearsPendingAfterFailure(receipt: AgentTurnDispatchReceipt): boolean {
  return INVALIDATING_DISPATCH_CODES.has(receipt.code);
}

function isExplicitStopOrRefusal(input: AgentTurnInput): boolean {
  if (input.explicit_control === "stop" || input.explicit_control === "refuse") {
    return true;
  }
  const control = classifyIntent(input.final_text);
  return control.intent === "explicit_stop" || control.intent === "decline_return";
}

function isLowConfidenceVoice(input: AgentTurnInput): boolean {
  return (
    input.channel === "voice" &&
    input.asr_confidence !== undefined &&
    (!Number.isFinite(input.asr_confidence) || input.asr_confidence < 0.7)
  );
}

function shouldClearForCandidate(candidate: AgentTurnCandidate): boolean {
  return (
    candidate.relevance === "none" ||
    candidate.intent_class === "obvious_off_topic_noise"
  );
}

/**
 * One normalized semantic turn. The provider proposes only; this harness owns
 * source/basis validation, pending lifecycle, allowlist commands and idempotency.
 */
export async function handleAgentTurn(
  input: AgentTurnInput,
  ports: AgentTurnPorts,
): Promise<AgentTurnDecision> {
  const currentPending = pendingMatchesInput(input, input.pending_intent)
    ? clonePending(input.pending_intent)
    : null;

  if (isExplicitStopOrRefusal(input)) {
    return decision("stop", "好的，先停在这里。", null);
  }

  if (!input.final_text.trim()) {
    return decision("clarify", "我还没接到完整一句，世界先不动。", currentPending);
  }

  if (isLowConfidenceVoice(input)) {
    return decision("clarify", "我还没听清，世界先不动。", currentPending);
  }

  let candidate: AgentTurnCandidate | null;
  try {
    candidate = parseCandidate(await ports.provider.decide(providerInput(input, currentPending)));
  } catch {
    return decision("clarify", "刚才没接稳，世界先不动。", currentPending);
  }

  if (!candidate) {
    return decision("clarify", "刚才没接稳，世界先不动。", currentPending);
  }

  if (candidate.confidence === "low" || candidate.confidence === "unknown") {
    return decision("clarify", "这一步还没接稳，世界先不动。", currentPending, candidate);
  }

  if (candidate.mode === "stop") {
    return decision("stop", "好的，先停在这里。", null, candidate);
  }

  if (candidate.mode !== "act") {
    if (
      candidate.mode === "discuss" &&
      candidate.pending_action_id &&
      candidateMatchesSource(candidate, input)
    ) {
      const next = makePending(candidate.pending_action_id, input);
      if (next) return decision("discuss", candidate.companion_line, next, candidate);
    }
    return decision(
      candidate.mode,
      candidate.companion_line,
      shouldClearForCandidate(candidate) ? null : currentPending,
      candidate,
    );
  }

  if (
    candidate.confidence !== "high" ||
    candidate.intent_class !== "executable_action" ||
    !candidateMatchesSource(candidate, input) ||
    !isBasis(input.world_basis)
  ) {
    return decision("clarify", "这一步还没接稳，世界先不动。", currentPending, candidate);
  }

  const action = candidate.proposed_action_id ?? currentPending?.action_id;
  if (!action) {
    return decision("clarify", "修哪一步？我还没接上。", currentPending, candidate);
  }

  const pendingBeforeDispatch =
    currentPending &&
    candidate.proposed_action_id &&
    candidate.proposed_action_id !== currentPending.action_id
      ? null
      : currentPending;
  const command = commandFor(action, input.world_basis);
  const idempotency_key = deriveWorldActionIdempotencyKey(
    input.turn_id,
    action,
    input.world_basis,
  );

  let dispatch_receipt: AgentTurnDispatchReceipt;
  try {
    const receipt = await ports.dispatch({
      turn_id: input.turn_id,
      command,
      idempotency_key,
    });
    if (!receiptLooksValid(receipt)) {
      return decision(
        "clarify",
        "这一步还没落下，世界先不动。",
        pendingBeforeDispatch,
        candidate,
        command,
        null,
        idempotency_key,
      );
    }
    dispatch_receipt = receipt;
  } catch {
    return decision(
      "clarify",
      "这一步还没落下，世界先不动。",
      pendingBeforeDispatch,
      candidate,
      command,
      null,
      idempotency_key,
    );
  }

  if (committedWorldAction(dispatch_receipt)) {
    return decision(
      "act",
      candidate.companion_line,
      null,
      candidate,
      command,
      dispatch_receipt,
      idempotency_key,
    );
  }

  return decision(
    "clarify",
    "这一步还没落下，世界先不动。",
    clearsPendingAfterFailure(dispatch_receipt) ? null : pendingBeforeDispatch,
    candidate,
    command,
    dispatch_receipt,
    idempotency_key,
  );
}
