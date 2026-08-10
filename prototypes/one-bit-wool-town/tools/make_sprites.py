#!/usr/bin/env python3
"""PROTOTYPE ONLY — generate 1-bit pixel sprites for the wool-town study.

Every sprite is drawn with Pillow primitives on a tiny canvas, one pixel per
cell, ink (#101511) on transparency. Output goes to ../assets/.
A contact sheet (contact-sheet.png) is rendered for visual self-review.
"""

from pathlib import Path

from PIL import Image, ImageDraw

INK = (16, 21, 17, 255)  # #101511
PAPER = (237, 241, 231, 255)  # #edf1e7 (contact sheet background only)

OUT = Path(__file__).resolve().parent.parent / "assets"
OUT.mkdir(parents=True, exist_ok=True)


def canvas(w: int, h: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def save(img: Image.Image, name: str) -> None:
    img.save(OUT / name)


# ---------------------------------------------------------------- characters
def person(d: ImageDraw.ImageDraw, *, hat: str, base_y: int = 23) -> None:
    """Chunky 24x24 villager silhouette with a transparent eye hole."""
    # head 4x4 with eye hole
    d.rectangle([10, 6, 13, 9], fill=INK)
    d.point((12, 7), fill=(0, 0, 0, 0))
    # hat variants
    if hat == "brim":  # shepherd wide brim + crown
        d.rectangle([5, 4, 18, 5], fill=INK)
        d.rectangle([9, 1, 14, 3], fill=INK)
    elif hat == "kerchief":  # spinner kerchief knot
        d.rectangle([9, 4, 14, 5], fill=INK)
        d.point((15, 4), fill=INK)
        d.point((16, 3), fill=INK)
    elif hat == "flat":  # weaver flat cap with right visor
        d.rectangle([8, 4, 16, 5], fill=INK)
        d.rectangle([10, 3, 13, 3], fill=INK)
        d.point((17, 5), fill=INK)
        d.point((18, 5), fill=INK)
    elif hat == "top":  # merchant tall cap
        d.rectangle([8, 5, 15, 5], fill=INK)
        d.rectangle([9, 0, 14, 4], fill=INK)
    # torso robe
    d.rectangle([9, 10, 14, 13], fill=INK)
    d.rectangle([8, 14, 15, 18], fill=INK)
    # legs
    d.rectangle([9, 19, 10, base_y - 1], fill=INK)
    d.rectangle([13, 14 - 14 + 19, 14, base_y - 1], fill=INK)


def shepherd() -> Image.Image:
    img, d = canvas(24, 24)
    person(d, hat="brim")
    # arm reaching to crook
    d.rectangle([14, 11, 17, 12], fill=INK)
    # crook staff with hook
    d.line([17, 5, 17, 21], fill=INK, width=1)
    d.line([17, 5, 20, 3], fill=INK, width=1)
    d.line([20, 3, 20, 6], fill=INK, width=1)
    return img


def spinner() -> Image.Image:
    img, d = canvas(24, 24)
    person(d, hat="kerchief")
    # raised arm holding distaff
    d.line([14, 11, 18, 7], fill=INK, width=1)
    d.line([18, 4, 18, 10], fill=INK, width=1)
    d.point((17, 3), fill=INK)
    d.point((18, 2), fill=INK)
    d.point((19, 3), fill=INK)
    return img


def weaver() -> Image.Image:
    img, d = canvas(24, 24)
    person(d, hat="flat")
    # both arms forward at loom height
    d.rectangle([14, 12, 19, 13], fill=INK)
    return img


def merchant() -> Image.Image:
    img, d = canvas(24, 24)
    person(d, hat="top")
    # arm holding money bag
    d.rectangle([14, 11, 18, 12], fill=INK)
    d.ellipse([17, 13, 22, 19], fill=INK)
    d.rectangle([18, 12, 20, 13], fill=INK)
    return img


def sheep() -> Image.Image:
    img, d = canvas(16, 16)
    d.ellipse([2, 4, 12, 11], fill=INK)  # woolly body
    d.rectangle([11, 5, 14, 9], fill=INK)  # head
    d.point((13, 6), fill=(0, 0, 0, 0))  # eye
    d.point((11, 4), fill=INK)  # ear
    d.rectangle([3, 12, 4, 15], fill=INK)  # legs
    d.rectangle([9, 12, 10, 15], fill=INK)
    return img


# --------------------------------------------------------------------- items
def wool() -> Image.Image:
    img, d = canvas(12, 12)
    d.ellipse([2, 2, 9, 9], fill=INK)
    d.ellipse([5, 4, 11, 10], fill=INK)
    d.ellipse([1, 5, 7, 11], fill=INK)
    d.point((4, 5), fill=(0, 0, 0, 0))
    d.point((7, 7), fill=(0, 0, 0, 0))
    return img


def yarn() -> Image.Image:
    img, d = canvas(12, 12)
    d.polygon([(6, 1), (11, 10), (1, 10)], fill=INK)  # cone spool
    d.line([3, 8, 9, 8], fill=(0, 0, 0, 0), width=1)  # thread gaps
    d.line([4, 6, 8, 6], fill=(0, 0, 0, 0), width=1)
    d.line([5, 4, 7, 4], fill=(0, 0, 0, 0), width=1)
    return img


def cloth() -> Image.Image:
    img, d = canvas(12, 12)
    for i, y in enumerate(range(0, 11, 3)):  # folded bolt stack
        x0, x1 = (2, 9) if i % 2 == 0 else (1, 10)
        d.rectangle([x0, y, x1, y + 1], fill=INK)
    return img


def coin() -> Image.Image:
    img, d = canvas(12, 12)
    d.ellipse([2, 2, 9, 9], fill=INK)
    d.rectangle([4, 4, 7, 7], fill=(0, 0, 0, 0))  # square-hole cash coin
    return img


# -------------------------------------------------------------------- scenery
def workshop() -> Image.Image:
    img, d = canvas(48, 36)
    d.rectangle([6, 16, 41, 35], outline=INK, width=2)  # walls
    d.polygon([(2, 16), (24, 4), (45, 16)], outline=INK, width=2)  # roof
    d.rectangle([20, 24, 27, 35], fill=INK)  # door
    d.rectangle([10, 20, 16, 25], outline=INK, width=1)  # window
    d.line([13, 20, 13, 25], fill=INK, width=1)
    d.rectangle([33, 6, 37, 12], fill=INK)  # chimney
    for x in range(8, 40, 4):  # timber lines
        d.point((x, 30), fill=INK)
    return img


def stall() -> Image.Image:
    img, d = canvas(32, 24)
    for i, x in enumerate(range(2, 30, 4)):  # striped awning
        if i % 2 == 0:
            d.rectangle([x, 2, x + 3, 6], fill=INK)
    d.rectangle([2, 6, 29, 7], fill=INK)
    d.line([4, 8, 4, 22], fill=INK, width=1)  # posts
    d.line([27, 8, 27, 22], fill=INK, width=1)
    d.rectangle([3, 16, 28, 19], fill=INK)  # counter
    return img


def wheel() -> Image.Image:
    img, d = canvas(16, 16)
    d.ellipse([1, 1, 14, 14], outline=INK, width=1)
    d.line([7, 1, 7, 14], fill=INK, width=1)
    d.line([1, 7, 14, 7], fill=INK, width=1)
    d.line([3, 3, 12, 12], fill=INK, width=1)
    d.line([12, 3, 3, 12], fill=INK, width=1)
    d.rectangle([6, 6, 8, 8], fill=INK)
    return img


def loom() -> Image.Image:
    img, d = canvas(24, 16)
    d.rectangle([1, 1, 22, 14], outline=INK, width=1)
    for x in range(4, 21, 3):  # warp threads
        d.line([x, 2, x, 13], fill=INK, width=1)
    d.rectangle([1, 6, 22, 8], fill=INK)  # beater bar
    return img


def tree() -> Image.Image:
    img, d = canvas(16, 20)
    d.ellipse([2, 1, 13, 10], fill=INK)
    d.point((4, 3), fill=(0, 0, 0, 0))
    d.point((9, 6), fill=(0, 0, 0, 0))
    d.point((6, 8), fill=(0, 0, 0, 0))
    d.rectangle([6, 11, 9, 18], fill=INK)
    d.rectangle([4, 18, 11, 19], fill=INK)
    return img


def fence() -> Image.Image:
    img, d = canvas(16, 8)
    d.rectangle([0, 2, 15, 3], fill=INK)
    d.rectangle([0, 5, 15, 6], fill=INK)
    d.rectangle([2, 0, 4, 7], fill=INK)
    d.rectangle([11, 0, 13, 7], fill=INK)
    return img


def grass() -> Image.Image:
    img, d = canvas(8, 4)
    d.line([1, 3, 1, 0], fill=INK, width=1)
    d.line([3, 3, 4, 1], fill=INK, width=1)
    d.line([6, 3, 6, 0], fill=INK, width=1)
    return img


def cloud() -> Image.Image:
    img, d = canvas(20, 8)
    d.ellipse([1, 3, 10, 7], fill=INK)
    d.ellipse([6, 1, 15, 6], fill=INK)
    d.ellipse([11, 3, 19, 7], fill=INK)
    return img


def sun() -> Image.Image:
    img, d = canvas(12, 12)
    d.ellipse([3, 3, 8, 8], fill=INK)
    d.point((5, 0), fill=INK)
    d.point((5, 11), fill=INK)
    d.point((0, 5), fill=INK)
    d.point((11, 5), fill=INK)
    d.point((1, 1), fill=INK)
    d.point((10, 1), fill=INK)
    d.point((1, 10), fill=INK)
    d.point((10, 10), fill=INK)
    return img


def smoke() -> Image.Image:
    img, d = canvas(6, 6)
    d.ellipse([1, 1, 4, 4], fill=INK)
    return img


SPRITES = {
    "shepherd.png": shepherd,
    "spinner.png": spinner,
    "weaver.png": weaver,
    "merchant.png": merchant,
    "sheep.png": sheep,
    "wool.png": wool,
    "yarn.png": yarn,
    "cloth.png": cloth,
    "coin.png": coin,
    "workshop.png": workshop,
    "stall.png": stall,
    "wheel.png": wheel,
    "loom.png": loom,
    "tree.png": tree,
    "fence.png": fence,
    "grass.png": grass,
    "cloud.png": cloud,
    "sun.png": sun,
    "smoke.png": smoke,
}


def main() -> None:
    for name, factory in SPRITES.items():
        save(factory(), name)

    # contact sheet for self-review: 8x nearest-neighbour on paper
    scale = 8
    cols = 5
    cell = 48 * 1  # grid cell in source px (max sprite width)
    rows = (len(SPRITES) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell * scale // 8 * 8, rows * 36 * scale), PAPER)
    for i, name in enumerate(SPRITES):
        img = Image.open(OUT / name)
        big = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
        x = (i % cols) * cell * scale // 8 * 8
        y = (i // cols) * 36 * scale
        sheet.alpha_composite(big, (x + 8, y + 8))
    sheet.save(Path(__file__).resolve().parent / "contact-sheet.png")
    print(f"wrote {len(SPRITES)} sprites + contact sheet")


if __name__ == "__main__":
    main()
