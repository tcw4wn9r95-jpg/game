// Isometric world renderer: cached terrain chunks, depth-sorted trees, decor,
// buildings and units, fog, then effects. Tile (x, y) maps to screen
// ((x - y) * Z, (x + y) * Z / 2), Z being device px per tile at the current zoom.
import { BUILDING_DEFS, type Building, type BuildingType, UNIT_DEFS, type Unit } from '../sim/entities';
import type { Fog } from '../sim/fog';
import { Feature, Terrain } from '../sim/terrain';
import type { World } from '../sim/world';
import { BIOMES, type Biome, pickTree } from './biome';
import { BuildingSprites } from './buildingSprites';
import type { View } from './canvas';
import { type Camera, ZOOM_LEVELS } from './camera';
import { ChunkCache } from './chunks';
import type { Tool } from './figures';
import { FOG_RGB, FogLayer } from './fogLayer';
import { PLAYER_COLORS } from './palette';
import { type Sprite, SpriteSet } from './sprites';
import { TerrainTextures } from './textures';
import { tileHash } from './tiles';
import { type UnitPose, UnitSprites, lookIndex, unitHeight } from './unitSprites';

/** Time (ms) per frame spent building chunks after the first frame; at least one is built.
 * Chunks still missing draw from another zoom level meanwhile. */
const CHUNK_BUILD_MS = 4;
const BG = `rgb(${FOG_RGB.join(',')})`;
const EFFECT_S = 1.3;
/** Square texture px per tile, relative to Z, so the 45° projection keeps full detail. */
const TEXTURE_K = Math.SQRT2;
/** Sprite px per 32-unit tile, relative to Z: a tree is about one diamond wide. */
const SPRITE_K = 1.6;

const TOOL_FOR: Record<string, Tool> = { tree: 'axe', gold: 'pick', stone: 'pick', berries: 'basket', sheep: 'knife', deer: 'knife', fish: 'spear', farm: 'hoe' };

interface LevelArt {
  /** Device px per tile (Z) at this level. */
  z: number;
  tiles: TerrainTextures;
  sprites: SpriteSet;
  units: UnitSprites;
  buildings: BuildingSprites;
}

export interface Overlay {
  selection: ReadonlySet<number>;
  /** Building being placed, at its north-corner tile. */
  ghost: { type: BuildingType; x: number; y: number; valid: boolean } | null;
}

export interface Effect {
  kind: 'text' | 'ring';
  x: number;
  y: number;
  text?: string;
  color: string;
  born: number;
}

interface Drawable {
  /** Depth: x + y of the ground point (larger is nearer the viewer). */
  d: number;
  draw: () => void;
}

interface FrameView {
  art: LevelArt;
  /** Device px per tile now (animated while zooming). */
  S: number;
  /** Scale from cached art to now. */
  k: number;
  ox: number;
  oy: number;
  W: number;
  H: number;
  exact: boolean;
  alpha: number;
  now: number;
  overlay: Overlay;
}

export class Renderer {
  private levels: Array<LevelArt | null> = ZOOM_LEVELS.map(() => null);
  private artDpr = 0;
  private readonly chunks: ChunkCache;
  private readonly fogLayer: FogLayer;
  private firstFrame = true;
  private readonly biome: Biome;
  private readonly items: Drawable[] = [];
  readonly effects: Effect[] = [];
  /** Last drawn position and facing per unit, to pick a view from movement. */
  private readonly lastPos = new Map<number, { x: number; y: number }>();
  private readonly lastView = new Map<number, { view: 'front' | 'side' | 'back'; left: boolean }>();

