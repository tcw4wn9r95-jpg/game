import { generateMap } from '../src/sim/mapgen';
import { TICK_RATE, World } from '../src/sim/world';
import { Opponent } from '../src/sim/ai/opponent';
const [seed = '4', mins = '100'] = process.argv.slice(2);
const map = generateMap({ type: 'heartland', size: 'standard', players: 2, seed: Number(seed) });
const w = new World(map);
const bots = [new Opponent(0, 'normal'), new Opponent(1, 'normal')];
bots.forEach((b) => b.setup(w));
const deaths = [{} as Record<string, number>, {} as Record<string, number>];
const destroyed = [{} as Record<string, number>, {} as Record<string, number>];
for (let t = 0; t < Number(mins) * 60 * TICK_RATE && w.winner === null; t++) {
  for (const b of bots) b.tick(w);
  w.step();
  for (const e of w.drainEvents()) {
    if (e.type === 'death') deaths[e.owner][e.unit] = (deaths[e.owner][e.unit] ?? 0) + 1;
    if (e.type === 'destroyed' && !e.building.includes('wall')) destroyed[e.owner][e.building] = (destroyed[e.owner][e.building] ?? 0) + 1;
  }
  if (t % (20 * 60 * TICK_RATE) === 0 && t) console.log(t / 600, 'min deaths', JSON.stringify(deaths), 'lost buildings', JSON.stringify(destroyed));
}
