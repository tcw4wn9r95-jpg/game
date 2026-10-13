// Villager economy: walking to resources, gathering, carrying to the nearest valid
// drop-off and resuming; building foundations; and what to do when work runs out.
import economy from '../data/economy.json';
import { DT, type ResourceKind } from './constants';
import {
  BUILDING_DEFS,
  type Building,
  type GatherTarget,
  type Order,
  UNIT_DEFS,
  type Unit,
  distToRect,
} from './entities';
import type { Goal } from './pathfinding';
import { Feature } from './terrain';
import type { World } from './world';

const CAPACITY = economy.carryCapacity;
/** How close (tiles, centre to target edge) a unit must be to work a tile or building. */
const REACH = 1.05;
/** Reach for point targets such as animals and fish. */
const REACH_POINT = 1.5;
/** Path searches that fail to reach the target before an order is abandoned. */
const MAX_REPATHS = 4;

/** Gather source names: tile features and resource entities. */
export type Source = 'tree' | 'gold' | 'stone' | 'berries' | 'sheep' | 'deer' | 'fish' | 'farm';

const FEATURE_SOURCE: Record<number, Source | undefined> = {
  [Feature.Tree]: 'tree',
  [Feature.Gold]: 'gold',
  [Feature.Stone]: 'stone',
  [Feature.Berries]: 'berries',
};
const SOURCE_FEATURE: Partial<Record<Source, number>> = { tree: Feature.Tree, gold: Feature.Gold, stone: Feature.Stone, berries: Feature.Berries };

export const SOURCE_RESOURCE: Record<Source, ResourceKind> = {
  tree: 'wood',
  gold: 'gold',
  stone: 'stone',
  berries: 'food',
  sheep: 'food',
  deer: 'food',
  fish: 'food',
  farm: 'food',
};

const RATE_KEY: Record<Source, keyof typeof economy.gatherRates> = {
  tree: 'wood',
  gold: 'gold',
  stone: 'stone',
  berries: 'berries',
  sheep: 'sheep',
  deer: 'deer',
  fish: 'fish',
  farm: 'farm',
};

/** What a drop-off building's completion sends its builders to gather. */
const CAMP_SOURCES: Partial<Record<string, Source[]>> = {
  lumber_camp: ['tree'],
  mining_camp: ['gold', 'stone'],
  mill: ['berries'],
  farm: ['farm'],
};

interface ResolvedTarget {
  x: number;
  y: number;
  /** 1 for a tile target, 0 for a point target, the footprint for a farm. */
  size: number;
  amount: number;
  /** Farms are worked from inside the field. */
  inside?: boolean;
}

const isFarm = (e: { kind: string; type?: string } | undefined): e is Building => e?.kind === 'building' && e.type === 'farm';

/** Source of a gather target, or null if it is gone or empty. */
export function sourceOf(w: World, t: GatherTarget): Source | null {
  if (t.kind === 'tile') {
    const i = t.y * w.map.size + t.x;
    return w.map.amount[i] > 0 ? (FEATURE_SOURCE[w.map.feature[i]] ?? null) : null;
  }
  const e = w.get(t.id);
  if (isFarm(e)) return e.complete && e.amount > 0 ? 'farm' : null;
  return e?.kind === 'resource' && e.amount > 0 ? e.type : null;
}

function resolve(w: World, t: GatherTarget): ResolvedTarget | null {
  if (t.kind === 'tile') {
    const i = t.y * w.map.size + t.x;
    if (w.map.feature[i] === Feature.None || w.map.amount[i] <= 0) return null;
    return { x: t.x, y: t.y, size: 1, amount: w.map.amount[i] };
  }
  const e = w.get(t.id);
  if (isFarm(e)) return e.complete && e.amount > 0 ? { x: e.x, y: e.y, size: e.size, amount: e.amount, inside: true } : null;
  if (e?.kind !== 'resource' || e.amount <= 0) return null;
  return { x: e.x, y: e.y, size: 0, amount: e.amount };
}

