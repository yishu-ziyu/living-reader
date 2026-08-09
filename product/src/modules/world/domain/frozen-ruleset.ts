import { canonicalize } from "./canonicalize";
import { parseRulesetShape } from "./parse";
import { deepFreeze } from "./safe";
import type { WoolTownRuleset } from "./types";
import { CANONICAL_ACTOR_ORDER } from "./types";

/**
 * F43: deep-frozen canonical wool-town-v1 ruleset.
 */

const _ruleset: WoolTownRuleset = {
  ruleset_id: "wool-town-v1",
  weaver_minimum_orders_for_next_depth: 3,
  weaver_outputs_pending: 0,
  expand_delta: {
    output: 5,
    stock: 3,
    reachable_orders: 2,
    cash: 4,
  },
  actor_ids: [...CANONICAL_ACTOR_ORDER],
};

export const FROZEN_WOOL_TOWN_RULESET: WoolTownRuleset = deepFreeze(_ruleset);

export const FROZEN_WOOL_TOWN_RULESET_FINGERPRINT = canonicalize(
  FROZEN_WOOL_TOWN_RULESET,
);

/**
 * Resolve ruleset by id to frozen singleton.
 * Rejects unknown root/nested keys, tampered body, reorder, missing actors.
 */
export function resolveCanonicalRuleset(
  ruleset_id: string,
  provided?: WoolTownRuleset | null,
):
  | { ok: true; ruleset: WoolTownRuleset }
  | { ok: false; reason: string } {
  if (ruleset_id !== FROZEN_WOOL_TOWN_RULESET.ruleset_id) {
    return { ok: false, reason: "unknown ruleset_id" };
  }
  if (provided != null) {
    // Exact allowlist first (unknown root fields fail)
    const shaped = parseRulesetShape(provided);
    if (!shaped.ok) {
      return { ok: false, reason: shaped.reason };
    }
    try {
      const fp = canonicalize({
        ruleset_id: shaped.value.ruleset_id,
        weaver_minimum_orders_for_next_depth:
          shaped.value.weaver_minimum_orders_for_next_depth,
        weaver_outputs_pending: shaped.value.weaver_outputs_pending,
        expand_delta: shaped.value.expand_delta,
        actor_ids: [...shaped.value.actor_ids],
      });
      if (fp !== FROZEN_WOOL_TOWN_RULESET_FINGERPRINT) {
        return { ok: false, reason: "ruleset body tampered" };
      }
    } catch {
      return { ok: false, reason: "ruleset not canonicalizable" };
    }
  }
  return { ok: true, ruleset: FROZEN_WOOL_TOWN_RULESET };
}
