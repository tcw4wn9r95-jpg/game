import { generateMap } from '../src/sim/mapgen';
import { TICK_RATE, World } from '../src/sim/world';
import { Opponent } from '../src/sim/ai/opponent';
const [type = 'islands', a = 'hard', b = 'easy', at = '32', seed = '1'] = process.argv.slice(2);
const map = generateMap({ type: type as 'islands', size: 'standard', players: 2, seed: Number(seed) });
const w = new World(map);
const bots = [new Opponent(0, a as 'hard'), new Opponent(1, b as 'easy')];
bots.forEach((x) => x.setup(w));
for (let t = 0; t < Number(at) * 60 * TICK_RATE; t++) {
  for (const x of bots) x.tick(w);
  w.step();
}
const wave = (bots[0] as unknown as { wave: { ids: Set<number>; target: number } | null }).wave;
console.log('wave', wave && { n: wave.ids.size, target: wave.target, tgt: w.get(wave.target)?.kind });
const by: Record<string, number> = {};
for (const u of w.units(0)) {
  if (u.type === 'villager' || u.type === 'fishing_ship') continue;
  const k = `${u.type} ${u.order?.type ?? 'none'} ${u.state}${u.inside ? ' inside' : ''}${wave?.ids.has(u.id) ? ' W' : ''}${u.ferry ? ' FERRY' : ''}${u.cargo.length ? ' cargo' + u.cargo.length : ''}`;
  by[k] = (by[k] ?? 0) + 1;
}
console.log(by);
console.log(bots[0].notes.slice(-8));
for (const u of w.units(0)) if (u.type === 'transport_ship') console.log('T', u.id, Math.round(u.x), Math.round(u.y), JSON.stringify(u.order), JSON.stringify(u.ferry));
const bl: Record<string, number> = {};
for (const b of w.buildings(0)) bl[b.type + (b.complete ? '' : '*')] = (bl[b.type + (b.complete ? '' : '*')] ?? 0) + 1;
console.log(bl, (bots[0] as unknown as { geography: unknown }).geography);
import { landRegion, shoreWater, transportsNear } from '../src/sim/naval';
{
  const army = [...w.units(0)].filter((u) => wave?.ids.has(u.id));
  const e = w.map.starts[1];
  const u0 = army[0];
  console.log('army at', Math.round(u0.x), Math.round(u0.y), 'order', JSON.stringify(u0.order), 'path', u0.path?.length, 'pending', u0.pathPending, 'repaths', u0.repaths);
  console.log('dest region', landRegion(w, e.x + 0.5, e.y + 0.5, 0), 'home', w.grid.component(Math.floor(u0.x), Math.floor(u0.y), 0));
  const ts = transportsNear(w, 0, u0.x, u0.y);
  console.log('transports avail', ts.length);
  if (ts[0]) {
    const home = w.grid.component(Math.floor(u0.x), Math.floor(u0.y), 0);
    console.log('pickup', shoreWater(w, ts[0], u0.x, u0.y, home, 0), 'dest shore', shoreWater(w, ts[0], e.x, e.y, landRegion(w, e.x, e.y, 0), 0));
  }
}
{
  const bl: Record<string, number> = {};
  for (const b of w.buildings(1)) bl[b.type] = (bl[b.type] ?? 0) + 1;
  console.log('P1 buildings', bl, 'P1 units', [...w.units(1)].map((u) => `${u.type}@${Math.round(u.x)},${Math.round(u.y)}${u.inside ? 'in' : ''}`));
  const wv = (bots[0] as unknown as { wave: { ids: Set<number>; target: number } | null }).wave;
  const t = wv && w.get(wv.target);
  console.log('target', t && (t.kind === 'building' ? `${t.type}@${t.x},${t.y}` : t.kind), 'explored?', t && t.kind === 'building' && w.fog[0].isExplored(t.x + 1, t.y + 1));
  const sample = [...w.units(0)].filter((u) => wv?.ids.has(u.id)).slice(0, 6);
  for (const u of sample) console.log(u.type, Math.round(u.x), Math.round(u.y), JSON.stringify(u.order), u.state, 'repaths', u.repaths);
}
{
  const o = bots[0] as unknown as { enemyBuildings(w: World): { type: string; id: number }[]; pickTarget(w: World, p: { x: number; y: number }, s: boolean): { type: string } | null; unreachable: Set<number> };
  console.log('enemyBuildings', o.enemyBuildings(w).map((b) => b.type + '#' + b.id).join(' '), 'unreach', [...o.unreachable], 'pick', o.pickTarget(w, { x: 60, y: 60 }, false)?.type);
}