/** Standing on a tile touching the target (the same rule paths aim for), or close enough by distance. */
function inReach(u: Unit, t: { x: number; y: number; size: number; inside?: boolean }): boolean {
  // Farmers work from well inside their field.
  if (t.inside) return u.x > t.x + 0.6 && u.x < t.x + t.size - 0.6 && u.y > t.y + 0.6 && u.y < t.y + t.size - 0.6;
  if (t.size === 0) return touches(u, Math.floor(t.x), Math.floor(t.y), 1) || Math.hypot(u.x - t.x, u.y - t.y) <= REACH_POINT;
  return touches(u, t.x, t.y, t.size) || distToRect(u.x, u.y, t.x, t.y, t.size) <= REACH;
}

function touches(u: Unit, x: number, y: number, size: number): boolean {
  const tx = Math.floor(u.x), ty = Math.floor(u.y);
  return tx >= x - 1 && tx <= x + size && ty >= y - 1 && ty <= y + size;
}

/** Takes one unit of resource from a target. Depleted tiles become walkable ground. */
function takeOne(w: World, t: GatherTarget): boolean {
  if (t.kind === 'tile') {
    const i = t.y * w.map.size + t.x;
    if (w.map.amount[i] <= 0) return false;
    w.map.amount[i]--;
    if (w.map.amount[i] === 0) {
      w.map.feature[i] = Feature.None;
      w.grid.refresh(i);
    }
    return true;
  }
  const e = w.get(t.id);
  if (isFarm(e)) {
    if (e.amount <= 0) return false;
    e.amount--;
    if (e.amount <= 0) reseed(w, e);
    return true;
  }
  if (e?.kind !== 'resource' || e.amount <= 0) return false;
  e.amount--;
  if (e.amount <= 0) w.remove(e.id);
  return true;
}

/** A harvested-out farm is replanted for its wood cost if auto-reseed is on, otherwise it goes fallow and disappears. */
function reseed(w: World, farm: Building): void {
  const p = w.players[farm.owner];
  const def = BUILDING_DEFS.farm;
  const wood = def.cost.wood ?? 0;
  if (p.autoReseed && p.resources.wood >= wood) {
    p.resources.wood -= wood;
    farm.amount = def.food ?? 0;
  } else {
    if (p.autoReseed) w.events.push({ type: 'error', owner: farm.owner, message: 'A farm ran out: not enough wood to replant' });
    w.remove(farm.id);
  }
}

/**
 * Another villager has this farm: one already working it wins, otherwise the
 * earlier villager (lower id) keeps its claim, so two can never both give way.
 */
function farmTaken(w: World, farmId: number, except: Unit): boolean {
  for (const o of w.units(except.owner)) {
    if (o === except || o.order?.type !== 'gather' || o.order.target.kind !== 'entity' || o.order.target.id !== farmId) continue;
    if (except.state === 'gather' && o.state !== 'gather') continue;
    if (o.state === 'gather' || o.id < except.id) return true;
  }
  return false;
}

/** True if some walkable tile next to (x, y) lies in the unit's region. */
function accessible(w: World, u: Unit, x: number, y: number): boolean {
  const region = w.grid.component(Math.floor(u.x), Math.floor(u.y));
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy;
      if (w.grid.isWalkable(tx, ty) && (region < 0 || w.grid.component(tx, ty) === region)) return true;
    }
  return false;
}

