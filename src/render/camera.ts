/** CSS pixels per tile for the three zoom levels. */
export const ZOOM_LEVELS = [16, 24, 36] as const;
const DEFAULT_LEVEL = 1;
const ZOOM_ANIM_S = 0.18;
/** Fling velocity decay per second (exponential). */
const FRICTION = 5;
/** Tiles of empty border the camera may show beyond the map edge. */
const EDGE_MARGIN = 2;

/**
 * Camera over the tile grid. Position is the view centre in tile units; all input
 * deltas are in CSS pixels.
 */
export class Camera {
  x = 0;
  y = 0;
  level = DEFAULT_LEVEL;
  /** Current CSS px per tile (animates between zoom levels). */
  scale: number = ZOOM_LEVELS[DEFAULT_LEVEL];
  viewW = 1;
  viewH = 1;
  private vx = 0;
  private vy = 0;
  private anim: { from: number; to: number; t: number; tx: number; ty: number; fx: number; fy: number } | null = null;

  constructor(private readonly mapSize: number) {}

  setView(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  get animating(): boolean {
    return this.anim !== null;
  }

  centerOn(tx: number, ty: number): void {
    this.x = tx;
    this.y = ty;
    this.vx = this.vy = 0;
    this.clamp();
  }

  panBy(dx: number, dy: number): void {
    this.x -= dx / this.scale;
    this.y -= dy / this.scale;
    this.clamp();
  }

  /** Starts inertial scrolling at the given CSS px/s. */
  fling(vx: number, vy: number): void {
    this.vx = vx;
    this.vy = vy;
  }

  stop(): void {
    this.vx = this.vy = 0;
  }

  /** Moves one zoom level in (dir > 0) or out, keeping the tile under (fx, fy) fixed. */
  zoomStep(dir: number, fx = this.viewW / 2, fy = this.viewH / 2): void {
    const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, this.level + Math.sign(dir)));
    if (next === this.level) return;
    const { x: tx, y: ty } = this.screenToTile(fx, fy);
    this.level = next;
    this.anim = { from: this.scale, to: ZOOM_LEVELS[next], t: 0, tx, ty, fx, fy };
  }

  update(dt: number): void {
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / ZOOM_ANIM_S);
      const e = 1 - (1 - a.t) ** 3;
      this.scale = a.from + (a.to - a.from) * e;
      this.x = a.tx - (a.fx - this.viewW / 2) / this.scale;
      this.y = a.ty - (a.fy - this.viewH / 2) / this.scale;
      if (a.t >= 1) {
        this.scale = a.to;
        this.anim = null;
      }
      this.clamp();
    }
    if (this.vx || this.vy) {
      this.panBy(this.vx * dt, this.vy * dt);
      const k = Math.exp(-FRICTION * dt);
      this.vx *= k;
      this.vy *= k;
      if (Math.hypot(this.vx, this.vy) < 8) this.vx = this.vy = 0;
    }
  }

  screenToTile(sx: number, sy: number): { x: number; y: number } {
    return { x: this.x + (sx - this.viewW / 2) / this.scale, y: this.y + (sy - this.viewH / 2) / this.scale };
  }

  private clamp(): void {
    const N = this.mapSize;
    const hw = this.viewW / 2 / this.scale, hh = this.viewH / 2 / this.scale;
    const fit = (v: number, half: number) =>
      half * 2 >= N + EDGE_MARGIN * 2 ? N / 2 : Math.max(half - EDGE_MARGIN, Math.min(N + EDGE_MARGIN - half, v));
    const x = fit(this.x, hw), y = fit(this.y, hh);
    if (x !== this.x) this.vx = 0;
    if (y !== this.y) this.vy = 0;
    this.x = x;
    this.y = y;
  }
}
