import { describe, expect, it } from "vitest";
import {
  compileReviewedRecipe,
  getReviewedRecipe,
  listReviewedRecipes,
  parseWorldRecipe,
} from "@/modules/world";
import { createReviewedRecipeCatalog } from "@/modules/world/recipe/catalog";

const RECIPE_FIELDS = [
  "actions",
  "actors",
  "claim_type",
  "failure_modes",
  "flows",
  "mechanism",
  "metrics",
  "parameters",
  "predicates",
  "recipe_id",
  "reuse_examples",
  "source_locator",
  "source_quote",
  "state_transitions",
  "status",
  "stocks",
  "visual_grammar",
];

describe("T053 reviewed world recipes", () => {
  it("loads exactly the two reviewed recipes in stable id order", () => {
    const recipes = listReviewedRecipes();

    expect(recipes.map((recipe) => recipe.recipe_id)).toEqual([
      "smith.b1.division-deepening.v1",
      "smith.b1.market-extent.v1",
    ]);
    expect(recipes.every((recipe) => recipe.status === "reviewed")).toBe(true);
    expect(recipes.map((recipe) => Object.keys(recipe).sort())).toEqual([
      RECIPE_FIELDS,
      RECIPE_FIELDS,
    ]);
    expect(recipes.map((recipe) => recipe.source_locator)).toEqual([
      expect.objectContaining({
        source_id: "smith.b1.c1.p1",
        legacy_source_id: "smith.b1.c1.division",
        fragment: "Smith_0206-01_235",
      }),
      expect.objectContaining({
        source_id: "smith.b1.c3.p1",
        legacy_source_id: "smith.b1.c3.market_extent",
        fragment: "Smith_0206-01_251",
      }),
    ]);
  });

  it("strictly rejects missing, unknown, and nested unknown fields", () => {
    const recipe = structuredClone(listReviewedRecipes()[0]!);
    const withUnknown = { ...recipe, unexpected: true };
    const { source_quote: _omitted, ...missing } = recipe;
    const nestedUnknown = {
      ...recipe,
      source_locator: { ...recipe.source_locator, page_number: 36 },
    };

    expect(parseWorldRecipe(withUnknown)).toMatchObject({ ok: false });
    expect(parseWorldRecipe(missing)).toMatchObject({ ok: false });
    expect(parseWorldRecipe(nestedUnknown)).toMatchObject({ ok: false });
  });

  it("keeps draft recipes parseable but impossible to load from a reviewed catalog", () => {
    const draft = {
      ...structuredClone(listReviewedRecipes()[0]!),
      recipe_id: "smith.b1.draft-only.v1",
      status: "draft",
    };
    const parsed = parseWorldRecipe(draft);
    expect(parsed).toMatchObject({ ok: true });

    const catalog = createReviewedRecipeCatalog([draft]);
    expect(catalog).toMatchObject({ ok: true });
    if (!catalog.ok) return;
    expect(catalog.value.list()).toEqual([]);
    expect(catalog.value.get(draft.recipe_id)).toBeNull();
  });

  it("clamps parameters and compiles the same recipe, params, and seed identically", () => {
    const input = {
      recipe_id: "smith.b1.market-extent.v1",
      parameters: { reachable_orders: 999, initial_cash: -50 },
      seed: 73,
      experience_id: "exp_recipe_1",
      world_id: "world_recipe_1",
      graph_revision: 4,
    } as const;

    const first = compileReviewedRecipe(input);
    const second = compileReviewedRecipe(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ok: true,
      value: {
        recipe_fingerprint: expect.stringMatching(/^recipe-v1:[0-9a-f]{16}$/),
        normalized_parameters: {
          initial_cash: 0,
          reachable_orders: 12,
        },
        definition: {
          recipe_id: input.recipe_id,
          seed: 73,
          action_ids: ["expand_market"],
          initial_state: {
            experience_id: "exp_recipe_1",
            world_id: "world_recipe_1",
            graph_revision: 4,
            world_revision: 0,
            ruleset_id: "wool-town-v1",
            seed: 73,
            phase: "playable",
            metrics: {
              output: 12,
              stock: 8,
              reachable_orders: 12,
              cash: 0,
            },
          },
        },
      },
    });
  });

  it("fails closed for unknown recipes, unknown parameters, and non-finite seeds", () => {
    const base = {
      parameters: {},
      seed: 42,
      experience_id: "exp_recipe_2",
      world_id: "world_recipe_2",
      graph_revision: 1,
    };

    expect(
      compileReviewedRecipe({ ...base, recipe_id: "not-reviewed" }),
    ).toEqual({ ok: false, code: "RECIPE_NOT_REVIEWED" });
    expect(
      compileReviewedRecipe({
        ...base,
        recipe_id: "smith.b1.division-deepening.v1",
        parameters: { invented: 1 },
      }),
    ).toEqual({ ok: false, code: "UNKNOWN_PARAMETER" });
    expect(
      compileReviewedRecipe({
        ...base,
        recipe_id: "smith.b1.division-deepening.v1",
        seed: Number.NaN,
      }),
    ).toEqual({ ok: false, code: "INVALID_IDENTITY" });
    expect(getReviewedRecipe("not-reviewed")).toBeNull();
  });
});
