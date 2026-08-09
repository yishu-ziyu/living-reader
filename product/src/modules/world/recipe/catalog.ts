import divisionDeepening from "../../../../content/recipes/division-deepening.json";
import marketExtent from "../../../../content/recipes/market-extent.json";
import { deepFreeze } from "../domain/safe";
import { parseWorldRecipe } from "./parse";
import type { WorldRecipe } from "./types";

export type ReviewedRecipeCatalog = Readonly<{
  list: () => readonly WorldRecipe[];
  get: (recipe_id: string) => WorldRecipe | null;
}>;

export type ReviewedRecipeCatalogResult =
  | { ok: true; value: ReviewedRecipeCatalog }
  | { ok: false; code: "INVALID_RECIPE_CATALOG"; reason: string };

export function createReviewedRecipeCatalog(
  rawRecipes: readonly unknown[],
): ReviewedRecipeCatalogResult {
  const parsed: WorldRecipe[] = [];
  const ids = new Set<string>();
  for (const raw of rawRecipes) {
    const result = parseWorldRecipe(raw);
    if (!result.ok) {
      return { ok: false, code: "INVALID_RECIPE_CATALOG", reason: result.reason };
    }
    if (ids.has(result.value.recipe_id)) {
      return {
        ok: false,
        code: "INVALID_RECIPE_CATALOG",
        reason: `duplicate recipe_id: ${result.value.recipe_id}`,
      };
    }
    ids.add(result.value.recipe_id);
    if (result.value.status === "reviewed") parsed.push(result.value);
  }

  const recipes = deepFreeze(
    [...parsed].sort((left, right) => left.recipe_id.localeCompare(right.recipe_id)),
  );
  const byId = new Map(recipes.map((recipe) => [recipe.recipe_id, recipe]));
  return {
    ok: true,
    value: {
      list: () => recipes,
      get: (recipe_id) => byId.get(recipe_id) ?? null,
    },
  };
}

const catalogResult = createReviewedRecipeCatalog([
  divisionDeepening,
  marketExtent,
]);

if (!catalogResult.ok) {
  throw new Error(`Invalid reviewed recipe catalog: ${catalogResult.reason}`);
}

const catalog = catalogResult.value;

export function listReviewedRecipes(): readonly WorldRecipe[] {
  return catalog.list();
}

export function listReviewedRecipeIdsForSource(
  sourceId: string,
): readonly string[] {
  const recipeIds: string[] = [];
  for (const recipe of catalog.list()) {
    if (
      recipe.source_locator.source_id === sourceId ||
      recipe.source_locator.legacy_source_id === sourceId
    ) {
      recipeIds.push(recipe.recipe_id);
    }
  }
  return recipeIds;
}

export function getReviewedRecipe(recipe_id: string): WorldRecipe | null {
  return catalog.get(recipe_id);
}
