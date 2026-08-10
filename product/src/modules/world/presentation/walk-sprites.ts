/**
 * Sprite footprints for the wool-town walk scene, in grid cells.
 *
 * `rows` MUST equal `cols * (pngHeight / pngWidth)`. When it does not, the
 * `object-fit: contain` art shrinks inside its box and leaves dead space, which
 * detaches the focus label from the figure it names. `walk-sprites.test.ts`
 * reads the real PNG headers and asserts this, so the drift cannot come back.
 */
export type WalkSprite = {
  src: string;
  cols: number;
  rows: number;
  label: string;
};

export const WALK_SPRITE: Record<string, WalkSprite> = {
  "avatar-reader": { src: "merchant.png", cols: 1.1, rows: 1.1, label: "你" },
  workshop: { src: "workshop.png", cols: 2.4, rows: 1.8, label: "纺织工坊" },
  "market-stall": { src: "stall.png", cols: 2, rows: 1.5, label: "村落市集" },
  "pasture-fence": { src: "fence.png", cols: 1.8, rows: 0.9, label: "羊圈牧场" },
  "road-gate": { src: "fence.png", cols: 1.4, rows: 0.7, label: "通往邻镇的路" },
  shepherd: { src: "shepherd.png", cols: 1, rows: 1, label: "牧羊人" },
  spinner: { src: "spinner.png", cols: 1, rows: 1, label: "纺纱工" },
  sheep: { src: "sheep.png", cols: 1, rows: 1, label: "羊" },
  tree: { src: "tree.png", cols: 1.1, rows: 1.375, label: "树" },
};

export const WALK_SPRITE_DIR = "/world/wool-town";

export function resolveWalkSprite(spriteRef: string): WalkSprite {
  return (
    WALK_SPRITE[spriteRef] ?? {
      src: "grass.png",
      cols: 1,
      rows: 1,
      label: spriteRef,
    }
  );
}
