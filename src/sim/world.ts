import data from '../data/maps.json';
import { Fog, type VisionSource } from './fog';
import type { GameMap } from './terrain';

/** Fixed simulation rate. The renderer interpolates between ticks. */
export const TICK_RATE = 10;
export const TICK_MS = 1000 / TICK_RATE;

/** Game state advanced only by step(). */
export class World {
  tick = 0;
  /** Fog per player slot. */
  readonly fog: Fog[];

  constructor(readonly map: GameMap) {
    this.fog = map.starts.map(() => new Fog(map.size));
    this.updateVision();
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
