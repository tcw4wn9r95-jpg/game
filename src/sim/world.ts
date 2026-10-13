import economy from '../data/economy.json';
import data from '../data/maps.json';
import { Fog, type VisionSource } from './fog';
import type { GameMap } from './terrain';

/** Fixed simulation rate. The renderer interpolates between ticks. */
export const TICK_RATE = 10;
export const TICK_MS = 1000 / TICK_RATE;

export type ResourceKind = 'food' | 'wood' | 'gold' | 'stone';
export const RESOURCE_KINDS: ResourceKind[] = ['food', 'wood', 'gold', 'stone'];

export interface PlayerState {
  resources: Record<ResourceKind, number>;
  pop: number;
  popCap: number;
  /** 0-3: Settlement, Township, Stronghold, Dominion. */
  age: number;
}

/** Game state advanced only by step(). */
export class World {
  tick = 0;
  readonly players: PlayerState[];
  /** Fog per player slot. */
  readonly fog: Fog[];

  constructor(readonly map: GameMap) {
    this.players = map.starts.map(() => ({
      resources: { ...economy.startResources },
      pop: 0,
      popCap: economy.popPerTownCenter,
      age: 0,
    }));
    this.fog = map.starts.map((s) => {
      const fog = new Fog(map.size);
      fog.explore(s.x + 0.5, s.y + 0.5, data.start.exploredRadius);
      return fog;
    });
    this.updateVision();
  }

  /** Match time in seconds. */
  get time(): number {
    return this.tick / TICK_RATE;
  }

  step(): void {
    this.tick++;
  }

  /** Until units exist (M2), each player sees around their starting Town Center. */
  private updateVision(): void {
    this.map.starts.forEach((s, i) => {
      const sources: VisionSource[] = [{ x: s.x + 0.5, y: s.y + 0.5, r: data.start.visionRadius }];
      this.fog[i].update(sources);
    });
  }
}
