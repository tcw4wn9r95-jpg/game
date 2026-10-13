// Turns gestures into selection changes and player commands.
import type { Camera } from '../render/camera';
import type { Effect } from '../render/renderer';
import { isGatherer, sourceOf } from '../sim/economy';
import { BUILDING_DEFS, type Building, type BuildingType, type Entity, type GatherTarget, type Unit } from '../sim/entities';
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
    const pick = this.pick(sx, sy);
    const units = this.ownUnits();
    const me = this.host.player;

    if (pick.kind === 'entity' && pick.e.kind === 'unit' && pick.e.owner === me) return this.select([pick.e.id]);
    if (pick.kind === 'entity' && pick.e.kind === 'building' && pick.e.owner === me) {
      const b = pick.e;
      const farmers = units.filter(isGatherer);
      if (b.type === 'farm' && b.complete && farmers.length) {
        this.issue({ type: 'gather', ids: farmers.map((u) => u.id), target: { kind: 'entity', id: b.id } });
        this.ring(b.x + b.size / 2, b.y + b.size / 2, '#ffe28a');
        return;
      }
      // Villagers act on it only if there is work there: build it, or unload what they carry.
      const accepts = (BUILDING_DEFS[b.type].dropoff as string[]);
      const helpers = units.filter((u) => (!b.complete && isGatherer(u)) || (b.complete && u.carry && accepts.includes(u.carry.res)));
      if (helpers.length) {
        this.issue({ type: 'help', ids: helpers.map((u) => u.id), id: b.id });
        this.ring(b.x + b.size / 2, b.y + b.size / 2, '#ffe28a');
        return;
      }
      return this.select([b.id]);
    }
    const producers = this.ownProducers();
    if (!units.length && producers.length && !(pick.kind === 'entity' && pick.e.kind === 'unit')) {
      // With a training building selected, a tap sets where new units gather.
      const target = this.gatherTarget(pick);
      const p = target ? this.targetPoint(target) : t;
      this.issue({ type: 'rally', ids: producers.map((b) => b.id), x: p.x, y: p.y, target });
      this.ring(p.x, p.y, '#fff0b0');
      return;
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
      const p = this.targetPoint(target);
      this.ring(p.x, p.y, '#ffe28a');
      return;
    }
    this.issue({ type: 'move', ids: units.map((u) => u.id), x: t.x, y: t.y });
    this.ring(t.x, t.y, '#9cf59a');
  }

  doubleTap(sx: number, sy: number): void {
    if (this.placing) return;
    const { camera } = this.host;
    const pick = this.pick(sx, sy);
    if (pick.kind !== 'entity' || pick.e.kind !== 'unit' || pick.e.owner !== this.host.player) return this.tap(sx, sy);
    const type = pick.e.type;
    const ids: number[] = [];
    for (const u of this.world.units(this.host.player)) {
      const p = camera.tileToScreen(u.x, u.y);
      if (u.type === type && p.x >= 0 && p.x <= camera.viewW && p.y >= 0 && p.y <= camera.viewH) ids.push(u.id);
    }
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
    const ids: number[] = [];
    for (const u of this.world.units(this.host.player)) {
      // Test the middle of the figure, which stands above its feet.
      const p = camera.tileToScreen(u.x, u.y);
      const my = p.y - camera.scale * 0.6;
      if (p.x >= l && p.x <= r && my >= tp && my <= b) ids.push(u.id);
    }
    if (ids.length) this.select(ids);
  }

  private dragOffset: { x: number; y: number } | null = null;

  /** Starts dragging the placement ghost if the touch lands on it; returns true to claim the gesture. */
  dragStart(sx: number, sy: number): boolean {
    const p = this.placing;
    if (!p) return false;
    const t = this.host.camera.screenToTile(sx, sy);
    const size = BUILDING_DEFS[p.type].size;
    if (t.x < p.x - 0.5 || t.x > p.x + size + 0.5 || t.y < p.y - 1 || t.y > p.y + size + 0.5) return false;
    this.dragOffset = { x: t.x - p.x, y: t.y - p.y };
    return true;
  }

  drag(sx: number, sy: number): void {
    const p = this.placing;
    if (!p || !this.dragOffset) return;
    const t = this.host.camera.screenToTile(sx, sy);
    const nx = Math.round(t.x - this.dragOffset.x), ny = Math.round(t.y - this.dragOffset.y);
    if (nx !== p.x || ny !== p.y) {
      p.x = nx;
      p.y = ny;
      this.changed();
    }
  }

  dragEnd(): void {
    this.dragOffset = null;
  }

  /** Deletes the player's selected units and buildings. */
  deleteSelected(): void {
    const ids = [...this.selection].filter((id) => {
      const e = this.world.get(id);
      return e && e.kind !== 'resource' && e.owner === this.host.player;
    });
    if (ids.length) this.issue({ type: 'delete', ids });
    this.deselect();
  }

  /** Sends a production or toggle command for the selected building. */
  command(cmd: Command): void {
    this.issue(cmd);
  }

  // ---------- picking ----------

  /** Finds what is under a screen point (CSS px). Everything stands up from the ground, so hit tests run in screen space. */
  private pick(sx: number, sy: number): Pick {
    const { world } = this;
    const { camera } = this.host;
    const fog = world.fog[this.host.player];
    const Z = camera.scale;
    const t = camera.screenToTile(sx, sy);
    let best: Entity | null = null;
    let bd = Infinity;
    // Generous hit box: about 22 CSS px around the figure so fingers can hit it.
    const tolX = Math.max(0.45 * 1.6 * Z, 22);
    for (const e of world.entities.values()) {
      if (e.kind !== 'unit') continue;
      if (e.owner !== this.host.player && !fog.isVisible(e.x, e.y)) continue;
      const p = camera.tileToScreen(e.x, e.y);
      const h = Math.max(unitHeight(e.type) * 1.6 * Z, 26);
      if (Math.abs(sx - p.x) > tolX || sy < p.y - h - 8 || sy > p.y + 12) continue;
      // Own units win ties so a crowd can always be tapped into.
      const d = Math.hypot(sx - p.x, sy - (p.y - h / 2)) / Z - (e.owner === this.host.player ? 0.2 : 0);
      if (d < bd) (bd = d), (best = e);
    }
    // A tap well inside a building picks the building unless a unit is right under the finger.
    if (best && bd > 0.5) {
      const b = this.buildingAt(t.x, t.y, 0.4);
      if (b) return { kind: 'entity', e: b };
    }
    if (best) return { kind: 'entity', e: best };
    // Buildings: the footprint, or the walls and roof that rise above it on screen.
    let bb: Building | null = null;
    let bbd = Infinity;
    for (const b of world.buildings()) {
      if (b.owner !== this.host.player && !fog.isExplored(b.x + 1, b.y + 1)) continue;
      const inside = t.x >= b.x && t.x <= b.x + b.size && t.y >= b.y && t.y <= b.y + b.size;
      const left = camera.tileToScreen(b.x, b.y + b.size).x, right = camera.tileToScreen(b.x + b.size, b.y).x;
      const top = camera.tileToScreen(b.x, b.y).y, mid = camera.tileToScreen(b.x + b.size, b.y).y;
      const flat = b.type === 'farm';
      const above = !flat && sx >= left && sx <= right && sy <= mid && sy >= top - b.size * Z * 1.4;
      if (!inside && !above) continue;
      // Prefer the building nearest the viewer (larger x+y) when sprites overlap.
      const d = -(b.x + b.y + b.size) + (inside ? 0 : 0.5);
      if (d < bbd) (bbd = d), (bb = b);
    }
    if (bb) return { kind: 'entity', e: bb };
    let rb: Entity | null = null;
    let rd = 0.7;
    for (const e of world.entities.values()) {
      if (e.kind !== 'resource' || !fog.isVisible(e.x, e.y)) continue;
      const p = camera.tileToScreen(e.x, e.y);
      const d = Math.hypot(sx - p.x, sy - (p.y - 0.3 * Z)) / Math.max(Z, 26);
      if (d < rd) (rd = d), (rb = e);
    }
    if (rb) return { kind: 'entity', e: rb };
    const N = world.map.size;
    const fx = Math.floor(t.x), fy = Math.floor(t.y);
    // Trees and piles stand up above their tile, so a tap on the canopy (the tiles below it on screen) still hits it.
    for (const [x, y] of [[fx, fy], [fx + 1, fy + 1], [fx + 1, fy], [fx, fy + 1], [fx + 2, fy + 2]]) {
      if (x < 0 || y < 0 || x >= N || y >= N || !fog.explored[y * N + x]) continue;
      if (world.map.feature[y * N + x] !== Feature.None) return { kind: 'tile', x, y };
    }
    return { kind: 'ground', x: t.x, y: t.y };
  }

  /** A visible building whose footprint contains the point, at least `inset` tiles from its edge. */
  private buildingAt(tx: number, ty: number, inset: number): Building | null {
    const fog = this.world.fog[this.host.player];
    for (const b of this.world.buildings()) {
      if (b.owner !== this.host.player && !fog.isExplored(b.x + 1, b.y + 1)) continue;
      if (tx >= b.x + inset && tx <= b.x + b.size - inset && ty >= b.y + inset && ty <= b.y + b.size - inset) return b;
    }
    return null;
  }

  private gatherTarget(p: Pick): GatherTarget | null {
    let t: GatherTarget | null = null;
    if (p.kind === 'tile') t = { kind: 'tile', x: p.x, y: p.y };
    else if (p.kind === 'entity' && (p.e.kind === 'resource' || (p.e.kind === 'building' && p.e.type === 'farm' && p.e.owner === this.host.player)))
      t = { kind: 'entity', id: p.e.id };
    return t && sourceOf(this.world, t) ? t : null;
  }

  private targetPoint(t: GatherTarget): { x: number; y: number } {
    if (t.kind === 'tile') return { x: t.x + 0.5, y: t.y + 0.5 };
    const e = this.world.get(t.id)!;
    return e.kind === 'building' ? { x: e.x + e.size / 2, y: e.y + e.size / 2 } : { x: e.x, y: e.y };
  }

  /** Selected buildings of the player's that can train units. */
  ownProducers(): Building[] {
    const out: Building[] = [];
    for (const id of this.selection) {
      const b = this.world.building(id);
      if (b && b.owner === this.host.player && b.complete && BUILDING_DEFS[b.type].trains.length) out.push(b);
    }
    return out;
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
