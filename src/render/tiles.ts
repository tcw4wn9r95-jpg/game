// Procedural ground tiles, drawn once per zoom level into an atlas.
import { Rng } from '../sim/rng';
import { Terrain } from '../sim/terrain';
import type { Biome } from './biome';

export const TILE_VARIANTS = 4;
const TERRAIN_COUNT = 5;

/** Stable per-tile hash for picking variants and jitter. */
export function tileHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

interface GroundStyle {
  base: string;
  specks: string[];
  /** Specks per 32x32 tile. */
  density: number;
  /** Speck size in 32-unit space [w, h]. */
  speck: [number, number];
}

function styles(b: Biome): Record<number, GroundStyle> {
  return {
    [Terrain.Grass]: { base: b.grass, specks: b.grassSpecks, density: 16, speck: [1, 3] },
    [Terrain.Dirt]: { base: b.dirt, specks: ['rgba(70,50,25,0.45)', 'rgba(230,200,150,0.35)'], density: 10, speck: [2, 2] },
    [Terrain.Sand]: { base: b.sand, specks: ['rgba(150,120,60,0.3)', 'rgba(255,250,220,0.5)'], density: 12, speck: [1, 1] },
    [Terrain.Shallow]: { base: b.shallow, specks: ['rgba(230,220,170,0.45)', 'rgba(255,255,255,0.25)'], density: 9, speck: [3, 1] },
    [Terrain.Deep]: { base: b.deep, specks: ['rgba(255,255,255,0.12)', 'rgba(0,20,60,0.18)'], density: 6, speck: [5, 1] },
  };
}

/** Land types overlap neighbours of lower rank with soft bumps along the shared edge. */
export const LAND_RANK: Record<number, number> = { [Terrain.Grass]: 3, [Terrain.Dirt]: 2, [Terrain.Sand]: 1 };

/** Atlas of TERRAIN_COUNT rows x TILE_VARIANTS columns, each tile `s` device px square. */
export class TileArt {
  readonly atlas: HTMLCanvasElement;
  private readonly bases: Record<number, string>;

  constructor(
    readonly s: number,
    biome: Biome,
  ) {
    const st = styles(biome);
    this.bases = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v.base]));
    this.atlas = document.createElement('canvas');
    this.atlas.width = s * TILE_VARIANTS;
    this.atlas.height = s * TERRAIN_COUNT;
    const g = this.atlas.getContext('2d')!;
    const u = s / 32;
    for (let t = 0; t < TERRAIN_COUNT; t++) {
      const style = st[t];
      for (let v = 0; v < TILE_VARIANTS; v++) {
        const rng = new Rng(t * 977 + v * 131 + 5);
        const ox = v * s, oy = t * s;
        // Same base colour for every variant so the tile grid doesn't show.
        g.fillStyle = style.base;
        g.fillRect(ox, oy, s, s);
        for (let k = 0; k < style.density; k++) {
          g.fillStyle = style.specks[rng.int(0, style.specks.length - 1)];
          const w = Math.max(1, Math.round(style.speck[0] * u)), h = Math.max(1, Math.round(style.speck[1] * u));
          g.fillRect(ox + Math.floor(rng.next() * (s - w)), oy + Math.floor(rng.next() * (s - h)), w, h);
        }
      }
    }
  }

  baseColor(terrain: number): string {
    return this.bases[terrain];
  }

  draw(g: CanvasRenderingContext2D, terrain: number, variant: number, dx: number, dy: number): void {
    const s = this.s;
    g.drawImage(this.atlas, variant * s, terrain * s, s, s, dx, dy, s, s);
  }
}
