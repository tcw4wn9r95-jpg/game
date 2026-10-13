import economy from '../data/economy.json';
import mapsData from '../data/maps.json';
import { applyCommand, type Command } from './commands';
import { combatThink, type Projectile, projectileTick } from './combat';
import { constructionTick, goalFor, think, unreachable } from './economy';
import { type ResourceKind, TICK_RATE } from './constants';
import {
  BUILDING_DEFS,
  type Building,
  type BuildingType,
  type Entity,
  type ResourceEntity,
  UNIT_DEFS,
  type Unit,
  type UnitType,
} from './entities';
import { Fog, type VisionSource } from './fog';
import { NavGrid } from './grid';
import { moveUnit, separate } from './movement';
import { productionTick } from './production';
import { Pathfinder } from './pathfinding';
import { Rng } from './rng';
import { SpatialHash } from './spatial';
import { type PlayerMods, type TechId, baseMods, buildingMaxHp, unitStats } from './techs';
import { type GameMap, Terrain } from './terrain';

export { DT, RESOURCE_KINDS, TICK_MS, TICK_RATE, type ResourceKind } from './constants';

/** Path searches run per tick; the rest wait for the next tick (keeps ticks bounded). */
const PATHS_PER_TICK = 32;

export interface PlayerState {
  resources: Record<ResourceKind, number>;
  /** Totals gathered over the match. */
  gathered: Record<ResourceKind, number>;
  pop: number;
  popCap: number;
  /** 0-3: Settlement, Township, Stronghold, Dominion. */
  age: number;
  /** Replant farms automatically when they run out (costs a farm's wood). */
  autoReseed: boolean;
  /** Technologies researched, in order. */
  techs: TechId[];
  /** Effective stats after research. */
  mods: PlayerMods;
  /** Market prices (gold per 100) for buying each commodity. */
  market: { food: number; wood: number; stone: number };
}

export type SimEvent =
  | { type: 'dropoff'; owner: number; x: number; y: number; res: ResourceKind; amount: number }
  | { type: 'built'; owner: number; id: number }
  | { type: 'trained'; owner: number; id: number }
  | { type: 'error'; owner: number; message: string }
  /** `owner` is the side that was hit; `by` the attacking side. */
  | { type: 'hit'; owner: number; by: number; id: number; x: number; y: number; amount: number; building: boolean }
  | { type: 'death'; owner: number; unit: UnitType; x: number; y: number; face: number; by: number }
  | { type: 'destroyed'; owner: number; building: BuildingType; x: number; y: number; size: number; by: number }
  | { type: 'converted'; owner: number; from: number; id: number; x: number; y: number }
  | { type: 'researched'; owner: number; tech: TechId };

/** Game state, advanced only by step(); input and AI both act through issue(). */
export class World {
  tick = 0;
  readonly players: PlayerState[];
  /** Fog per player slot. */
  readonly fog: Fog[];
  readonly entities = new Map<number, Entity>();
  readonly grid: NavGrid;
  readonly paths: Pathfinder;
  readonly rng: Rng;
  /** Events since the last drain (drop-offs, completions, errors), for effects and HUD. */
  events: SimEvent[] = [];
  /** Builders working on each foundation this tick. */
  readonly builders = new Map<number, number>();
  /** Units by position, rebuilt each tick. */
  readonly spatial: SpatialHash;
  /** Arrows and javelins in flight. */
  projectiles: Projectile[] = [];
  nextProjectileId = 1;
  private nextId = 1;
  private pending: Array<{ player: number; cmd: Command }> = [];
  private pathQueue: number[] = [];
  private readonly popLimit: number;

