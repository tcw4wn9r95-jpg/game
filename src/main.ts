import './style.css';
import { createView } from './render/canvas';
import { drawSplash } from './render/splash';
import { TICK_MS, World } from './sim/world';
import { FpsCounter } from './ui/fps';

/** Longest frame gap we catch up on; anything longer (app backgrounded) is dropped. */
const MAX_FRAME_MS = 250;

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

function boot(): void {
  blockBrowserGestures();
  lockLandscape();
  registerServiceWorker();

  const view = createView(document.getElementById('game') as HTMLCanvasElement);
  const fps = new FpsCounter(document.getElementById('fps')!);
  document.getElementById('build')!.textContent = `build ${__BUILD_ID__}`;

  const world = new World();
  let last = performance.now();
  let acc = 0;

  const frame = (now: number) => {
    acc += Math.min(now - last, MAX_FRAME_MS);
    last = now;
    while (acc >= TICK_MS) {
      world.step();
      acc -= TICK_MS;
    }
    const alpha = acc / TICK_MS;
    drawSplash(view, world.prevDriftX + (world.driftX - world.prevDriftX) * alpha);
    fps.frame(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
