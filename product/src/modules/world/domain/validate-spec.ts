import {
  KERNEL_COMPILED_METRIC_KEYS,
  type KernelCompiledMetricKey,
} from "./compile-metrics";
import { isFiniteNumber, isPlainObject, isSafeInteger } from "./safe";
import type {
  ActorId,
  ActorLocalState,
  CharacterObservation,
  KernelEventKind,
  KernelEventSpec,
} from "./types";
import { CANONICAL_ACTOR_ORDER } from "./types";

const ACTORS = new Set<string>(CANONICAL_ACTOR_ORDER);

const EVENT_KINDS = new Set<string>([
  "character_refusal",
  "character_accept",
  "character_observation",
]);

const SPEC_KEYS = new Set([
  "event_kind",
  "actor_id",
  "summary",
  "metrics",
  "causation_index",
]);

const COMPILED_METRIC_SET = new Set<string>(KERNEL_COMPILED_METRIC_KEYS);

/** Exact local_state keys per actor (F43/F44 rework). */
const LOCAL_KEYS: Record<ActorId, readonly string[]> = {
  merchant: ["actor_id", "reachable_orders", "exchange_open"],
  shepherd: ["actor_id", "stock", "reachable_orders"],
  spinner: ["actor_id", "reachable_orders"],
  weaver: [
    "actor_id",
    "reachable_orders",
    "minimum_orders_for_next_depth",
    "outputs_pending",
  ],
};

function validateLocalState(
  actor_id: ActorId,
  raw: unknown,
): { ok: true; value: ActorLocalState } | { ok: false; reason: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "local_state not plain object" };
  }
  const allowed = new Set(LOCAL_KEYS[actor_id]);
  for (const k of Object.keys(raw)) {
    if (!allowed.has(k)) {
      return { ok: false, reason: `local_state extra field: ${k}` };
    }
  }
  for (const k of LOCAL_KEYS[actor_id]) {
    if (!(k in raw)) {
      return { ok: false, reason: `local_state missing field: ${k}` };
    }
  }
  if (raw.actor_id !== actor_id) {
    return { ok: false, reason: "local_state.actor_id mismatch" };
  }

  if (actor_id === "merchant") {
    if (!isFiniteNumber(raw.reachable_orders)) {
      return { ok: false, reason: "reachable_orders not finite" };
    }
    if (typeof raw.exchange_open !== "boolean") {
      return { ok: false, reason: "exchange_open not boolean" };
    }
    return {
      ok: true,
      value: {
        actor_id: "merchant",
        reachable_orders: raw.reachable_orders,
        exchange_open: raw.exchange_open,
      },
    };
  }
  if (actor_id === "shepherd") {
    if (!isFiniteNumber(raw.stock) || !isFiniteNumber(raw.reachable_orders)) {
      return { ok: false, reason: "shepherd numbers not finite" };
    }
    return {
      ok: true,
      value: {
        actor_id: "shepherd",
        stock: raw.stock,
        reachable_orders: raw.reachable_orders,
      },
    };
  }
  if (actor_id === "spinner") {
    if (!isFiniteNumber(raw.reachable_orders)) {
      return { ok: false, reason: "reachable_orders not finite" };
    }
    return {
      ok: true,
      value: {
        actor_id: "spinner",
        reachable_orders: raw.reachable_orders,
      },
    };
  }
  // weaver
  if (
    !isFiniteNumber(raw.reachable_orders) ||
    !isFiniteNumber(raw.minimum_orders_for_next_depth) ||
    !isFiniteNumber(raw.outputs_pending)
  ) {
    return { ok: false, reason: "weaver numbers not finite" };
  }
  return {
    ok: true,
    value: {
      actor_id: "weaver",
      reachable_orders: raw.reachable_orders,
      minimum_orders_for_next_depth: raw.minimum_orders_for_next_depth,
      outputs_pending: raw.outputs_pending,
    },
  };
}

