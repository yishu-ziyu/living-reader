import { cloneMetrics, cloneWorldState } from "../domain/clone";
import { EMPTY_WORLD_STATE, parseWorldState } from "../domain/parse";
import { isFiniteNumber, isPlainObject } from "../domain/safe";
import { validateKernelEventSpec } from "../domain/validate-spec";
import type {
  EvolveResult,
  KernelEventSpec,
  WorldMetrics,
  WorldState,
} from "../domain/types";

function isFiniteMetrics(m: WorldMetrics): boolean {
  return (
    isFiniteNumber(m.output) &&
    isFiniteNumber(m.stock) &&
    isFiniteNumber(m.reachable_orders) &&
    isFiniteNumber(m.cash)
  );
}

/**
 * Pure evolve — fail-closed, never throws.
 * evolve(null), evolve([] with bad state), evil events → typed result + EMPTY fallback.
 */
export function evolve(
  state: unknown,
  events: unknown,
  metricsPatch?: unknown,
): EvolveResult {
  try {
    return evolveInner(state, events, metricsPatch);
  } catch {
    return {
      ok: false,
      code: "INVALID_STATE",
      state: cloneWorldState(EMPTY_WORLD_STATE),
    };
  }
}

function evolveInner(
  state: unknown,
  events: unknown,
  metricsPatch?: unknown,
): EvolveResult {
  const parsed = parseWorldState(state);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "INVALID_STATE",
      state: cloneWorldState(EMPTY_WORLD_STATE),
    };
  }
  const base = cloneWorldState(parsed.value);

  if (!Array.isArray(events)) {
    return { ok: false, code: "KERNEL_EVENT_SPEC_INVALID", state: base };
  }

  for (const e of events) {
    const v = validateKernelEventSpec(e);
    if (!v.ok) {
      return { ok: false, code: "KERNEL_EVENT_SPEC_INVALID", state: base };
    }
  }

  if (metricsPatch != null) {
    if (!isPlainObject(metricsPatch) || !isFiniteMetrics(metricsPatch as WorldMetrics)) {
      return { ok: false, code: "INVALID_METRICS_PATCH", state: base };
    }
    const allowed = new Set(["output", "stock", "reachable_orders", "cash"]);
    for (const k of Object.keys(metricsPatch)) {
      if (!allowed.has(k)) {
        return { ok: false, code: "INVALID_METRICS_PATCH", state: base };
      }
    }
    for (const k of allowed) {
      if (!(k in metricsPatch)) {
        return { ok: false, code: "INVALID_METRICS_PATCH", state: base };
      }
    }
  }

  if (events.length === 0 && metricsPatch == null) {
    return { ok: true, state: base };
  }

  const next = cloneWorldState(base);
  next.world_revision = base.world_revision + 1;
  if (metricsPatch != null) {
    next.metrics = cloneMetrics(metricsPatch as WorldMetrics);
  }
  return { ok: true, state: next };
}

// Keep typed overload for internal call sites with known WorldState
export type { KernelEventSpec, WorldMetrics, WorldState };
