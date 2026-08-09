import {
  isFiniteNumber,
  isNonEmptyString,
  isPlainObject,
  isSafeInteger,
} from "./safe";
import type {
  DecisionCode,
  KernelEnv,
  WorldCommand,
  WorldMetrics,
  WorldPhase,
  WorldState,
  WoolTownRuleset,
} from "./types";

export const EMPTY_WORLD_STATE: WorldState = {
  experience_id: "",
  world_id: "",
  graph_revision: 0,
  world_revision: 0,
  ruleset_id: "",
  seed: 0,
  phase: "closed",
  metrics: { output: 0, stock: 0, reachable_orders: 0, cash: 0 },
};

const PHASES = new Set<string>(["seeded", "playable", "closed"]);

const STATE_KEYS = new Set([
  "experience_id",
  "world_id",
  "graph_revision",
  "world_revision",
  "ruleset_id",
  "seed",
  "phase",
  "metrics",
]);

const METRIC_KEYS = ["output", "stock", "reachable_orders", "cash"] as const;

const COMMAND_KEYS = new Set([
  "action",
  "experience_id",
  "world_id",
  "graph_revision",
  "expected_world_revision",
  "ruleset_id",
]);

const ENV_KEYS = new Set(["ruleset", "seed"]);

const RULESET_KEYS = new Set([
  "ruleset_id",
  "weaver_minimum_orders_for_next_depth",
  "weaver_outputs_pending",
  "expand_delta",
  "actor_ids",
]);

function parseMetrics(
  raw: unknown,
): { ok: true; value: WorldMetrics } | { ok: false; reason: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "metrics not object" };
  }
  for (const k of Object.keys(raw)) {
    if (!(METRIC_KEYS as readonly string[]).includes(k)) {
      return { ok: false, reason: `unknown metrics key: ${k}` };
    }
  }
  for (const k of METRIC_KEYS) {
    if (!(k in raw) || !isFiniteNumber(raw[k])) {
      return { ok: false, reason: `metrics.${k} must be finite number` };
    }
  }
  return {
    ok: true,
    value: {
      output: raw.output as number,
      stock: raw.stock as number,
      reachable_orders: raw.reachable_orders as number,
      cash: raw.cash as number,
    },
  };
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: DecisionCode; reason: string };

/**
 * F42: strict WorldState parser — never throws.
 * revision/seed must be Number.isSafeInteger.
 */
export function parseWorldState(raw: unknown): ParseResult<WorldState> {
  if (raw === null || raw === undefined) {
    return { ok: false, code: "INVALID_STATE", reason: "state null/undefined" };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, code: "INVALID_STATE", reason: "state not plain object" };
  }
  for (const k of Object.keys(raw)) {
    if (!STATE_KEYS.has(k)) {
      return {
        ok: false,
        code: "INVALID_STATE",
        reason: `unknown state field: ${k}`,
      };
    }
  }
  if (!isNonEmptyString(raw.experience_id)) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "experience_id empty",
    };
  }
  if (!isNonEmptyString(raw.world_id)) {
    return { ok: false, code: "INVALID_STATE", reason: "world_id empty" };
  }
  if (!isNonEmptyString(raw.ruleset_id)) {
    return { ok: false, code: "INVALID_STATE", reason: "ruleset_id empty" };
  }
  if (!isSafeInteger(raw.graph_revision) || (raw.graph_revision as number) < 0) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "graph_revision must be non-negative safe integer",
    };
  }
  if (
    !isSafeInteger(raw.world_revision) ||
    (raw.world_revision as number) < 0
  ) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "world_revision must be non-negative safe integer",
    };
  }
  if (!isSafeInteger(raw.seed)) {
    return {
      ok: false,
      code: "INVALID_STATE",
      reason: "seed must be safe integer",
    };
  }
  if (typeof raw.phase !== "string" || !PHASES.has(raw.phase)) {
    return { ok: false, code: "INVALID_STATE", reason: "phase invalid" };
  }
  const metrics = parseMetrics(raw.metrics);
  if (!metrics.ok) {
    return { ok: false, code: "INVALID_STATE", reason: metrics.reason };
  }
  return {
    ok: true,
    value: {
      experience_id: raw.experience_id,
      world_id: raw.world_id,
      graph_revision: raw.graph_revision as number,
      world_revision: raw.world_revision as number,
      ruleset_id: raw.ruleset_id,
      seed: raw.seed as number,
      phase: raw.phase as WorldPhase,
      metrics: metrics.value,
    },
  };
}

