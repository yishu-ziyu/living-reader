import type { WorldMetrics, WorldState } from "./types";

/** Deep clone WorldState so input remains immutable after decide/evolve. */
export function cloneWorldState(state: WorldState): WorldState {
  return {
    experience_id: state.experience_id,
    world_id: state.world_id,
    graph_revision: state.graph_revision,
    world_revision: state.world_revision,
    ruleset_id: state.ruleset_id,
    seed: state.seed,
    phase: state.phase,
    metrics: cloneMetrics(state.metrics),
  };
}

export function cloneMetrics(m: WorldMetrics): WorldMetrics {
  return {
    output: m.output,
    stock: m.stock,
    reachable_orders: m.reachable_orders,
    cash: m.cash,
  };
}

export function metricsEqual(a: WorldMetrics, b: WorldMetrics): boolean {
  return (
    a.output === b.output &&
    a.stock === b.stock &&
    a.reachable_orders === b.reachable_orders &&
    a.cash === b.cash
  );
}

export function deepEqualState(a: WorldState, b: WorldState): boolean {
  return (
    a.experience_id === b.experience_id &&
    a.world_id === b.world_id &&
    a.graph_revision === b.graph_revision &&
    a.world_revision === b.world_revision &&
    a.ruleset_id === b.ruleset_id &&
    a.seed === b.seed &&
    a.phase === b.phase &&
    metricsEqual(a.metrics, b.metrics)
  );
}
