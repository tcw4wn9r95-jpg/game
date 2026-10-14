import './style.css';
import { Game } from './game';
import { attachGestures } from './input/gestures';
import { createView } from './render/canvas';
import type { MapOptions } from './sim/mapgen';
import { MAP_SIZES, MAP_TYPES, type MapSize, type MapType } from './sim/terrain';
import { generateMap } from './sim/mapgen';
import { MenuBackdrop } from './ui/backdrop';
import { FpsCounter } from './ui/fps';
import { randomSeed, showSetup } from './ui/setup';
import { installTheme } from './ui/theme';
import { type SlotId, readSave, writeSave } from './ui/saves';
import { showSlots } from './ui/slotPanel';
import { installErrorLog, logError, setErrorContext, showErrorLog } from './ui/errorLog';
import { loadWorld } from './sim/save';
import type { World } from './sim/world';
import type { GameMap } from './sim/terrain';

/** Real time between autosaves. */
const AUTOSAVE_MS = 60_000;

function blockBrowserGestures(): void {
  // iOS Safari ignores user-scalable=no, so block pinch and double-tap zoom here.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}

function lockLandscape(): void {
  // Supported on Android installs; iOS rejects it and relies on the rotate overlay.
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  orientation.lock?.('landscape').catch(() => {});
}

function registerServiceWorker(): void {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  }
}

/** Debug/test entry: ?map=islands&size=epic&players=4&seed=7&reveal=1&bench=1 skips the setup screen. */
function optionsFromUrl(params: URLSearchParams): MapOptions | null {
  const type = params.get('map') as MapType | null;
  if (!type || !MAP_TYPES.includes(type)) return null;
  const size = params.get('size') as MapSize | null;
  const players = Number(params.get('players'));
  return {
    type,
    size: size && MAP_SIZES.includes(size) ? size : 'standard',
    players: players >= 2 && players <= 4 ? players : 2,
    seed: Number(params.get('seed')) || randomSeed(),
  };
}

function boot(): void {
  installErrorLog();
  installTheme();
  blockBrowserGestures();
  lockLandscape();
  registerServiceWorker();

  const params = new URLSearchParams(location.search);
  const debug = { reveal: params.has('reveal'), bench: params.has('bench'), fps: params.has('fps') };
  const view = createView(document.getElementById('game') as HTMLCanvasElement);
  const hud = document.getElementById('hud')!;
  let game: Game | null = null;
  let backdrop: MenuBackdrop | null = null;
  let fps: FpsCounter | null = null;

  attachGestures(view.ctx.canvas, () => game?.camera ?? null, {
    onTap: (x, y) => game?.controller.tap(x, y),
    onDoubleTap: (x, y) => game?.controller.doubleTap(x, y),
    onBox: (x0, y0, x1, y1, done) => game?.controller.box(x0, y0, x1, y1, done),
    onDragStart: (x, y) => game?.controller.dragStart(x, y) ?? false,
    onDrag: (x, y) => game?.controller.drag(x, y),
    onDragEnd: () => game?.controller.dragEnd(),
  });

  const clearBackdrop = () => {
    backdrop?.dispose();
    backdrop = null;
  };
  const start = (source: GameMap | World) => {
    clearBackdrop();
    game = new Game(source, view, hud, debug);
    game.hud.onNewMatch = toSetup;
    game.hud.onSave = () => showSlots(document.body, 'save', (slot) => void saveTo(slot), () => {});
    game.hud.onLoad = () => showSlots(document.body, 'load', (slot) => void loadFrom(slot), () => {});
    game.hud.onErrors = () => showErrorLog(document.body);
    setErrorContext(() => game?.world.time);
    // Automated browser tests drive the match through this handle.
    if (params.has('test')) (window as unknown as { __game: Game }).__game = game;
    fps = new FpsCounter(hud.querySelector('#fps')!);
    hud.hidden = false;
  };
  function toSetup() {
    game?.destroy();
    game = null;
    hud.hidden = true;
    showSetup(document.body, {
      onPreview: (map) => {
        clearBackdrop();
        backdrop = new MenuBackdrop(view, map);
      },
      onStart: (_opts, map) => start(map),
      onLoad: (slot) => void loadFrom(slot),
    });
  }

  /** Saves the match to a slot; the autosave goes quietly. */
  async function saveTo(slot: SlotId): Promise<void> {
    const g = game;
    if (!g) return;
    try {
      const snap = g.snapshot();
      await writeSave(slot, snap.meta, snap.data);
      if (slot !== 'auto') g.hud.toast('Game saved');
    } catch (e) {
      console.error(e);
      logError(e);
      if (slot !== 'auto') g.hud.toast("Couldn't save: storage is unavailable or full");
    }
  }

  /** Replaces whatever is running with a saved match. */
  async function loadFrom(slot: SlotId): Promise<void> {
    try {
      const rec = await readSave(slot);
      if (!rec) return;
      const world = loadWorld(rec.data);
      document.querySelector('.setup')?.remove();
      game?.destroy();
      game = null;
      start(world);
      const g = game as Game | null;
      if (g) {
        if (rec.meta.camera) g.restoreCamera(rec.meta.camera);
        g.hud.toast('Game loaded');
      }
    } catch (e) {
      console.error(e);
      logError(e);
      (game as Game | null)?.hud.toast("Couldn't load that save");
    }
  }

  // Autosave every minute of play, and whenever the app goes to the background
  // (a phone may kill a backgrounded tab without warning).
  setInterval(() => {
    if (game && !game.hud.paused) void saveTo('auto');
  }, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && game) void saveTo('auto');
  });
  window.addEventListener('pagehide', () => {
    if (game) void saveTo('auto');
  });

  if (params.has('ships')) {
    void import('./ui/spriteSheet').then((m) => m.drawShipSheet(view, Number(params.get('ships')) || 1.6));
    return;
  }
  if (params.has('buildings')) {
    void import('./ui/spriteSheet').then((m) => m.drawBuildingSheet(view, Number(params.get('buildings')) || 48));
    return;
  }
  if (params.has('sheet')) {
    void import('./ui/spriteSheet').then((m) => m.drawSpriteSheet(view, Number(params.get('sheet')) || 3));
    return;
  }
  const fromUrl = optionsFromUrl(params);
  if (fromUrl) start(generateMap(fromUrl));
  else toSetup();

  let last = performance.now();
  let reported = false;
  const frame = (now: number) => {
    // Schedule the next frame first: one bad frame must never stop the game.
    requestAnimationFrame(frame);
    // rAF timestamps can precede a performance.now() read taken just before, so clamp.
    const dt = Math.max(0, now - last);
    last = Math.max(last, now);
    try {
      if (game) {
        game.frame(now, dt);
        fps?.frame(now);
      } else if (backdrop) backdrop.frame(dt);
    } catch (e) {
      console.error(e);
      logError(e);
      if (!reported && game) {
        reported = true;
        game.hud.toast('Something went wrong; the game recovered. Menu → Error Log has the details.');
      }
    }
  };
  requestAnimationFrame(frame);
}

boot();
