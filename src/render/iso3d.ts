// Tiny isometric 3D toolkit for building sprites. Coordinates: x, y in tiles from
// the footprint's north corner (+x toward the lower right, +y toward the lower
// left), z in units up. One tile is a diamond 64 units wide and 32 tall.
// Light comes from the upper left: south-west faces are lit, south-east faces shaded.

export type G = CanvasRenderingContext2D;
export type V3 = [number, number, number];

export const HALF_W = 32;
export const HALF_H = 16;

export function P(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * HALF_W, (x + y) * HALF_H - z];
}

export function poly3(g: G, pts: V3[], fill: string | CanvasGradient | CanvasPattern, stroke: string | null = 'rgba(25,15,5,0.65)', lw = 0.8): void {
  g.beginPath();
  pts.forEach((p, i) => {
    const [X, Y] = P(p[0], p[1], p[2]);
    if (i) g.lineTo(X, Y);
    else g.moveTo(X, Y);
  });
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.stroke();
  }
}

export function line3(g: G, a: V3, b: V3, color: string, lw = 1): void {
  const [ax, ay] = P(a[0], a[1], a[2]);
  const [bx, by] = P(b[0], b[1], b[2]);
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
}

/**
 * Runs `draw` in the plane of a wall: local u runs along the wall in units
 * (32 per tile), v runs up. 'left' walls lie along +x at fixed y (facing the
 * lower left); 'right' walls lie along -y at fixed x (facing the lower right),
 * with u = 0 at the southern end.
 */
export function onWall(g: G, side: 'left' | 'right', x: number, y: number, z: number, draw: () => void): void {
  g.save();
  const [ex, ey] = P(x, y, z);
  if (side === 'left') g.transform(1, 0.5, 0, -1, ex, ey);
  else g.transform(1, -0.5, 0, -1, ex, ey);
  draw();
  g.restore();
}

/** Runs `draw` on the ground plane: local (u, v) in units along +x and +y. */
export function onGround(g: G, x: number, y: number, draw: () => void): void {
  g.save();
  const [ex, ey] = P(x, y, 0);
  g.transform(1, 0.5, -1, 0.5, ex, ey);
  draw();
  g.restore();
}

export function shadeColor(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Soft shadow of a box on the ground, thrown toward the lower right. */
export function boxShadow(g: G, x0: number, y0: number, x1: number, y1: number, h: number): void {
  const off = (h / 32) * 0.9;
  g.save();
  g.fillStyle = 'rgba(12,18,6,0.30)';
  g.beginPath();
  const pts: V3[] = [
    [x0, y1, 0],
    [x1, y1, 0],
    [x1 + off, y1 - off * 0.25, 0],
    [x1 + off, y0 - off * 0.25, 0],
    [x1, y0, 0],
  ];
  pts.forEach((p, i) => {
    const [X, Y] = P(p[0], p[1]);
    if (i) g.lineTo(X, Y);
    else g.moveTo(X, Y);
  });
  g.closePath();
  g.fill();
  g.restore();
}

export interface WallStyle {
  base: string;
  /** Timber frame colour for half-timbered plaster, or null for plain. */
  frame?: string | null;
  /** Stone courses instead of plaster. */
  stone?: boolean;
  /** Horizontal planks. */
  planks?: boolean;
}

/** Fills one wall face with its material, then optional detail. */
function wallFace(g: G, len: number, h: number, style: WallStyle, lit: number, detail?: (len: number, h: number) => void): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, shadeColor(style.base, 0.82 * lit));
  grad.addColorStop(1, shadeColor(style.base, 1.04 * lit));
  g.fillStyle = grad;
  g.fillRect(0, 0, len, h);
  if (style.stone) {
    g.strokeStyle = `rgba(30,25,20,${0.35 * lit})`;
    g.lineWidth = 0.6;
    for (let v = 0, row = 0; v < h; v += 4, row++)
      for (let u = row % 2 ? -3 : 0; u < len; u += 6) g.strokeRect(u, v, 6, 4);
  }
  if (style.planks) {
    g.strokeStyle = 'rgba(40,25,10,0.45)';
    g.lineWidth = 0.6;
    for (let v = 3; v < h; v += 3.2) {
      g.beginPath();
      g.moveTo(0, v);
      g.lineTo(len, v);
      g.stroke();
    }
  }
  if (style.frame) {
    // Half-timbering: posts, a mid rail, and braces.
    g.strokeStyle = style.frame;
    g.lineWidth = 1.6;
    g.strokeRect(0.8, 0.8, len - 1.6, h - 1.6);
    const n = Math.max(2, Math.round(len / 11));
    for (let k = 1; k < n; k++) {
      const u = (len * k) / n;
      g.beginPath();
      g.moveTo(u, 0);
      g.lineTo(u, h);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, h * 0.5);
    g.lineTo(len, h * 0.5);
    g.moveTo(0, 0);
    g.lineTo(len / n, h * 0.5);
    g.moveTo(len, 0);
    g.lineTo(len - len / n, h * 0.5);
    g.stroke();
  }
  detail?.(len, h);
}