  constructor(
    readonly map: GameMap,
    opts: { spawnStarts?: boolean } = {},
  ) {
    this.rng = new Rng(map.seed ^ 0x9e3779b9);
    this.grid = new NavGrid(map);
    this.paths = new Pathfinder(this.grid);
    this.spatial = new SpatialHash(map.size);
    this.popLimit = mapsData.sizes[map.sizeName].popCap;
    this.players = map.starts.map(() => ({
      resources: { ...economy.startResources },
      gathered: { food: 0, wood: 0, gold: 0, stone: 0 },
      pop: 0,
      popCap: 0,
      age: 0,
      autoReseed: true,
      techs: [],
      mods: baseMods(),
      market: { food: 100, wood: 100, stone: 130 },
    }));
    this.fog = map.starts.map((s) => {
      const fog = new Fog(map.size);
      fog.explore(s.x + 0.5, s.y + 0.5, mapsData.start.exploredRadius);
      return fog;
    });
    for (const a of map.animals) this.add<ResourceEntity>({ kind: 'resource', type: a.kind, x: a.x, y: a.y, amount: a.amount });
    if (opts.spawnStarts !== false) map.starts.forEach((s, p) => this.spawnStart(p, s.x, s.y));
    this.updatePopulation();
    this.updateVision();
  }

  /** Match time in seconds. */
  get time(): number {
    return this.tick / TICK_RATE;
  }

  // ---------- entities ----------

  private add<T extends Entity>(e: Omit<T, 'id'>): T {
    const full = { ...e, id: this.nextId++ } as T;
    this.entities.set(full.id, full);
    return full;
  }

