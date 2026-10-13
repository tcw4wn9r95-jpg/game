// Terrain is pre-rendered in 8x8-tile chunks per zoom level, kept in an LRU cache
// bounded by bytes so large maps stay within iOS Safari's canvas memory limits.
import { Noise } from '../sim/noise';
import { Rng } from '../sim/rng';
import { type GameMap, Terrain, isWater } from '../sim/terrain';
import type { Biome } from './biome';
import { EDGE_NOISE_RES, EDGE_NOISE_TILES, SHEET, type TerrainTextures, boundaryNoise } from './textures';
import { GROUND_RANK, RANK_TERRAIN, tileHash } from './tiles';

export const CHUNK = 8;
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

  build(level: number, cx: number, cy: number, tex: TerrainTextures): HTMLCanvasElement {
    const px = CHUNK * tex.s;
    const c = this.pool.get(px)?.pop() ?? document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d')!;
    this.paint(g, cx, cy, tex);
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

  private tileImg: ImageData | null = null;

  private paint(g: CanvasRenderingContext2D, cx: number, cy: number, tex: TerrainTextures): void {
    const { map } = this;
    const N = map.size, s = tex.s;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;

    g.fillStyle = '#05070d';
    g.fillRect(0, 0, CHUNK * s, CHUNK * s);
    if (!this.tileImg || this.tileImg.width !== s) this.tileImg = g.createImageData(s, s);

    for (let ty = 0; ty < CHUNK; ty++) {
      const y = y0 + ty;
      if (y >= N) break;
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = x0 + tx;
        if (x >= N) break;
        const t = map.terrain[y * N + x];
        // Interior tiles copy straight from the texture sheet; boundary tiles are blended per pixel.
        let uniform = true;
        for (let dy = -1; dy <= 1 && uniform; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < N && ny < N && map.terrain[ny * N + nx] !== t) {
              uniform = false;
              break;
            }
          }
        if (uniform) {
          g.drawImage(tex.sheets[t], (x % SHEET) * s, (y % SHEET) * s, s, s, tx * s, ty * s, s, s);
        } else {
          this.blendTile(tex, x, y);
          g.putImageData(this.tileImg, tx * s, ty * s);
        }
      }
    }

    // Lighting: ground patches, hill shading and water depth, smoothed across tiles and chunks.
    g.imageSmoothingEnabled = true;
    g.drawImage(this.tint, x0, y0, CHUNK + 2, CHUNK + 2, -s, -s, (CHUNK + 2) * s, (CHUNK + 2) * s);

    for (let ty = 0; ty < CHUNK; ty++) {
      const y = y0 + ty;
      if (y >= N) break;
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = x0 + tx;
        if (x >= N) break;
        if (map.terrain[y * N + x] === Terrain.Grass) this.flowers(g, tx * s, ty * s, s, tileHash(x, y));
      }
    }
  }

  /**
   * Fills tileImg for a tile on a terrain boundary. Each ground layer (by rank) is
   * interpolated between neighbouring tile centres, nudged by world-space noise and
   * thresholded, so boundaries run smoothly and diagonally instead of along the grid.
   * Shared edges sample the same centres and noise, so tiles join seamlessly.
   */
  private blendTile(tex: TerrainTextures, x: number, y: number): void {
    const { map } = this;
    const N = map.size, s = tex.s, P = tex.P;
    const out = this.tileImg!.data;
    const noise = boundaryNoise();
    const NW = EDGE_NOISE_RES * EDGE_NOISE_TILES;

    // Ranks of the 3x3 neighbourhood (edges clamp to the centre tile).
    const r = new Int8Array(9);
    let lo = 9, hi = -1;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        const t = nx >= 0 && ny >= 0 && nx < N && ny < N ? map.terrain[ny * N + nx] : map.terrain[y * N + x];
        const k = GROUND_RANK[t];
        r[(dy + 1) * 3 + dx + 1] = k;
        if (k < lo) lo = k;
        if (k > hi) hi = k;
      }

    const sx0 = (x % SHEET) * s, sy0 = (y % SHEET) * s;
    const landRank = GROUND_RANK[Terrain.Sand];
    for (let py = 0; py < s; py++) {
      const v = (py + 0.5) / s;
      const qy = v < 0.5 ? -1 : 1;
      const wy = Math.abs(v - 0.5);
      const ny = ((((y + v) * EDGE_NOISE_RES) | 0) % NW) * NW;
      for (let px = 0; px < s; px++) {
        const u = (px + 0.5) / s;
        const qx = u < 0.5 ? -1 : 1;
        const wx = Math.abs(u - 0.5);
        const w00 = (1 - wx) * (1 - wy), w10 = wx * (1 - wy), w01 = (1 - wx) * wy, w11 = wx * wy;
        const c00 = r[4], c10 = r[4 + qx], c01 = r[4 + qy * 3], c11 = r[4 + qy * 3 + qx];
        const n = noise[ny + ((((x + u) * EDGE_NOISE_RES) | 0) % NW)] * 0.55;

        const so = ((sy0 + py) * P + sx0 + px) * 4;
        let src = tex.pixels[RANK_TERRAIN[lo]];
        let R = src[so], G = src[so + 1], B = src[so + 2];
        let landField = 0;
        for (let k = lo + 1; k <= hi; k++) {
          // Fraction of the four surrounding tile centres at rank >= k.
          const f = (c00 >= k ? w00 : 0) + (c10 >= k ? w10 : 0) + (c01 >= k ? w01 : 0) + (c11 >= k ? w11 : 0) + n;
          if (k === landRank) landField = f;
          const a = f <= 0.44 ? 0 : f >= 0.56 ? 1 : (f - 0.44) / 0.12;
          if (a === 0) continue;
          src = tex.pixels[RANK_TERRAIN[k]];
          R += (src[so] - R) * a;
          G += (src[so + 1] - G) * a;
          B += (src[so + 2] - B) * a;
        }
        if (lo < landRank && hi >= landRank) {
          // Surf just off the shore, and wet sand just on it.
          const d = landField - 0.5;
          const foam = d < 0 ? 0.75 * Math.exp(-(((d + 0.07) / 0.045) ** 2)) : 0;
          if (foam > 0.02) {
            R += (245 - R) * foam;
            G += (250 - G) * foam;
            B += (250 - B) * foam;
          } else if (d > 0 && d < 0.1) {
            const wet = 0.18 * (1 - d / 0.1);
            R *= 1 - wet;
            G *= 1 - wet;
            B *= 1 - wet * 0.7;
          }
        }
        const o = (py * s + px) * 4;
        out[o] = R;
        out[o + 1] = G;
        out[o + 2] = B;
        out[o + 3] = 255;
      }
    }
  }

  private flowers(g: CanvasRenderingContext2D, dx: number, dy: number, s: number, h: number): void {
    const { biome } = this;
    if (((h >>> 6) % 1000) / 1000 >= biome.flowerRate) return;
    const rng = new Rng(h);
    const u = s / 32;
    const cx = dx + s * (0.25 + rng.next() * 0.5), cy = dy + s * (0.25 + rng.next() * 0.5);
    const col = biome.flowers[h % biome.flowers.length];
    for (let k = 0; k < 5; k++) {
      const fx = cx + (rng.next() - 0.5) * s * 0.4, fy = cy + (rng.next() - 0.5) * s * 0.4;
      g.fillStyle = 'rgba(20,40,10,0.35)';
      g.fillRect(fx, fy + u * 0.6, Math.max(1, u * 0.9), Math.max(1, u * 0.6));
      g.fillStyle = col;
      g.fillRect(fx, fy, Math.max(1, u * 0.9), Math.max(1, u * 0.9));
    }
  }
}