/** Nearest reachable target of one of these sources around (cx, cy), excluding `skip`. */
export function findResource(
  w: World,
  u: Unit,
  sources: Source[],
  cx: number,
  cy: number,
  radius = economy.searchRadius,
  skip?: GatherTarget,
): GatherTarget | null {
  let best: GatherTarget | null = null;
  let bd = Infinity;
  const features = sources.map((s) => SOURCE_FEATURE[s]).filter((f): f is number => f !== undefined);
  if (features.length) {
    const N = w.map.size;
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(N - 1, Math.floor(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(N - 1, Math.floor(cy + radius));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * N + x;
        if (!features.includes(w.map.feature[i]) || w.map.amount[i] <= 0) continue;
        if (skip?.kind === 'tile' && skip.x === x && skip.y === y) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > radius || d >= bd || !accessible(w, u, x, y)) continue;
        bd = d;
        best = { kind: 'tile', x, y };
      }
  }
  if (sources.includes('farm'))
    for (const b of w.buildings(u.owner)) {
      if (!isFarm(b) || !b.complete || b.amount <= 0 || farmTaken(w, b.id, u)) continue;
      if (skip?.kind === 'entity' && skip.id === b.id) continue;
      const d = Math.hypot(b.x + b.size / 2 - cx, b.y + b.size / 2 - cy);
      if (d > radius || d >= bd) continue;
      bd = d;
      best = { kind: 'entity', id: b.id };
    }
  for (const r of w.resources()) {
    if (!sources.includes(r.type) || r.amount <= 0) continue;
    if (skip?.kind === 'entity' && skip.id === r.id) continue;
    const d = Math.hypot(r.x - cx, r.y - cy);
    if (d > radius || d >= bd || !accessible(w, u, r.x, r.y)) continue;
    bd = d;
    best = { kind: 'entity', id: r.id };
  }
  return best;
}

/** Nearest complete drop-off of the unit's owner that accepts this resource. */
export function findDropoff(w: World, u: Unit, res: ResourceKind): Building | null {
  let best: Building | null = null;
  let bd = Infinity;
  for (const b of w.buildings(u.owner)) {
    if (!b.complete || !(BUILDING_DEFS[b.type].dropoff as string[]).includes(res)) continue;
    const d = distToRect(u.x, u.y, b.x, b.y, b.size);
    if (d < bd) (bd = d), (best = b);
  }
  return best;
}

export function gatherOrder(w: World, t: GatherTarget): Order | null {
  const source = sourceOf(w, t);
  return source ? { type: 'gather', target: t, res: SOURCE_RESOURCE[source], source } : null;
}

/** Sets a new order and resets per-order movement state. */
export function setOrder(u: Unit, order: Order | null): void {
  u.order = order;
  u.path = null;
  u.pathPending = false;
  u.repaths = 0;
}

function walkTo(w: World, u: Unit): void {
  u.state = 'walk';
  if (u.path || u.pathPending) return;
  // Paths keep ending short of the target (crowding, odd geometry): treat it as unreachable.
  if (u.repaths > MAX_REPATHS * 2) return unreachable(w, u);
  w.requestPath(u);
}

// ---------- per-tick behaviour ----------

export function think(w: World, u: Unit): void {
  const o = u.order;
  if (!o) {
    u.state = 'idle';
    return;
  }
  switch (o.type) {
    case 'move':
      if (!u.path && !u.pathPending && Math.hypot(u.x - o.x, u.y - o.y) < 0.6) setOrder(u, null), (u.state = 'idle');
      else walkTo(w, u);
      return;
    case 'gather':
      return gather(w, u, o);
    case 'dropoff':
      return dropoff(w, u, o);
    case 'build':
      return build(w, u, o);
  }
}

