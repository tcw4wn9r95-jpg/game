/** Fixed simulation rate. The renderer interpolates between ticks. */
export const TICK_RATE = 10;
export const TICK_MS = 1000 / TICK_RATE;

/**
 * Game state advanced only by tick(). Placeholder for M0: it carries the tick
 * counter and a drifting camera target so the loop's interpolation is visible.
 */
export class World {
  tick = 0;
  driftX = 0;
  prevDriftX = 0;

  step(): void {
    this.prevDriftX = this.driftX;
    this.driftX += 2;
    this.tick++;
  }
}