  get(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  unit(id: number): Unit | undefined {
    const e = this.entities.get(id);
    return e?.kind === 'unit' ? e : undefined;
  }

  building(id: number): Building | undefined {
    const e = this.entities.get(id);
    return e?.kind === 'building' ? e : undefined;
  }

  *units(owner?: number): IterableIterator<Unit> {
    for (const e of this.entities.values()) if (e.kind === 'unit' && (owner === undefined || e.owner === owner)) yield e;
  }

  *buildings(owner?: number): IterableIterator<Building> {
    for (const e of this.entities.values()) if (e.kind === 'building' && (owner === undefined || e.owner === owner)) yield e;
  }

  *resources(): IterableIterator<ResourceEntity> {
    for (const e of this.entities.values()) if (e.kind === 'resource') yield e;
  }

  remove(id: number): void {
    const e = this.entities.get(id);
    if (!e) return;
    if (e.kind === 'building') this.grid.setBuilding(e.x, e.y, e.size, 0);
    if (e.kind === 'unit') this.updatePopulation();
    this.entities.delete(id);
  }

  spawnUnit(type: UnitType, owner: number, x: number, y: number): Unit {
    return this.add<Unit>({
      kind: 'unit',
      type,
      owner,
      x,
      y,
      px: x,
      py: y,
      hp: unitStats(this, owner, type).hp,
      face: 1,
      stance: UNIT_DEFS[type].stance,
      cooldown: 0,
      guard: null,
      flow: null,
      attackedBy: 0,
      attackedAt: -1000,
      faith: 0,
      order: null,
      path: null,
      pathIdx: 0,
      pathPending: false,
      state: 'idle',
      carry: null,
      gatherAcc: 0,
      resume: null,
      repaths: 0,
    });
  }

  /** True if a building of this type fits at (x, y) for this player. */
  canPlace(type: BuildingType, owner: number, x: number, y: number): boolean {
    const def = BUILDING_DEFS[type];
    const size = def.size;
    const { map, grid } = this;
    const fog = this.fog[owner];
    if (def.requires && ![...this.buildings(owner)].some((b) => b.type === def.requires && b.complete)) return false;
    if (this.players[owner] && def.age > this.players[owner].age) return false;
    for (let ty = y; ty < y + size; ty++)
      for (let tx = x; tx < x + size; tx++) {
        if (!grid.inside(tx, ty)) return false;
        const i = ty * map.size + tx;
        const t = map.terrain[i];
        if (t === Terrain.Deep || t === Terrain.Shallow) return false;
        if (map.feature[i] !== 0 || grid.building[i] !== 0) return false;
        if (fog && !fog.explored[i]) return false;
      }
    return true;
  }

  placeBuilding(type: BuildingType, owner: number, x: number, y: number, complete = false): Building {
    const def = BUILDING_DEFS[type];
    const b = this.add<Building>({
      kind: 'building',
      type,
      owner,
      x,
      y,
      size: def.size,
      hp: complete ? def.hp : 1,
      progress: complete ? 1 : 0,
      complete,
      queue: [],
      rally: null,
      repeat: false,
      amount: def.food ? def.food + (this.players[owner]?.mods.farmFood ?? 0) : 0,
      housed: false,
    });
    if (complete) b.hp = buildingMaxHp(this, b);
    this.grid.setBuilding(x, y, def.size, b.id, !def.walkable);
    // Anyone standing on the new footprint steps off it.
    for (const u of this.units()) {
      if (def.walkable || this.grid.building[Math.floor(u.y) * this.map.size + Math.floor(u.x)] !== b.id) continue;
      const out = this.grid.nearestWalkable(u.x, u.y, -1, def.size + 4);
      if (out) {
        u.x = u.px = out.x + 0.5;
        u.y = u.py = out.y + 0.5;
      }
      u.path = null;
    }
    if (complete) this.updatePopulation();
    return b;
  }

  /** Town Center, three villagers and a scout around a start tile. */
  private spawnStart(owner: number, sx: number, sy: number): void {
    const tc = this.placeBuilding('town_center', owner, sx - 1, sy - 1, true);
    const below = tc.y + tc.size + 0.6;
    for (let k = 0; k < 3; k++) this.spawnUnit('villager', owner, tc.x + 0.8 + k * 1.2, below);
    this.spawnUnit('scout', owner, tc.x + tc.size + 0.8, tc.y + 1.5);
  }

  // ---------- commands & paths ----------

  issue(player: number, cmd: Command): void {
    this.pending.push({ player, cmd });
  }

  /** Queues a path search for a unit; the goal is read from its order when the search runs. */
  requestPath(u: Unit): void {
    if (u.pathPending) return;
    u.pathPending = true;
    this.pathQueue.push(u.id);
  }

  private processPaths(): void {
    let done = 0;
    while (this.pathQueue.length && done < PATHS_PER_TICK) {
      const id = this.pathQueue.shift()!;
      const u = this.unit(id);
      if (!u || !u.pathPending) continue;
      u.pathPending = false;
      const goal = goalFor(this, u);
      if (!goal) continue;
      done++;
      let sx = Math.floor(u.x), sy = Math.floor(u.y);
      if (!this.grid.isWalkable(sx, sy)) {
        const near = this.grid.nearestWalkable(u.x, u.y, -1, 3);
        if (near) (sx = near.x), (sy = near.y);
      }
      const path = this.paths.find(sx, sy, goal);
      if (path === null) {
        unreachable(this, u);
        continue;
      }
      u.path = path;
      u.pathIdx = 0;
    }
  }

  // ---------- simulation ----------

  step(): void {
    for (const { player, cmd } of this.pending) applyCommand(this, player, cmd);
    this.pending = [];

    this.builders.clear();
    this.spatial.rebuild(this.units());
    for (const u of this.units()) {
      u.px = u.x;
      u.py = u.y;
      if (!combatThink(this, u)) think(this, u);
    }
    this.processPaths();
    for (const u of this.units()) moveUnit(this, u);
    separate(this);
    projectileTick(this);
    constructionTick(this);
    productionTick(this);
    this.updatePopulation();
    if (this.tick % 2 === 0) this.updateVision();
    this.tick++;
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  updatePopulation(): void {
    for (const p of this.players) (p.pop = 0), (p.popCap = 0);
    for (const u of this.units()) if (this.players[u.owner]) this.players[u.owner].pop += UNIT_DEFS[u.type].pop;
    for (const b of this.buildings())
      if (b.complete && this.players[b.owner]) this.players[b.owner].popCap += BUILDING_DEFS[b.type].pop;
    for (const p of this.players) p.popCap = Math.min(p.popCap, this.popLimit);
  }

  private updateVision(): void {
    const sources: VisionSource[][] = this.players.map(() => []);
    for (const u of this.units()) sources[u.owner]?.push({ x: u.x, y: u.y, r: unitStats(this, u.owner, u.type).los });
    for (const b of this.buildings())
      sources[b.owner]?.push({ x: b.x + b.size / 2, y: b.y + b.size / 2, r: BUILDING_DEFS[b.type].los + b.size / 2 + (this.players[b.owner]?.mods.building.los ?? 0) });
    this.fog.forEach((f, i) => f.update(sources[i]));
  }
}