function gather(w: World, u: Unit, o: Extract<Order, { type: 'gather' }>): void {
  if (u.carry && u.carry.res !== o.res) u.carry = null; // switching jobs drops the load
  if (u.carry && u.carry.amount >= CAPACITY) return goDropoff(w, u, o);

  let t = resolve(w, o.target);
  if (t?.inside && o.target.kind === 'entity' && farmTaken(w, o.target.id, u)) {
    // Someone else is farming here: find a free field nearby.
    const next = findResource(w, u, ['farm'], t.x + 1.5, t.y + 1.5, economy.searchRadius, o.target);
    if (!next) return finishWork(w, u);
    o.target = next;
    u.path = null;
    t = resolve(w, next);
  }
  if (!t) {
    const old = o.target;
    const ox = old.kind === 'tile' ? old.x + 0.5 : u.x, oy = old.kind === 'tile' ? old.y + 0.5 : u.y;
    if (o.source === 'farm') return finishWork(w, u); // the field is gone; don't wander to another one
    const next = findResource(w, u, [o.source as Source], ox, oy);
    if (!next) return finishWork(w, u);
    o.target = next;
    u.path = null;
    u.repaths = 0;
    t = resolve(w, next)!;
  }

  if (!inReach(u, t)) return walkTo(w, u);
  u.path = null;
  u.state = 'gather';
  u.repaths = 0;
  if (t.x + t.size / 2 !== u.x) u.face = t.x + t.size / 2 > u.x ? 1 : -1;
  u.gatherAcc += economy.gatherRates[RATE_KEY[o.source as Source]] * DT;
  while (u.gatherAcc >= 1) {
    u.gatherAcc -= 1;
    if (!takeOne(w, o.target)) break;
    if (!u.carry) u.carry = { res: o.res, amount: 0 };
    u.carry.amount++;
    if (u.carry.amount >= CAPACITY) break;
  }
}

function goDropoff(w: World, u: Unit, resume: Order | null): void {
  const b = u.carry && findDropoff(w, u, u.carry.res);
  if (!b) {
    // Nowhere to unload: wait here with the load.
    setOrder(u, null);
    u.state = 'idle';
    return;
  }
  u.resume = resume;
  setOrder(u, { type: 'dropoff', id: b.id });
  walkTo(w, u);
}

function dropoff(w: World, u: Unit, o: Extract<Order, { type: 'dropoff' }>): void {
  if (!u.carry) {
    const next = u.resume;
    u.resume = null;
    return setOrder(u, next);
  }
  let b = w.building(o.id);
  if (!b || !b.complete || b.owner !== u.owner || !(BUILDING_DEFS[b.type].dropoff as string[]).includes(u.carry.res)) {
    b = findDropoff(w, u, u.carry.res) ?? undefined;
    if (!b) return finishWork(w, u);
    o.id = b.id;
    u.path = null;
  }
  if (!inReach(u, b)) return walkTo(w, u);
  const p = w.players[u.owner];
  p.resources[u.carry.res] += u.carry.amount;
  p.gathered[u.carry.res] += u.carry.amount;
  w.events.push({ type: 'dropoff', owner: u.owner, x: u.x, y: u.y, res: u.carry.res, amount: u.carry.amount });
  u.carry = null;
  const next = u.resume;
  u.resume = null;
  setOrder(u, next);
}

function build(w: World, u: Unit, o: Extract<Order, { type: 'build' }>): void {
  const b = w.building(o.id);
  if (!b || b.owner !== u.owner) return finishWork(w, u);
  if (b.complete) return afterBuild(w, u, b);
  if (!inReach(u, b)) return walkTo(w, u);
  u.path = null;
  u.repaths = 0;
  u.state = 'build';
  u.face = b.x + b.size / 2 > u.x ? 1 : -1;
  w.builders.set(b.id, (w.builders.get(b.id) ?? 0) + 1);
}

/** After finishing a building: work the camp's resource, help another foundation, or idle. */
function afterBuild(w: World, u: Unit, b: Building): void {
  const sources = CAMP_SOURCES[b.type];
  const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
  if (isFarm(b) && !farmTaken(w, b.id, u)) {
    const order = gatherOrder(w, { kind: 'entity', id: b.id });
    if (order) return setOrder(u, order);
  }
  if (sources && !isFarm(b)) {
    const t = findResource(w, u, sources, cx, cy, 8);
    const order = t && gatherOrder(w, t);
    if (order) return setOrder(u, order);
  }
  let next: Building | null = null;
  let bd = 10;
  for (const f of w.buildings(u.owner)) {
    if (f.complete) continue;
    const d = distToRect(cx, cy, f.x, f.y, f.size);
    if (d < bd) (bd = d), (next = f);
  }
  setOrder(u, next ? { type: 'build', id: next.id } : null);
}

