import { describe, expect, it } from "vitest";
import {
  compilePresentation,
  compileReviewedRecipe,
  decide,
  type WorldCommand,
} from "@/modules/world";

function definition() {
  const compiled = compileReviewedRecipe({
    recipe_id: "smith.b1.market-extent.v1",
    parameters: {},
    seed: 42,
    experience_id: "exp_presentation_1",
    world_id: "world_presentation_1",
    graph_revision: 2,
  });
  if (!compiled.ok) throw new Error(compiled.code);
  return compiled.value.definition;
}

describe("T053 PresentationCompiler", () => {
  it("builds a deterministic, DOM-readable seed-only plan", () => {
    const world = definition();
    const input = {
      definition: world,
      state: world.initial_state,
      events: [],
      reduced_motion: false,
    } as const;

    const first = compilePresentation(input);
    const second = compilePresentation(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      plan_version: 1,
      motion_mode: "standard",
      basis: {
        recipe_id: "smith.b1.market-extent.v1",
        world_id: "world_presentation_1",
        world_revision: 0,
        seed: 42,
      },
      scene: { template_id: "wool-workshop" },
      timeline: [],
      metrics: { supply: 12, inventory: 8, demand: 2, cash: 24 },
    });
    expect(first?.entities.map((entity) => entity.actor_id)).toEqual([
      "merchant",
      "shepherd",
      "spinner",
      "weaver",
    ]);
    expect(first?.captions.length).toBeGreaterThan(0);
    expect(first?.dom_summary.join(" ")).toContain("可触达订单 2");
  });

  it("maps kernel events to motion verbs and a reduced-motion terminal state", () => {
    const world = definition();
    const command: WorldCommand = {
      action: "expand_market",
      experience_id: world.initial_state.experience_id,
      world_id: world.initial_state.world_id,
      graph_revision: world.initial_state.graph_revision,
      expected_world_revision: 0,
      ruleset_id: world.initial_state.ruleset_id,
    };
    const receipt = decide(world.initial_state, command, {
      ruleset: world.ruleset,
      seed: world.seed,
    });
    expect(receipt.ok).toBe(true);

    const animated = compilePresentation({
      definition: world,
      state: receipt.next_state,
      events: receipt.events,
      reduced_motion: false,
    });
    const reduced = compilePresentation({
      definition: world,
      state: receipt.next_state,
      events: receipt.events,
      reduced_motion: true,
    });

    expect(animated?.timeline).toHaveLength(4);
    expect(animated?.timeline.every((step) => step.duration_ms > 0)).toBe(true);
    expect(reduced).toMatchObject({ motion_mode: "reduced" });
    expect(reduced?.timeline.every((step) => step.duration_ms === 0)).toBe(true);
    expect(reduced?.captions).toEqual(animated?.captions);
    expect(reduced?.dom_summary.join(" ")).toContain("可触达订单 4");
  });

  it("fails closed when state identity or an event actor does not belong to the definition", () => {
    const world = definition();

    expect(
      compilePresentation({
        definition: world,
        state: { ...world.initial_state, world_id: "other" },
        events: [],
        reduced_motion: false,
      }),
    ).toBeNull();
    expect(
      compilePresentation({
        definition: world,
        state: world.initial_state,
        events: [
          {
            event_kind: "character_observation",
            actor_id: "intruder",
            summary: "not allowlisted",
            metrics: { supply: 1, inventory: 1, demand: 1, cash: 1 },
            causation_index: 0,
          },
        ],
        reduced_motion: false,
      }),
    ).toBeNull();
  });
});
