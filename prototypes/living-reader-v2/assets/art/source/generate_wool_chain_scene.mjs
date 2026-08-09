import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 160;
const H = 90;
const SCALE = 2;
const PAPER = [0xF6, 0xF1, 0xDF];
const INK = [0x15, 0x15, 0x15];
const pixels = new Uint8Array(W * H);

function px(x, y, value = 1) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && x < W && y >= 0 && y < H) pixels[y * W + x] = value;
}

function rect(x, y, w, h, value = 1) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) px(xx, yy, value);
  }
}

function line(x0, y0, x1, y1, value = 1) {
  let dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    px(x0, y0, value);
    if (x0 === x1 && y0 === y1) break;
    const doubled = error * 2;
    if (doubled >= dy) {
      error += dy;
      x0 += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

function ellipse(cx, cy, rx, ry, value = 1, fill = false) {
  for (let y = -ry; y <= ry; y += 1) {
    for (let x = -rx; x <= rx; x += 1) {
      const n = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if ((fill && n <= 1) || (!fill && n >= 0.58 && n <= 1.16)) px(cx + x, cy + y, value);
    }
  }
}

function bitmap(x, y, rows) {
  rows.forEach((row, yy) => {
    [...row].forEach((cell, xx) => {
      if (cell === '#') px(x + xx, y + yy, 1);
      if (cell === 'o') px(x + xx, y + yy, 0);
    });
  });
}

function dither(x, y, w, h) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (((xx & 1) === 0) && ((yy & 1) === 0)) px(xx, yy);
    }
  }
}

// Quiet town envelope: one world, not a row of UI cards.
rect(0, 0, W, 2);
line(0, 24, 18, 8);
line(18, 8, 36, 24);
line(36, 24, 56, 6);
line(56, 6, 76, 24);
line(76, 24, 96, 10);
line(96, 10, 116, 24);
line(116, 24, 138, 7);
line(138, 7, 159, 24);
line(0, 25, 159, 25);
for (const x of [3, 38, 78, 118, 157]) line(x, 25, x, 74);
rect(25, 4, 5, 15);
rect(26, 2, 3, 2);
rect(101, 5, 5, 13);
rect(102, 3, 3, 2);

// Large material beats mark the left-to-right wool chain.
// Sheep and raw fleece.
bitmap(0, 61, [
  '..####.#####......',
  '.############.....',
  '##############.##.',
  '###############.##',
  '.#############..##',
  '..###.###.###...##',
  '..###.....###.....',
  '..###.....###.....',
]);
ellipse(22, 70, 7, 4, 1, false);
rect(16, 70, 13, 5);
for (const x of [18, 21, 24, 27]) px(x, 72, 0);

// Shepherd: broad hat, open coat, shears reaching to fleece, tall crook.
bitmap(10, 31, [
  '.......########.......',
  '.....############.....',
  '...################...',
  '.......########.......',
  '.......########.......',
  '........######........',
  '.......########.......',
  '......##########......',
  '.....############.....',
  '....##############....',
  '...######....######...',
  '..######......######..',
  '.######........######.',
  '######..........######',
  '.#####..........#####.',
  '..####..........####..',
  '..#####........#####..',
  '...#####......#####...',
  '....#####....#####....',
  '.....####....####.....',
  '.....####....####.....',
  '.....####....####.....',
  '.....####....####.....',
  '....#####....#####....',
  '....#####....#####....',
  '...######....######...',
  '...######....######...',
  '..#######....#######..',
  '..#######....#######..',
  '.########....########.',
  '.########....########.',
]);
px(21, 36, 0);
line(19, 43, 19, 58, 0);
line(22, 43, 22, 58, 0);
// Crook is taller than the head and asymmetrical.
line(35, 28, 35, 64);
line(35, 28, 38, 25);
line(38, 25, 41, 28);
line(41, 28, 40, 31);
// Open shears connect hand to raw fleece.
line(11, 49, 6, 55);
line(11, 51, 6, 58);
ellipse(6, 55, 1, 1, 1, false);
ellipse(6, 58, 1, 1, 1, false);

// Spinner: bonnet and bell skirt beside an oversized wheel and drop spindle.
bitmap(45, 31, [
  '......#########.......',
  '....#############.....',
  '..#################...',
  '....#############.....',
  '......#########.......',
  '.......#######........',
  '......#########.......',
  '.....###########......',
  '....#############.....',
  '...###############....',
  '..#######...#######...',
  '..######.....######...',
  '...#####.....#####....',
  '....####.....####.....',
  '...######...######....',
  '..#################...',
  '.###################..',
  '#####################.',
  '#####################.',
  '#####################.',
  '.###################..',
  '.###################..',
  '..#################...',
  '..#################...',
  '...###############....',
  '...###############....',
  '....#############.....',
  '....#############.....',
  '.....###########......',
  '......####.####.......',
  '.....#####.#####......',
]);
px(56, 36, 0);
// Paper stripes break the dress into readable volume without gray.
line(51, 49, 48, 60, 0);
line(61, 49, 65, 60, 0);
line(51, 60, 63, 60, 0);
ellipse(70, 54, 10, 10, 1, false);
ellipse(70, 54, 2, 2, 1, false);
for (let i = 0; i < 8; i += 1) {
  const angle = (Math.PI * i) / 4;
  line(70, 54, Math.round(70 + Math.cos(angle) * 9), Math.round(54 + Math.sin(angle) * 9));
}
line(64, 45, 70, 50);
// Hanging spindle with a fat yarn cop.
line(66, 44, 77, 35);
line(77, 35, 77, 48);
rect(74, 43, 7, 3);
px(77, 49);
ellipse(73, 70, 5, 3, 1, false);
ellipse(77, 70, 5, 3, 1, false);

