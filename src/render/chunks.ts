// Terrain is pre-rendered in 16x16-tile chunks per zoom level, kept in an LRU cache
// bounded by bytes so large maps stay within iOS Safari's canvas memory limits.
import { Noise } from '../sim/noise';
import { Rng } from '../sim/rng';
import { type GameMap, Terrain, isWater } from '../sim/terrain';
import type { Biome } from './biome';
import { LAND_RANK, TILE_VARIANTS, type TileArt, tileHash } from './tiles';

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
  /** One texel per tile (plus a 1-tile border): soft ground patches and water depth, drawn smoothed over each chunk. */
  private readonly tint: HTMLCanvasElement;

  constructor(
    private readonly map: GameMap,
    private readonly biome: Biome,
  ) {
    this.chunksPerSide = Math.ceil(map.size / CHUNK);
    this.tint = buildTint(map, biome);
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

  /** Frees every canvas backing store immediately. */
  dispose(): void {
    this.clear();
    for (const list of this.pool.values()) for (const c of list) c.width = c.height = 0;
    this.pool.clear();
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
    const strip = Math.max(1, Math.round(s * 0.1));
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    g.fillStyle = '#05070d';
    g.fillRect(0, 0, CHUNK * s, CHUNK * s);

    // Pass 1: ground tiles and soft edges between land types.
    for (let ty = 0; ty < CHUNK; ty++) {
      const y = y0 + ty;
      if (y >= N) break;
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = x0 + tx;
        if (x >= N) break;
        const t = map.terrain[y * N + x];
        const dx = tx * s, dy = ty * s;
        art.draw(g, t, tileHash(x, y) % TILE_VARIANTS, dx, dy);
        if (isWater(t)) continue;
        const rank = LAND_RANK[t];
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nt = map.terrain[ny * N + nx];
          if (!(LAND_RANK[nt] > rank)) continue;
          g.fillStyle = art.baseColor(nt);
          g.beginPath();
          for (let b = 0; b < 3; b++) {
            const along = s * (0.17 + b * 0.33) + ((tileHash(x + b, y + d) % 7) - 3) * s * 0.02;
            const r = s * 0.2 * (0.5 + (tileHash(x * 3 + d, y + b) % 5) * 0.12);
            const [bx, by] =
              d === 0 ? [dx + along, dy] : d === 1 ? [dx + s, dy + along] : d === 2 ? [dx + along, dy + s] : [dx, dy + along];
            g.moveTo(bx + r, by);
            g.arc(bx, by, r, 0, Math.PI * 2);
          }
          g.fill();
        }
      }
    }

    // Pass 2: large-scale tint (ground patches, water depth), smoothed across tiles and chunks.
    g.imageSmoothingEnabled = true;
    g.drawImage(this.tint, x0, y0, CHUNK + 2, CHUNK + 2, -s, -s, (CHUNK + 2) * s, (CHUNK + 2) * s);

    // Pass 3: shoreline foam, hills, decorations.
    for (let ty = 0; ty < CHUNK; ty++) {
      const y = y0 + ty;
      if (y >= N) break;
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = x0 + tx;
        if (x >= N) break;
        const i = y * N + x;
        const t = map.terrain[i];
        const dx = tx * s, dy = ty * s;
        const h = tileHash(x, y);

        if (isWater(t)) {
          g.fillStyle = 'rgba(240,250,255,0.55)';
          for (let d = 0; d < 4; d++) {
            const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
            if (nx < 0 || ny < 0 || nx >= N || ny >= N || isWater(map.terrain[ny * N + nx])) continue;
            if (d === 0) g.fillRect(dx, dy, s, strip);
            else if (d === 1) g.fillRect(dx + s - strip, dy, strip, s);
            else if (d === 2) g.fillRect(dx, dy + s - strip, s, strip);
            else g.fillRect(dx, dy, strip, s);
          }
          continue;
        }

        const e = map.elevation[i];
        if (e > 0) {
          g.fillStyle = `rgba(255,248,214,${0.06 * e})`;
          g.fillRect(dx, dy, s, s);
          // Light from the north-west: lit edges up/left, shaded slopes down/right.
          const lower = (nx: number, ny: number) =>
            nx >= 0 && ny >= 0 && nx < N && ny < N && map.elevation[ny * N + nx] < e;
          if (lower(x, y + 1)) {
            const grad = g.createLinearGradient(0, dy + s * 0.55, 0, dy + s);
            grad.addColorStop(0, 'rgba(52,36,14,0)');
            grad.addColorStop(1, 'rgba(52,36,14,0.42)');
            g.fillStyle = grad;
            g.fillRect(dx, dy + s * 0.55, s, s * 0.45);
          }
          if (lower(x + 1, y)) {
            g.fillStyle = 'rgba(30,20,8,0.16)';
            g.fillRect(dx + s - strip, dy, strip, s);
          }
          if (lower(x, y - 1)) {
            g.fillStyle = 'rgba(255,250,220,0.16)';
            g.fillRect(dx, dy, s, strip);
          }
          if (lower(x - 1, y)) {
            g.fillStyle = 'rgba(255,250,220,0.1)';
            g.fillRect(dx, dy, strip, s);
          }
        }

        if (t === Terrain.Grass) this.grassDecor(g, dx, dy, s, h);
        else if (t === Terrain.Dirt && h % 5 === 0) {
          g.fillStyle = 'rgba(120,110,95,0.85)';
          g.beginPath();
          g.ellipse(dx + s * (0.3 + ((h >>> 5) % 40) / 100), dy + s * (0.3 + ((h >>> 9) % 40) / 100), s * 0.07, s * 0.05, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  private grassDecor(g: CanvasRenderingContext2D, dx: number, dy: number, s: number, h: number): void {
    const { biome } = this;
    const u = s / 32;
    if (h % 4 === 0) {
      // Grass tuft.
      const px = dx + s * (0.2 + ((h >>> 4) % 60) / 100), py = dy + s * (0.3 + ((h >>> 10) % 55) / 100);
      g.strokeStyle = biome.grassSpecks[1];
      g.lineWidth = Math.max(1, u);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px - 2 * u, py - 4 * u);
      g.moveTo(px, py);
      g.lineTo(px, py - 5 * u);
      g.moveTo(px, py);
      g.lineTo(px + 2 * u, py - 4 * u);
      g.stroke();
    }
    if (((h >>> 6) % 1000) / 1000 < biome.flowerRate) {
      const rng = new Rng(h);
      g.fillStyle = biome.flowers[h % biome.flowers.length];
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(dx + s * (0.2 + rng.next() * 0.6), dy + s * (0.2 + rng.next() * 0.6), Math.max(1, 1.3 * u), 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

/** Builds the (N+2)^2 tint texture: noise patches on land, depth shading on water. */
function buildTint(map: GameMap, biome: Biome): HTMLCanvasElement {
  const N = map.size, P = N + 2;
  const noise = new Noise(new Rng(map.seed ^ 0x5eed));

  // Distance from land for every water tile (multi-source BFS, capped).
  const shore = new Uint8Array(N * N).fill(255);
  const queue: number[] = [];
  for (let i = 0; i < N * N; i++)
    if (!isWater(map.terrain[i])) {
      shore[i] = 0;
      queue.push(i);
    }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    if (shore[i] >= 10) continue;
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (shore[j] !== 255) continue;
      shore[j] = shore[i] + 1;
      queue.push(j);
    }
  }

  const c = document.createElement('canvas');
  c.width = c.height = P;
  const g = c.getContext('2d')!;
  const img = g.createImageData(P, P);
  const d = img.data;
  for (let py = 0; py < P; py++)
    for (let px = 0; px < P; px++) {
      const x = Math.min(N - 1, Math.max(0, px - 1)), y = Math.min(N - 1, Math.max(0, py - 1));
      const i = y * N + x, o = (py * P + px) * 4;
      if (isWater(map.terrain[i])) {
        const dist = shore[i] === 255 ? 10 : shore[i];
        if (map.terrain[i] === Terrain.Shallow || dist <= 1) {
          d.set([200, 240, 240, 60], o);
        } else {
          d.set([6, 22, 58, Math.min(130, (dist - 1) * 20)], o);
        }
      } else {
        const v = (noise.fbm(x, y, 9, 3) - 0.5) * 2 * biome.patchStrength;
        if (v > 0) d.set([255, 246, 196, Math.min(255, v * 255)], o);
        else d.set([22, 38, 8, Math.min(255, -v * 255)], o);
      }
    }
  g.putImageData(img, 0, 0);
  return c;
}
