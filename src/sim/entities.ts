import buildings from '../data/buildings.json';
import units from '../data/units.json';
import type { ResourceKind } from './constants';

export type UnitType = keyof typeof units;
export type BuildingType = keyof typeof buildings;
export type UnitDef = (typeof units)[UnitType] & { gatherer?: boolean; builder?: boolean };
export type BuildingDef = (typeof buildings)[BuildingType];

export const UNIT_DEFS = units as Record<UnitType, UnitDef>;
export const BUILDING_DEFS = buildings as Record<BuildingType, BuildingDef>;

/** Something a villager can gather: a resource tile (tree, mine, bush) or a resource entity (animal, fish). */
export type GatherTarget = { kind: 'tile'; x: number; y: number } | { kind: 'entity'; id: number };

export type Order =
  | { type: 'move'; x: number; y: number }
  | { type: 'gather'; target: GatherTarget; res: ResourceKind; source: string }
  | { type: 'build'; id: number }
  | { type: 'dropoff'; id: number };

export interface Unit {
  id: number;
  kind: 'unit';
  type: UnitType;
  owner: number;
  /** Position in tiles (centre of tile = +0.5). */
  x: number;
  y: number;
  /** Position at the start of the current tick, for render interpolation. */
  px: number;
  py: number;
  hp: number;
  /** Facing: -1 left, 1 right. */
  face: number;
  order: Order | null;
  /** Waypoints (tile coords) of the current path. */
  path: Array<{ x: number; y: number }> | null;
  pathIdx: number;
  /** True while waiting for the path service. */
  pathPending: boolean;
  /** What the unit is doing this tick, for animation and the HUD. */
  state: 'idle' | 'walk' | 'gather' | 'build';
  carry: { res: ResourceKind; amount: number } | null;
  /** Fractional gather progress not yet moved into `carry`. */
  gatherAcc: number;
  /** Resumes this gather order after a drop-off. */
  resume: Order | null;
  /** Path searches for the current order that ended without reaching it (gives up after a few). */
  repaths: number;
}

export interface Building {
  id: number;
  kind: 'building';
  type: BuildingType;
  owner: number;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
  size: number;
  hp: number;
  /** Construction progress 0..1. */
  progress: number;
  complete: boolean;
}

/** Food on the hoof or in the water, gathered where it stands. */
export interface ResourceEntity {
  id: number;
  kind: 'resource';
  type: 'sheep' | 'deer' | 'fish';
  x: number;
  y: number;
  amount: number;
}

export type Entity = Unit | Building | ResourceEntity;

/** Distance from a point to a building footprint (0 inside). */
export function distToRect(px: number, py: number, x: number, y: number, size: number): number {
  const dx = Math.max(x - px, 0, px - (x + size));
  const dy = Math.max(y - py, 0, py - (y + size));
  return Math.hypot(dx, dy);
}
