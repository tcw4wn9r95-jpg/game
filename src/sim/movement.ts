import { DT } from './constants';
import { UNIT_DEFS, type Unit } from './entities';
import type { World } from './world';

/** Separation strength per tick (fraction of overlap resolved). */
const PUSH = 0.35;

/** Advances a unit along its path at its speed. */
export function moveUnit(w: World, u: Unit): void {
  if (!u.path) return;
  let step = UNIT_DEFS[u.type].speed * DT;
  while (step > 0 && u.pathIdx < u.path.length) {
    const wp = u.path[u.pathIdx];
    // A building or other obstacle appeared on the route: plan again.
    if (!w.grid.isWalkable(Math.floor(wp.x), Math.floor(wp.y))) {
      u.path = null;
      return;
    }
    const dx = wp.x - u.x, dy = wp.y - u.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.05) u.face = dx > 0 ? 1 : -1;
    if (d <= step) {
      u.x = wp.x;
      u.y = wp.y;
      step -= d;
      u.pathIdx++;
    } else {
      u.x += (dx / d) * step;
      u.y += (dy / d) * step;
      step = 0;
    }
  }
  if (u.pathIdx >= u.path.length) {
    u.path = null;
    u.repaths++;
    if (u.order?.type === 'move') {
      u.order = null;
      u.state = 'idle';
    }
  }
}

/**
 * Soft collision: overlapping units nudge each other apart, never onto blocked
 * tiles. Uses a spatial hash with 2-tile cells.
 */
export function separate(w: World): void {
  const cell = 2;
  const cols = Math.ceil(w.map.size / cell);
  const buckets = new Map<number, Unit[]>();
  for (const u of w.units()) {
    const k = Math.floor(u.y / cell) * cols + Math.floor(u.x / cell);
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = []));
    b.push(u);
  }
  for (const u of w.units()) {
    const cx = Math.floor(u.x / cell), cy = Math.floor(u.y / cell);
    const ru = UNIT_DEFS[u.type].radius;
    const working = u.state === 'gather' || u.state === 'build';
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const b = buckets.get((cy + dy) * cols + cx + dx);
        if (!b) continue;
        for (const o of b) {
          if (o.id <= u.id) continue;
          const min = ru + UNIT_DEFS[o.type].radius;
          const ox = u.x - o.x, oy = u.y - o.y;
          const d = Math.hypot(ox, oy);
          if (d >= min) continue;
          let nx: number, ny: number;
          if (d < 1e-4) {
            // Exactly stacked: split along a direction derived from the id.
            const a = (u.id * 2.399) % (Math.PI * 2);
            nx = Math.cos(a);
            ny = Math.sin(a);
          } else {
            nx = ox / d;
            ny = oy / d;
          }
          const push = ((min - d) * PUSH) / 2;
          // Workers hold their ground against walkers; two workers only ease apart gently.
          const oWorking = o.state === 'gather' || o.state === 'build';
          const wu = working ? (oWorking ? 0.15 : 0) : oWorking ? 2 : 1;
          const wo = oWorking ? (working ? 0.15 : 0) : working ? 2 : 1;
          nudge(w, u, nx * push * wu, ny * push * wu);
          nudge(w, o, -nx * push * wo, -ny * push * wo);
        }
      }
  }
}

function nudge(w: World, u: Unit, dx: number, dy: number): void {
  if (!dx && !dy) return;
  const nx = u.x + dx, ny = u.y + dy;
  const tx = Math.floor(nx), ty = Math.floor(ny);
  // Never shove a unit into a separate pocket (e.g. diagonally between two trees).
  const sameTile = tx === Math.floor(u.x) && ty === Math.floor(u.y);
  if (sameTile || (w.grid.isWalkable(tx, ty) && w.grid.component(tx, ty) === w.grid.component(Math.floor(u.x), Math.floor(u.y)))) {
    u.x = nx;
    u.y = ny;
  }
}
