import { FROZEN_WOOL_TOWN_RULESET } from "../../domain/frozen-ruleset";
import type { KernelEnv, WorldMetrics, WorldState } from "../../domain/types";

export const WOOL_TOWN_RULESET_ID = "wool-town-v1" as const;

/** Baseline small market metrics (only in fixture/ruleset). */
export const WOOL_TOWN_BASELINE_METRICS: WorldMetrics = Object.freeze({
  output: 12,
  stock: 8,
  reachable_orders: 2,
  cash: 24,
});

/** After one expand_market on baseline. */
export const WOOL_TOWN_EXPANDED_METRICS: WorldMetrics = Object.freeze({
  output: 17,
  stock: 11,
  reachable_orders: 4,
  cash: 28,
});

/** Frozen canonical ruleset (same singleton as kernel resolves). */
export const WOOL_TOWN_RULESET = FROZEN_WOOL_TOWN_RULESET;

export type WoolTownSeedInput = {
  experience_id: string;
  world_id: string;
  graph_revision: number;
  seed?: number;
};

/** Build a playable small-market WorldState from fixture constants. */
export function createWoolTownBaseline(input: WoolTownSeedInput): WorldState {
  return {
    experience_id: input.experience_id,
    world_id: input.world_id,
    graph_revision: input.graph_revision,
    world_revision: 0,
    ruleset_id: WOOL_TOWN_RULESET_ID,
    seed: input.seed ?? 42,
    phase: "playable",
    metrics: { ...WOOL_TOWN_BASELINE_METRICS },
  };
}

export function woolTownEnv(seed = 42): KernelEnv {
  return {
    // Always the frozen singleton — mutation attempts no-op on frozen props
    ruleset: FROZEN_WOOL_TOWN_RULESET,
    seed,
  };
}
