// Training units: queues with up-front cost, pausing at the population cap,
// spawning next to the building and heading for its rally point.
import economy from '../data/economy.json';
import { DT, type ResourceKind } from './constants';
import { gatherOrder, isGatherer, setOrder } from './economy';
import { BUILDING_DEFS, type Building, UNIT_DEFS, type UnitType } from './entities';
import type { World } from './world';

type Cost = Partial<Record<ResourceKind, number>>;

export function canAfford(w: World, player: number, cost: Cost): boolean {
  const r = w.players[player].resources;
  return Object.entries(cost).every(([k, v]) => r[k as ResourceKind] >= (v ?? 0));
}

export function pay(w: World, player: number, cost: Cost, sign = 1): void {
  const r = w.players[player].resources;
  for (const [k, v] of Object.entries(cost)) r[k as ResourceKind] -= sign * (v ?? 0);
}

/** Adds a unit to a building's queue, paying for it now. Returns false (with an error event) if it can't. */
export function enqueue(w: World, b: Building, unit: UnitType): boolean {
  const def = BUILDING_DEFS[b.type];
  if (!b.complete || !def.trains.includes(unit)) return false;
  if (b.queue.length >= economy.queueLimit) {
    w.events.push({ type: 'error', owner: b.owner, message: 'Queue is full' });
    return false;
  }
  const cost = UNIT_DEFS[unit].cost;
  if (!canAfford(w, b.owner, cost)) {
    const short = Object.entries(cost).find(([k, v]) => w.players[b.owner].resources[k as ResourceKind] < (v ?? 0));
    w.events.push({ type: 'error', owner: b.owner, message: `Not enough ${short?.[0] ?? 'resources'}` });
    return false;
  }
  pay(w, b.owner, cost);
  b.queue.push({ unit, progress: 0 });
  return true;
}

/** Removes a queued unit and refunds it in full. */
export function cancelQueued(w: World, b: Building, index: number): void {
  const item = b.queue[index];
  if (!item) return;
  b.queue.splice(index, 1);
  pay(w, b.owner, UNIT_DEFS[item.unit].cost, -1);
  if (index === 0) b.housed = false;
}

export function productionTick(w: World): void {
  for (const b of w.buildings()) {
    if (!b.complete || !b.queue.length) continue;
    const head = b.queue[0];
    const p = w.players[b.owner];
    const udef = UNIT_DEFS[head.unit];
    if (p.pop + udef.pop > p.popCap) {
      if (!b.housed) w.events.push({ type: 'error', owner: b.owner, message: 'Need more houses' });
      b.housed = true;
      continue;
    }
    b.housed = false;
    head.progress += DT / udef.trainTime;
    if (head.progress < 1) continue;
    b.queue.shift();
    const u = spawnFrom(w, b, head.unit);
    p.pop += udef.pop;
    w.events.push({ type: 'trained', owner: b.owner, id: u.id });
    if (b.repeat && b.queue.length === 0 && canAfford(w, b.owner, udef.cost)) {
      pay(w, b.owner, udef.cost);
      b.queue.push({ unit: head.unit, progress: 0 });
    }
  }
}

/** Places a new unit beside the building, on the side facing its rally point, and sends it there. */
function spawnFrom(w: World, b: Building, type: UnitType) {
  const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
  const toward = b.rally ?? { x: cx, y: b.y + b.size + 1 };
  const d = Math.hypot(toward.x - cx, toward.y - cy) || 1;
  const ex = cx + ((toward.x - cx) / d) * (b.size / 2 + 0.8), ey = cy + ((toward.y - cy) / d) * (b.size / 2 + 0.8);
  const spot = w.grid.nearestWalkable(ex, ey, -1, b.size + 4) ?? { x: Math.floor(cx), y: b.y + b.size };
  const u = w.spawnUnit(type, b.owner, spot.x + 0.5, spot.y + 0.5);
  if (b.rally) {
    const order = b.rally.target && isGatherer(u) ? gatherOrder(w, b.rally.target) : null;
    setOrder(u, order ?? { type: 'move', x: b.rally.x, y: b.rally.y });
  }
  return u;
}
