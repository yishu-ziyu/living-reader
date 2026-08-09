import type {
  ActorLocalState,
  MerchantLocalState,
  ShepherdLocalState,
  SpinnerLocalState,
  WeaverLocalState,
} from "../domain/types";

export type PredicateResult = {
  predicate_id: string;
  evaluated: boolean;
  action: string;
  reason_code: string;
};

export function merchantExpandPredicate(
  local: MerchantLocalState,
): PredicateResult {
  const open = local.exchange_open === true || local.reachable_orders > 0;
  return {
    predicate_id: "merchant.expand_open",
    evaluated: open,
    action: open ? "ship" : "hold",
    reason_code: open ? "ORDERS_REACHABLE" : "NO_ORDERS",
  };
}

export function shepherdExpandPredicate(
  local: ShepherdLocalState,
): PredicateResult {
  const ok = local.stock > 0 || local.reachable_orders > 0;
  return {
    predicate_id: "shepherd.supply_chain",
    evaluated: ok,
    action: ok ? "gather" : "hold",
    reason_code: ok ? "RAW_WOOL_FLOW" : "WAITING_INPUT",
  };
}

export function spinnerExpandPredicate(
  local: SpinnerLocalState,
): PredicateResult {
  const ok = local.reachable_orders > 0;
  return {
    predicate_id: "spinner.capacity",
    evaluated: ok,
    action: ok ? "spin" : "hold",
    reason_code: ok ? "YARN_CAPACITY" : "WAITING_ORDERS",
  };
}

export function weaverDeepenPredicate(local: WeaverLocalState): PredicateResult {
  const need =
    local.minimum_orders_for_next_depth + local.outputs_pending;
  const canDeepen = local.reachable_orders >= need;
  if (!canDeepen) {
    return {
      predicate_id: "weaver.deepen_gate",
      evaluated: false,
      action: "refuse",
      reason_code: "CHARACTER_REFUSAL",
    };
  }
  return {
    predicate_id: "weaver.deepen_gate",
    evaluated: true,
    action: "accept",
    reason_code: "ORDERS_SUFFICIENT",
  };
}

export function weaverExpandPredicate(local: WeaverLocalState): PredicateResult {
  const need =
    local.minimum_orders_for_next_depth + local.outputs_pending;
  const ok = local.reachable_orders >= need;
  return {
    predicate_id: "weaver.market_observe",
    evaluated: ok,
    action: ok ? "weave" : "hold",
    reason_code: ok ? "ORDERS_SUFFICIENT" : "STILL_CONSTRAINED",
  };
}

export function recomputePredicate(
  predicate_id: string,
  local: ActorLocalState,
): PredicateResult {
  switch (predicate_id) {
    case "merchant.expand_open":
      if (local.actor_id !== "merchant") {
        return failPred(predicate_id);
      }
      return merchantExpandPredicate(local);
    case "shepherd.supply_chain":
      if (local.actor_id !== "shepherd") {
        return failPred(predicate_id);
      }
      return shepherdExpandPredicate(local);
    case "spinner.capacity":
      if (local.actor_id !== "spinner") {
        return failPred(predicate_id);
      }
      return spinnerExpandPredicate(local);
    case "weaver.deepen_gate":
      if (local.actor_id !== "weaver") {
        return failPred(predicate_id);
      }
      return weaverDeepenPredicate(local);
    case "weaver.market_observe":
      if (local.actor_id !== "weaver") {
        return failPred(predicate_id);
      }
      return weaverExpandPredicate(local);
    default:
      return failPred(predicate_id);
  }
}

function failPred(predicate_id: string): PredicateResult {
  return {
    predicate_id,
    evaluated: false,
    action: "unknown",
    reason_code: "UNKNOWN_PREDICATE",
  };
}
