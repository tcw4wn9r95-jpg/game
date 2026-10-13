import type { Fog } from '../sim/fog';

export const FOG_RGB = [5, 7, 13] as const;
const EXPLORED_ALPHA = 130;

/**
 * One texel per tile, drawn stretched with bilinear filtering so fog edges are soft.
 * Rebuilt only when the fog's version changes.
 */
export class FogLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private version = -1;

  constructor(private readonly fog: Fog) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = fog.size;
    this.g = this.canvas.getContext('2d')!;
    this.img = this.g.createImageData(fog.size, fog.size);
    const d = this.img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = FOG_RGB[0];
      d[i + 1] = FOG_RGB[1];
      d[i + 2] = FOG_RGB[2];
    }
  }

  refresh(): void {
    if (this.version === this.fog.version) return;
    this.version = this.fog.version;
    const { visible, explored } = this.fog;
    const d = this.img.data;
    for (let i = 0, p = 3; i < visible.length; i++, p += 4) d[p] = visible[i] ? 0 : explored[i] ? EXPLORED_ALPHA : 255;
    this.g.putImageData(this.img, 0, 0);
  }

  /** Draws the fog over the viewport. ox/oy: world device px at screen origin; S: device px per tile. */
  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, S: number, W: number, H: number): void {
    if (this.fog.revealed) return;
    const N = this.fog.size;
    const sx0 = Math.max(0, ox / S), sy0 = Math.max(0, oy / S);
    const sx1 = Math.min(N, (ox + W) / S), sy1 = Math.min(N, (oy + H) / S);
    if (sx1 <= sx0 || sy1 <= sy0) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 * S - ox, sy0 * S - oy, (sx1 - sx0) * S, (sy1 - sy0) * S);
  }
}
