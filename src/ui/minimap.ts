import type { Camera } from '../render/camera';
import { PLAYER_COLORS } from '../render/palette';
import type { Fog } from '../sim/fog';
import type { GameMap } from '../sim/terrain';
import { mapImage } from './mapImage';

const REDRAW_MS = 120;

/**
 * Minimap in the HUD corner: terrain and resources under the player's fog, the
 * camera viewport, and the player's start. Tap or drag to move the camera.
 */
export class Minimap {
  readonly el: HTMLCanvasElement;
  private readonly base: HTMLCanvasElement;
  private readonly fogCanvas: HTMLCanvasElement;
  private readonly fogImg: ImageData;
  private fogVersion = -1;
  private lastDraw = 0;
  private dirty = true;

  constructor(
    parent: HTMLElement,
    private readonly map: GameMap,
    private readonly fog: Fog,
    private readonly camera: Camera,
  ) {
    const N = map.size;
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    parent.appendChild(this.el);

    this.base = mapImage(map);

    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = this.fogCanvas.height = N;
    this.fogImg = this.fogCanvas.getContext('2d')!.createImageData(N, N);

    const jump = (e: PointerEvent) => {
      const r = this.el.getBoundingClientRect();
      camera.centerOn(((e.clientX - r.left) / r.width) * N, ((e.clientY - r.top) / r.height) * N);
      this.dirty = true;
    };
    this.el.addEventListener('pointerdown', (e) => {
      this.el.setPointerCapture(e.pointerId);
      jump(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.el.hasPointerCapture(e.pointerId)) jump(e);
    });
  }

  destroy(): void {
    this.el.remove();
  }

  draw(now: number): void {
    if (now - this.lastDraw < REDRAW_MS && !this.dirty) return;
    this.lastDraw = now;
    this.dirty = false;
    const N = this.map.size;
    const css = this.el.clientWidth;
    const px = Math.round(css * Math.min(window.devicePixelRatio || 1, 2));
    if (this.el.width !== px) this.el.width = this.el.height = px;
    const g = this.el.getContext('2d')!;
    const k = px / N;

    if (this.fogVersion !== this.fog.version) {
      this.fogVersion = this.fog.version;
      const d = this.fogImg.data;
      for (let i = 0; i < N * N; i++) {
        d[i * 4 + 3] = this.fog.visible[i] ? 0 : this.fog.explored[i] ? 110 : 255;
      }
      this.fogCanvas.getContext('2d')!.putImageData(this.fogImg, 0, 0);
    }

    // Smooth when shrinking a big map into the frame; crisp when enlarging a small one.
    g.imageSmoothingEnabled = N > px;
    g.drawImage(this.base, 0, 0, px, px);
    g.drawImage(this.fogCanvas, 0, 0, px, px);

    const s = this.map.starts[0];
    g.fillStyle = PLAYER_COLORS[0];
    g.strokeStyle = '#ffffff';
    g.lineWidth = Math.max(1, k * 0.6);
    g.fillRect((s.x - 2) * k, (s.y - 2) * k, 4 * k, 4 * k);
    g.strokeRect((s.x - 2) * k, (s.y - 2) * k, 4 * k, 4 * k);

    const cam = this.camera;
    const hw = cam.viewW / 2 / cam.scale, hh = cam.viewH / 2 / cam.scale;
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = Math.max(1, px / 120);
    g.strokeRect((cam.x - hw) * k, (cam.y - hh) * k, hw * 2 * k, hh * 2 * k);
  }
}