  constructor(
    private readonly view: View,
    private readonly world: World,
    private readonly fog: Fog,
    private readonly player = 0,
  ) {
    this.biome = BIOMES[world.map.type];
    this.chunks = new ChunkCache(world.map, this.biome);
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
      const z = Math.round(ZOOM_LEVELS[level] * this.view.dpr);
      const sprite = Math.round(z * SPRITE_K);
      a = {
        z,
        tiles: new TerrainTextures(Math.round(z * TEXTURE_K), this.biome),
        sprites: new SpriteSet(sprite),
        units: new UnitSprites(sprite),
        buildings: new BuildingSprites(z * 2),
      };
      this.levels[level] = a;
    }
    return a;
  }

  dispose(): void {
    this.chunks.dispose();
  }

  /** alpha: fraction of the way from the last tick to the next; now: seconds, for animation. */
  draw(cam: Camera, alpha = 1, now = 0, overlay: Overlay = { selection: new Set(), ghost: null }): void {
    const { ctx, dpr } = this.view;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const level = cam.level;
    const art = this.art(level);
    // At rest, draw 1:1 from the cached art; while zooming, scale it.
    const exact = !cam.animating;
    const S = exact ? art.z : cam.scale * dpr;
    let ox = (cam.x - cam.y) * S - W / 2, oy = ((cam.x + cam.y) * S) / 2 - H / 2;
    if (exact) (ox = Math.round(ox)), (oy = Math.round(oy));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    const v: FrameView = { art, S, k: S / art.z, ox, oy, W, H, exact, alpha, now, overlay };
    this.drawChunks(level, v);
    this.drawObjects(v);
    this.fogLayer.refresh();
    this.drawFog(v);
    this.drawEffects(v);
    this.firstFrame = false;
  }

  /** Screen position (device px) of a tile-space point. */
  private sx(v: FrameView, x: number, y: number): number {
    return (x - y) * v.S - v.ox;
  }

  private sy(v: FrameView, x: number, y: number): number {
    return ((x + y) * v.S) / 2 - v.oy;
  }

  /** Tile-space bounds covering the screen, with a margin for tall sprites. */
  private visibleTiles(v: FrameView, margin: number) {
    const N = this.world.map.size;
    const corners = [
      [0, 0],
      [v.W, 0],
      [0, v.H],
      [v.W, v.H],
    ].map(([px, py]) => {
      const a = (px + v.ox) / v.S, b = (2 * (py + v.oy)) / v.S;
      return { x: (a + b) / 2, y: (b - a) / 2 };
    });
    const clamp = (n: number) => Math.max(0, Math.min(N - 1, n));
    return {
      x0: clamp(Math.floor(Math.min(...corners.map((c) => c.x))) - margin),
      x1: clamp(Math.ceil(Math.max(...corners.map((c) => c.x))) + margin),
      y0: clamp(Math.floor(Math.min(...corners.map((c) => c.y))) - margin),
      y1: clamp(Math.ceil(Math.max(...corners.map((c) => c.y))) + margin),
    };
  }

  private drawChunks(level: number, v: FrameView) {
    const { ctx } = this.view;
    const { art, S } = v;
    const C = ChunkCache.tilesPerChunk(art.z * 2);
    const n = Math.ceil(this.world.map.size / C);
    const t = this.visibleTiles(v, 1);
    const deadline = this.firstFrame ? Infinity : performance.now() + CHUNK_BUILD_MS;
    let built = 0;
    const cw = C * 2 * S, ch = C * S;
    ctx.imageSmoothingEnabled = !v.exact;
    for (let cy = Math.floor(t.y0 / C); cy <= Math.min(n - 1, Math.floor(t.y1 / C)); cy++)
      for (let cx = Math.floor(t.x0 / C); cx <= Math.min(n - 1, Math.floor(t.x1 / C)); cx++) {
        const dx = this.sx(v, cx * C, cy * C) - C * S, dy = this.sy(v, cx * C, cy * C);
        if (dx > v.W || dy > v.H || dx + cw < 0 || dy + ch < 0) continue;
        let c = this.chunks.get(level, cx, cy);
        if (!c && (built === 0 || performance.now() < deadline)) {
          built++;
          c = this.chunks.build(level, cx, cy, art.tiles, art.z * 2, art.z, C);
        }
        if (c && v.exact && c.width === Math.round(cw)) {
          ctx.drawImage(c, dx, dy);
          continue;
        }
        c ??= this.chunks.anyLevel(cx, cy, ZOOM_LEVELS.length, C);
        if (c) {
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(c, dx, dy, cw + 1, ch + 1);
          ctx.imageSmoothingEnabled = !v.exact;
        }
      }
  }

  private drawObjects(v: FrameView) {
    const { ctx } = this.view;
    const { world, fog } = this;
    const { map } = world;
    const N = map.size;
    const sp = v.art.sprites;
    const t = this.visibleTiles(v, 3);
    ctx.imageSmoothingEnabled = !v.exact;
    const put = (s: Sprite, wx: number, wy: number) => this.put(v, s, wx, wy);
    const onScreen = (x: number, y: number, pad: number) => {
      const X = this.sx(v, x, y), Y = this.sy(v, x, y);
      return X > -pad && X < v.W + pad && Y > -pad * 0.5 && Y < v.H + pad * 2.5;
    };
    const pad = v.S * 3;

    const items = this.items;
    items.length = 0;
    // Trees, mines, bushes and ground decor.
    for (let y = t.y0; y <= t.y1; y++)
      for (let x = t.x0; x <= t.x1; x++) {
        const i = y * N + x;
        if (!fog.explored[i] || !onScreen(x + 0.5, y + 0.5, pad)) continue;
        const f = map.feature[i];
        const h = tileHash(x, y);
        if (f === Feature.Tree) {
          const jx = ((h >>> 8) % 100) / 100 - 0.5, jy = ((h >>> 16) % 100) / 100 - 0.5;
          const kind = sp.trees[pickTree(this.biome, h & 1023)];
          const s = kind[(h >>> 24) % kind.length];
          const wx = x + 0.5 + jx * 0.3, wy = y + 0.5 + jy * 0.3;
          items.push({ d: wx + wy, draw: () => put(s, wx, wy) });
        } else if (f !== Feature.None) {
          const s = f === Feature.Gold ? sp.gold : f === Feature.Stone ? sp.stone : sp.berries;
          items.push({ d: x + y + 1, draw: () => put(s, x + 0.5, y + 0.5) });
        } else if (map.terrain[i] === Terrain.Grass && world.grid.building[i] === 0) {
          // Scattered grass tufts and the odd bush, as on AoE meadows.
          const r = h % 97;
          if (r < 9) {
            const s = sp.decor[(h >>> 7) % sp.decor.length];
            const wx = x + 0.2 + ((h >>> 12) % 60) / 100, wy = y + 0.2 + ((h >>> 18) % 60) / 100;
            items.push({ d: wx + wy - 0.3, draw: () => put(s, wx, wy) });
          }
        }
      }
    for (const e of world.entities.values()) {
      if (e.kind === 'unit') {
        const x = e.px + (e.x - e.px) * v.alpha, y = e.py + (e.y - e.py) * v.alpha;
        if (!onScreen(x, y, pad)) continue;
        if (e.owner !== this.player && !fog.isVisible(x, y)) continue;
        items.push({ d: x + y, draw: () => this.drawUnit(v, e, x, y) });
      } else if (e.kind === 'building') {
        if (!onScreen(e.x + e.size / 2, e.y + e.size / 2, pad + e.size * v.S * 2)) continue;
        if (e.owner !== this.player && !fog.isExplored(e.x + e.size / 2, e.y + e.size / 2)) continue;
        // Fields lie flat: draw them before anything standing on or around them.
        const flat = BUILDING_DEFS[e.type].walkable;
        items.push({ d: flat ? e.x + e.y - 1 : e.x + e.y + e.size, draw: () => this.drawBuilding(v, e) });
      } else {
        if (!onScreen(e.x, e.y, pad) || !fog.isVisible(e.x, e.y)) continue;
        const s = e.type === 'sheep' ? sp.sheep : e.type === 'deer' ? sp.deer : sp.fish;
        items.push({ d: e.x + e.y, draw: () => put(s, e.x, e.y) });
      }
    }
    const gh = v.overlay.ghost;
    if (gh) items.push({ d: gh.x + gh.y + BUILDING_DEFS[gh.type].size, draw: () => this.drawGhost(v, gh) });
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.draw();
  }

  private put(v: FrameView, s: Sprite, wx: number, wy: number, alpha = 1): void {
    const { ctx } = this.view;
    const px = this.sx(v, wx, wy), py = this.sy(v, wx, wy);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (v.exact) ctx.drawImage(s.c, Math.round(px - s.ax), Math.round(py - s.ay));
    else ctx.drawImage(s.c, px - s.ax * v.k, py - s.ay * v.k, s.c.width * v.k, s.c.height * v.k);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  /** The footprint diamond of a square of tiles, as a path. */
  private diamond(v: FrameView, x: number, y: number, size: number): void {
    const { ctx } = this.view;
    ctx.beginPath();
    ctx.moveTo(this.sx(v, x, y), this.sy(v, x, y));
    ctx.lineTo(this.sx(v, x + size, y), this.sy(v, x + size, y));
    ctx.lineTo(this.sx(v, x + size, y + size), this.sy(v, x + size, y + size));
    ctx.lineTo(this.sx(v, x, y + size), this.sy(v, x, y + size));
    ctx.closePath();
  }

  private drawUnit(v: FrameView, u: Unit, x: number, y: number): void {
    const { ctx } = this.view;
    const { S } = v;
    const selected = v.overlay.selection.has(u.id);
    const px = this.sx(v, x, y), py = this.sy(v, x, y);
    if (selected) {
      ctx.strokeStyle = u.owner === this.player ? 'rgba(255,255,255,0.95)' : 'rgba(255,90,80,0.95)';
      ctx.lineWidth = Math.max(1.5, S / 16);
      const r = S * (u.type === 'scout' ? 0.75 : 0.5);
      ctx.beginPath();
      ctx.ellipse(px, py, r, r / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Stagger animation phase per unit so crowds don't move in lockstep.
    const t = v.now + (u.id % 7) * 0.13;
    const p = this.poseFor(u, x, y, t);
    this.put(v, v.art.units.get(u.type, u.owner, lookIndex(u.id), p), x, y);
    if (selected) this.hpBar(v, px, py - S * SPRITE_K * (unitHeight(u.type) + 0.12), S * 0.9, u.hp / UNIT_DEFS[u.type].hp, u.owner);
  }

  /** Where a working unit's job is, to face it. */
  private jobPoint(u: Unit): { x: number; y: number } | null {
    const o = u.order;
    if (o?.type === 'gather') {
      if (o.target.kind === 'tile') return { x: o.target.x + 0.5, y: o.target.y + 0.5 };
      const e = this.world.get(o.target.id);
      if (!e) return null;
      return e.kind === 'building' ? { x: e.x + e.size / 2, y: e.y + e.size / 2 } : { x: e.x, y: e.y };
    }
    if (o?.type === 'build') {
      const b = this.world.building(o.id);
      return b ? { x: b.x + b.size / 2, y: b.y + b.size / 2 } : null;
    }
    return null;
  }

  /** Chooses view, animation frame, tool and load for a unit this frame. */
  private poseFor(u: Unit, x: number, y: number, t: number): UnitPose {
    const prev = this.lastPos.get(u.id);
    // Side-on reads best for a unit that hasn't moved yet.
    let view = this.lastView.get(u.id) ?? { view: 'side' as const, left: u.face < 0 };
    const moving = u.state === 'walk' && (u.x !== u.px || u.y !== u.py);
    if (prev && moving) {
      // Direction on screen: isometric x is (dx - dy), y is (dx + dy) / 2.
      const dx = x - prev.x, dy = y - prev.y;
      const sdx = dx - dy, sdy = (dx + dy) / 2;
      if (Math.abs(sdx) + Math.abs(sdy) > 1e-4)
        view = Math.abs(sdy) > Math.abs(sdx) * 1.1 ? { view: sdy > 0 ? 'front' : 'back', left: false } : { view: 'side', left: sdx < 0 };
    }
    this.lastPos.set(u.id, { x, y });
    const working = u.state === 'gather' || u.state === 'build';
    if (working) {
      // Work plays side-on, facing the job.
      const j = this.jobPoint(u);
      const sdx = j ? j.x - x - (j.y - y) : u.face;
      view = { view: 'side', left: sdx < 0 };
    }
    this.lastView.set(u.id, view);
    let tool: Tool = 'none';
    if (u.state === 'build') tool = 'hammer';
    else if (u.state === 'gather' && u.order?.type === 'gather') tool = TOOL_FOR[u.order.source] ?? 'none';
    const fps = u.type === 'scout' ? 12 : 10;
    return {
      ...view,
      anim: working ? 'work' : moving ? 'walk' : 'idle',
      frame: working ? Math.floor(t * 5) % 4 : moving ? Math.floor(t * fps) % 6 : 0,
      tool,
      carry: u.carry && u.carry.amount > 0 && !working ? u.carry.res : null,
    };
  }

  private drawBuilding(v: FrameView, b: Building): void {
    const { ctx } = this.view;
    const { S } = v;
    const def = BUILDING_DEFS[b.type];
    // Farms show how much crop is left.
    const variant = b.type === 'farm' && b.complete ? Math.max(1, Math.ceil((b.amount / (def.food ?? 1)) * 3)) : 0;
    const sprite = v.art.buildings.get(b.type, b.size, b.owner, variant);
    const selected = v.overlay.selection.has(b.id);
    const ny = this.sy(v, b.x, b.y);
    const k = v.exact ? 1 : v.k;
    if (selected) {
      // Selection ring on the ground, so the building stands over it.
      this.diamond(v, b.x - 0.15, b.y - 0.15, b.size + 0.3);
      ctx.strokeStyle = b.owner === this.player ? 'rgba(255,255,255,0.9)' : 'rgba(255,90,80,0.9)';
      ctx.lineWidth = Math.max(1.5, S / 16);
      ctx.stroke();
    }
    if (b.complete) {
      this.put(v, sprite, b.x, b.y);
    } else {
      // Foundation: staked-out plot, the building rising from the ground, scaffolding.
      this.diamond(v, b.x, b.y, b.size);
      ctx.fillStyle = 'rgba(110,82,48,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,210,160,0.8)';
      ctx.lineWidth = Math.max(1, S / 24);
      ctx.stroke();
      const p = Math.max(0.04, b.progress);
      const sh = sprite.c.height;
      const shown = Math.max(1, Math.round(sh * p));
      const nx = this.sx(v, b.x, b.y);
      ctx.drawImage(sprite.c, 0, sh - shown, sprite.c.width, shown, nx - sprite.ax * k, ny - sprite.ay * k + (sh - shown) * k, sprite.c.width * k, shown * k);
      // Scaffolding poles at the visible corners, as tall as the work so far.
      const pole = S * b.size * 1.6 * p;
      ctx.strokeStyle = 'rgba(92,62,30,0.9)';
      ctx.lineWidth = Math.max(1, S / 14);
      ctx.beginPath();
      for (const [cx, cy] of [[b.x, b.y + b.size], [b.x + b.size, b.y + b.size], [b.x + b.size, b.y], [b.x + b.size / 2, b.y + b.size]]) {
        const X = this.sx(v, cx, cy), Y = this.sy(v, cx, cy);
        ctx.moveTo(X, Y);
        ctx.lineTo(X, Y - pole);
      }
      ctx.stroke();
    }
    if (selected && b.rally && b.owner === this.player) this.drawRally(v, b);
    if (selected || !b.complete) {
      const cx = this.sx(v, b.x + b.size / 2, b.y + b.size / 2);
      const top = def.walkable ? this.sy(v, b.x, b.y) - S * 0.6 : ny - S * (0.4 + b.size * 0.55);
      this.hpBar(v, cx, top, Math.min(b.size * S * 1.2, S * 3), b.complete ? b.hp / def.hp : b.progress, b.owner, !b.complete);
    }
  }

  /** Dashed line from a building to its rally flag. */
  private drawRally(v: FrameView, b: Building): void {
    const { ctx } = this.view;
    const { S } = v;
    const r = b.rally!;
    const bx = this.sx(v, b.x + b.size / 2, b.y + b.size / 2), by = this.sy(v, b.x + b.size / 2, b.y + b.size / 2);
    const fx = this.sx(v, r.x, r.y), fy = this.sy(v, r.x, r.y);
    ctx.save();
    ctx.setLineDash([S * 0.3, S * 0.2]);
    ctx.strokeStyle = 'rgba(255,240,200,0.75)';
    ctx.lineWidth = Math.max(1, S / 20);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#3a2614';
    ctx.lineWidth = Math.max(1.5, S / 14);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - S * 1.3);
    ctx.stroke();
    const wave = Math.sin(v.now * 4) * S * 0.06;
    ctx.fillStyle = PLAYER_COLORS[b.owner % PLAYER_COLORS.length];
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx, fy - S * 1.3);
    ctx.quadraticCurveTo(fx + S * 0.35, fy - S * 1.25 + wave, fx + S * 0.7, fy - S * 1.15);
    ctx.lineTo(fx, fy - S * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawGhost(v: FrameView, gh: NonNullable<Overlay['ghost']>): void {
    const { ctx } = this.view;
    const size = BUILDING_DEFS[gh.type].size;
    this.diamond(v, gh.x, gh.y, size);
    ctx.fillStyle = gh.valid ? 'rgba(90,220,110,0.35)' : 'rgba(230,60,50,0.4)';
    ctx.fill();
    ctx.strokeStyle = gh.valid ? 'rgba(170,255,180,0.95)' : 'rgba(255,140,130,0.95)';
    ctx.lineWidth = Math.max(1.5, v.S / 14);
    ctx.stroke();
    this.put(v, v.art.buildings.get(gh.type, size, this.player, gh.type === 'farm' ? 3 : 0), gh.x, gh.y, 0.6);
  }

  /** AoE-style health bar in the owner's colour (gold while under construction). */
  private hpBar(v: FrameView, cx: number, y: number, w: number, frac: number, owner: number, building = false): void {
    const { ctx } = this.view;
    const h = Math.max(3, v.S / 7);
    const f = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = 'rgba(10,6,2,0.85)';
    ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(70,20,15,0.9)';
    ctx.fillRect(cx - w / 2, y, w, h);
    ctx.fillStyle = building ? '#e8c25a' : PLAYER_COLORS[owner % PLAYER_COLORS.length];
    ctx.fillRect(cx - w / 2, y, w * f, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cx - w / 2, y, w * f, Math.max(1, h * 0.35));
  }

  private drawFog(v: FrameView): void {
    if (this.fog.revealed) return;
    const { ctx } = this.view;
    // The fog texture has one texel per tile; draw it through the isometric projection.
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(v.S, v.S / 2, -v.S, v.S / 2, -v.ox, -v.oy);
    ctx.drawImage(this.fogLayer.canvas, 0, 0);
    ctx.restore();
  }

  private drawEffects(v: FrameView): void {
    const { ctx } = this.view;
    const { S } = v;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      const age = v.now - e.born;
      if (age > EFFECT_S) {
        this.effects.splice(i, 1);
        continue;
      }
      if (!this.fog.isVisible(e.x, e.y)) continue;
      const t = age / EFFECT_S;
      const px = this.sx(v, e.x, e.y), py = this.sy(v, e.x, e.y);
      ctx.globalAlpha = 1 - t * t;
      if (e.kind === 'text') {
        ctx.font = `700 ${Math.round(Math.max(11, S * 0.55))}px 'Alegreya Sans', sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = Math.max(2, S / 10);
        ctx.strokeStyle = 'rgba(10,6,2,0.85)';
        const ty = py - S * (1.6 + t * 1.2);
        ctx.strokeText(e.text!, px, ty);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text!, px, ty);
      } else {
        ctx.strokeStyle = e.color;
        ctx.lineWidth = Math.max(1.5, S / 14);
        ctx.beginPath();
        const r = S * (0.3 + t * 0.8);
        ctx.ellipse(px, py, r, r / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
}
