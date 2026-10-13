import { BUILDING_DEFS, type Building, type BuildingType, UNIT_DEFS, type Unit } from '../sim/entities';
import type { Fog } from '../sim/fog';
import { Feature } from '../sim/terrain';
import type { World } from '../sim/world';
import { BIOMES, type Biome, pickTree } from './biome';
import { BuildingSprites } from './buildingSprites';
import type { View } from './canvas';
import { type Camera, ZOOM_LEVELS } from './camera';
import { CHUNK, ChunkCache } from './chunks';
import { PLAYER_COLORS } from './palette';
import { FOG_RGB, FogLayer } from './fogLayer';
import { type Sprite, SpriteSet } from './sprites';
import { TerrainTextures } from './textures';
import { tileHash } from './tiles';
import type { Tool } from './figures';
import { type UnitPose, UnitSprites, lookIndex, unitHeight } from './unitSprites';

/** Time (ms) per frame spent building chunks after the first frame; at least one is built.
 * Chunks still missing draw from another zoom level meanwhile. */
const CHUNK_BUILD_MS = 4;
const BG = `rgb(${FOG_RGB.join(',')})`;
const EFFECT_S = 1.3;

const TOOL_FOR: Record<string, Tool> = { tree: 'axe', gold: 'pick', stone: 'pick', berries: 'basket', sheep: 'knife', deer: 'knife', fish: 'spear', farm: 'hoe' };

interface LevelArt {
  s: number;
  tiles: TerrainTextures;
  sprites: SpriteSet;
  units: UnitSprites;
  buildings: BuildingSprites;
}