export function parseWorldCommand(raw: unknown): ParseResult<WorldCommand> {
  if (raw === null || raw === undefined) {
    return {
      ok: false,
      code: "INVALID_COMMAND",
      reason: "command null/undefined",
    };
  }
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      code: "INVALID_COMMAND",
      reason: "command not plain object",
    };
  }
  for (const k of Object.keys(raw)) {
    if (!COMMAND_KEYS.has(k)) {
      return {
        ok: false,
        code: "INVALID_COMMAND",
        reason: `unknown command field: ${k}`,
      };
    }
  }
  if (typeof raw.action !== "string" || raw.action.length === 0) {
    return {
      ok: false,
      code: "INVALID_COMMAND",
      reason: "action must be non-empty string",
    };
  }
  if (!isNonEmptyString(raw.experience_id)) {
    return {
      ok: false,
      code: "INVALID_COMMAND",
      reason: "experience_id empty",
    };
  }
  if (!isNonEmptyString(raw.world_id)) {
    return { ok: false, code: "INVALID_COMMAND", reason: "world_id empty" };
  }
  if (!isNonEmptyString(raw.ruleset_id)) {
    return { ok: false, code: "INVALID_COMMAND", reason: "ruleset_id empty" };
  }
  if (
    !isSafeInteger(raw.graph_revision) ||
    (raw.graph_revision as number) < 0
  ) {
    return {
      ok: false,
      code: "INVALID_COMMAND",
      reason: "graph_revision must be non-negative safe integer",
    };
  }
  if (
    !isSafeInteger(raw.expected_world_revision) ||
    (raw.expected_world_revision as number) < 0
  ) {
    return {
      ok: false,
      code: "INVALID_COMMAND",
      reason: "expected_world_revision must be non-negative safe integer",
    };
  }
  return {
    ok: true,
    value: {
      action: raw.action,
      experience_id: raw.experience_id,
      world_id: raw.world_id,
      graph_revision: raw.graph_revision as number,
      expected_world_revision: raw.expected_world_revision as number,
      ruleset_id: raw.ruleset_id,
    },
  };
}

/**
 * Exact allowlist on ruleset root + nested expand_delta (F43 rework).
 */
export function parseRulesetShape(
  raw: unknown,
): { ok: true; value: WoolTownRuleset } | { ok: false; reason: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "ruleset not plain object" };
  }
  for (const k of Object.keys(raw)) {
    if (!RULESET_KEYS.has(k)) {
      return { ok: false, reason: `unknown ruleset field: ${k}` };
    }
  }
  for (const k of RULESET_KEYS) {
    if (!(k in raw)) {
      return { ok: false, reason: `missing ruleset field: ${k}` };
    }
  }
  if (!isNonEmptyString(raw.ruleset_id)) {
    return { ok: false, reason: "ruleset_id empty" };
  }
  if (!isSafeInteger(raw.weaver_minimum_orders_for_next_depth)) {
    return {
      ok: false,
      reason: "weaver_minimum_orders_for_next_depth not safe integer",
    };
  }
  if (!isSafeInteger(raw.weaver_outputs_pending)) {
    return { ok: false, reason: "weaver_outputs_pending not safe integer" };
  }
  const delta = parseMetrics(raw.expand_delta);
  if (!delta.ok) {
    return { ok: false, reason: `expand_delta: ${delta.reason}` };
  }
  if (!Array.isArray(raw.actor_ids)) {
    return { ok: false, reason: "actor_ids must be array" };
  }
  return {
    ok: true,
    value: {
      ruleset_id: raw.ruleset_id,
      weaver_minimum_orders_for_next_depth:
        raw.weaver_minimum_orders_for_next_depth as number,
      weaver_outputs_pending: raw.weaver_outputs_pending as number,
      expand_delta: delta.value,
      actor_ids: raw.actor_ids as WoolTownRuleset["actor_ids"],
    },
  };
}

export function parseKernelEnv(raw: unknown): ParseResult<KernelEnv> {
  if (raw === null || raw === undefined) {
    return { ok: false, code: "INVALID_ENV", reason: "env null/undefined" };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, code: "INVALID_ENV", reason: "env not plain object" };
  }
  for (const k of Object.keys(raw)) {
    if (!ENV_KEYS.has(k)) {
      return {
        ok: false,
        code: "INVALID_ENV",
        reason: `unknown env field: ${k}`,
      };
    }
  }
  if (!isSafeInteger(raw.seed)) {
    return {
      ok: false,
      code: "INVALID_ENV",
      reason: "seed must be safe integer",
    };
  }
  const rs = parseRulesetShape(raw.ruleset);
  if (!rs.ok) {
    return { ok: false, code: "INVALID_ENV", reason: rs.reason };
  }
  return {
    ok: true,
    value: {
      seed: raw.seed as number,
      ruleset: rs.value,
    },
  };
}

export function emptyBasis(
  command?: WorldCommand | null,
  seed = 0,
): {
  action: string;
  experience_id: string;
  world_id: string;
  graph_revision: number;
  expected_world_revision: number;
  ruleset_id: string;
  seed: number;
} {
  return {
    action: command?.action ?? "",
    experience_id: command?.experience_id ?? "",
    world_id: command?.world_id ?? "",
    graph_revision: command?.graph_revision ?? 0,
    expected_world_revision: command?.expected_world_revision ?? 0,
    ruleset_id: command?.ruleset_id ?? "",
    seed,
  };
}
