import { Controller } from './input/controller';
import type { View } from './render/canvas';
import { Camera, ZOOM_LEVELS } from './render/camera';
import { type Effect, Renderer } from './render/renderer';
import type { GameMap } from './sim/terrain';
import { TICK_MS, World } from './sim/world';
import { Bench } from './ui/bench';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { SelectionPanel } from './ui/selectionPanel';

/** Longest frame gap we catch up on; anything longer (app backgrounded) is dropped. */
const MAX_FRAME_MS = 250;
const RES_COLORS = { food: '#ffb08a', wood: '#e9c08a', gold: '#ffe066', stone: '#e4e4dc' } as const;

export interface DebugFlags {
  reveal: boolean;
  bench: boolean;
  fps: boolean;
}

/** One match: owns the world, camera, renderer, input controller and HUD. */
export class Game {
  readonly world: World;
  readonly camera: Camera;
  readonly hud: Hud;
  readonly controller: Controller;
  private readonly renderer: Renderer;
  private readonly minimap: Minimap;
  private readonly panel: SelectionPanel;
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
    this.camera.centerOn(start.x + 0.5, start.y + 1.5);

    this.hud = new Hud(hudRoot);
    hudRoot.querySelector<HTMLElement>('#fps')!.hidden = !(debug.fps || debug.bench);
    this.renderer = new Renderer(view, this.world, fog, this.player);
    this.minimap = new Minimap(this.hud.minimapSlot, this.world, fog, this.camera, this.player);
    this.controller = new Controller({
      world: this.world,
      camera: this.camera,
      player: this.player,
      addEffect: (e) => this.addEffect(e),
    });
    this.panel = new SelectionPanel(hudRoot, this.controller, this.world, this.player);
    this.hud.onIdleVillager = () => this.controller.nextIdleVillager();
    this.bench = debug.bench ? new Bench(this.camera, map.size, hudRoot.querySelector('#bench')!) : null;
  }

  private addEffect(e: Omit<Effect, 'born'>): void {
    this.renderer.effects.push({ ...e, born: performance.now() / 1000 });
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
    for (const ev of this.world.drainEvents()) {
      if (ev.owner !== this.player) continue;
      if (ev.type === 'dropoff') this.addEffect({ kind: 'text', x: ev.x, y: ev.y, text: `+${ev.amount}`, color: RES_COLORS[ev.res] });
      else if (ev.type === 'error') this.hud.toast(ev.message);
    }
    const dt = dtClamped / 1000;
    this.bench?.update(dt);
    this.camera.setView(this.view.width, this.view.height);
    this.camera.update(dt);
    const c = this.controller;
    const ghost = c.placing ? { ...c.placing, valid: c.placementValid() } : null;
    this.renderer.draw(this.camera, this.hud.paused ? 1 : this.acc / TICK_MS, now / 1000, { selection: c.selection, ghost });
    this.minimap.draw(now);
    this.hud.update(this.world, this.player, c.idleVillagers().length);
    this.panel.update();
  }

  destroy(): void {
    this.minimap.destroy();
    this.renderer.dispose();
    this.controller.destroy();
    this.panel.destroy();
    this.hud.destroy();
  }
}
