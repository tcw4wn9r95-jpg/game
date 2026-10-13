import buildings from '../data/buildings.json';
import units from '../data/units.json';
import type { ResourceKind } from './constants';

export type UnitType = keyof typeof units;
export type BuildingType = keyof typeof buildings;
export interface UnitDef {
  name: string;
  hp: number;
  speed: number;
  los: number;
  radius: number;
  pop: number;
  cost: Partial<Record<ResourceKind, number>>;
  trainTime: number;
  attack: number;
  meleeArmor: number;
  pierceArmor: number;
  range: number;
  description: string;
  gatherer?: boolean;
  builder?: boolean;
}

export interface BuildingDef {
  name: string;
  size: number;
  hp: number;
  buildTime: number;
  cost: Partial<Record<ResourceKind, number>>;
  pop: number;
  los: number;
  dropoff: ResourceKind[];
  age: number;
  buildable: boolean;
  description: string;
  meleeArmor: number;
  pierceArmor: number;
  /** Units this building can train. */
  trains: UnitType[];
  /** Units can walk over it (farms). */
  walkable?: boolean;
  /** Food a farm yields per planting. */
  food?: number;
  /** A completed building of this type is needed before this one can be placed. */
  requires?: BuildingType;
}

export const UNIT_DEFS = units as unknown as Record<UnitType, UnitDef>;
export const BUILDING_DEFS = buildings as unknown as Record<BuildingType, BuildingDef>;

/** Something a villager can gather: a resource tile (tree, mine, bush) or an entity (animal, fish, farm). */
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
  /** Units waiting to be trained; the head is in progress. */
  queue: Array<{ unit: UnitType; progress: number }>;
  /** Where trained units go: a point, or a resource to start gathering. */
  rally: { x: number; y: number; target: GatherTarget | null } | null;
  /** Re-queue each unit as it finishes (if affordable). */
  repeat: boolean;
  /** Farms: food left in the current planting. */
  amount: number;
  /** Production is waiting for population room (for a one-off alert). */
  housed: boolean;
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
