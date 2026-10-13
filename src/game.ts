import type { View } from './render/canvas';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { generateMap, type MapOptions } from './sim/mapgen';
import { TICK_MS, World } from './sim/world';
import { Bench } from './ui/bench';
import { Minimap } from './ui/minimap';

/** Longest frame gap we catch up on; anything longer (app backgrounded) is dropped. */
const MAX_FRAME_MS = 250;

export interface DebugFlags {
  reveal: boolean;
  bench: boolean;
}

/** One match: owns the world, camera, renderer and in-match HUD pieces. */
export class Game {
  readonly world: World;
  readonly camera: Camera;
  private readonly renderer: Renderer;
  private readonly minimap: Minimap;
  private readonly bench: Bench | null;
  private acc = 0;
  /** The human player's slot. */
  readonly player = 0;

  constructor(opts: MapOptions, private readonly view: View, hud: HTMLElement, debug: DebugFlags) {
    const map = generateMap(opts);
    this.world = new World(map);
    const fog = this.world.fog[this.player];
    if (debug.reveal || debug.bench) fog.revealAll();

    this.camera = new Camera(map.size);
    this.camera.setView(view.width, view.height);
    const start = map.starts[this.player];
    this.camera.centerOn(start.x + 0.5, start.y + 0.5);

    this.renderer = new Renderer(view, map, fog);
    this.minimap = new Minimap(hud.querySelector('.hud-bottom-right')!, map, fog, this.camera);
    this.bench = debug.bench ? new Bench(this.camera, map.size, hud.querySelector('#bench')!) : null;
  }

  frame(now: number, dtMs: number): void {
    this.acc += Math.min(dtMs, MAX_FRAME_MS);
    while (this.acc >= TICK_MS) {
      this.world.step();
      this.acc -= TICK_MS;
    }
    const dt = Math.min(dtMs, MAX_FRAME_MS) / 1000;
    this.bench?.update(dt);
    this.camera.setView(this.view.width, this.view.height);
    this.camera.update(dt);
    this.renderer.draw(this.camera);
    this.minimap.draw(now);
  }

  destroy(): void {
    this.minimap.destroy();
  }
}
