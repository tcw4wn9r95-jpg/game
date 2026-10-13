import './style.css';
import { Game } from './game';
import { attachGestures } from './input/gestures';
import { createView } from './render/canvas';
import type { MapOptions } from './sim/mapgen';
import { MAP_SIZES, MAP_TYPES, type MapSize, type MapType } from './sim/terrain';
import { FpsCounter } from './ui/fps';
import { randomSeed, showSetup } from './ui/setup';

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
  blockBrowserGestures();
  lockLandscape();
  registerServiceWorker();

  const params = new URLSearchParams(location.search);
  const debug = { reveal: params.has('reveal'), bench: params.has('bench') };
  const view = createView(document.getElementById('game') as HTMLCanvasElement);
  const hud = document.getElementById('hud')!;
  const menu = document.getElementById('menu')!;
  const fps = new FpsCounter(document.getElementById('fps')!);
  let game: Game | null = null;

  attachGestures(view.ctx.canvas, () => game?.camera ?? null);

  const start = (o: MapOptions) => {
    game = new Game(o, view, hud, debug);
    hud.hidden = false;
  };
  const toSetup = () => {
    game?.destroy();
    game = null;
    hud.hidden = true;
    showSetup(document.body, start);
  };

  document.getElementById('menu-btn')!.addEventListener('click', () => (menu.hidden = false));
  document.getElementById('menu-resume')!.addEventListener('click', () => (menu.hidden = true));
  document.getElementById('menu-new')!.addEventListener('click', () => {
    menu.hidden = true;
    toSetup();
  });

  const fromUrl = optionsFromUrl(params);
  if (fromUrl) start(fromUrl);
  else toSetup();

  let last = performance.now();
  const frame = (now: number) => {
    const dt = now - last;
    last = now;
    if (game) game.frame(now, dt);
    else {
      view.ctx.setTransform(1, 0, 0, 1, 0, 0);
      view.ctx.fillStyle = '#0e1426';
      view.ctx.fillRect(0, 0, view.ctx.canvas.width, view.ctx.canvas.height);
    }
    fps.frame(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