/** No more work for this order: unload anything carried, then stand idle. */
function finishWork(w: World, u: Unit): void {
  if (u.carry && u.carry.amount > 0 && u.order?.type !== 'dropoff') return goDropoff(w, u, null);
  setOrder(u, null);
  u.state = 'idle';
}

// ---------- path goals ----------

/** Where the unit's current order wants it to stand, as a path goal. */
export function goalFor(w: World, u: Unit): Goal | null {
  const o = u.order;
  if (!o) return null;
  switch (o.type) {
    case 'move': {
      let tx = Math.floor(o.x), ty = Math.floor(o.y);
      const region = w.grid.component(Math.floor(u.x), Math.floor(u.y));
      if (!w.grid.isWalkable(tx, ty) || w.grid.component(tx, ty) !== region) {
        const near = w.grid.nearestWalkable(o.x, o.y, region);
        if (!near) return null;
        tx = near.x;
        ty = near.y;
        o.x = tx + 0.5;
        o.y = ty + 0.5;
      }
      return { x0: tx, y0: ty, x1: tx, y1: ty, reach: 0 };
    }
    case 'gather': {
      const t = resolve(w, o.target);
      if (!t) return null;
      // Farmers stand in the middle of their field.
      if (t.inside) return { x0: t.x + 1, y0: t.y + 1, x1: t.x + t.size - 2, y1: t.y + t.size - 2, reach: 0 };
      const tx = Math.floor(t.x), ty = Math.floor(t.y);
      return { x0: tx, y0: ty, x1: tx, y1: ty, reach: 1 };
    }
    case 'build':
    case 'dropoff': {
      const b = w.building(o.id);
      if (!b) return null;
      return { x0: b.x, y0: b.y, x1: b.x + b.size - 1, y1: b.y + b.size - 1, reach: 1 };
    }
  }
}

/** The order's goal can't be reached: try another target of the same kind, else give up. */
export function unreachable(w: World, u: Unit): void {
  const o = u.order;
  u.repaths++;
  if (o?.type === 'gather' && u.repaths <= MAX_REPATHS) {
    const ox = o.target.kind === 'tile' ? o.target.x + 0.5 : u.x, oy = o.target.kind === 'tile' ? o.target.y + 0.5 : u.y;
    const next = findResource(w, u, [o.source as Source], ox, oy, economy.searchRadius, o.target);
    if (next) {
      o.target = next;
      return;
    }
  }
  if (o?.type === 'dropoff' && u.carry) {
    // Try any other drop-off before giving up.
    const b = findDropoff(w, u, u.carry.res);
    if (b && b.id !== o.id && u.repaths <= MAX_REPATHS) {
      o.id = b.id;
      return;
    }
  }
  finishWork(w, u);
  if (u.order?.type === 'dropoff' && u.repaths > MAX_REPATHS) setOrder(u, null);
}

// ---------- construction ----------

/** Advances foundations by the builders working on them this tick. */
export function constructionTick(w: World): void {
  for (const [id, n] of w.builders) {
    const b = w.building(id);
    if (!b || b.complete) continue;
    const def = BUILDING_DEFS[b.type];
    // Extra builders help with diminishing returns: 1 builder = 1x, 4 builders = 2x.
    const before = b.progress;
    b.progress = Math.min(1, b.progress + (DT / def.buildTime) * ((n + 2) / 3));
    b.hp = Math.min(def.hp, b.hp + (b.progress - before) * def.hp);
    if (b.progress >= 1) {
      b.complete = true;
      w.events.push({ type: 'built', owner: b.owner, id: b.id });
    }
  }
}

export const isGatherer = (u: Unit) => !!UNIT_DEFS[u.type].gatherer;
export const isBuilder = (u: Unit) => !!UNIT_DEFS[u.type].builder;
