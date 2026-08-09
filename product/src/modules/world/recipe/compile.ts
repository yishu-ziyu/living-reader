import { canonicalize } from "../domain/canonicalize";
import { FROZEN_WOOL_TOWN_RULESET } from "../domain/frozen-ruleset";
import { deepFreeze, isPlainObject } from "../domain/safe";
import type { WorldMetrics } from "../domain/types";
import { getReviewedRecipe } from "./catalog";
import type {
  CompileReviewedRecipeInput,
  CompileReviewedRecipeResult,
  NormalizedRecipeParameters,
  WorldDefinition,
  WorldRecipe,
} from "./types";

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function fnv1a32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function hex32(value: number): string {
  return value.toString(16).padStart(8, "0");
}

/** Stable content identity; not a security or signature primitive. */
export function recipeFingerprint(recipe: WorldRecipe): string {
  const canonical = canonicalize(recipe);
  return `recipe-v1:${hex32(fnv1a32(canonical, 0x811c9dc5))}${hex32(
    fnv1a32(canonical, 0x9e3779b9),
  )}`;
}

function normalizeParameters(
  recipe: WorldRecipe,
  provided: CompileReviewedRecipeInput["parameters"],
):
  | { ok: true; value: NormalizedRecipeParameters }
  | { ok: false; code: "INVALID_PARAMETERS" | "UNKNOWN_PARAMETER" } {
  const input = provided ?? {};
  if (!isPlainObject(input)) return { ok: false, code: "INVALID_PARAMETERS" };
  const definitions = [...recipe.parameters].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const known = new Set(definitions.map((parameter) => parameter.id));
  if (Object.keys(input).some((key) => !known.has(key))) {
    return { ok: false, code: "UNKNOWN_PARAMETER" };
  }

  const normalized: Record<string, number> = {};
  for (const parameter of definitions) {
    const raw = input[parameter.id] ?? parameter.default;
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return { ok: false, code: "INVALID_PARAMETERS" };
    }
    const rounded = parameter.integer ? Math.round(raw) : raw;
    normalized[parameter.id] = Math.min(
      parameter.max,
      Math.max(parameter.min, rounded),
    );
  }
  return { ok: true, value: deepFreeze(normalized) };
}

function initialMetrics(
  recipe: WorldRecipe,
  normalized: NormalizedRecipeParameters,
): WorldMetrics {
  const metrics = { ...recipe.mechanism.initial_metrics };
  for (const parameter of recipe.parameters) {
    const metric = parameter.target.slice("metrics.".length) as keyof WorldMetrics;
    metrics[metric] = normalized[parameter.id]!;
  }
  return metrics;
}

export function compileReviewedRecipe(
  input: CompileReviewedRecipeInput,
): CompileReviewedRecipeResult {
  const recipe = getReviewedRecipe(input.recipe_id);
  if (!recipe) return { ok: false, code: "RECIPE_NOT_REVIEWED" };
  if (
    !nonEmptyString(input.experience_id) ||
    !nonEmptyString(input.world_id) ||
    !Number.isSafeInteger(input.graph_revision) ||
    input.graph_revision < 0 ||
    !Number.isSafeInteger(input.seed)
  ) {
    return { ok: false, code: "INVALID_IDENTITY" };
  }
  const normalized = normalizeParameters(recipe, input.parameters);
  if (!normalized.ok) return normalized;

  const fingerprint = recipeFingerprint(recipe);
  const definition: WorldDefinition = {
    definition_version: 1,
    recipe_id: recipe.recipe_id,
    recipe_fingerprint: fingerprint,
    normalized_parameters: normalized.value,
    seed: input.seed,
    source_locator: recipe.source_locator,
    source_quote: recipe.source_quote,
    claim_type: recipe.claim_type,
    mechanism_id: recipe.mechanism.mechanism_id,
    ruleset: FROZEN_WOOL_TOWN_RULESET,
    initial_state: {
      experience_id: input.experience_id,
      world_id: input.world_id,
      graph_revision: input.graph_revision,
      world_revision: 0,
      ruleset_id: FROZEN_WOOL_TOWN_RULESET.ruleset_id,
      seed: input.seed,
      phase: "playable",
      metrics: initialMetrics(recipe, normalized.value),
    },
    action_ids: recipe.actions.map((action) => action.action_id),
    actors: recipe.actors,
    metrics: recipe.metrics,
    visual_grammar: recipe.visual_grammar,
  };

  return {
    ok: true,
    value: deepFreeze({
      definition: deepFreeze(definition),
      recipe_fingerprint: fingerprint,
      normalized_parameters: normalized.value,
    }),
  };
}
