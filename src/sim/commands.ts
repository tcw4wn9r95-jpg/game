// Player commands. Touch input and the AI both produce these; the world applies
// them at the start of the next tick, so the simulation stays deterministic.
import { gatherOrder, isBuilder, isGatherer, setOrder, sourceOf } from './economy';
import { BUILDING_DEFS, type BuildingType, type GatherTarget, type Unit } from './entities';
import type { World } from './world';

export type Command =
  | { type: 'move'; ids: number[]; x: number; y: number }
  | { type: 'gather'; ids: number[]; target: GatherTarget }
  | { type: 'build'; ids: number[]; building: BuildingType; x: number; y: number }
  | { type: 'help'; ids: number[]; id: number }
  | { type: 'stop'; ids: number[] };

export function applyCommand(w: World, player: number, cmd: Command): void {
  const units = cmd.ids.map((id) => w.unit(id)).filter((u): u is Unit => !!u && u.owner === player);
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
      const cost = def.cost as Partial<Record<keyof typeof p.resources, number>>;
      for (const [k, v] of Object.entries(cost)) {
        if (p.resources[k as keyof typeof p.resources] < (v ?? 0)) {
          w.events.push({ type: 'error', owner: player, message: `Not enough ${k}` });
          return;
        }
      }
      for (const [k, v] of Object.entries(cost)) p.resources[k as keyof typeof p.resources] -= v ?? 0;
      const b = w.placeBuilding(cmd.building, player, cmd.x, cmd.y);
      for (const u of units) if (isBuilder(u)) setOrder(u, { type: 'build', id: b.id }), (u.resume = null);
      return;
    }
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
