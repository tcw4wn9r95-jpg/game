import { Controller } from './input/controller';
import type { View } from './render/canvas';
import { Camera, ZOOM_LEVELS } from './render/camera';
import { type Effect, type Overlay, Renderer } from './render/renderer';
import type { GameMap } from './sim/terrain';
import { TICK_MS, World } from './sim/world';
import { Bench } from './ui/bench';
import { AGES, TECH_DEFS } from './sim/techs';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { CommandCenter } from './ui/commandCenter';

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
  private readonly panel: CommandCenter;
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
    this.panel = new CommandCenter(hudRoot, this.controller, this.world, this.player);
    this.hud.onIdleVillager = () => this.controller.nextIdleVillager();
    this.hud.onIdleMilitary = () => this.controller.nextIdleMilitary();
    this.hud.onAllMilitary = () => this.controller.selectAllMilitary();
    this.bench = debug.bench ? new Bench(this.camera, map.size, hudRoot.querySelector('#bench')!) : null;
  }

  /** Seconds-clock of the last attack alert, and where, so alerts don't spam. */
  private lastAlert = -100;
  private alertAt: { x: number; y: number } | null = null;
  private deaths = 0;

  /** Toasts an alert (at most every 12 s unless forced); tapping it jumps the camera there. */
  private alert(message: string, x: number, y: number, now: number, force = false): void {
    if (!force && now - this.lastAlert < 12) return;
    this.lastAlert = now;
    this.alertAt = { x, y };
    this.hud.toast(message, () => {
      if (this.alertAt) this.camera.centerOn(this.alertAt.x, this.alertAt.y);
    });
    this.minimap.ping(x, y, now);
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
    const nowS = performance.now() / 1000;
    for (const ev of this.world.drainEvents()) {
      // Battle aftermath is drawn for every side.
      if (ev.type === 'blast') {
        this.addEffect({ kind: 'blast', x: ev.x, y: ev.y, color: '', size: ev.size });
        continue;
      }
      if (ev.type === 'death') this.renderer.addDeath(ev, this.deaths++, nowS);
      else if (ev.type === 'destroyed') this.renderer.addRuin(ev, nowS);
      if (ev.type === 'converted' && ev.from === this.player) this.alert('A unit was converted by an enemy monk!', ev.x, ev.y, nowS, true);
      if (ev.owner !== this.player) continue;
      if (ev.type === 'hit' && ev.by !== this.player && ev.by >= 0) {
        this.alert(ev.building ? 'Your town is under attack!' : 'Your units are under attack!', ev.x, ev.y, nowS);
        continue;
      }
      if (ev.type === 'researched') {
        const t = TECH_DEFS[ev.tech];
        const age = t.effects.find((e) => e.type === 'age');
        if (age) this.hud.announce(`${AGES[age.age].name} Age`, 'New buildings, units and technologies are available.');
        else this.hud.toast(`${t.name} researched`);
        continue;
      }
      if (ev.type === 'dropoff') this.addEffect({ kind: 'text', x: ev.x, y: ev.y, text: `+${ev.amount}`, color: RES_COLORS[ev.res] });
      else if (ev.type === 'error') this.hud.toast(ev.message);
    }
    const dt = dtClamped / 1000;
    this.bench?.update(dt);
    this.camera.setView(this.view.width, this.view.height);
    this.camera.update(dt);
    const c = this.controller;
    let ghost: Overlay['ghost'] = null;
    if (c.placing) {
      const p = c.placing;
      ghost = { type: p.type, x: p.x, y: p.y, valid: c.placementValid() };
      if (p.wall) {
        const gateType = p.wall.kind === 'stone' ? 'gate' : 'palisade_gate';
        ghost.wall = c.wallPlan().map((t) => ({ ...t, valid: this.world.canPlace(t.gate ? gateType : p.type, this.player, t.x, t.y) }));
      }
    }
    this.renderer.draw(this.camera, this.hud.paused ? 1 : this.acc / TICK_MS, now / 1000, { selection: c.selection, ghost });
    this.minimap.draw(now);
    this.hud.update(this.world, this.player, c.idleVillagers().length, c.idleMilitary().length);
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
