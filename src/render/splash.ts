import { Rng } from '../sim/rng';
import type { View } from './canvas';

const TILE = 32;
const PATTERN_TILES = 8;

/** Procedural meadow drawn once to an offscreen canvas, then tiled. */
function makeMeadow(): HTMLCanvasElement {
  const size = TILE * PATTERN_TILES;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rng = new Rng(7);
  for (let ty = 0; ty < PATTERN_TILES; ty++) {
    for (let tx = 0; tx < PATTERN_TILES; tx++) {
      const shade = 0.9 + rng.next() * 0.2;
      g.fillStyle = `rgb(${Math.round(78 * shade)},${Math.round(140 * shade)},${Math.round(62 * shade)})`;
      g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = rng.next() < 0.5 ? '#5f9e45' : '#3f7a35';
        g.fillRect(tx * TILE + rng.int(2, TILE - 4), ty * TILE + rng.int(2, TILE - 6), 2, 4);
      }
    }
  }
  return c;
}

let meadow: HTMLCanvasElement | null = null;

/** M0 placeholder scene: a scrolling meadow and the title banner. */
export function drawSplash(view: View, scrollX: number): void {
  const { ctx, width, height } = view;
  meadow ??= makeMeadow();
  const size = meadow.width;
  const ox = -(((scrollX % size) + size) % size);
  for (let y = 0; y < height; y += size) {
    for (let x = ox; x < width; x += size) ctx.drawImage(meadow, x, y);
  }

  const cx = width / 2, cy = height / 2;
  ctx.fillStyle = 'rgba(14,20,38,0.78)';
  ctx.beginPath();
  ctx.roundRect(cx - 170, cy - 46, 340, 92, 14);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f6c440';
  ctx.font = '700 30px Georgia, "Times New Roman", serif';
  ctx.fillText('Hearth & Crown', cx, cy - 10);
  ctx.fillStyle = '#f4ecd8';
  ctx.font = '500 13px -apple-system, sans-serif';
  ctx.fillText('M0 scaffold · the realm is being built', cx, cy + 24);
}