/** Window with frame and a dim interior (v from the bottom). */
export function windowAt(g: G, u: number, v: number, w = 4, h = 5): void {
  g.fillStyle = '#2a1a0c';
  g.fillRect(u - w / 2, v, w, h);
  g.fillStyle = 'rgba(255,210,120,0.25)';
  g.fillRect(u - w / 2 + 0.6, v + 0.6, w - 1.2, h * 0.4);
  g.strokeStyle = '#5a3d22';
  g.lineWidth = 0.8;
  g.strokeRect(u - w / 2, v, w, h);
  g.beginPath();
  g.moveTo(u, v);
  g.lineTo(u, v + h);
  g.stroke();
}

export function doorAt(g: G, u: number, w = 6, h = 10): void {
  g.fillStyle = '#3a2412';
  g.beginPath();
  g.moveTo(u - w / 2, 0);
  g.lineTo(u - w / 2, h - w / 2);
  g.arc(u, h - w / 2, w / 2, Math.PI, 0, true);
  g.lineTo(u + w / 2, 0);
  g.closePath();
  g.fill();
  g.strokeStyle = '#6b4a2a';
  g.lineWidth = 0.7;
  for (const k of [-1.5, 0, 1.5]) {
    g.beginPath();
    g.moveTo(u + k, 0);
    g.lineTo(u + k, h - 2);
    g.stroke();
  }
}

/**
 * A box with walls (two visible faces). Detail callbacks draw in wall space:
 * u along the wall (left: from the west corner; right: from the south corner), v up.
 */
export function box(
  g: G,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h: number,
  style: WallStyle,
  detail: { left?: (len: number, h: number) => void; right?: (len: number, h: number) => void } = {},
): void {
  const lenL = (x1 - x0) * 32, lenR = (y1 - y0) * 32;
  onWall(g, 'right', x1, y1, 0, () => wallFace(g, lenR, h, style, 0.72, detail.right));
  onWall(g, 'left', x0, y1, 0, () => wallFace(g, lenL, h, style, 1, detail.left));
  // Outline the silhouette.
  poly3(g, [[x0, y1, 0], [x1, y1, 0], [x1, y0, 0], [x1, y0, h], [x1, y1, h], [x0, y1, h]], 'rgba(0,0,0,0)', 'rgba(25,15,5,0.7)', 0.9);
}

export interface RoofStyle {
  /** Base colour of the roof covering. */
  color: string;
  kind: 'thatch' | 'shingle' | 'canvas';
  /** Team-coloured trim along the eaves (canvas roofs). */
  trim?: string;
}

/** Strokes across a roof slope from eave (a->b) up to ridge (c->d). */
function slopeTexture(g: G, a: V3, b: V3, c: V3, d: V3, style: RoofStyle, light: number, seed: number): void {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = style.kind === 'canvas' ? 6 : 30;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const e: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const r: V3 = [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t];
    if (style.kind === 'thatch') {
      const k = 0.75 + rnd() * 0.4;
      line3(g, e, r, shadeColor(style.color, k * light), 0.9);
    } else if (style.kind === 'shingle') {
      line3(g, e, r, `rgba(30,15,5,${0.3 * light})`, 0.6);
    } else {
      line3(g, e, r, `rgba(80,60,30,${0.25 * light})`, 0.7);
    }
  }
  if (style.kind === 'shingle')
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const p: V3 = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
      const q: V3 = [b[0] + (d[0] - b[0]) * t, b[1] + (d[1] - b[1]) * t, b[2] + (d[2] - b[2]) * t];
      line3(g, p, q, 'rgba(30,15,5,0.35)', 0.6);
    }
}

/**
 * Gable roof over a box, ridge along x (gable ends face the lower right) or
 * along y (gable ends face the lower left). `o` is the eave overhang in tiles.
 */
