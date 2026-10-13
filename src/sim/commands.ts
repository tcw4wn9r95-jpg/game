// Player commands. Touch input and the AI both produce these; the world applies
// them at the start of the next tick, so the simulation stays deterministic.
import { findResource, gatherOrder, isBuilder, isGatherer, setOrder, sourceOf } from './economy';
import { BUILDING_DEFS, type BuildingType, type GatherTarget, type Unit, type UnitType } from './entities';
import { cancelQueued, canAfford, enqueue, pay } from './production';
import type { World } from './world';

export type Command =
  | { type: 'move'; ids: number[]; x: number; y: number }
  | { type: 'gather'; ids: number[]; target: GatherTarget }
  | { type: 'build'; ids: number[]; building: BuildingType; x: number; y: number }
  | { type: 'help'; ids: number[]; id: number }
  | { type: 'stop'; ids: number[] }
  | { type: 'train'; id: number; unit: UnitType; count?: number }
  | { type: 'cancelTrain'; id: number; index: number }
  | { type: 'rally'; ids: number[]; x: number; y: number; target: GatherTarget | null }
  | { type: 'repeat'; id: number; on: boolean }
  | { type: 'delete'; ids: number[] }
  | { type: 'autoReseed'; on: boolean };

export function applyCommand(w: World, player: number, cmd: Command): void {
  const ids = 'ids' in cmd ? cmd.ids : [];
  const units = ids.map((id) => w.unit(id)).filter((u): u is Unit => !!u && u.owner === player);
  switch (cmd.type) {
    case 'move':
      return moveGroup(units, cmd.x, cmd.y);
    case 'stop':
      for (const u of units) {
        setOrder(u, null);
        u.resume = null;
      }
      return;
    case 'gather':
      return gatherGroup(w, units, cmd.target);
    case 'build': {
      const def = BUILDING_DEFS[cmd.building];
      const p = w.players[player];
      if (!def.buildable || !w.canPlace(cmd.building, player, cmd.x, cmd.y)) {
        w.events.push({ type: 'error', owner: player, message: "Can't build there" });
        return;
      }
      if (!canAfford(w, player, def.cost)) {
        const short = Object.entries(def.cost).find(([k, v]) => p.resources[k as keyof typeof p.resources] < (v ?? 0));
        w.events.push({ type: 'error', owner: player, message: `Not enough ${short?.[0] ?? 'resources'}` });
        return;
      }
      pay(w, player, def.cost);
      const b = w.placeBuilding(cmd.building, player, cmd.x, cmd.y);
      for (const u of units) if (isBuilder(u)) setOrder(u, { type: 'build', id: b.id }), (u.resume = null);
      return;
    }
    case 'train': {
      const b = w.building(cmd.id);
      if (!b || b.owner !== player) return;
      for (let k = 0; k < (cmd.count ?? 1); k++) if (!enqueue(w, b, cmd.unit)) break;
      return;
    }
    case 'cancelTrain': {
      const b = w.building(cmd.id);
      if (b && b.owner === player) cancelQueued(w, b, cmd.index);
      return;
    }
    case 'rally':
      for (const id of cmd.ids) {
        const b = w.building(id);
        if (b && b.owner === player && BUILDING_DEFS[b.type].trains.length) b.rally = { x: cmd.x, y: cmd.y, target: cmd.target };
      }
      return;
    case 'repeat': {
      const b = w.building(cmd.id);
      if (b && b.owner === player) b.repeat = cmd.on;
      return;
    }
    case 'autoReseed':
      w.players[player].autoReseed = cmd.on;
      return;
    case 'delete':
      for (const id of cmd.ids) {
        const e = w.get(id);
        if (!e || e.kind === 'resource' || e.owner !== player) continue;
        if (e.kind === 'building') {
          // Refund what wasn't built yet, and everything still queued.
          const def = BUILDING_DEFS[e.type];
          if (!e.complete) pay(w, player, Object.fromEntries(Object.entries(def.cost).map(([k, v]) => [k, Math.floor((v ?? 0) * (1 - e.progress))])), -1);
          while (e.queue.length) cancelQueued(w, e, e.queue.length - 1);
        }
        w.remove(id);
      }
      return;
    case 'help': {
      const b = w.building(cmd.id);
      if (!b || b.owner !== player) return;
      for (const u of units) {
        if (!b.complete && isBuilder(u)) setOrder(u, { type: 'build', id: b.id });
        else if (b.complete && u.carry && (BUILDING_DEFS[b.type].dropoff as string[]).includes(u.carry.res))
          setOrder(u, { type: 'dropoff', id: b.id });
        else moveGroup([u], b.x + b.size / 2, b.y + b.size + 0.5);
      }
      return;
    }
  }
}

