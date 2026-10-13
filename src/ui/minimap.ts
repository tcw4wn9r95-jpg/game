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
/**
 * Diamond minimap, as in AoE: the square map turned 45° and halved in height,
 * matching the isometric view.
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
      // Invert the diamond mapping: u = x - y and v = x + y in minimap fractions.
      const u = ((e.clientX - r.left) / r.width) * 2 - 1, v = ((e.clientY - r.top) / r.height) * 2;
      camera.centerOn(((u + v) / 2) * N, ((v - u) / 2) * N);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(this.el.clientWidth * dpr), H = Math.round(this.el.clientHeight * dpr);
    if (this.el.width !== W || this.el.height !== H) {
      this.el.width = W;
      this.el.height = H;
    }
    const g = this.el.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);

    if (this.fogVersion !== this.fog.version) {
      this.fogVersion = this.fog.version;
      const d = this.fogImg.data;
      for (let i = 0; i < N * N; i++) d[i * 4 + 3] = this.fog.visible[i] ? 0 : this.fog.explored[i] ? 110 : 255;
      this.fogCanvas.getContext('2d')!.putImageData(this.fogImg, 0, 0);
    }

    // Tile (x, y) -> minimap ((x - y) * W / 2N + W / 2, (x + y) * H / 2N).
    const ax = W / (2 * N), ay = H / (2 * N);
    const at = (x: number, y: number) => [(x - y) * ax + W / 2, (x + y) * ay] as const;
    g.setTransform(ax, ay, -ax, ay, W / 2, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.base, 0, 0);
    g.drawImage(this.fogCanvas, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);

    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.lineWidth = 1;
    for (const b of this.world.buildings()) {
      if (b.owner !== this.player && !this.fog.isExplored(b.x + b.size / 2, b.y + b.size / 2)) continue;
      const [cx, cy] = at(b.x + b.size / 2, b.y + b.size / 2);
      const r = Math.max(2.5, b.size * ax);
      g.fillStyle = PLAYER_COLORS[b.owner % PLAYER_COLORS.length];
      g.beginPath();
      g.moveTo(cx, cy - r / 2);
      g.lineTo(cx + r, cy);
      g.lineTo(cx, cy + r / 2);
      g.lineTo(cx - r, cy);
      g.closePath();
      g.fill();
      g.stroke();
    }
    const dot = Math.max(2, ax * 1.4);
    for (const u of this.world.units()) {
      if (u.owner !== this.player && !this.fog.isVisible(u.x, u.y)) continue;
      const [x, y] = at(u.x, u.y);
      g.fillStyle = PLAYER_COLORS[u.owner % PLAYER_COLORS.length];
      g.fillRect(x - dot / 2, y - dot / 2, dot, dot);
    }

    // The camera's view: the four screen corners mapped back onto the ground.
    const cam = this.camera;
    const corners = [
      cam.screenToTile(0, 0),
      cam.screenToTile(cam.viewW, 0),
      cam.screenToTile(cam.viewW, cam.viewH),
      cam.screenToTile(0, cam.viewH),
    ];
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = Math.max(1, W / 160);
    g.beginPath();
    corners.forEach((c, i) => {
      const [x, y] = at(c.x, c.y);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
    g.stroke();
  }
}