export function gableRoof(g: G, x0: number, y0: number, x1: number, y1: number, h: number, rise: number, style: RoofStyle, along: 'x' | 'y' = 'x', o = 0.12, seed = 7): void {
  const top = h + rise;
  const wall = style.kind === 'canvas' ? style.color : '#d8c8a0';
  if (along === 'x') {
    const ym = (y0 + y1) / 2;
    const A: V3 = [x0 - o, ym, top], B: V3 = [x1 + o, ym, top];
    // Back slope, then the gable end, then the lit front slope.
    poly3(g, [A, B, [x1 + o, y0 - o, h], [x0 - o, y0 - o, h]], shadeColor(style.color, 0.62));
    poly3(g, [[x1, y0, h], [x1, y1, h], [x1, ym, top]], shadeColor(wall, 0.7));
    const front: V3[] = [[x0 - o, y1 + o, h], [x1 + o, y1 + o, h], B, A];
    const [fx0, fy0] = P(x0, y1 + o, h), [, fy1] = P(x0, ym, top);
    const grad = g.createLinearGradient(fx0, fy0, fx0, fy1);
    grad.addColorStop(0, shadeColor(style.color, 0.85));
    grad.addColorStop(1, shadeColor(style.color, 1.12));
    poly3(g, front, grad);
    slopeTexture(g, front[0], front[1], A, B, style, 1, seed);
    if (style.trim) line3(g, front[0], front[1], style.trim, 2.4);
  } else {
    const xm = (x0 + x1) / 2;
    const A: V3 = [xm, y0 - o, top], B: V3 = [xm, y1 + o, top];
    poly3(g, [A, B, [x0 - o, y1 + o, h], [x0 - o, y0 - o, h]], shadeColor(style.color, 1.05));
    const right: V3[] = [[x1 + o, y1 + o, h], [x1 + o, y0 - o, h], A, B];
    poly3(g, right, shadeColor(style.color, 0.7));
    slopeTexture(g, right[0], right[1], B, A, style, 0.7, seed);
    poly3(g, [[x0, y1, h], [x1, y1, h], [xm, y1, top]], wall);
    if (style.trim) line3(g, right[0], right[1], style.trim, 2.4);
  }
}

/** Four-sided (hipped) roof, e.g. a canvas awning or a tower cap. */
export function hipRoof(g: G, x0: number, y0: number, x1: number, y1: number, h: number, rise: number, style: RoofStyle, o = 0.12, seed = 3): void {
  const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  const inset = Math.min(x1 - x0, y1 - y0) / 2 - 0.05;
  const peakA: V3 = [x0 + inset, ym, h + rise], peakB: V3 = [x1 - inset, ym, h + rise];
  const c00: V3 = [x0 - o, y0 - o, h], c10: V3 = [x1 + o, y0 - o, h], c11: V3 = [x1 + o, y1 + o, h], c01: V3 = [x0 - o, y1 + o, h];
  poly3(g, [c00, c10, peakB, peakA], shadeColor(style.color, 0.65));
  poly3(g, [c00, peakA, c01], shadeColor(style.color, 0.95));
  poly3(g, [c10, c11, peakB], shadeColor(style.color, 0.72));
  slopeTexture(g, c11, c10, peakB, peakB, style, 0.72, seed);
  poly3(g, [c01, c11, peakB, peakA], shadeColor(style.color, 1.1));
  slopeTexture(g, c01, c11, peakA, peakB, style, 1, seed + 1);
  if (style.trim) {
    line3(g, c01, c11, style.trim, 2.6);
    line3(g, c11, c10, shadeColor(style.trim, 0.75), 2.6);
  }
  void xm;
}

/** A round wooden post (log) standing at (x, y). */
export function post(g: G, x: number, y: number, h: number, w = 2.2, color = '#6e4b2a'): void {
  const [bx, by] = P(x, y, 0);
  const grad = g.createLinearGradient(bx - w, 0, bx + w, 0);
  grad.addColorStop(0, shadeColor(color, 1.25));
  grad.addColorStop(1, shadeColor(color, 0.6));
  g.fillStyle = grad;
  g.fillRect(bx - w / 2, by - h, w, h);
  g.strokeStyle = 'rgba(25,15,5,0.7)';
  g.lineWidth = 0.6;
  g.strokeRect(bx - w / 2, by - h, w, h);
}

/** A horizontal log lying from a to b at height z. */
export function log(g: G, a: [number, number], b: [number, number], z: number, r = 1.8): void {
  const [ax, ay] = P(a[0], a[1], z), [bx, by] = P(b[0], b[1], z);
  g.strokeStyle = 'rgba(25,15,5,0.8)';
  g.lineCap = 'round';
  g.lineWidth = r * 2 + 1;
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
  g.strokeStyle = '#8a5d32';
  g.lineWidth = r * 2;
  g.stroke();
  g.strokeStyle = 'rgba(255,220,160,0.35)';
  g.lineWidth = r * 0.6;
  g.beginPath();
  g.moveTo(ax, ay - r * 0.5);
  g.lineTo(bx, by - r * 0.5);
  g.stroke();
  g.fillStyle = '#d9b27a';
  g.beginPath();
  g.ellipse(bx, by, r * 0.9, r, 0, 0, Math.PI * 2);
  g.fill();
}
