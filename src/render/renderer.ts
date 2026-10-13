import type { Fog } from '../sim/fog';
import { Feature, type GameMap, type Animal } from '../sim/terrain';
import type { View } from './canvas';
import { type Camera, ZOOM_LEVELS } from './camera';
import { CHUNK, ChunkCache } from './chunks';
import { FOG_RGB, FogLayer } from './fogLayer';
import { type Sprite, SpriteSet } from './sprites';
import { BIOMES, type Biome, pickTree } from './biome';
import { TileArt, tileHash } from './tiles';

/** Chunks built per frame after the first; the rest draw from another zoom level meanwhile. */
const CHUNK_BUILDS_PER_FRAME = 3;
const BG = `rgb(${FOG_RGB.join(',')})`;

interface LevelArt {
  s: number;
  tiles: TileArt;
  sprites: SpriteSet;
}

/** Draws the world: cached terrain chunks, y-sorted objects, then fog. */
export class Renderer {
  private levels: Array<LevelArt | null> = ZOOM_LEVELS.map(() => null);
  private artDpr = 0;
  private readonly chunks: ChunkCache;
  private readonly fogLayer: FogLayer;
  private firstFrame = true;
  private animalRows: Animal[] = [];
  private readonly biome: Biome;

  constructor(
    private readonly view: View,
    private readonly map: GameMap,
    private readonly fog: Fog,
  ) {
    this.biome = BIOMES[map.type];
    this.chunks = new ChunkCache(map, this.biome);
    this.fogLayer = new FogLayer(fog);
  }

  private art(level: number): LevelArt {
    if (this.artDpr !== this.view.dpr) {
      this.artDpr = this.view.dpr;
      this.levels = ZOOM_LEVELS.map(() => null);
      this.chunks.clear();
      this.firstFrame = true;
    }
    let a = this.levels[level];
    if (!a) {
      const s = Math.round(ZOOM_LEVELS[level] * this.view.dpr);
      a = { s, tiles: new TileArt(s, this.biome), sprites: new SpriteSet(s) };
      this.levels[level] = a;
    }
    return a;
  }

  dispose(): void {
    this.chunks.dispose();
  }

  draw(cam: Camera): void {
    const { ctx, dpr } = this.view;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const level = cam.level;
    const art = this.art(level);
    // At rest, draw 1:1 from the cached art; while zooming, scale it.
    const exact = !cam.animating;
    const S = exact ? art.s : cam.scale * dpr;
    const k = S / art.s;
    const ox = Math.round(cam.x * S - W / 2), oy = Math.round(cam.y * S - H / 2);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    this.drawChunks(level, art, S, ox, oy, W, H, exact);
    this.drawObjects(art, S, k, ox, oy, W, H, exact);
    this.fogLayer.refresh();
    this.fogLayer.draw(ctx, ox, oy, S, W, H);
    this.firstFrame = false;
  }

  private drawChunks(level: number, art: LevelArt, S: number, ox: number, oy: number, W: number, H: number, exact: boolean) {
    const { ctx } = this.view;
    const cs = CHUNK * S;
    const n = this.chunks.chunksPerSide;
    const cx0 = Math.max(0, Math.floor(ox / cs)), cx1 = Math.min(n - 1, Math.floor((ox + W) / cs));
    const cy0 = Math.max(0, Math.floor(oy / cs)), cy1 = Math.min(n - 1, Math.floor((oy + H) / cs));
    let budget = this.firstFrame ? Infinity : CHUNK_BUILDS_PER_FRAME;
    ctx.imageSmoothingEnabled = !exact;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        let c = this.chunks.get(level, cx, cy);
        if (!c && budget > 0) {
          budget--;
          c = this.chunks.build(level, cx, cy, art.tiles);
        }
        const dx = cx * cs - ox, dy = cy * cs - oy;
        if (c && exact && c.width === cs) {
          ctx.drawImage(c, dx, dy);
          continue;
        }
        c ??= this.chunks.anyLevel(cx, cy, ZOOM_LEVELS.length);
        if (c) {
          ctx.imageSmoothingEnabled = true;
          // Overlap by a pixel to hide seams when scaling.
          ctx.drawImage(c, Math.floor(dx), Math.floor(dy), Math.ceil(cs) + 1, Math.ceil(cs) + 1);
          ctx.imageSmoothingEnabled = !exact;
        } else {
          ctx.fillStyle = '#4b8b3c';
          ctx.fillRect(dx, dy, cs, cs);
        }
      }
  }

  private drawObjects(art: LevelArt, S: number, k: number, ox: number, oy: number, W: number, H: number, exact: boolean) {
    const { ctx } = this.view;
    const { map, fog } = this;
    const N = map.size;
    const sp = art.sprites;
    const tx0 = Math.max(0, Math.floor(ox / S) - 1), tx1 = Math.min(N - 1, Math.ceil((ox + W) / S) + 1);
    const ty0 = Math.max(0, Math.floor(oy / S) - 1), ty1 = Math.min(N - 1, Math.ceil((oy + H) / S) + 2);
    ctx.imageSmoothingEnabled = !exact;

    const put = (s: Sprite, wx: number, wy: number) => {
      const px = wx * S - ox, py = wy * S - oy;
      if (exact) ctx.drawImage(s.c, Math.round(px - s.ax), Math.round(py - s.ay));
      else ctx.drawImage(s.c, px - s.ax * k, py - s.ay * k, s.c.width * k, s.c.height * k);
    };

    // Animals visible right now, sorted by row so they interleave with trees correctly.
    const rows = this.animalRows;
    rows.length = 0;
    for (const a of map.animals)
      if (a.y >= ty0 && a.y <= ty1 + 1 && a.x >= tx0 && a.x <= tx1 + 1 && fog.isVisible(a.x, a.y)) rows.push(a);
    rows.sort((a, b) => a.y - b.y);
    let ai = 0;

    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const i = y * N + x;
        const f = map.feature[i];
        if (f === Feature.None || !fog.explored[i]) continue;
        const h = tileHash(x, y);
        if (f === Feature.Tree) {
          const jx = ((h >>> 8) % 100) / 100 - 0.5, jy = ((h >>> 16) % 100) / 100 - 0.5;
          put(sp.trees[pickTree(this.biome, h & 1023)], x + 0.5 + jx * 0.22, y + 0.82 + jy * 0.14);
        } else {
          put(f === Feature.Gold ? sp.gold : f === Feature.Stone ? sp.stone : sp.berries, x + 0.5, y + 0.85);
        }
      }
      while (ai < rows.length && rows[ai].y < y + 1) {
        const a = rows[ai++];
        put(a.kind === 'sheep' ? sp.sheep : a.kind === 'deer' ? sp.deer : sp.fish, a.x, a.y + (a.kind === 'fish' ? 0 : 0.3));
      }
    }
  }
}
