import type { MapOptions } from '../sim/mapgen';
import { MAP_SIZES, MAP_TYPES, type MapSize, type MapType } from '../sim/terrain';

const STORAGE_KEY = 'hc.setup';

const MAP_LABELS: Record<MapType, string> = { heartland: 'Heartland', coastal: 'Coastal', lakes: 'Lakes', islands: 'Islands' };
const SIZE_LABELS: Record<MapSize, string> = { skirmish: 'Skirmish', standard: 'Standard', epic: 'Epic' };
const PLAYER_LABELS: Record<number, string> = { 2: '1 vs 1', 3: '1 vs 2', 4: '2 vs 2' };

function loadPrefs(): Partial<MapOptions> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function savePrefs(o: MapOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: o.type, size: o.size, players: o.players }));
  } catch {
    /* storage unavailable: preferences just don't persist */
  }
}

export const randomSeed = () => Math.floor(Math.random() * 1e9);

/** New-game screen. Calls onStart with the chosen options and removes itself. */
export function showSetup(root: HTMLElement, onStart: (o: MapOptions) => void): void {
  const prefs = loadPrefs();
  const opts: MapOptions = {
    type: MAP_TYPES.includes(prefs.type as MapType) ? (prefs.type as MapType) : 'heartland',
    size: MAP_SIZES.includes(prefs.size as MapSize) ? (prefs.size as MapSize) : 'standard',
    players: [2, 3, 4].includes(prefs.players as number) ? (prefs.players as number) : 2,
    seed: randomSeed(),
  };

  const el = document.createElement('div');
  el.className = 'setup';
  el.innerHTML = `
    <h1>Hearth &amp; Crown</h1>
    <div class="setup-rows"></div>
    <button class="setup-start">Start match</button>
    <div class="setup-build">build ${__BUILD_ID__}</div>`;
  const rows = el.querySelector('.setup-rows')!;

  const row = <T extends string | number>(label: string, values: T[], names: Record<string, string>, get: () => T, set: (v: T) => void) => {
    const r = document.createElement('div');
    r.className = 'setup-row';
    r.innerHTML = `<span class="setup-label">${label}</span>`;
    const group = document.createElement('div');
    group.className = 'seg';
    for (const v of values) {
      const b = document.createElement('button');
      b.textContent = names[String(v)];
      b.setAttribute('aria-pressed', String(get() === v));
      b.addEventListener('click', () => {
        set(v);
        group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });
      group.appendChild(b);
    }
    r.appendChild(group);
    rows.appendChild(r);
  };

  row('Map', MAP_TYPES, MAP_LABELS, () => opts.type, (v) => (opts.type = v));
  row('Size', MAP_SIZES, SIZE_LABELS, () => opts.size, (v) => (opts.size = v));
  row('Players', [2, 3, 4], PLAYER_LABELS, () => opts.players, (v) => (opts.players = v));

  el.querySelector('.setup-start')!.addEventListener('click', () => {
    savePrefs(opts);
    el.remove();
    onStart(opts);
  });
  root.appendChild(el);
}
