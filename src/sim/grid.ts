import { Feature, type GameMap, Terrain } from './terrain';

/**
 * Land navigation layer: which tiles land units can stand on, which building
 * occupies each tile, and connected regions so unreachable goals are rejected
 * without a search.
 */
export class NavGrid {
  readonly N: number;
  /** 1 = walkable by land units. */
  readonly walk: Uint8Array;
  /** Building id occupying each tile (0 = none). */
  readonly building: Int32Array;
  private comp: Int32Array;
  private compDirty = true;

  constructor(private readonly map: GameMap) {
    this.N = map.size;
    this.walk = new Uint8Array(this.N * this.N);
    this.building = new Int32Array(this.N * this.N);
    this.comp = new Int32Array(this.N * this.N);
    for (let i = 0; i < this.N * this.N; i++) this.refresh(i);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.N && y < this.N;
  }

  isWalkable(x: number, y: number): boolean {
    return this.inside(x, y) && this.walk[y * this.N + x] === 1;
  }

  /** Recomputes walkability of one tile from terrain, features and buildings. */
  refresh(i: number): void {
    const was = this.walk[i];
    const now = this.map.terrain[i] !== Terrain.Deep && this.map.feature[i] === Feature.None && this.building[i] === 0 ? 1 : 0;
    if (was !== now) {
      this.walk[i] = now;
      this.compDirty = true;
    }
  }

  setBuilding(x: number, y: number, size: number, id: number): void {
    for (let ty = y; ty < y + size; ty++)
      for (let tx = x; tx < x + size; tx++) {
        const i = ty * this.N + tx;
        this.building[i] = id;
        this.refresh(i);
      }
  }

  /** Connected-region id of a tile (-1 if blocked). Regions are rebuilt lazily after changes. */
  component(x: number, y: number): number {
    if (!this.inside(x, y)) return -1;
    if (this.compDirty) this.rebuildComponents();
    return this.comp[y * this.N + x];
  }

  private rebuildComponents(): void {
    const { N, walk, comp } = this;
    comp.fill(-1);
    const stack = new Int32Array(N * N);
    let next = 0;
    for (let i = 0; i < N * N; i++) {
      if (!walk[i] || comp[i] >= 0) continue;
      let sp = 0;
      stack[sp++] = i;
      comp[i] = next;
      while (sp) {
        const j = stack[--sp];
        const x = j % N, y = (j / N) | 0;
        if (x > 0 && walk[j - 1] && comp[j - 1] < 0) (comp[j - 1] = next), (stack[sp++] = j - 1);
        if (x < N - 1 && walk[j + 1] && comp[j + 1] < 0) (comp[j + 1] = next), (stack[sp++] = j + 1);
        if (y > 0 && walk[j - N] && comp[j - N] < 0) (comp[j - N] = next), (stack[sp++] = j - N);
        if (y < N - 1 && walk[j + N] && comp[j + N] < 0) (comp[j + N] = next), (stack[sp++] = j + N);
      }
      next++;
    }
    this.compDirty = false;
  }

  /** Nearest walkable tile to (x, y) in the given region, searching outward in rings. */
  nearestWalkable(x: number, y: number, region: number, maxR = 24): { x: number; y: number } | null {
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let r = 0; r <= maxR; r++) {
      let best: { x: number; y: number } | null = null;
      let bd = Infinity;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = cx + dx, ty = cy + dy;
          if (!this.isWalkable(tx, ty) || (region >= 0 && this.component(tx, ty) !== region)) continue;
          const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
          if (d < bd) (bd = d), (best = { x: tx, y: ty });
        }
      if (best) return best;
    }
    return null;
  }
}
