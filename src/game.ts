import type { View } from './render/canvas';
import { Camera, ZOOM_LEVELS } from './render/camera';
import { Renderer } from './render/renderer';
import type { GameMap } from './sim/terrain';
import { TICK_MS, World } from './sim/world';
import { Bench } from './ui/bench';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';

/** Longest frame gap we catch up on; anything longer (app backgrounded) is dropped. */
const MAX_FRAME_MS = 250;

export interface DebugFlags {
  reveal: boolean;
  bench: boolean;
  fps: boolean;
}

/** One match: owns the world, camera, renderer and HUD. */
export class Game {
  readonly world: World;
  readonly camera: Camera;
  readonly hud: Hud;
  private readonly renderer: Renderer;
  private readonly minimap: Minimap;
  private readonly bench: Bench | null;
  private acc = 0;
  /** The human player's slot. */
  readonly player = 0;

  constructor(map: GameMap, private readonly view: View, hudRoot: HTMLElement, debug: DebugFlags) {
    this.world = new World(map);
    const fog = this.world.fog[this.player];
    if (debug.reveal || debug.bench) fog.revealAll();

    this.camera = new Camera(map.size);
    this.camera.setView(view.width, view.height);
    const start = map.starts[this.player];
    // Open zoomed out so the explored surroundings (coast, lake, river) are in view.
    this.camera.level = 0;
    this.camera.scale = ZOOM_LEVELS[0];
    this.camera.centerOn(start.x + 0.5, start.y + 0.5);

    this.hud = new Hud(hudRoot);
    hudRoot.querySelector<HTMLElement>('#fps')!.hidden = !(debug.fps || debug.bench);
    this.renderer = new Renderer(view, map, fog);
    this.minimap = new Minimap(this.hud.minimapSlot, map, fog, this.camera);
    this.bench = debug.bench ? new Bench(this.camera, map.size, hudRoot.querySelector('#bench')!) : null;
  }

  frame(now: number, dtMs: number): void {
    const dtClamped = Math.min(dtMs, MAX_FRAME_MS);
    if (!this.hud.paused) {
      this.acc += dtClamped;
      while (this.acc >= TICK_MS) {
        this.world.step();
        this.acc -= TICK_MS;
      }
    }
    const dt = dtClamped / 1000;
    this.bench?.update(dt);
    this.camera.setView(this.view.width, this.view.height);
    this.camera.update(dt);
    this.renderer.draw(this.camera);
    this.minimap.draw(now);
    this.hud.update(this.world, this.player);
  }

  destroy(): void {
    this.minimap.destroy();
    this.renderer.dispose();
    this.hud.destroy();
  }
}
