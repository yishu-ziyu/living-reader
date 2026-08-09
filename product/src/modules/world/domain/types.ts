/**
 * T008 pure WorldKernel contracts.
 * No EventStore / React / network / clock / random UUID.
 */

import { deepFreeze } from "./safe";

export type WorldActionId = "deepen_specialization" | "expand_market";

export type WorldPhase = "seeded" | "playable" | "closed";

/** Internal wool-town metrics — live only in fixture/ruleset. */
export type WorldMetrics = {
  output: number;
  stock: number;
  reachable_orders: number;
  cash: number;
};

/**
 * T003 WORLD_METRICS_ALLOWLIST-compatible metrics after explicit compile.
 * Mapping: output→supply, stock→inventory, reachable_orders→demand, cash→cash.
 */
export type CompiledWorldEventMetrics = {
  supply: number;
  inventory: number;
  demand: number;
  cash: number;
};

export type WorldIdentity = {
  experience_id: string;
  world_id: string;
  graph_revision: number;
  world_revision: number;
  ruleset_id: string;
  seed: number;
};

export type WorldState = WorldIdentity & {
  phase: WorldPhase;
  metrics: WorldMetrics;
};

export type WorldCommand = {
  action: string;
  experience_id: string;
  world_id: string;
  graph_revision: number;
  expected_world_revision: number;
  ruleset_id: string;
};

/** Frozen ruleset + seed only. No wall clock. */
export type KernelEnv = {
  ruleset: WoolTownRuleset;
  seed: number;
};

export type WoolTownRuleset = {
  ruleset_id: string;
  weaver_minimum_orders_for_next_depth: number;
  weaver_outputs_pending: number;
  expand_delta: WorldMetrics;
  actor_ids: readonly ActorId[];
};

export type ActorId = "merchant" | "shepherd" | "spinner" | "weaver";

/** Exact causal order for wool-town expand — runtime frozen. */
export const CANONICAL_ACTOR_ORDER: readonly ActorId[] = deepFreeze([
  "merchant",
  "shepherd",
  "spinner",
  "weaver",
] as ActorId[]);

/** Minimal local slices — predicates only see their own fields. */
export type MerchantLocalState = {
  actor_id: "merchant";
  reachable_orders: number;
  exchange_open: boolean;
};

export type ShepherdLocalState = {
  actor_id: "shepherd";
  stock: number;
  reachable_orders: number;
};

export type SpinnerLocalState = {
  actor_id: "spinner";
  reachable_orders: number;
};

export type WeaverLocalState = {
  actor_id: "weaver";
  reachable_orders: number;
  minimum_orders_for_next_depth: number;
  outputs_pending: number;
};

export type ActorLocalState =
  | MerchantLocalState
  | ShepherdLocalState
  | SpinnerLocalState
  | WeaverLocalState;

export type CharacterObservation = {
  actor_id: ActorId;
  predicate_id: string;
  evaluated: boolean;
  local_state: ActorLocalState;
  action: string;
  reason_code: string;
  causation_index: number;
};

export type KernelEventKind =
  | "character_refusal"
  | "character_accept"
  | "character_observation";

/**
 * Spec that T009 may compile into reader_world.world.event_recorded.v1.
 * metrics are already T003-allowlisted compiled keys.
 */
export type KernelEventSpec = {
  event_kind: KernelEventKind;
  actor_id: ActorId | null;
  summary: string;
  metrics: CompiledWorldEventMetrics;
  causation_index: number;
};

export type DecisionCode =
  | "OK"
  | "CHARACTER_REFUSAL"
  | "WORLD_NOT_READY"
  | "WORLD_IDENTITY_MISMATCH"
  | "GRAPH_REVISION_MISMATCH"
  | "EXPECTED_WORLD_REVISION_MISMATCH"
  | "RULESET_MISMATCH"
  | "ACTION_UNSUPPORTED"
  | "INVALID_STATE"
  | "INVALID_COMMAND"
  | "INVALID_ENV"
  | "SEED_MISMATCH"
  | "KERNEL_EVENT_SPEC_INVALID"
  | "INVALID_METRICS_PATCH";

export type WorldDecisionReceipt = {
  ok: boolean;
  code: DecisionCode;
  basis: {
    action: string;
    experience_id: string;
    world_id: string;
    graph_revision: number;
    expected_world_revision: number;
    ruleset_id: string;
    seed: number;
  };
  next_state: WorldState;
  events: KernelEventSpec[];
  observations: CharacterObservation[];
};

export type EvolveResult =
  | { ok: true; state: WorldState }
  | {
      ok: false;
      code: "KERNEL_EVENT_SPEC_INVALID" | "INVALID_METRICS_PATCH" | "INVALID_STATE";
      state: WorldState;
    };
