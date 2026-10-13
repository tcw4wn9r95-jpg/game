// Turns gestures into selection changes and player commands.
import type { Camera } from '../render/camera';
import type { Effect } from '../render/renderer';
import { isGatherer, sourceOf } from '../sim/economy';
import { BUILDING_DEFS, type BuildingType, type Entity, type GatherTarget, type Unit } from '../sim/entities';
import { unitHeight } from '../render/unitSprites';
import type { Command } from '../sim/commands';
import { Feature } from '../sim/terrain';
import type { World } from '../sim/world';

export interface ControllerHost {
  world: World;
  camera: Camera;
  player: number;
  addEffect(e: Omit<Effect, 'born'>): void;
}

type Pick =
  | { kind: 'entity'; e: Entity }
  | { kind: 'tile'; x: number; y: number }
  | { kind: 'ground'; x: number; y: number };

export interface Placing {
  type: BuildingType;
  x: number;
  y: number;
}

export class Controller {
  readonly selection = new Set<number>();
  placing: Placing | null = null;
  /** Bumped whenever selection or mode changes, so the HUD knows to rebuild. */
  version = 0;
  private idleCursor = 0;
  private readonly boxEl: HTMLElement;

  constructor(private readonly host: ControllerHost) {
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'select-box';
    this.boxEl.hidden = true;
    document.body.appendChild(this.boxEl);
  }

  destroy(): void {
    this.boxEl.remove();
  }

  private get world() {
    return this.host.world;
  }

  /** Selected units the player owns. */
  ownUnits(): Unit[] {
    const out: Unit[] = [];
    for (const id of this.selection) {
      const u = this.world.unit(id);
      if (u && u.owner === this.host.player) out.push(u);
    }
    return out;
  }

  private changed(): void {
    this.version++;
  }

  select(ids: number[]): void {
    this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.changed();
  }

  deselect(): void {
    this.select([]);
  }

  /** Drops dead or vanished entities from the selection. */
  prune(): void {
    let gone = false;
    for (const id of this.selection)
      if (!this.world.get(id)) {
        this.selection.delete(id);
        gone = true;
      }
    if (gone) this.changed();
  }

  // ---------- gestures ----------

  tap(sx: number, sy: number): void {
    const { camera } = this.host;
    const t = camera.screenToTile(sx, sy);
    if (this.placing) {
      const size = BUILDING_DEFS[this.placing.type].size;
      this.placing.x = Math.round(t.x - size / 2);
      this.placing.y = Math.round(t.y - size / 2);
      this.changed();
      return;
    }
    const pick = this.pick(t.x, t.y);
    const units = this.ownUnits();
    const me = this.host.player;

    if (pick.kind === 'entity' && pick.e.kind === 'unit' && pick.e.owner === me) return this.select([pick.e.id]);
    if (pick.kind === 'entity' && pick.e.kind === 'building' && pick.e.owner === me) {
      const b = pick.e;
      const helpers = units.filter((u) => (!b.complete && isGatherer(u)) || (b.complete && u.carry));
      if (helpers.length) {
        this.issue({ type: 'help', ids: helpers.map((u) => u.id), id: b.id });
        this.ring(b.x + b.size / 2, b.y + b.size / 2, '#ffe28a');
        return;
      }
      return this.select([b.id]);
    }
    if (!units.length) {
      // Nothing to command: tapping something selects it for a look, tapping ground clears.
      if (pick.kind === 'entity') return this.select([pick.e.id]);
      if (this.selection.size) this.deselect();
      return;
    }
    const target = this.gatherTarget(pick);
    if (target) {
      this.issue({ type: 'gather', ids: units.map((u) => u.id), target });
      const p = target.kind === 'tile' ? { x: target.x + 0.5, y: target.y + 0.5 } : (this.world.get(target.id) as { x: number; y: number });
      this.ring(p.x, p.y, '#ffe28a');
      return;
    }
    this.issue({ type: 'move', ids: units.map((u) => u.id), x: t.x, y: t.y });
    this.ring(t.x, t.y, '#9cf59a');
  }

  doubleTap(sx: number, sy: number): void {
    if (this.placing) return;
    const { camera } = this.host;
    const t = camera.screenToTile(sx, sy);
    const pick = this.pick(t.x, t.y);
    if (pick.kind !== 'entity' || pick.e.kind !== 'unit' || pick.e.owner !== this.host.player) return this.tap(sx, sy);
    const type = pick.e.type;
    const hw = camera.viewW / 2 / camera.scale, hh = camera.viewH / 2 / camera.scale;
    const ids: number[] = [];
    for (const u of this.world.units(this.host.player))
      if (u.type === type && Math.abs(u.x - camera.x) <= hw && Math.abs(u.y - camera.y) <= hh) ids.push(u.id);
    this.select(ids);
  }

  box(x0: number, y0: number, x1: number, y1: number, done: boolean): void {
    const l = Math.min(x0, x1), r = Math.max(x0, x1), tp = Math.min(y0, y1), b = Math.max(y0, y1);
    if (!done) {
      Object.assign(this.boxEl.style, { left: `${l}px`, top: `${tp}px`, width: `${r - l}px`, height: `${b - tp}px` });
      this.boxEl.hidden = false;
      return;
    }
    this.boxEl.hidden = true;
    if (r - l < 6 && b - tp < 6) return;
    const { camera } = this.host;
    const a = camera.screenToTile(l, tp), c = camera.screenToTile(r, b);
    const ids: number[] = [];
    for (const u of this.world.units(this.host.player)) {
      // Test the middle of the figure, which stands above its feet.
      const my = u.y - 0.4;
      if (u.x >= a.x && u.x <= c.x && my >= a.y && my <= c.y) ids.push(u.id);
    }
    if (ids.length) this.select(ids);
  }