export interface Overlay {
  selection: ReadonlySet<number>;
  /** Building being placed, at its top-left tile. */
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

/** A depth-sorted thing to draw: drawn after map row floor(y) has its trees drawn. */
interface Drawable {
  y: number;
  draw: () => void;
}

/** Draws the world: cached terrain chunks, y-sorted objects and units, then fog and effects. */
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
      const s = Math.round(ZOOM_LEVELS[level] * this.view.dpr);
      a = { s, tiles: new TerrainTextures(s, this.biome), sprites: new SpriteSet(s), units: new UnitSprites(s), buildings: new BuildingSprites(s) };
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
    const S = exact ? art.s : cam.scale * dpr;
    const k = S / art.s;
    const ox = Math.round(cam.x * S - W / 2), oy = Math.round(cam.y * S - H / 2);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    this.drawChunks(level, art, S, ox, oy, W, H, exact);
    const v = { art, S, k, ox, oy, W, H, exact, alpha, now, overlay };
    this.drawObjects(v);
    this.fogLayer.refresh();
    this.fogLayer.draw(ctx, ox, oy, S, W, H);
    this.drawEffects(v);
    this.firstFrame = false;
  }

  private drawChunks(level: number, art: LevelArt, S: number, ox: number, oy: number, W: number, H: number, exact: boolean) {
    const { ctx } = this.view;
    const cs = CHUNK * S;
    const n = this.chunks.chunksPerSide;
    const cx0 = Math.max(0, Math.floor(ox / cs)), cx1 = Math.min(n - 1, Math.floor((ox + W) / cs));
    const cy0 = Math.max(0, Math.floor(oy / cs)), cy1 = Math.min(n - 1, Math.floor((oy + H) / cs));
    const deadline = this.firstFrame ? Infinity : performance.now() + CHUNK_BUILD_MS;
    let built = 0;
    ctx.imageSmoothingEnabled = !exact;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        let c = this.chunks.get(level, cx, cy);
        if (!c && (built === 0 || performance.now() < deadline)) {
          built++;
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

  private drawObjects(v: FrameView) {
    const { ctx } = this.view;
    const { world, fog } = this;
    const { map } = world;
    const N = map.size;
    const { art, S, ox, oy, W, H, exact } = v;
    const sp = art.sprites;
    const tx0 = Math.max(0, Math.floor(ox / S) - 2), tx1 = Math.min(N - 1, Math.ceil((ox + W) / S) + 2);
    const ty0 = Math.max(0, Math.floor(oy / S) - 1), ty1 = Math.min(N - 1, Math.ceil((oy + H) / S) + 4);
    ctx.imageSmoothingEnabled = !exact;
    const put = (s: Sprite, wx: number, wy: number) => this.put(v, s, wx, wy);

    // Entities in view, depth-sorted so they interleave with trees by row.
    const items = this.items;
    items.length = 0;
    const inView = (x: number, y: number, pad: number) => x >= tx0 - pad && x <= tx1 + 1 + pad && y >= ty0 && y <= ty1 + 1 + pad;
    for (const e of world.entities.values()) {
      if (e.kind === 'unit') {
        const x = e.px + (e.x - e.px) * v.alpha, y = e.py + (e.y - e.py) * v.alpha;
        if (!inView(x, y, 1)) continue;
        if (e.owner !== this.player && !fog.isVisible(x, y)) continue;
        items.push({ y, draw: () => this.drawUnit(v, e, x, y) });
      } else if (e.kind === 'building') {
        if (!inView(e.x + e.size / 2, e.y + e.size, e.size)) continue;
        if (e.owner !== this.player && !fog.isExplored(e.x + e.size / 2, e.y + e.size / 2)) continue;
        // Fields lie flat: draw them before anything standing on or below them.
        const flat = BUILDING_DEFS[e.type].walkable;
        items.push({ y: flat ? e.y - 0.5 : e.y + e.size - 0.01, draw: () => this.drawBuilding(v, e) });
      } else {
        if (!inView(e.x, e.y, 0) || !fog.isVisible(e.x, e.y)) continue;
        const s = e.type === 'sheep' ? sp.sheep : e.type === 'deer' ? sp.deer : sp.fish;
        items.push({ y: e.y, draw: () => put(s, e.x, e.y + (e.type === 'fish' ? 0 : 0.3)) });
      }
    }
    if (v.overlay.ghost) {
      const gh = v.overlay.ghost;
      items.push({ y: gh.y + BUILDING_DEFS[gh.type].size - 0.01, draw: () => this.drawGhost(v, gh) });
    }
    items.sort((a, b) => a.y - b.y);
    let ii = 0;
    while (ii < items.length && items[ii].y < ty0) items[ii++].draw();

    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const i = y * N + x;
        const f = map.feature[i];
        if (f === Feature.None || !fog.explored[i]) continue;
        const h = tileHash(x, y);
        if (f === Feature.Tree) {
          const jx = ((h >>> 8) % 100) / 100 - 0.5, jy = ((h >>> 16) % 100) / 100 - 0.5;
          const kind = sp.trees[pickTree(this.biome, h & 1023)];
          put(kind[(h >>> 24) % kind.length], x + 0.5 + jx * 0.3, y + 0.78 + jy * 0.2);
        } else {
          put(f === Feature.Gold ? sp.gold : f === Feature.Stone ? sp.stone : sp.berries, x + 0.5, y + 0.8);
        }
      }
      while (ii < items.length && items[ii].y < y + 1) items[ii++].draw();
    }
    while (ii < items.length) items[ii++].draw();
  }

  private put(v: FrameView, s: Sprite, wx: number, wy: number, alpha = 1): void {
    const { ctx } = this.view;
    const px = wx * v.S - v.ox, py = wy * v.S - v.oy;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (v.exact) ctx.drawImage(s.c, Math.round(px - s.ax), Math.round(py - s.ay));
    else ctx.drawImage(s.c, px - s.ax * v.k, py - s.ay * v.k, s.c.width * v.k, s.c.height * v.k);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  private drawUnit(v: FrameView, u: Unit, x: number, y: number): void {
    const { ctx } = this.view;
    const { S, ox, oy } = v;
    const selected = v.overlay.selection.has(u.id);
    const sx = x * S - ox, sy = y * S - oy;
    if (selected) {
      ctx.strokeStyle = u.owner === this.player ? 'rgba(255,255,255,0.95)' : 'rgba(255,90,80,0.95)';
      ctx.lineWidth = Math.max(1.5, S / 16);
      ctx.beginPath();
      ctx.ellipse(sx, sy, S * (u.type === 'scout' ? 0.48 : 0.36), S * (u.type === 'scout' ? 0.2 : 0.15), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Stagger animation phase per unit so crowds don't move in lockstep.
    const t = v.now + (u.id % 7) * 0.13;
    const p = this.poseFor(u, x, y, t);
    this.put(v, v.art.units.get(u.type, u.owner, lookIndex(u.id), p), x, y);

    if (selected) this.hpBar(v, sx, sy - S * (unitHeight(u.type) + 0.2), S * 0.5, u.hp / UNIT_DEFS[u.type].hp);
  }

  /** Chooses view, animation frame, tool and load for a unit this frame. */
  private poseFor(u: Unit, x: number, y: number, t: number): UnitPose {
    const prev = this.lastPos.get(u.id);
    // Side-on reads best for a unit that hasn't moved yet (a horse head-on is just a sliver).
    let view = this.lastView.get(u.id) ?? { view: 'side' as const, left: u.face < 0 };
    const moving = u.state === 'walk' && (u.x !== u.px || u.y !== u.py);
    if (prev && moving) {
      const dx = x - prev.x, dy = y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 1e-4)
        view = Math.abs(dy) > Math.abs(dx) * 1.3 ? { view: dy > 0 ? 'front' : 'back', left: false } : { view: 'side', left: dx < 0 };
    }
    this.lastPos.set(u.id, { x, y });
    const working = u.state === 'gather' || u.state === 'build';
    // Work always plays side-on, facing the job.
    if (working) view = { view: 'side', left: u.face < 0 };
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
    const { S, ox, oy } = v;
    const def = BUILDING_DEFS[b.type];
    // Farms show how much crop is left.
    const variant = b.type === 'farm' && b.complete ? Math.max(1, Math.ceil((b.amount / (def.food ?? 1)) * 3)) : 0;
    const sprite = v.art.buildings.get(b.type, b.size, b.owner, variant);
    const fx = b.x * S - ox, fy = b.y * S - oy, fw = b.size * S;
    const selected = v.overlay.selection.has(b.id);
    if (selected) {
      ctx.strokeStyle = b.owner === this.player ? 'rgba(255,255,255,0.9)' : 'rgba(255,90,80,0.9)';
      ctx.lineWidth = Math.max(1.5, S / 16);
      ctx.strokeRect(fx + 1, fy + 1, fw - 2, fw - 2);
    }
    if (b.complete) {
      this.put(v, sprite, b.x, b.y);
    } else {
      // Foundation: staked-out plot, the building rising from the ground, scaffolding.
      ctx.fillStyle = 'rgba(110,82,48,0.55)';
      ctx.fillRect(fx, fy, fw, fw);
      ctx.strokeStyle = 'rgba(230,210,160,0.8)';
      ctx.lineWidth = Math.max(1, S / 24);
      ctx.strokeRect(fx + S * 0.08, fy + S * 0.08, fw - S * 0.16, fw - S * 0.16);
      const p = Math.max(0.04, b.progress);
      const k = v.exact ? 1 : v.k;
      const sh = sprite.c.height;
      const shown = Math.max(1, Math.round(sh * p));
      const dx = fx - sprite.ax * k, dy = fy - sprite.ay * k + (sh - shown) * k;
      ctx.drawImage(sprite.c, 0, sh - shown, sprite.c.width, shown, dx, dy, sprite.c.width * k, shown * k);
      ctx.strokeStyle = 'rgba(92,62,30,0.9)';
      ctx.lineWidth = Math.max(1, S / 18);
      const top = fy + fw - (fw + S) * p;
      ctx.beginPath();
      for (let i = 0; i <= b.size * 2; i++) {
        const x = fx + (fw * i) / (b.size * 2);
        ctx.moveTo(x, fy + fw);
        ctx.lineTo(x, top);
      }
      for (let y = fy + fw; y > top; y -= S * 0.5) {
        ctx.moveTo(fx, y);
        ctx.lineTo(fx + fw, y);
      }
      ctx.stroke();
    }
    if (selected && b.rally && b.owner === this.player) this.drawRally(v, b);
    if (selected || !b.complete) {
      this.hpBar(v, fx + fw / 2, fy - S * 0.6, Math.min(fw * 0.8, S * 2.2), b.complete ? b.hp / def.hp : b.progress, b.complete ? undefined : '#e8c25a');
    }
  }

  /** Dashed line from a building to its rally flag. */
  private drawRally(v: FrameView, b: Building): void {
    const { ctx } = this.view;
    const { S, ox, oy } = v;
    const r = b.rally!;
    const bx = (b.x + b.size / 2) * S - ox, by = (b.y + b.size / 2) * S - oy;
    const fx = r.x * S - ox, fy = r.y * S - oy;
    ctx.save();
    ctx.setLineDash([S * 0.2, S * 0.15]);
    ctx.strokeStyle = 'rgba(255,240,200,0.75)';
    ctx.lineWidth = Math.max(1, S / 20);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.restore();
    // Flag on a pole.
    ctx.strokeStyle = '#3a2614';
    ctx.lineWidth = Math.max(1.5, S / 14);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - S * 0.9);
    ctx.stroke();
    const wave = Math.sin(v.now * 4) * S * 0.05;
    ctx.fillStyle = PLAYER_COLORS[b.owner % PLAYER_COLORS.length];
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx, fy - S * 0.9);
    ctx.quadraticCurveTo(fx + S * 0.25, fy - S * 0.85 + wave, fx + S * 0.5, fy - S * 0.78);
    ctx.lineTo(fx, fy - S * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawGhost(v: FrameView, gh: NonNullable<Overlay['ghost']>): void {
    const { ctx } = this.view;
    const { S, ox, oy } = v;
    const size = BUILDING_DEFS[gh.type].size;
    const fx = gh.x * S - ox, fy = gh.y * S - oy, fw = size * S;
    ctx.fillStyle = gh.valid ? 'rgba(90,220,110,0.35)' : 'rgba(230,60,50,0.4)';
    ctx.fillRect(fx, fy, fw, fw);
    ctx.strokeStyle = gh.valid ? 'rgba(170,255,180,0.95)' : 'rgba(255,140,130,0.95)';
    ctx.lineWidth = Math.max(1.5, S / 14);
    ctx.strokeRect(fx, fy, fw, fw);
    this.put(v, v.art.buildings.get(gh.type, size, this.player), gh.x, gh.y, 0.6);
  }

  private hpBar(v: FrameView, cx: number, y: number, w: number, frac: number, color?: string): void {
    const { ctx } = this.view;
    const h = Math.max(3, v.S / 9);
    ctx.fillStyle = 'rgba(10,6,2,0.8)';
    ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color ?? (frac > 0.5 ? '#5fd35a' : frac > 0.25 ? '#e6c330' : '#e24a3b');
    ctx.fillRect(cx - w / 2, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  private drawEffects(v: FrameView): void {
    const { ctx } = this.view;
    const { S, ox, oy } = v;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      const age = v.now - e.born;
      if (age > EFFECT_S) {
        this.effects.splice(i, 1);
        continue;
      }
      if (!this.fog.isVisible(e.x, e.y)) continue;
      const t = age / EFFECT_S;
      const sx = e.x * S - ox, sy = e.y * S - oy;
      ctx.globalAlpha = 1 - t * t;
      if (e.kind === 'text') {
        ctx.font = `700 ${Math.round(Math.max(11, S * 0.5))}px 'Alegreya Sans', sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = Math.max(2, S / 10);
        ctx.strokeStyle = 'rgba(10,6,2,0.85)';
        ctx.strokeText(e.text!, sx, sy - S * (0.9 + t * 0.9));
        ctx.fillStyle = e.color;
        ctx.fillText(e.text!, sx, sy - S * (0.9 + t * 0.9));
      } else {
        ctx.strokeStyle = e.color;
        ctx.lineWidth = Math.max(1.5, S / 14);
        ctx.beginPath();
        ctx.ellipse(sx, sy, S * (0.15 + t * 0.45), S * (0.07 + t * 0.2), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
}

interface FrameView {
  art: LevelArt;
  S: number;
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
