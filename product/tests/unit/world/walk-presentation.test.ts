import { describe, expect, it } from "vitest";
import {
  assertWalkOccupancy,
  compilePresentation,
  compileReviewedRecipe,
  compileWoolTownWalkPresentation,
  isWalkableCell,
  lockedPlacesHaveReasons,
  resolveCurrentPlaceId,
  resolveWalkSprite,
  sortDrawablesByDepth,
  type WalkDrawable,
} from "@/modules/world";

function woolDefinition() {
  const compiled = compileReviewedRecipe({
    recipe_id: "smith.b1.market-extent.v1",
    parameters: {},
    seed: 42,
    experience_id: "exp_walk_1",
    world_id: "world_walk_1",
    graph_revision: 2,
  });
  if (!compiled.ok) throw new Error(compiled.code);
  return compiled.value.definition;
}

describe("T072 walk presentation", () => {
  it("keeps at most one foreground drawable per cell", () => {
    const walk = compileWoolTownWalkPresentation();
    expect(assertWalkOccupancy(walk.drawables)).toEqual({ ok: true });

    const occupied = walk.drawables.find(
      (drawable) => drawable.kind === "building",
    )!;
    const collision: WalkDrawable[] = [
      ...walk.drawables,
      {
        id: "dup",
        kind: "actor",
        anchor: occupied.anchor,
        sprite_ref: "actor-dup",
      },
    ];
    const result = assertWalkOccupancy(collision);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cell).toBe(`${occupied.anchor.x},${occupied.anchor.y}`);
    }
  });

  it("orders drawables by anchor.y ascending for depth", () => {
    const walk = compileWoolTownWalkPresentation();
    const ordered = sortDrawablesByDepth(walk.drawables);
    for (let index = 1; index < ordered.length; index += 1) {
      const prev = ordered[index - 1]!;
      const next = ordered[index]!;
      expect(prev.anchor.y).toBeLessThanOrEqual(next.anchor.y);
    }
    expect(ordered.map((item) => item.id)).toEqual(
      sortDrawablesByDepth([...walk.drawables].reverse()).map((item) => item.id),
    );
  });

  it("resolves current place by Chebyshev distance including ties and none", () => {
    const walk = compileWoolTownWalkPresentation();
    expect(resolveCurrentPlaceId({ x: 4, y: 1 }, walk.places)).toBe("workshop");
    expect(resolveCurrentPlaceId({ x: 1, y: 1 }, walk.places)).toBe("pasture");
    expect(resolveCurrentPlaceId({ x: 5, y: 3 }, walk.places)).toBeNull();

    // Ambiguous tie: equal distance to two entrances prefers smaller id.
    const tied = resolveCurrentPlaceId(
      { x: 2, y: 2 },
      [
        {
          id: "zeta",
          label: "Z",
          entrance: { x: 1, y: 2 },
          status: "open",
          locked_reason: null,
        },
        {
          id: "alpha",
          label: "A",
          entrance: { x: 3, y: 2 },
          status: "open",
          locked_reason: null,
        },
      ],
    );
    expect(tied).toBe("alpha");
  });

  it("requires locked places to carry a non-empty reason", () => {
    const walk = compileWoolTownWalkPresentation();
    expect(lockedPlacesHaveReasons(walk.places)).toBe(true);
    expect(
      lockedPlacesHaveReasons([
        {
          id: "road",
          label: "路",
          entrance: { x: 0, y: 0 },
          status: "locked",
          locked_reason: "",
        },
      ]),
    ).toBe(false);
  });

  it("blocks the built band, the map edge, and the locked road gate", () => {
    const walk = compileWoolTownWalkPresentation();

    expect(isWalkableCell(walk, { x: 5, y: 3 })).toBe(true);
    expect(isWalkableCell(walk, { x: 4, y: 0 })).toBe(false); // sprite headroom band
    expect(isWalkableCell(walk, { x: 4, y: 1 })).toBe(false); // built north band
    expect(isWalkableCell(walk, { x: 10, y: 3 })).toBe(false); // locked road gate
    expect(isWalkableCell(walk, { x: -1, y: 3 })).toBe(false);
    expect(isWalkableCell(walk, { x: 11, y: 3 })).toBe(false); // road-gate headroom
    expect(isWalkableCell(walk, { x: 12, y: 3 })).toBe(false);
    expect(isWalkableCell(walk, { x: 3, y: 7 })).toBe(false);
  });

  it("leaves ground below the southmost resident instead of the stage border", () => {
    const walk = compileWoolTownWalkPresentation();
    const southmost = Math.max(...walk.drawables.map((d) => d.anchor.y));

    expect(southmost).toBeLessThan(walk.map.rows - 1);
    expect(isWalkableCell(walk, { x: 3, y: walk.map.rows - 1 })).toBe(true);
  });

  it("keeps every walkable row reachable from the avatar start", () => {
    const walk = compileWoolTownWalkPresentation();
    for (let x = 0; x < walk.map.cols; x += 1) {
      expect(isWalkableCell(walk, { x, y: 2 })).toBe(x < 10);
    }
  });

  it("keeps every sprite box inside the stage so nothing is sheared", () => {
    const walk = compileWoolTownWalkPresentation();
    const boxes = [
      ...walk.drawables,
      { id: "avatar", anchor: walk.avatar.cell, sprite_ref: "avatar-reader" },
    ];

    for (const box of boxes) {
      const sprite = resolveWalkSprite(box.sprite_ref);
      const left = box.anchor.x + 0.5 - sprite.cols / 2;
      const right = left + sprite.cols;
      const top = box.anchor.y + 1 - sprite.rows;

      expect({ id: box.id, overflowsLeft: left < 0 }).toEqual({
        id: box.id,
        overflowsLeft: false,
      });
      expect({ id: box.id, overflowsRight: right > walk.map.cols }).toEqual({
        id: box.id,
        overflowsRight: false,
      });
      expect({ id: box.id, overflowsTop: top < 0 }).toEqual({
        id: box.id,
        overflowsTop: false,
      });
    }
  });

  it("compiles wool-workshop presentation plans with walk data and summary", () => {
    const definition = woolDefinition();
    const plan = compilePresentation({
      definition,
      state: definition.initial_state,
      events: [],
      reduced_motion: false,
    });

    expect(plan?.walk).not.toBeNull();
    expect(plan?.walk?.places.map((place) => place.id).sort()).toEqual([
      "market",
      "pasture",
      "road",
      "workshop",
    ]);
    expect(plan?.dom_summary.join(" ")).toContain("我在：");
    expect(plan?.dom_summary.join(" ")).toContain("方向键或 WASD");
    expect(plan?.dom_summary.join(" ")).toContain("通往邻镇的路还没修通");
    expect(assertWalkOccupancy(plan!.walk!.drawables)).toEqual({ ok: true });
  });
});
