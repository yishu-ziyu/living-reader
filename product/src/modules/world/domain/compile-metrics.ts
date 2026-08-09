import { deepFreeze } from "./safe";
import type { CompiledWorldEventMetrics, WorldMetrics } from "./types";

/**
 * Explicit compile: internal WorldMetrics → T003 WORLD_METRICS_ALLOWLIST keys.
 * output → supply; stock → inventory; reachable_orders → demand; cash → cash
 */
export function compileWorldMetricsToEventMetrics(
  m: WorldMetrics,
): CompiledWorldEventMetrics {
  // Fresh object — never share alias with caller
  return {
    supply: m.output,
    inventory: m.stock,
    demand: m.reachable_orders,
    cash: m.cash,
  };
}

/** Keys allowed on KernelEventSpec.metrics — runtime frozen. */
export const KERNEL_COMPILED_METRIC_KEYS: readonly string[] = deepFreeze([
  "supply",
  "inventory",
  "demand",
  "cash",
]);

export type KernelCompiledMetricKey =
  | "supply"
  | "inventory"
  | "demand"
  | "cash";