export function validateKernelEventSpec(
  spec: unknown,
): { ok: true; value: KernelEventSpec } | { ok: false; reason: string } {
  if (!isPlainObject(spec)) {
    return { ok: false, reason: "spec must be plain object" };
  }
  const o = spec;
  for (const k of Object.keys(o)) {
    if (!SPEC_KEYS.has(k)) {
      return { ok: false, reason: `unknown field: ${k}` };
    }
  }
  if (typeof o.event_kind !== "string" || !EVENT_KINDS.has(o.event_kind)) {
    return { ok: false, reason: "event_kind not allowlisted" };
  }
  if (o.actor_id !== null) {
    if (typeof o.actor_id !== "string" || !ACTORS.has(o.actor_id)) {
      return { ok: false, reason: "actor_id invalid" };
    }
  }
  if (typeof o.summary !== "string" || o.summary.length === 0) {
    return { ok: false, reason: "summary must be non-empty string" };
  }
  if (!isSafeInteger(o.causation_index) || (o.causation_index as number) < 0) {
    return {
      ok: false,
      reason: "causation_index must be non-negative safe integer",
    };
  }
  if (!isPlainObject(o.metrics)) {
    return { ok: false, reason: "metrics must be plain object" };
  }
  const metrics = o.metrics;
  for (const k of Object.keys(metrics)) {
    if (!COMPILED_METRIC_SET.has(k)) {
      return { ok: false, reason: `unknown/forbidden metric key: ${k}` };
    }
  }
  for (const k of KERNEL_COMPILED_METRIC_KEYS) {
    if (!(k in metrics)) {
      return { ok: false, reason: `missing metric key: ${k}` };
    }
    if (!isFiniteNumber(metrics[k])) {
      return { ok: false, reason: `metrics.${k} must be finite number` };
    }
  }

  return {
    ok: true,
    value: {
      event_kind: o.event_kind as KernelEventKind,
      actor_id: o.actor_id as ActorId | null,
      summary: o.summary,
      // fresh metrics object — no shared alias
      metrics: {
        supply: metrics.supply as number,
        inventory: metrics.inventory as number,
        demand: metrics.demand as number,
        cash: metrics.cash as number,
      },
      causation_index: o.causation_index as number,
    },
  };
}

export function validateObservation(
  obs: unknown,
): { ok: true; value: CharacterObservation } | { ok: false; reason: string } {
  if (!isPlainObject(obs)) {
    return { ok: false, reason: "observation must be plain object" };
  }
  const o = obs;
  const allowed = new Set([
    "actor_id",
    "predicate_id",
    "evaluated",
    "local_state",
    "action",
    "reason_code",
    "causation_index",
  ]);
  for (const k of Object.keys(o)) {
    if (!allowed.has(k)) {
      return { ok: false, reason: `unknown observation field: ${k}` };
    }
  }
  if (typeof o.actor_id !== "string" || !ACTORS.has(o.actor_id)) {
    return { ok: false, reason: "actor_id invalid" };
  }
  if (typeof o.predicate_id !== "string" || !o.predicate_id) {
    return { ok: false, reason: "predicate_id invalid" };
  }
  if (typeof o.evaluated !== "boolean") {
    return { ok: false, reason: "evaluated must be boolean" };
  }
  if (typeof o.action !== "string") {
    return { ok: false, reason: "action must be string" };
  }
  if (typeof o.reason_code !== "string") {
    return { ok: false, reason: "reason_code must be string" };
  }
  if (!isSafeInteger(o.causation_index) || (o.causation_index as number) < 0) {
    return {
      ok: false,
      reason: "causation_index must be non-negative safe integer",
    };
  }
  const ls = validateLocalState(o.actor_id as ActorId, o.local_state);
  if (!ls.ok) {
    return ls;
  }

  return {
    ok: true,
    value: {
      actor_id: o.actor_id as ActorId,
      predicate_id: o.predicate_id,
      evaluated: o.evaluated,
      local_state: ls.value,
      action: o.action,
      reason_code: o.reason_code,
      causation_index: o.causation_index as number,
    },
  };
}

/**
 * Receipt event list: causation indices must be continuous unique 0..n-1.
 */
export function validateCausationSequence(
  items: readonly { causation_index: number }[],
): boolean {
  if (items.length === 0) return true;
  const idxs = items.map((i) => i.causation_index).sort((a, b) => a - b);
  for (let i = 0; i < idxs.length; i++) {
    if (idxs[i] !== i) return false;
  }
  return new Set(idxs).size === idxs.length;
}

export type { KernelCompiledMetricKey };
