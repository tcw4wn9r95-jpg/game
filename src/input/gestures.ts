import type { Camera } from '../render/camera';

/** Movement (CSS px) before a touch counts as a drag instead of a tap. */
const TAP_SLOP = 8;
const TAP_MAX_MS = 350;
/** Pinch distance ratio that triggers one zoom step. */
const PINCH_STEP = 1.3;
/** Window (ms) of recent moves used to estimate fling velocity. */
const FLING_WINDOW = 90;

export interface GestureHandlers {
  onTap?(x: number, y: number): void;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * Turns pointer input on the canvas into camera moves: one-finger pan with fling,
 * two-finger pinch (stepped zoom) and pan, mouse wheel zoom, and taps.
 */
export function attachGestures(el: HTMLElement, camera: () => Camera | null, handlers: GestureHandlers = {}): void {
  const pointers = new Map<number, Pt>();
  let start: (Pt & { t: number }) | null = null;
  let dragging = false;
  let pinchDist = 0;
  let samples: Array<{ x: number; y: number; t: number }> = [];

  const mid = (): Pt => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const spread = (): number => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    camera()?.stop();
    if (pointers.size === 1) {
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
      dragging = false;
      samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    } else if (pointers.size === 2) {
      start = null; // a second finger cancels any tap
      pinchDist = spread();
    }
  });

  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    const cam = camera();
    if (!p || !cam) return;
    if (pointers.size === 1) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!dragging && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) dragging = true;
      p.x = e.clientX;
      p.y = e.clientY;
      if (dragging) {
        cam.panBy(dx, dy);
        const now = performance.now();
        samples.push({ x: e.clientX, y: e.clientY, t: now });
        while (samples.length > 2 && now - samples[0].t > FLING_WINDOW) samples.shift();
      }
    } else if (pointers.size === 2) {
      const before = mid();
      p.x = e.clientX;
      p.y = e.clientY;
      const after = mid();
      cam.panBy(after.x - before.x, after.y - before.y);
      const ratio = spread() / pinchDist;
      if (ratio > PINCH_STEP || ratio < 1 / PINCH_STEP) {
        cam.zoomStep(ratio > 1 ? 1 : -1, after.x, after.y);
        pinchDist = spread();
      }
    }
  });

  const end = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const cam = camera();
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (wasSingle && cam) {
      if (!dragging && start && performance.now() - start.t < TAP_MAX_MS && e.type === 'pointerup') {
        handlers.onTap?.(e.clientX, e.clientY);
      } else if (dragging && samples.length >= 2) {
        const a = samples[0], b = samples[samples.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0 && performance.now() - b.t < 60) cam.fling((b.x - a.x) / dt, (b.y - a.y) / dt);
      }
      start = null;
    } else if (pointers.size === 1) {
      // Lifting one finger of a pinch continues as a pan with the other, never a tap.
      const [rest] = [...pointers.values()];
      start = null;
      dragging = true;
      samples = [{ x: rest.x, y: rest.y, t: performance.now() }];
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) < 4) return;
      camera()?.zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
    },
    { passive: false },
  );
}
