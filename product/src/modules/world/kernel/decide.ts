import {
  merchantExpandPredicate,
  shepherdExpandPredicate,
  spinnerExpandPredicate,
  weaverDeepenPredicate,
  weaverExpandPredicate,
} from "../actors/predicates";
import { selectLocalState } from "../actors/selectors";
import { cloneMetrics, cloneWorldState } from "../domain/clone";
import { compileWorldMetricsToEventMetrics } from "../domain/compile-metrics";
import { resolveCanonicalRuleset } from "../domain/frozen-ruleset";
import {
  EMPTY_WORLD_STATE,
  emptyBasis,
  parseKernelEnv,
  parseWorldCommand,
  parseWorldState,
} from "../domain/parse";
import {
  validateCausationSequence,
  validateKernelEventSpec,
  validateObservation,
} from "../domain/validate-spec";
import type {
  CharacterObservation,
  DecisionCode,
  KernelEnv,
  KernelEventSpec,
  WorldCommand,
  WorldDecisionReceipt,
  WorldState,
  WoolTownRuleset,
} from "../domain/types";
import { CANONICAL_ACTOR_ORDER } from "../domain/types";
import { evolve } from "./evolve";
import { checkGuards } from "./guards";

function basisOf(
  command: WorldCommand,
  env: KernelEnv,
): WorldDecisionReceipt["basis"] {
  return {
    action: command.action,
    experience_id: command.experience_id,
    world_id: command.world_id,
    graph_revision: command.graph_revision,
    expected_world_revision: command.expected_world_revision,
    ruleset_id: command.ruleset_id,
    seed: env.seed,
  };
}

function fail(
  state: WorldState,
  command: WorldCommand | null,
  env: KernelEnv | null,
  code: DecisionCode,
): WorldDecisionReceipt {
  return {
    ok: false,
    code,
    basis: command && env ? basisOf(command, env) : emptyBasis(command, env?.seed ?? 0),
    next_state: state ? cloneWorldState(state) : cloneWorldState(EMPTY_WORLD_STATE),
    events: [],
    observations: [],
  };
}

/**
 * Pure decide — never throws.
 * F42/F43/F44: parse → frozen ruleset → guards → action; all outputs validated.
 */
export function decide(
  stateRaw: unknown,
  commandRaw: unknown,
  envRaw: unknown,
): WorldDecisionReceipt {
  try {
    return decideInner(stateRaw, commandRaw, envRaw);
  } catch {
    return fail(EMPTY_WORLD_STATE, null, null, "INVALID_STATE");
  }
}

function decideInner(
  stateRaw: unknown,
  commandRaw: unknown,
  envRaw: unknown,
): WorldDecisionReceipt {
  const stateP = parseWorldState(stateRaw);
  if (!stateP.ok) {
    return fail(EMPTY_WORLD_STATE, null, null, stateP.code);
  }
  const state = stateP.value;
  const frozenInput = cloneWorldState(state);

  const cmdP = parseWorldCommand(commandRaw);
  if (!cmdP.ok) {
    return fail(frozenInput, null, null, cmdP.code);
  }
  const command = cmdP.value;

  const envP = parseKernelEnv(envRaw);
  if (!envP.ok) {
    return fail(frozenInput, command, null, envP.code);
  }
  const env = envP.value;

  const resolved = resolveCanonicalRuleset(
    command.ruleset_id,
    env.ruleset,
  );
  if (!resolved.ok) {
    return fail(frozenInput, command, env, "RULESET_MISMATCH");
  }
  // Also require state.ruleset_id matches frozen
  if (state.ruleset_id !== resolved.ruleset.ruleset_id) {
    return fail(frozenInput, command, env, "RULESET_MISMATCH");
  }

  const ruleset = resolved.ruleset;
  // Use env with frozen ruleset reference (ignore mutable body)
  const safeEnv: KernelEnv = { seed: env.seed, ruleset };

  const guard = checkGuards(state, command, safeEnv, ruleset);
  if (guard) {
    const r = fail(frozenInput, command, safeEnv, guard);
    // prove input immutability path
    return { ...r, next_state: cloneWorldState(frozenInput) };
  }

  if (command.action === "deepen_specialization") {
    return finalize(decideDeepen(state, command, safeEnv, ruleset), frozenInput);
  }
  if (command.action === "expand_market") {
    return finalize(decideExpand(state, command, safeEnv, ruleset), frozenInput);
  }
  return fail(frozenInput, command, safeEnv, "ACTION_UNSUPPORTED");
}

