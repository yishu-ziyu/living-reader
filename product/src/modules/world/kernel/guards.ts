import type {
  DecisionCode,
  KernelEnv,
  WorldCommand,
  WorldState,
  WoolTownRuleset,
} from "../domain/types";

/**
 * Fail-closed guard order (first match wins):
 * WORLD_NOT_READY → WORLD_IDENTITY_MISMATCH → GRAPH_REVISION_MISMATCH
 * → EXPECTED_WORLD_REVISION_MISMATCH → RULESET_MISMATCH → SEED_MISMATCH
 * → ACTION_UNSUPPORTED
 */
export function checkGuards(
  state: WorldState,
  command: WorldCommand,
  env: KernelEnv,
  ruleset: WoolTownRuleset,
): DecisionCode | null {
  if (state.phase !== "playable") {
    return "WORLD_NOT_READY";
  }

  if (
    command.experience_id !== state.experience_id ||
    command.world_id !== state.world_id
  ) {
    return "WORLD_IDENTITY_MISMATCH";
  }

  if (command.graph_revision !== state.graph_revision) {
    return "GRAPH_REVISION_MISMATCH";
  }

  if (command.expected_world_revision !== state.world_revision) {
    return "EXPECTED_WORLD_REVISION_MISMATCH";
  }

  if (
    command.ruleset_id !== state.ruleset_id ||
    command.ruleset_id !== ruleset.ruleset_id ||
    state.ruleset_id !== ruleset.ruleset_id
  ) {
    return "RULESET_MISMATCH";
  }

  if (env.seed !== state.seed) {
    return "SEED_MISMATCH";
  }

  if (
    command.action !== "deepen_specialization" &&
    command.action !== "expand_market"
  ) {
    return "ACTION_UNSUPPORTED";
  }

  return null;
}
