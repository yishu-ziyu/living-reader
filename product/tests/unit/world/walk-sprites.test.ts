import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWalkSprite, WALK_SPRITE } from "@/modules/world";

const SPRITE_ROOT = path.resolve(__dirname, "../../../public/world/wool-town");

/** Reads intrinsic pixel size from a PNG IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(path.join(SPRITE_ROOT, file));
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe("T072 walk sprite boxes match their art", () => {
  it("declares rows equal to cols times the real PNG aspect ratio", () => {
    const drift = Object.entries(WALK_SPRITE)
      .map(([ref, sprite]) => {
        const { width, height } = pngSize(sprite.src);
        const expectedRows = sprite.cols * (height / width);
        return { ref, declared: sprite.rows, expectedRows };
      })
      .filter((entry) => Math.abs(entry.declared - entry.expectedRows) > 0.02);

    expect(drift).toEqual([]);
  });

  it("keeps the avatar box square so its label sits on its head", () => {
    const avatar = WALK_SPRITE["avatar-reader"]!;
    const { width, height } = pngSize(avatar.src);
    expect(height).toBe(width);
    expect(avatar.rows).toBeCloseTo(avatar.cols, 5);
  });

  it("falls back to a one-cell tile and echoes the unknown ref as its label", () => {
    expect(resolveWalkSprite("not-a-sprite")).toEqual({
      src: "grass.png",
      cols: 1,
      rows: 1,
      label: "not-a-sprite",
    });
  });
});
