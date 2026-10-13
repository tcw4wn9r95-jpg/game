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
  const start = (map: ReturnType<typeof generateMap>) => {
    clearBackdrop();
    game = new Game(map, view, hud, debug);
    game.hud.onNewMatch = toSetup;
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
    });
  }

  if (params.has('sheet')) {
    void import('./ui/spriteSheet').then((m) => m.drawSpriteSheet(view, Number(params.get('sheet')) || 3));
    return;
  }
  const fromUrl = optionsFromUrl(params);
  if (fromUrl) start(generateMap(fromUrl));
  else toSetup();

  let last = performance.now();
  const frame = (now: number) => {
    // rAF timestamps can precede a performance.now() read taken just before, so clamp.
    const dt = Math.max(0, now - last);
    last = Math.max(last, now);
    if (game) {
      game.frame(now, dt);
      fps?.frame(now);
    } else if (backdrop) backdrop.frame(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
