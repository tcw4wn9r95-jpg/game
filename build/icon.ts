// Procedural app icon: a golden crown above a stone hearth with a fire.
// Rendered per-pixel with supersampling and encoded as PNG with node's zlib,
// so the repo carries no image assets.
import { deflateSync } from 'node:zlib';

type RGB = [number, number, number];
type Shape = (x: number, y: number) => boolean;

const rect = (x0: number, y0: number, x1: number, y1: number): Shape =>
  (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const circle = (cx: number, cy: number, r: number): Shape =>
  (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): Shape => {
  const s = (px: number, py: number, qx: number, qy: number, x: number, y: number) =>
    (x - qx) * (py - qy) - (px - qx) * (y - qy);
  return (x, y) => {
    const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
};
const union = (...shapes: Shape[]): Shape => (x, y) => shapes.some((s) => s(x, y));

const GOLD: RGB = [246, 196, 64];
const GOLD_DARK: RGB = [196, 140, 30];
const STONE: RGB = [150, 146, 140];
const STONE_LIGHT: RGB = [196, 192, 184];
const SOOT: RGB = [28, 16, 12];
const FLAME: RGB = [244, 110, 36];
const FLAME_CORE: RGB = [255, 222, 90];
const RUBY: RGB = [200, 32, 48];

// Layers are painted in order; coordinates are in a 0..1 square.
const layers: Array<[Shape, RGB]> = [
  // Hearth
  [rect(0.26, 0.58, 0.74, 0.88), STONE],
  [rect(0.22, 0.54, 0.78, 0.61), STONE_LIGHT],
  [union(rect(0.36, 0.68, 0.64, 0.88), circle(0.5, 0.69, 0.14)), SOOT],
  [union(circle(0.5, 0.79, 0.085), tri(0.415, 0.78, 0.585, 0.78, 0.5, 0.6)), FLAME],
  [union(circle(0.5, 0.815, 0.045), tri(0.455, 0.81, 0.545, 0.81, 0.5, 0.7)), FLAME_CORE],
  // Crown
  [tri(0.29, 0.40, 0.44, 0.40, 0.31, 0.19), GOLD],
  [tri(0.39, 0.40, 0.61, 0.40, 0.5, 0.14), GOLD],
  [tri(0.56, 0.40, 0.71, 0.40, 0.69, 0.19), GOLD],
  [rect(0.29, 0.38, 0.71, 0.47), GOLD_DARK],
  [union(circle(0.31, 0.19, 0.03), circle(0.5, 0.14, 0.03), circle(0.69, 0.19, 0.03)), GOLD],
  [circle(0.5, 0.425, 0.03), RUBY],
];

function background(x: number, y: number): RGB {
  const d = Math.min(1, Math.hypot(x - 0.5, y - 0.45) / 0.75);
  return [27 - 13 * d, 36 - 16 * d, 64 - 26 * d];
}

/** Returns RGBA pixels. `scale` < 1 shrinks the artwork toward the centre (maskable safe zone). */
export function renderIcon(size: number, scale = 1): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const ss = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (px + (sx + 0.5) / ss) / size;
          const v = (py + (sy + 0.5) / ss) / size;
          let c = background(u, v);
          const lu = (u - 0.5) / scale + 0.5, lv = (v - 0.5) / scale + 0.5;
          for (const [shape, color] of layers) if (shape(lu, lv)) c = color;
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const i = (py * size + px) * 4, n = ss * ss;
      out[i] = r / n; out[i + 1] = g / n; out[i + 2] = b / n; out[i + 3] = 255;
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(size: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const iconPng = (size: number, scale = 1) => encodePng(size, renderIcon(size, scale));
