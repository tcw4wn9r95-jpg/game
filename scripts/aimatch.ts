// Usage: node dist-scripts/aimatch.js <map> <size> <seed> <ai0> <ai1> [maxMinutes]
import { runMatch } from '../src/sim/ai/match';
import type { Difficulty } from '../src/sim/ai/opponent';
import type { MapSize, MapType } from '../src/sim/terrain';

const [type = 'heartland', size = 'standard', seed = '1', a = 'hard', b = 'easy', max = '90'] = process.argv.slice(2);
const t0 = Date.now();
const r = runMatch({ type: type as MapType, size: size as MapSize, seed: Number(seed), ai: [a as Difficulty, b as Difficulty], maxMinutes: Number(max), logEvery: 5 });
for (const l of r.log) console.log(l);
if (process.env.NOTES) for (const n of r.notes) console.log(n);
console.log(JSON.stringify({ type, seed, ai: [a, b], styles: r.log.find((l) => l.includes('styles'))?.split(': ')[1], winner: r.winner, minutes: +r.minutes.toFixed(1), stall: Math.round(r.longestStall), wall: Math.round((Date.now() - t0) / 1000) }));