  // ---------- picking ----------

  private pick(tx: number, ty: number): Pick {
    const { world } = this;
    const fog = world.fog[this.host.player];
    let best: Entity | null = null;
    let bd = Infinity;
    for (const e of world.entities.values()) {
      if (e.kind === 'unit') {
        if (e.owner !== this.host.player && !fog.isVisible(e.x, e.y)) continue;
        // Generous hit box: at least ~22 CSS px around the figure so fingers can hit it.
        const h = unitHeight(e.type);
        const tol = Math.max(0.45, 22 / this.host.camera.scale);
        if (Math.abs(tx - e.x) > tol || ty < e.y - h - tol * 0.4 || ty > e.y + tol * 0.6) continue;
        // Own units win ties so a crowd can always be tapped into.
        const d = Math.hypot(tx - e.x, ty - (e.y - h / 2)) - (e.owner === this.host.player ? 0.2 : 0);
        if (d < bd) (bd = d), (best = e);
      }
    }
    if (best) return { kind: 'entity', e: best };
    for (const e of world.entities.values()) {
      if (e.kind === 'building') {
        if (e.owner !== this.host.player && !fog.isExplored(e.x + 1, e.y + 1)) continue;
        if (tx >= e.x && tx <= e.x + e.size && ty >= e.y - e.size * 0.35 && ty <= e.y + e.size) return { kind: 'entity', e };
      } else if (e.kind === 'resource') {
        if (fog.isVisible(e.x, e.y) && Math.hypot(tx - e.x, ty - (e.y - 0.15)) < 0.6) return { kind: 'entity', e };
      }
    }
    const N = world.map.size;
    const fx = Math.floor(tx), fy = Math.floor(ty);
    // Trees and piles stand up above their tile, so a tap just above one still hits it.
    for (const [x, y] of [[fx, fy], [fx, fy + 1]]) {
      if (x < 0 || y < 0 || x >= N || y >= N || !fog.explored[y * N + x]) continue;
      if (world.map.feature[y * N + x] !== Feature.None) return { kind: 'tile', x, y };
    }
    return { kind: 'ground', x: tx, y: ty };
  }

  private gatherTarget(p: Pick): GatherTarget | null {
    let t: GatherTarget | null = null;
    if (p.kind === 'tile') t = { kind: 'tile', x: p.x, y: p.y };
    else if (p.kind === 'entity' && p.e.kind === 'resource') t = { kind: 'entity', id: p.e.id };
    return t && sourceOf(this.world, t) ? t : null;
  }

  // ---------- actions from the HUD ----------

  startPlacing(type: BuildingType): void {
    const { camera } = this.host;
    const size = BUILDING_DEFS[type].size;
    this.placing = { type, x: Math.round(camera.x - size / 2), y: Math.round(camera.y - size / 2) };
    this.changed();
  }

  placementValid(): boolean {
    const p = this.placing;
    return !!p && this.world.canPlace(p.type, this.host.player, p.x, p.y);
  }

  confirmPlacing(): void {
    const p = this.placing;
    if (!p) return;
    const builders = this.ownUnits().filter(isGatherer);
    this.issue({ type: 'build', ids: builders.map((u) => u.id), building: p.type, x: p.x, y: p.y });
    this.placing = null;
    this.changed();
  }

  cancelPlacing(): void {
    this.placing = null;
    this.changed();
  }

  stop(): void {
    const ids = this.ownUnits().map((u) => u.id);
    if (ids.length) this.issue({ type: 'stop', ids });
  }

  idleVillagers(): Unit[] {
    return [...this.world.units(this.host.player)].filter((u) => u.type === 'villager' && !u.order);
  }

  /** Selects the next idle villager and centres the camera on it. */
  nextIdleVillager(): void {
    const idle = this.idleVillagers();
    if (!idle.length) return;
    const u = idle[this.idleCursor++ % idle.length];
    this.select([u.id]);
    this.host.camera.centerOn(u.x, u.y);
  }

  /** Own units that fight (everything but villagers). */
  military(): Unit[] {
    return [...this.world.units(this.host.player)].filter((u) => u.type !== 'villager');
  }

  idleMilitary(): Unit[] {
    return this.military().filter((u) => !u.order);
  }

  nextIdleMilitary(): void {
    const idle = this.idleMilitary();
    if (!idle.length) return;
    const u = idle[this.idleCursor++ % idle.length];
    this.select([u.id]);
    this.host.camera.centerOn(u.x, u.y);
  }

  selectAllMilitary(): void {
    const ids = this.military().map((u) => u.id);
    if (ids.length) this.select(ids);
  }

  private issue(cmd: Command): void {
    this.world.issue(this.host.player, cmd);
  }

  private ring(x: number, y: number, color: string): void {
    this.host.addEffect({ kind: 'ring', x, y, color });
  }
}