/** Spreads a group around the target point so they don't all stand on one tile. */
function moveGroup(units: Unit[], x: number, y: number): void {
  const sorted = [...units].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  sorted.forEach((u, k) => {
    const [ox, oy] = spiral(k);
    setOrder(u, { type: 'move', x: x + ox * 0.9, y: y + oy * 0.9 });
    u.resume = null;
  });
}

/** k-th offset of a square spiral around the origin. */
function spiral(k: number): [number, number] {
  if (k === 0) return [0, 0];
  const ring = Math.ceil((Math.sqrt(k + 1) - 1) / 2);
  const side = ring * 2;
  const start = (side - 1) ** 2;
  const t = k - start;
  const seg = Math.floor(t / side), off = (t % side) - ring + 1;
  return seg === 0 ? [ring, off] : seg === 1 ? [-off, ring] : seg === 2 ? [-ring, -off] : [off, -ring];
}

/** Sends gatherers to a resource (at most two per tile on clustered tiles); others walk there. */
function gatherGroup(w: World, units: Unit[], target: GatherTarget): void {
  const source = sourceOf(w, target);
  if (!source) return;
  const gatherers = units.filter(isGatherer);
  const others = units.filter((u) => !isGatherer(u));
  if (others.length) {
    const tx = target.kind === 'tile' ? target.x + 0.5 : (w.get(target.id) as { x: number }).x;
    const ty = target.kind === 'tile' ? target.y + 0.5 : (w.get(target.id) as { y: number }).y;
    moveGroup(others, tx, ty);
  }
  let spots: GatherTarget[] = [target];
  if (source === 'farm' && gatherers.length > 1) {
    // One farmer per field: hand out the tapped farm, then the nearest free ones.
    const [first, ...rest] = gatherers;
    const order = gatherOrder(w, target);
    if (order) setOrder(first, order), (first.resume = null);
    const f = w.get((target as { id: number }).id) as { x: number; y: number };
    for (const u of rest) {
      // Farms already given out count as worked, so each search finds a different free one.
      const t = findResource(w, u, ['farm'], f.x + 1.5, f.y + 1.5, 12);
      const o = t && gatherOrder(w, t);
      if (o) {
        setOrder(u, o);
        u.resume = null;
      }
    }
    return;
  }
  if (target.kind === 'tile' && gatherers.length > 2) {
    const N = w.map.size;
    const f = w.map.feature[target.y * N + target.x];
    const near: Array<{ x: number; y: number; d: number }> = [];
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = target.x + dx, y = target.y + dy;
        if (!w.grid.inside(x, y) || w.map.feature[y * N + x] !== f || w.map.amount[y * N + x] <= 0) continue;
        near.push({ x, y, d: Math.hypot(dx, dy) });
      }
    near.sort((a, b) => a.d - b.d);
    spots = near.map((n) => ({ kind: 'tile', x: n.x, y: n.y }));
  }
  gatherers.forEach((u, k) => {
    const order = gatherOrder(w, spots[Math.floor(k / 2) % spots.length]);
    if (order) {
      setOrder(u, order);
      u.resume = null;
    }
  });
}
