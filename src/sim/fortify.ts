// Fortifications: wall lines and gates, towers and castles that shoot arrows,
// garrisons (which add arrows and shelter units), and villagers repairing.
import { DT, type ResourceKind, TICK_RATE } from './constants';
import { setOrder } from './economy';
import { BUILDING_DEFS, type Building, type BuildingType, UNIT_DEFS, type Unit, distToRect } from './entities';
import { buildingAttack, buildingMaxHp, unitStats } from './techs';
import type { World } from './world';

/** Repairs cost this share of the building's price, spread over its HP. */
const REPAIR_COST = 0.5;
/** HP restored per second per repairer, as a share of max HP per build time. */
const REPAIR_RATE = 0.75;
/** Garrisoned units in a Town Center or Castle heal this much per second. */
const SHELTER_HEAL = 1;

// ---------- garrison ----------

/** Can this unit shelter in this building? Towers take villagers and foot soldiers; castles anyone but siege and horse. */
export function canShelter(b: Building, u: Unit): boolean {
  const def = BUILDING_DEFS[b.type];
  if (!def.garrison || !b.complete || b.owner !== u.owner) return false;
  const cls = UNIT_DEFS[u.type].classes;
  if (cls.includes('siege')) return false;
  if (b.type === 'castle') return true;
  return !cls.includes('cavalry');
}

export const shelterRoom = (b: Building) => (BUILDING_DEFS[b.type].garrison ?? 0) - b.garrison.length;

/** Units inside add an arrow each, if they are villagers or foot soldiers. */
function extraArrows(w: World, b: Building): number {
  let n = 0;
  for (const id of b.garrison) {
    const u = w.unit(id);
    if (u && !UNIT_DEFS[u.type].classes.includes('monk')) n++;
  }
  return n;
}

export function garrisonThink(w: World, u: Unit, o: { id: number }, reach: (u: Unit, b: Building) => boolean, walk: () => void): void {
  const b = w.building(o.id);
  if (!b || !canShelter(b, u) || shelterRoom(b) <= 0) {
    setOrder(u, null);
    u.state = 'idle';
    return;
  }
  if (!reach(u, b)) return walk();
  enter(u, b);
}

function enter(u: Unit, b: Building): void {
  setOrder(u, null);
  u.state = 'idle';
  u.inside = b.id;
  u.resume = null;
  b.garrison.push(u.id);
  u.x = u.px = b.x + b.size / 2;
  u.y = u.py = b.y + b.size / 2;
}

/** Lets everyone out of a building onto free ground around it. */
export function ungarrison(w: World, b: Building): void {
  for (const id of b.garrison) {
    const u = w.unit(id);
    if (!u) continue;
    u.inside = 0;
    const spot = w.grid.nearestWalkable(b.x + b.size / 2, b.y + b.size + 0.5, -1, b.size + 6, u.owner);
    if (spot) {
      u.x = u.px = spot.x + 0.5 + (w.rng.next() - 0.5) * 0.4;
      u.y = u.py = spot.y + 0.5 + (w.rng.next() - 0.5) * 0.4;
    }
    u.guard = { x: u.x, y: u.y };
  }
  b.garrison = [];
}

// ---------- repair ----------

export function repairThink(w: World, u: Unit, o: { id: number }, reach: (u: Unit, b: Building) => boolean, walk: () => void): void {
  const b = w.building(o.id);
  if (!b || b.owner !== u.owner || !b.complete) {
    setOrder(u, null);
    u.state = 'idle';
    return;
  }
  const max = buildingMaxHp(w, b);
  if (b.hp >= max) {
    setOrder(u, null);
    u.state = 'idle';
    return;
  }
  if (!reach(u, b)) return walk();
  u.path = null;
  u.state = 'repair';
  u.face = b.x + b.size / 2 > u.x ? 1 : -1;
  const def = BUILDING_DEFS[b.type];
  const hp = Math.min(max - b.hp, (max / def.buildTime) * REPAIR_RATE * DT * (w.players[u.owner]?.mods.buildSpeed ?? 1));
  // Pay for it as it goes: half the building's cost, pro rata.
  const p = w.players[u.owner];
  const cost = Object.entries(def.cost).map(([k, v]) => [k as ResourceKind, ((v ?? 0) * REPAIR_COST * hp) / max] as const);
  if (cost.some(([k, v]) => p.resources[k] < v)) {
    setOrder(u, null);
    u.state = 'idle';
    w.events.push({ type: 'error', owner: u.owner, message: 'Not enough resources to repair' });
    return;
  }
  for (const [k, v] of cost) p.resources[k] -= v;
  b.hp += hp;
}

// ---------- arrows ----------

