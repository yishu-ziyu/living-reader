import { deepFreeze } from "../domain/safe";
import type {
  WalkCell,
  WalkDrawable,
  WalkPlace,
  WalkPresentation,
} from "./types";

export function cellKey(cell: WalkCell): string {
  return `${cell.x},${cell.y}`;
}

export function chebyshevDistance(a: WalkCell, b: WalkCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Foreground kinds that may not share a cell. */
export function assertWalkOccupancy(
  drawables: readonly WalkDrawable[],
): { ok: true } | { ok: false; cell: string; left: string; right: string } {
  const seen = new Map<string, WalkDrawable>();
  for (const drawable of drawables) {
    if (
      drawable.kind !== "avatar" &&
      drawable.kind !== "actor" &&
      drawable.kind !== "building"
    ) {
      continue;
    }
    const key = cellKey(drawable.anchor);
    const prior = seen.get(key);
    if (prior) {
      return { ok: false, cell: key, left: prior.id, right: drawable.id };
    }
    seen.set(key, drawable);
  }
  return { ok: true };
}

/** Stable depth order: lower foot-row draws first; x breaks ties. */
export function sortDrawablesByDepth(
  drawables: readonly WalkDrawable[],
): WalkDrawable[] {
  return [...drawables].sort((left, right) => {
    if (left.anchor.y !== right.anchor.y) return left.anchor.y - right.anchor.y;
    if (left.anchor.x !== right.anchor.x) return left.anchor.x - right.anchor.x;
    return left.id.localeCompare(right.id);
  });
}

/**
 * Current place = open or locked place whose entrance is within Chebyshev 1.
 * Ties prefer the smallest place id for determinism.
 */
export function resolveCurrentPlaceId(
  avatarCell: WalkCell,
  places: readonly WalkPlace[],
): string | null {
  const near = places
    .filter((place) => chebyshevDistance(avatarCell, place.entrance) <= 1)
    .sort((left, right) => left.id.localeCompare(right.id));
  return near[0]?.id ?? null;
}

export function lockedPlacesHaveReasons(
  places: readonly WalkPlace[],
): boolean {
  return places.every(
    (place) =>
      place.status === "open" ||
      (place.status === "locked" &&
        typeof place.locked_reason === "string" &&
        place.locked_reason.trim().length > 0),
  );
}

export function isWalkableCell(
  walk: WalkPresentation,
  cell: WalkCell,
): boolean {
  const { cols, rows, blockers } = walk.map;
  if (cell.x < 0 || cell.y < 0 || cell.x >= cols || cell.y >= rows) return false;
  return blockers[cell.y * cols + cell.x] === 0;
}

/**
 * Wool-town exterior walk layout.
 *
 * Placement lives in the presentation compiler (scene template), not recipe
 * JSON, matching entity_order / seed_caption as deterministic presentation
 * grammar.
 *
 * The three places sit in three directions from the avatar's start so walking
 * has a real choice, and each building keeps a clear cell in front of it:
 *
 *      0    1    2    3    4    5    6    7    8    9   10   11
 *  0   .    .    .    .    .    .    .    .    .    .    .    .
 *  1   .  [牧场]  .    .  [工坊]  .   树    .  [市集]  .    #    #
 *  2   .    .    .    .    .    .    .    .    .    .    #    #
 *  3   .    羊   .    .    .   (你)   .    .    .    .  [路]   #
 *  4   .    .    .    .    .    .    .    .    .    .    #    #
 *  5   .  牧羊人  .    .    .    .    .  纺纱工  .    .    #    #
 *  6   .    .    .    .    .    .    .    .    .    .    #    #
 *
 * Row 1 is the built north band and column 10 is the town edge. Row 0 and
 * column 11 are headroom: a sprite taller or wider than one cell grows into
 * them instead of being sheared by the stage's clipped edge. Row 6 is ground:
 * the southmost resident stands on visible floor, not on the stage border. The
 * only exit is the locked road gate at (10,3).
 */
export function compileWoolTownWalkPresentation(): WalkPresentation {
  const cols = 12;
  const rows = 7;
  const blockers = Array.from({ length: cols * rows }, () => 0 as 0 | 1);
  for (let x = 0; x < cols; x += 1) {
    blockers[x] = 1; // headroom band behind the buildings
    blockers[cols + x] = 1; // built north band
  }
  for (let y = 2; y < rows; y += 1) {
    blockers[y * cols + (cols - 2)] = 1; // town edge, road gate included
    blockers[y * cols + (cols - 1)] = 1; // headroom for the wide road gate
  }

  const places: WalkPlace[] = [
    {
      id: "market",
      label: "村落市集",
      entrance: { x: 8, y: 1 },
      status: "open",
      locked_reason: null,
    },
    {
      id: "pasture",
      label: "羊圈牧场",
      entrance: { x: 1, y: 1 },
      status: "open",
      locked_reason: null,
    },
    {
      id: "road",
      label: "通往邻镇的路",
      entrance: { x: 10, y: 3 },
      status: "locked",
      locked_reason: "通往邻镇的路还没修通，走不过去。",
    },
    {
      id: "workshop",
      label: "纺织工坊",
      entrance: { x: 4, y: 1 },
      status: "open",
      locked_reason: null,
    },
  ];

  const drawables: WalkDrawable[] = sortDrawablesByDepth([
    {
      id: "building-pasture-fence",
      kind: "building",
      anchor: { x: 1, y: 1 },
      sprite_ref: "pasture-fence",
    },
    {
      id: "building-workshop",
      kind: "building",
      anchor: { x: 4, y: 1 },
      sprite_ref: "workshop",
    },
    {
      id: "building-market-stall",
      kind: "building",
      anchor: { x: 8, y: 1 },
      sprite_ref: "market-stall",
    },
    {
      id: "decor-tree-west",
      kind: "building",
      anchor: { x: 6, y: 1 },
      sprite_ref: "tree",
    },
    {
      id: "building-road-gate",
      kind: "building",
      anchor: { x: 10, y: 3 },
      sprite_ref: "road-gate",
    },
    { id: "actor-sheep", kind: "actor", anchor: { x: 1, y: 3 }, sprite_ref: "sheep" },
    {
      id: "actor-shepherd",
      kind: "actor",
      anchor: { x: 1, y: 5 },
      sprite_ref: "shepherd",
    },
    {
      id: "actor-spinner",
      kind: "actor",
      anchor: { x: 7, y: 5 },
      sprite_ref: "spinner",
    },
  ]);

  const occupancy = assertWalkOccupancy(drawables);
  if (!occupancy.ok) {
    throw new Error(
      `walk occupancy collision at ${occupancy.cell}: ${occupancy.left} vs ${occupancy.right}`,
    );
  }
  if (!lockedPlacesHaveReasons(places)) {
    throw new Error("locked walk place missing locked_reason");
  }

  return deepFreeze({
    map: { cols, rows, blockers: blockers as readonly (0 | 1)[] },
    avatar: { cell: { x: 5, y: 3 } },
    places,
    drawables,
  });
}

export function walkDomSummaryLines(
  walk: WalkPresentation,
  latestEventSummary: string | null,
): string[] {
  const currentId = resolveCurrentPlaceId(walk.avatar.cell, walk.places);
  const current = walk.places.find((place) => place.id === currentId) ?? null;
  const openLabels = walk.places
    .filter((place) => place.status === "open")
    .map((place) => place.label);
  const locked = walk.places.find((place) => place.status === "locked");

  const lines = [
    current
      ? `我在：${current.label}附近（格子 ${walk.avatar.cell.x},${walk.avatar.cell.y}）`
      : `我在：镇外空地（格子 ${walk.avatar.cell.x},${walk.avatar.cell.y}）`,
    `用方向键或 WASD 走动。可前往：${openLabels.join("、")}${
      locked ? `；${locked.label}锁定` : ""
    }`,
  ];
  if (latestEventSummary) lines.push(`刚才：${latestEventSummary}`);
  if (locked?.locked_reason) lines.push(`锁定原因：${locked.locked_reason}`);
  return lines;
}
