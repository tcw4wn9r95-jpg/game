// Procedural ground tiles, drawn once per zoom level into an atlas.
import { Rng } from '../sim/rng';
import { Terrain } from '../sim/terrain';

export const TILE_VARIANTS = 4;
const TERRAIN_COUNT = 5;

/** Stable per-tile hash for picking variants and jitter. */
export function tileHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

interface GroundStyle {
  base: string[];
  specks: string[];
  /** Specks per 32x32 tile. */
  density: number;
  /** Speck size in 32-unit space [w, h]. */
  speck: [number, number];
}

const STYLES: Record<number, GroundStyle> = {
  [Terrain.Grass]: { base: ['#4f9140', '#4b8b3c', '#549744', '#4a883b'], specks: ['#6aae50', '#3c7831', '#5fa249'], density: 14, speck: [1, 3] },
  [Terrain.Dirt]: { base: ['#9c7b4e', '#977649', '#a28152', '#94744a'], specks: ['#7d6040', '#b8966a', '#86683f'], density: 10, speck: [2, 2] },
  [Terrain.Sand]: { base: ['#dcc683', '#d8c17d', '#e0ca89', '#d5bf7b'], specks: ['#c9b16c', '#ecdba0'], density: 12, speck: [1, 1] },
  [Terrain.Shallow]: { base: ['#6cbcc8', '#69b8c5', '#70c0cc', '#66b5c2'], specks: ['#b9d9b8', '#8fd0d8', '#58a7b6'], density: 9, speck: [3, 1] },
  [Terrain.Deep]: { base: ['#2b6aa3', '#2a679f', '#2d6ea7', '#29659c'], specks: ['#3d80bb', '#235c90'], density: 6, speck: [5, 1] },
};

/** Land types overlap neighbours of lower rank with soft bumps along the shared edge. */
export const LAND_RANK: Record<number, number> = { [Terrain.Grass]: 3, [Terrain.Dirt]: 2, [Terrain.Sand]: 1 };
export const edgeColor = (t: number) => STYLES[t].base[0];

/** Atlas of TERRAIN_COUNT rows x TILE_VARIANTS columns, each tile `s` device px square. */
export class TileArt {
  readonly atlas: HTMLCanvasElement;

  constructor(readonly s: number) {
    this.atlas = document.createElement('canvas');
    this.atlas.width = s * TILE_VARIANTS;
    this.atlas.height = s * TERRAIN_COUNT;
    const g = this.atlas.getContext('2d')!;
    const u = s / 32;
    for (let t = 0; t < TERRAIN_COUNT; t++) {
      const st = STYLES[t];
      for (let v = 0; v < TILE_VARIANTS; v++) {
        const rng = new Rng(t * 977 + v * 131 + 5);
        const ox = v * s, oy = t * s;
        g.fillStyle = st.base[v];
        g.fillRect(ox, oy, s, s);
        for (let k = 0; k < st.density; k++) {
          g.fillStyle = st.specks[rng.int(0, st.specks.length - 1)];
          const w = Math.max(1, Math.round(st.speck[0] * u)), h = Math.max(1, Math.round(st.speck[1] * u));
          g.fillRect(ox + Math.floor(rng.next() * (s - w)), oy + Math.floor(rng.next() * (s - h)), w, h);
        }
      }
    }
  }

  draw(g: CanvasRenderingContext2D, terrain: number, variant: number, dx: number, dy: number): void {
    const s = this.s;
    g.drawImage(this.atlas, variant * s, terrain * s, s, s, dx, dy, s, s);
  }
}
