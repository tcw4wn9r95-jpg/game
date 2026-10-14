import { PLAYER_COLORS } from '../render/palette';
import { generateMap, type MapOptions } from '../sim/mapgen';
import { type GameMap, MAP_SIZES, MAP_TYPES, type MapSize, type MapType } from '../sim/terrain';
import { ICONS, MAP_ICONS } from './icons';
import { mapImage } from './mapImage';
import { type SlotId, listSaves } from './saves';
import { showSlots } from './slotPanel';

const STORAGE_KEY = 'hc.setup';

const MAP_INFO: Record<MapType, { name: string; desc: string }> = {
  heartland: { name: 'Heartland', desc: 'Open farmland cut by a river. Hold the fords; wall the gaps.' },
  coastal: { name: 'Coastal', desc: 'A long shore on one flank. Rule the sea for fish and a second front.' },
  lakes: { name: 'Lakes', desc: 'A great lake at the heart of the realm. Docks are optional, but useful.' },
  islands: { name: 'Islands', desc: 'Every realm on its own isle. Only ships carry armies to war.' },
};
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

export const randomSeed = () => Math.floor(Math.random() * 1e6);

export interface SetupHooks {
  onPreview(map: GameMap): void;
  onStart(opts: MapOptions, map: GameMap): void;
  /** Resume a saved match (the setup screen has already gone). */
  onLoad(slot: SlotId): void;
}

/** New-match screen with a live preview of the generated map. Removes itself on start. */
export function showSetup(root: HTMLElement, hooks: SetupHooks): void {
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
    <div class="setup-main">
      <section class="setup-left frame">
        <header class="setup-title"><span class="crest">${ICONS.crown}</span><h1>Hearth &amp; Crown</h1></header>
        <div class="setup-label">Map</div>
        <div class="cards" data-row="type"></div>
        <div class="setup-label">Size</div>
        <div class="seg" data-row="size"></div>
        <div class="setup-label">Players</div>
        <div class="seg" data-row="players"></div>
      </section>
      <section class="setup-right frame">
        <div class="preview-wrap"><canvas class="preview"></canvas></div>
        <div class="map-name"></div>
        <div class="map-desc"></div>
        <div class="seed-row"><span class="seed"></span><button class="icon-btn" aria-label="New map">${ICONS.dice}</button></div>
        <button class="btn btn-gold start">Start Match</button>
        <div class="load-row" hidden>
          <button class="btn btn-wood continue" hidden>Continue</button>
          <button class="btn btn-wood load">Load Game</button>
        </div>
      </section>
    </div>
    <div class="setup-build">build ${__BUILD_ID__}</div>`;

  const preview = el.querySelector<HTMLCanvasElement>('.preview')!;
  let map: GameMap | null = null;
  let pending = 0;

  const refresh = () => {
    cancelAnimationFrame(pending);
    // Defer a frame so the button state paints before generation runs.
    pending = requestAnimationFrame(() => {
      map = generateMap(opts);
      drawPreview(preview, map);
      el.querySelector('.map-name')!.textContent = `${MAP_INFO[opts.type].name} · ${SIZE_LABELS[opts.size]}`;
      el.querySelector('.map-desc')!.textContent = MAP_INFO[opts.type].desc;
      el.querySelector('.seed')!.textContent = `Seed ${opts.seed}`;
      hooks.onPreview(map);
    });
  };

  const group = <T extends string | number>(row: string, values: T[], render: (v: T) => string, get: () => T, set: (v: T) => void) => {
    const container = el.querySelector(`[data-row=${row}]`)!;
    for (const v of values) {
      const b = document.createElement('button');
      b.className = row === 'type' ? 'card' : 'seg-btn';
      b.innerHTML = render(v);
      b.setAttribute('aria-pressed', String(get() === v));
      b.addEventListener('click', () => {
        if (get() === v) return;
        set(v);
        container.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        refresh();
      });
      container.appendChild(b);
    }
  };

  group('type', MAP_TYPES, (t) => `<span class="card-art">${MAP_ICONS[t]}</span><span class="card-name">${MAP_INFO[t].name}</span>`, () => opts.type, (v) => (opts.type = v));
  group('size', MAP_SIZES, (s) => SIZE_LABELS[s], () => opts.size, (v) => (opts.size = v));
  group('players', [2, 3, 4], (p) => PLAYER_LABELS[p], () => opts.players, (v) => (opts.players = v));

  el.querySelector('.icon-btn')!.addEventListener('click', () => {
    opts.seed = randomSeed();
    refresh();
  });
  el.querySelector('.start')!.addEventListener('click', () => {
    if (!map) return;
    savePrefs(opts);
    cancelAnimationFrame(pending);
    el.remove();
    hooks.onStart(opts, map);
  });

  // Saved games: Continue picks up the autosave; Load lists every slot.
  const leave = (slot: SlotId) => {
    cancelAnimationFrame(pending);
    el.remove();
    hooks.onLoad(slot);
  };
  el.querySelector('.continue')!.addEventListener('click', () => leave('auto'));
  el.querySelector('.load')!.addEventListener('click', () => showSlots(document.body, 'load', leave, () => {}));
  void listSaves().then((saves) => {
    if (!Object.values(saves).some(Boolean)) return;
    el.querySelector<HTMLElement>('.load-row')!.hidden = false;
    el.querySelector<HTMLElement>('.continue')!.hidden = !saves.auto;
  });

  root.appendChild(el);
  refresh();
}

function drawPreview(canvas: HTMLCanvasElement, map: GameMap): void {
  const css = canvas.clientWidth || 150;
  const px = Math.round(css * Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(mapImage(map), 0, 0, px, px);
  const k = px / map.size;
  map.starts.forEach((s, i) => {
    g.fillStyle = PLAYER_COLORS[i];
    g.strokeStyle = '#fff6dc';
    g.lineWidth = Math.max(1.5, px / 90);
    g.beginPath();
    g.arc((s.x + 0.5) * k, (s.y + 0.5) * k, Math.max(4, px / 26), 0, Math.PI * 2);
    g.fill();
    g.stroke();
  });
}
