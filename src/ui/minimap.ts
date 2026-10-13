import type { Camera } from '../render/camera';
import { PLAYER_COLORS } from '../render/palette';
import type { Fog } from '../sim/fog';
import type { World } from '../sim/world';
import { mapImage } from './mapImage';

const REDRAW_MS = 120;
const BASE_REFRESH_MS = 3000;

/**
 * Minimap in the HUD corner: terrain and resources under the player's fog, the
 * camera viewport, and the player's start. Tap or drag to move the camera.
 */
export class Minimap {
  readonly el: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  private baseAt = 0;
  private readonly fogCanvas: HTMLCanvasElement;
  private readonly fogImg: ImageData;
  private fogVersion = -1;
  private lastDraw = 0;
  private dirty = true;

  constructor(
    parent: HTMLElement,
    private readonly world: World,
    private readonly fog: Fog,
    private readonly camera: Camera,
    private readonly player: number,
  ) {
    const map = world.map;
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
    const N = this.world.map.size;
    // Felled trees and mined-out deposits: refresh the terrain picture now and then.
    if (now - this.baseAt > BASE_REFRESH_MS) {
      this.base = mapImage(this.world.map);
      this.baseAt = now;
    }
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

    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.lineWidth = 1;
    for (const b of this.world.buildings()) {
      if (b.owner !== this.player && !this.fog.isExplored(b.x + b.size / 2, b.y + b.size / 2)) continue;
      const sz = Math.max(3, b.size * k);
      g.fillStyle = PLAYER_COLORS[b.owner % PLAYER_COLORS.length];
      g.fillRect(b.x * k, b.y * k, sz, sz);
      g.strokeRect(b.x * k, b.y * k, sz, sz);
    }
    const dot = Math.max(2, k * 1.2);
    for (const u of this.world.units()) {
      if (u.owner !== this.player && !this.fog.isVisible(u.x, u.y)) continue;
      g.fillStyle = PLAYER_COLORS[u.owner % PLAYER_COLORS.length];
      g.fillRect(u.x * k - dot / 2, u.y * k - dot / 2, dot, dot);
    }

    const cam = this.camera;
    const hw = cam.viewW / 2 / cam.scale, hh = cam.viewH / 2 / cam.scale;
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = Math.max(1, px / 120);
    g.strokeRect((cam.x - hw) * k, (cam.y - hh) * k, hw * 2 * k, hh * 2 * k);
  }
}
