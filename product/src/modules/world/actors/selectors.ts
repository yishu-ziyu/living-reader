import type {
  ActorId,
  ActorLocalState,
  WorldState,
  WoolTownRuleset,
} from "../domain/types";

/**
 * F43: minimal local-state selectors.
 * Predicates never receive full WorldState or extra actor fields.
 */
export function selectLocalState(
  actor_id: ActorId,
  state: WorldState,
  ruleset: WoolTownRuleset,
): ActorLocalState {
  const m = state.metrics;
  switch (actor_id) {
    case "merchant":
      return {
        actor_id: "merchant",
        reachable_orders: m.reachable_orders,
        exchange_open: m.reachable_orders > 0,
      };
    case "shepherd":
      return {
        actor_id: "shepherd",
        stock: m.stock,
        reachable_orders: m.reachable_orders,
      };
    case "spinner":
      return {
        actor_id: "spinner",
        reachable_orders: m.reachable_orders,
      };
    case "weaver":
      return {
        actor_id: "weaver",
        reachable_orders: m.reachable_orders,
        minimum_orders_for_next_depth:
          ruleset.weaver_minimum_orders_for_next_depth,
        outputs_pending: ruleset.weaver_outputs_pending,
      };
    default: {
      const _exhaustive: never = actor_id;
      return _exhaustive;
    }
  }
}