/** Towers, castles and town centres shoot at the nearest enemy in range; each garrisoned soldier adds an arrow. */
export function towerTick(w: World): void {
  for (const b of w.buildings()) {
    if (!b.complete) continue;
    const a = buildingAttack(w, b);
    if (!a) continue;
    if (b.cooldown > 0) {
      b.cooldown--;
      continue;
    }
    const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
    const fog = w.fog[b.owner];
    const reachR = a.range + b.size / 2;
    const heated = !!w.players[b.owner]?.mods.defense.heatedShot;
    const targets: Array<{ u: Unit; d: number }> = [];
    w.spatial.query(cx, cy, reachR + 1, (o) => {
      if (o.owner === b.owner || o.inside || (fog && !fog.isVisible(o.x, o.y))) return;
      const d = distToRect(o.x, o.y, b.x, b.y, b.size);
      if (d > a.range || d < a.minRange) return;
      targets.push({ u: o, d });
    });
    if (!targets.length) continue;
    targets.sort((p, q) => p.d - q.d);
    const arrows = a.arrows + extraArrows(w, b);
    if (arrows <= 0) continue;
    b.cooldown = Math.round(a.reload * TICK_RATE);
    for (let k = 0; k < arrows; k++) {
      // Extra arrows spread over the nearest few targets.
      const t = targets[k % Math.min(targets.length, 3)].u;
      const sx = cx + (w.rng.next() - 0.5) * b.size * 0.6, sy = cy + (w.rng.next() - 0.5) * b.size * 0.6;
      const dist = Math.hypot(t.x - sx, t.y - sy);
      const ticks = Math.max(1, Math.round((dist / 8) * TICK_RATE));
      w.projectiles.push({
        id: w.nextProjectileId++,
        from: 'archer',
        owner: b.owner,
        shooter: b.id,
        target: t.id,
        sx,
        sy,
        tx: t.x,
        ty: t.y,
        t: 0,
        dt: 1 / ticks,
        arc: 0.6 + dist * 0.05,
        // Heated Shot: red-hot arrows set ships' timbers alight.
        damage: heated && UNIT_DEFS[t.type].naval ? a.attack * 2 : a.attack,
        height: b.type === 'castle' ? 2 : b.type === 'town_center' ? 1.4 : 1.6,
      });
    }
  }
  // Shelter heals.
  for (const b of w.buildings()) {
    if (!b.garrison.length || (b.type !== 'town_center' && b.type !== 'castle')) continue;
    for (const id of b.garrison) {
      const u = w.unit(id);
      if (u) u.hp = Math.min(unitStats(w, u.owner, u.type).hp, u.hp + SHELTER_HEAL * DT);
    }
  }
}

// ---------- walls ----------

/** Wall segment and gate types for a wall material. */
export const WALL_TYPES: Record<'palisade' | 'stone', { wall: BuildingType; gate: BuildingType }> = {
  palisade: { wall: 'palisade_wall', gate: 'palisade_gate' },
  stone: { wall: 'stone_wall', gate: 'gate' },
};

/**
 * Tiles along a line from (x0, y0) to (x1, y1), snapped to straight or 45°
 * diagonal so a wall drawn with a finger comes out neat.
 */
export function wallLine(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  let dx = x1 - x0, dy = y1 - y0;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax > ay * 2) dy = 0;
  else if (ay > ax * 2) dx = 0;
  else {
    const m = Math.max(ax, ay);
    dx = Math.sign(dx) * m;
    dy = Math.sign(dy) * m;
  }
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  const out: Array<{ x: number; y: number }> = [];
  for (let k = 0; k <= n; k++) out.push({ x: x0 + Math.round((dx * k) / (n || 1)), y: y0 + Math.round((dy * k) / (n || 1)) });
  return out;
}

/**
 * Lays foundations for a wall line (gates where asked), paying per segment in
 * order and stopping when money runs out. Returns the foundations placed.
 */
export function placeWall(w: World, owner: number, kind: 'palisade' | 'stone', tiles: Array<{ x: number; y: number; gate?: boolean }>): Building[] {
  const p = w.players[owner];
  const types = WALL_TYPES[kind];
  const placed: Building[] = [];
  let short = false;
  for (const t of tiles) {
    const type = t.gate ? types.gate : types.wall;
    const def = BUILDING_DEFS[type];
    if (def.age > p.age || !w.canPlace(type, owner, t.x, t.y)) continue;
    if (Object.entries(def.cost).some(([k, v]) => p.resources[k as ResourceKind] < (v ?? 0))) {
      short = true;
      break;
    }
    for (const [k, v] of Object.entries(def.cost)) p.resources[k as ResourceKind] -= v ?? 0;
    placed.push(w.placeBuilding(type, owner, t.x, t.y));
  }
  if (short) w.events.push({ type: 'error', owner, message: placed.length ? 'Ran out of resources partway along the wall' : 'Not enough resources' });
  return placed;
}

export function setGateLock(w: World, b: Building, locked: boolean): void {
  if (!BUILDING_DEFS[b.type].gate) return;
  b.locked = locked;
  w.grid.setGate(b.x, b.y, b.owner, locked);
}