// Weaver: the loom is the dominant rectangular silhouette, with shuttle in motion.
rect(82, 29, 32, 39);
rect(85, 32, 26, 33, 0);
rect(86, 34, 24, 5);
for (let x = 87; x <= 109; x += 4) line(x, 34, x, 63);
line(85, 50, 111, 50);
line(85, 60, 111, 60);
bitmap(87, 35, [
  '.......########......',
  '.....############....',
  '...################..',
  '.....############....',
  '.......########......',
  '........######.......',
  '.......########......',
  '......##########.....',
  '.....############....',
  '....##############...',
  '...#######.#######...',
  '..#######...#######..',
  '.#######.....#######.',
  '######.......########',
  '.#####.......#######.',
  '..#####.....#######..',
  '...#####...#######...',
  '....#####.#######....',
  '.....##########......',
  '.....##########......',
  '....#####..#####.....',
  '...#####....#####....',
  '...#####....#####....',
  '..######....######...',
  '..######....######...',
  '.#######....#######..',
  '.#######....#######..',
  '########....########.',
]);
px(98, 40, 0);
// Large diamond shuttle cuts across the loom.
line(93, 51, 101, 47);
line(101, 47, 109, 51);
line(109, 51, 101, 55);
line(101, 55, 93, 51);
rect(98, 50, 7, 3, 0);
// Cloth leaves the loom as a clearly striped bolt.
rect(106, 64, 10, 14);
for (let y = 65; y < 77; y += 3) line(107, y, 114, y + 1, 0);

// Merchant: tall crown, squared coat, open ledger, money pouch and cloth cart.
bitmap(124, 29, [
  '.......########.......',
  '......##########......',
  '......##########......',
  '......##########......',
  '...################...',
  '..##################..',
  '......##########......',
  '.......########.......',
  '.......########.......',
  '......##########......',
  '.....############.....',
  '....##############....',
  '...################...',
  '..#######....#######..',
  '.#######......#######.',
  '#######........#######',
  '######..........######',
  '.#####..........#####.',
  '..####..........####..',
  '..#####........#####..',
  '...#####......#####...',
  '....#####....#####....',
  '.....####....####.....',
  '.....####....####.....',
  '.....####....####.....',
  '.....####....####.....',
  '....#####....#####....',
  '....#####....#####....',
  '...######....######...',
  '..#######....#######..',
  '.########....########.',
]);
px(135, 37, 0);
line(132, 44, 132, 58, 0);
line(138, 44, 138, 58, 0);
// Open ledger creates a unique white book silhouette.
line(120, 47, 128, 51);
line(128, 51, 136, 47);
line(120, 47, 120, 57);
line(136, 47, 136, 57);
line(120, 57, 128, 61);
line(128, 61, 136, 57);
rect(122, 49, 5, 7, 0);
rect(129, 49, 5, 7, 0);
line(128, 50, 128, 59);
ellipse(143, 59, 4, 5, 1, true);
line(140, 54, 146, 54);
// Handcart of finished cloth makes trade legible at a glance.
line(143, 66, 155, 66);
line(145, 66, 142, 76);
line(155, 66, 157, 76);
line(142, 76, 157, 76);
ellipse(145, 79, 3, 3, 1, false);
ellipse(155, 79, 3, 3, 1, false);
for (const x of [144, 149, 154]) {
  rect(x, 59, 4, 12);
  line(x, 60, x + 3, 63, 0);
  line(x, 65, x + 3, 68, 0);
}

// A continuous road and material trail tie the four stations together.
line(0, 82, 159, 82);
line(0, 88, 159, 88);
dither(0, 84, 160, 4);
for (const [x, y] of [[31, 75], [38, 73], [80, 73], [117, 76]]) {
  ellipse(x, y, 3, 2, 1, false);
}

// Sparse life marks; never soft or translucent.
line(12, 12, 14, 10);
line(14, 10, 16, 12);
line(72, 8, 74, 6);
line(74, 6, 76, 8);

const outW = W * SCALE;
const outH = H * SCALE;
const header = Buffer.from(`P6\n${outW} ${outH}\n255\n`, 'ascii');
const body = Buffer.alloc(outW * outH * 3);
for (let y = 0; y < outH; y += 1) {
  for (let x = 0; x < outW; x += 1) {
    const color = pixels[Math.floor(y / SCALE) * W + Math.floor(x / SCALE)] ? INK : PAPER;
    const offset = (y * outW + x) * 3;
    body[offset] = color[0];
    body[offset + 1] = color[1];
    body[offset + 2] = color[2];
  }
}

const destination = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../scenes/market-production-keyframe-320x180.ppm',
);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, Buffer.concat([header, body]));
console.log(destination);