/** Builds the (N+2)^2 lighting texture: noise patches and hill shading on land, depth shading on water. */
function buildTint(map: GameMap, biome: Biome): HTMLCanvasElement {
  const N = map.size, P = N + 2;
  const noise = new Noise(new Rng(map.seed ^ 0x5eed));
  const clampXY = (v: number) => Math.min(N - 1, Math.max(0, v));

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

  // Smoothed height field for hill shading (two 3x3 box blurs).
  let h = Float32Array.from(map.elevation);
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += h[clampXY(y + dy) * N + clampXY(x + dx)];
        out[y * N + x] = sum / 9;
      }
    h = out;
  }
  const height = (x: number, y: number) => h[clampXY(y) * N + clampXY(x)];

  const c = document.createElement('canvas');
  c.width = c.height = P;
  const g = c.getContext('2d')!;
  const img = g.createImageData(P, P);
  const d = img.data;
  for (let py = 0; py < P; py++)
    for (let px = 0; px < P; px++) {
      const x = clampXY(px - 1), y = clampXY(py - 1);
      const i = y * N + x, o = (py * P + px) * 4;
      if (isWater(map.terrain[i])) {
        const dist = shore[i] === 255 ? 10 : shore[i];
        if (map.terrain[i] === Terrain.Shallow || dist <= 1) d.set([210, 245, 245, 50], o);
        else d.set([4, 18, 50, Math.min(140, (dist - 1) * 22)], o);
        continue;
      }
      // Light from the north-west: slopes facing it brighten, the far side darkens.
      const slope = height(x - 1, y - 1) - height(x + 1, y + 1);
      let l = (noise.fbm(x, y, 9, 3) - 0.5) * 2 * biome.patchStrength + slope * 0.32 + height(x, y) * 0.03;
      const nearWater = DIRS.some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < N && ny < N && isWater(map.terrain[ny * N + nx]);
      });
      if (nearWater) l -= 0.1;
      if (l > 0) d.set([255, 238, 170, Math.min(90, l * 200)], o);
      else d.set([18, 30, 6, Math.min(200, -l * 255)], o);
    }
  g.putImageData(img, 0, 0);
  return c;
}
