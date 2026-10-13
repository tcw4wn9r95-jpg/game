// Terrain is pre-rendered in 16x16-tile chunks per zoom level, kept in an LRU cache
// bounded by bytes so large maps stay within iOS Safari's canvas memory limits.
import { type GameMap, isWater } from '../sim/terrain';
import { LAND_RANK, TILE_VARIANTS, type TileArt, edgeColor, tileHash } from './tiles';

export const CHUNK = 16;
const BUDGET_BYTES = 64 * 1024 * 1024;
const POOL_PER_SIZE = 2;

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

export class ChunkCache {
  private cache = new Map<string, HTMLCanvasElement>();
  private bytes = 0;
  /** Recycled canvases from evicted chunks, keyed by pixel size. */
  private pool = new Map<number, HTMLCanvasElement[]>();
  readonly chunksPerSide: number;

  constructor(private readonly map: GameMap) {
    this.chunksPerSide = Math.ceil(map.size / CHUNK);
  }

  get(level: number, cx: number, cy: number): HTMLCanvasElement | undefined {
    const key = `${level}:${cx}:${cy}`;
    const c = this.cache.get(key);
    if (c) {
      // Refresh LRU position.
      this.cache.delete(key);
      this.cache.set(key, c);
    }
    return c;
  }

  /** Any cached zoom level of this chunk, for drawing scaled while the right one builds. */
  anyLevel(cx: number, cy: number, levels: number): HTMLCanvasElement | undefined {
    for (let l = 0; l < levels; l++) {
      const c = this.cache.get(`${l}:${cx}:${cy}`);
      if (c) return c;
    }
    return undefined;
  }

  build(level: number, cx: number, cy: number, art: TileArt): HTMLCanvasElement {
    const px = CHUNK * art.s;
    const c = this.pool.get(px)?.pop() ?? document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d')!;
    this.paint(g, cx, cy, art);
    const key = `${level}:${cx}:${cy}`;
    this.cache.set(key, c);
    this.bytes += px * px * 4;
    this.evict();
    return c;
  }

  /** Drops every cached chunk overlapping a tile (terrain changed there). */
  invalidateTile(x: number, y: number): void {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    for (const key of [...this.cache.keys()]) {
      const [, kx, ky] = key.split(':').map(Number);
      if (kx === cx && ky === cy) this.remove(key);
    }
  }

  clear(): void {
    for (const key of [...this.cache.keys()]) this.remove(key);
  }

  private evict(): void {
    for (const key of this.cache.keys()) {
      if (this.bytes <= BUDGET_BYTES) break;
      this.remove(key);
    }
  }

  private remove(key: string): void {
    const c = this.cache.get(key);
    if (!c) return;
    this.cache.delete(key);
    this.bytes -= c.width * c.height * 4;
    const size = c.width;
    const list = this.pool.get(size) ?? [];
    if (list.length < POOL_PER_SIZE) list.push(c);
    else c.width = c.height = 0; // release the backing store now rather than at GC
    this.pool.set(size, list);
  }

  private paint(g: CanvasRenderingContext2D, cx: number, cy: number, art: TileArt): void {
    const { map } = this;
    const N = map.size, s = art.s;
    const strip = Math.max(1, Math.round(s * 0.12));
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    g.fillStyle = '#05070d';
    g.fillRect(0, 0, CHUNK * s, CHUNK * s);
    for (let ty = 0; ty < CHUNK; ty++) {
      const y = y0 + ty;
      if (y >= N) break;
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = x0 + tx;
        if (x >= N) break;
        const i = y * N + x;
        const t = map.terrain[i];
        const dx = tx * s, dy = ty * s;
        art.draw(g, t, tileHash(x, y) % TILE_VARIANTS, dx, dy);

        if (isWater(t)) {
          // Foam where water meets land.
          for (let d = 0; d < 4; d++) {
            const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
            if (nx < 0 || ny < 0 || nx >= N || ny >= N || isWater(map.terrain[ny * N + nx])) continue;
            g.fillStyle = 'rgba(150,210,230,0.45)';
            const band = strip * 2;
            if (d === 0) g.fillRect(dx, dy, s, band);
            else if (d === 1) g.fillRect(dx + s - band, dy, band, s);
            else if (d === 2) g.fillRect(dx, dy + s - band, s, band);
            else g.fillRect(dx, dy, band, s);
            g.fillStyle = 'rgba(240,250,255,0.7)';
            if (d === 0) g.fillRect(dx, dy, s, strip);
            else if (d === 1) g.fillRect(dx + s - strip, dy, strip, s);
            else if (d === 2) g.fillRect(dx, dy + s - strip, s, strip);
            else g.fillRect(dx, dy, strip, s);
          }
          continue;
        }

        // Soften edges where a higher-ranked land type borders this tile.
        const rank = LAND_RANK[t];
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nt = map.terrain[ny * N + nx];
          if (!(LAND_RANK[nt] > rank)) continue;
          g.fillStyle = edgeColor(nt);
          const r = s * 0.2;
          g.beginPath();
          for (let b = 0; b < 3; b++) {
            const along = s * (0.17 + b * 0.33) + ((tileHash(x + b, y + d) % 7) - 3) * s * 0.02;
            const depth = r * (0.5 + (tileHash(x * 3 + d, y + b) % 5) * 0.12);
            const [bx, by] =
              d === 0 ? [dx + along, dy] : d === 1 ? [dx + s, dy + along] : d === 2 ? [dx + along, dy + s] : [dx, dy + along];
            g.moveTo(bx + depth, by);
            g.arc(bx, by, depth, 0, Math.PI * 2);
          }
          g.fill();
        }

        const e = map.elevation[i];
        if (e > 0) {
          g.fillStyle = `rgba(255,248,214,${0.07 * e})`;
          g.fillRect(dx, dy, s, s);
        }
        // Light from the north-west: lit edges up/left, shaded slopes down/right.
        const lower = (nx: number, ny: number) =>
          nx >= 0 && ny >= 0 && nx < N && ny < N && map.elevation[ny * N + nx] < e;
        if (e > 0) {
          if (lower(x, y + 1)) {
            g.fillStyle = 'rgba(52,36,14,0.38)';
            g.fillRect(dx, dy + s - strip * 2, s, strip * 2);
          }
          if (lower(x + 1, y)) {
            g.fillStyle = 'rgba(30,20,8,0.2)';
            g.fillRect(dx + s - strip, dy, strip, s);
          }
          if (lower(x, y - 1)) {
            g.fillStyle = 'rgba(255,250,220,0.18)';
            g.fillRect(dx, dy, s, strip);
          }
          if (lower(x - 1, y)) {
            g.fillStyle = 'rgba(255,250,220,0.12)';
            g.fillRect(dx, dy, strip, s);
          }
        }
      }
    }
  }
}