function finalize(
  receipt: WorldDecisionReceipt,
  frozenInput: WorldState,
): WorldDecisionReceipt {
  // Validate every event/observation; re-clone metrics (no shared alias)
  const events: KernelEventSpec[] = [];
  for (const e of receipt.events) {
    const v = validateKernelEventSpec(e);
    if (!v.ok) {
      return fail(frozenInput, null, null, "KERNEL_EVENT_SPEC_INVALID");
    }
    events.push(v.value);
  }
  const observations: CharacterObservation[] = [];
  for (const o of receipt.observations) {
    const v = validateObservation(o);
    if (!v.ok) {
      return fail(frozenInput, null, null, "KERNEL_EVENT_SPEC_INVALID");
    }
    observations.push(v.value);
  }
  if (
    !validateCausationSequence(events) ||
    !validateCausationSequence(observations)
  ) {
    return fail(frozenInput, null, null, "KERNEL_EVENT_SPEC_INVALID");
  }
  return {
    ...receipt,
    next_state: cloneWorldState(receipt.next_state),
    events,
    observations,
  };
}

function decideDeepen(
  state: WorldState,
  command: WorldCommand,
  env: KernelEnv,
  ruleset: WoolTownRuleset,
): WorldDecisionReceipt {
  const local = selectLocalState("weaver", state, ruleset);
  if (local.actor_id !== "weaver") {
    return fail(state, command, env, "KERNEL_EVENT_SPEC_INVALID");
  }
  const pred = weaverDeepenPredicate(local);
  const compiled = compileWorldMetricsToEventMetrics(state.metrics);

  if (!pred.evaluated) {
    const observation: CharacterObservation = {
      actor_id: "weaver",
      predicate_id: pred.predicate_id,
      evaluated: pred.evaluated,
      local_state: { ...local },
      action: pred.action,
      reason_code: pred.reason_code,
      causation_index: 0,
    };
    const event: KernelEventSpec = {
      event_kind: "character_refusal",
      actor_id: "weaver",
      summary: "小市场下织工拒绝进一步专业化：卖不完/无法换回所需品",
      metrics: compiled,
      causation_index: 0,
    };
    const evolved = evolve(state, [event], null);
    if (!evolved.ok) {
      return fail(state, command, env, evolved.code);
    }
    return {
      ok: true,
      code: "CHARACTER_REFUSAL",
      basis: basisOf(command, env),
      next_state: evolved.state,
      events: [event],
      observations: [observation],
    };
  }

  const observation: CharacterObservation = {
    actor_id: "weaver",
    predicate_id: pred.predicate_id,
    evaluated: true,
    local_state: { ...local },
    action: pred.action,
    reason_code: pred.reason_code,
    causation_index: 0,
  };
  const event: KernelEventSpec = {
    event_kind: "character_accept",
    actor_id: "weaver",
    summary: "织工接受进一步专业化",
    metrics: compiled,
    causation_index: 0,
  };
  const evolved = evolve(state, [event], null);
  if (!evolved.ok) {
    return fail(state, command, env, evolved.code);
  }
  return {
    ok: true,
    code: "OK",
    basis: basisOf(command, env),
    next_state: evolved.state,
    events: [event],
    observations: [observation],
  };
}

function decideExpand(
  state: WorldState,
  command: WorldCommand,
  env: KernelEnv,
  ruleset: WoolTownRuleset,
): WorldDecisionReceipt {
  const d = ruleset.expand_delta;
  const nextMetrics = {
    output: state.metrics.output + d.output,
    stock: state.metrics.stock + d.stock,
    reachable_orders: state.metrics.reachable_orders + d.reachable_orders,
    cash: state.metrics.cash + d.cash,
  };
  const compiled = compileWorldMetricsToEventMetrics(nextMetrics);

  const projected: WorldState = {
    ...cloneWorldState(state),
    metrics: cloneMetrics(nextMetrics),
  };

  // F43: always exact frozen actor tuple order — never env.ruleset.actor_ids
  const order = CANONICAL_ACTOR_ORDER;
  const events: KernelEventSpec[] = [];
  const observations: CharacterObservation[] = [];

  for (let i = 0; i < order.length; i++) {
    const actor_id = order[i]!;
    const local = selectLocalState(actor_id, projected, ruleset);
    const pred =
      local.actor_id === "merchant"
        ? merchantExpandPredicate(local)
        : local.actor_id === "shepherd"
          ? shepherdExpandPredicate(local)
          : local.actor_id === "spinner"
            ? spinnerExpandPredicate(local)
            : weaverExpandPredicate(local);

    observations.push({
      actor_id,
      predicate_id: pred.predicate_id,
      evaluated: pred.evaluated,
      local_state: { ...local },
      action: pred.action,
      reason_code: pred.reason_code,
      causation_index: i,
    });
    events.push({
      event_kind: "character_observation",
      actor_id,
      summary: `${actor_id}:${pred.action}:${pred.reason_code}`,
      metrics: compiled,
      causation_index: i,
    });
  }

  const evolved = evolve(state, events, nextMetrics);
  if (!evolved.ok) {
    return fail(state, command, env, evolved.code);
  }

  return {
    ok: true,
    code: "OK",
    basis: basisOf(command, env),
    next_state: evolved.state,
    events,
    observations,
  };
}
