// Unit sprites rendered lazily from the articulated figures, per zoom level.
import type { ResourceKind } from '../sim/constants';
import type { UnitType } from '../sim/entities';
import {
  type Anim,
  CLOTHS,
  type FigureSpec,
  HAIRS,
  type Look,
  SKINS,
  type Tool,
  type View,
  drawArcher,
  drawKnight,
  drawMilitia,
  drawMonk,
  drawScout,
  drawSkirmisher,
  drawSpearman,
  drawPetard,
  drawVillager,
} from './figures';
import { drawMangonel, drawRam, drawScorpion, drawSiegeTower, drawTrebuchet } from './siegeFigures';
import { grade } from './materials';
import { PLAYER_COLORS } from './palette';
import type { Sprite } from './sprites';

/** Per-type size (tiles per 100 figure units) and drawing bounds in figure units. */
const DEFS: Record<UnitType, { tilesPer100: number; x0: number; x1: number; y0: number; y1: number; draw: (g: CanvasRenderingContext2D, f: FigureSpec) => void }> = {
  villager: { tilesPer100: 0.82, x0: -45, x1: 45, y0: -150, y1: 12, draw: drawVillager },
  scout: { tilesPer100: 1.2, x0: -60, x1: 70, y0: -150, y1: 12, draw: drawScout },
  militia: { tilesPer100: 0.86, x0: -50, x1: 50, y0: -160, y1: 12, draw: drawMilitia },
  spearman: { tilesPer100: 0.86, x0: -60, x1: 70, y0: -180, y1: 40, draw: drawSpearman },
  archer: { tilesPer100: 0.84, x0: -50, x1: 50, y0: -150, y1: 12, draw: drawArcher },
  skirmisher: { tilesPer100: 0.84, x0: -50, x1: 55, y0: -160, y1: 12, draw: drawSkirmisher },
  knight: { tilesPer100: 1.25, x0: -70, x1: 110, y0: -160, y1: 12, draw: drawKnight },
  monk: { tilesPer100: 0.84, x0: -45, x1: 45, y0: -170, y1: 12, draw: drawMonk },
  petard: { tilesPer100: 0.84, x0: -50, x1: 50, y0: -150, y1: 12, draw: drawPetard },
  ram: { tilesPer100: 0.95, x0: -75, x1: 95, y0: -100, y1: 14, draw: drawRam },
  mangonel: { tilesPer100: 0.95, x0: -70, x1: 70, y0: -110, y1: 14, draw: drawMangonel },
  scorpion: { tilesPer100: 0.95, x0: -50, x1: 70, y0: -80, y1: 12, draw: drawScorpion },
  siege_tower: { tilesPer100: 0.9, x0: -50, x1: 70, y0: -225, y1: 14, draw: drawSiegeTower },
  trebuchet: { tilesPer100: 0.95, x0: -100, x1: 115, y0: -250, y1: 14, draw: drawTrebuchet },
};

/**
 * Unit sprite px per 32-unit tile, relative to Z. Smaller than trees and
 * scenery so that people stand at about a third of a house's height.
 */
export const UNIT_K = 1.05;

/** Height of a unit's figure in tiles (before UNIT_K), for hit-testing taps. */
export const unitHeight = (type: UnitType) =>
  type === 'siege_tower' ? 2 : type === 'trebuchet' ? 1.6 : type === 'scout' || type === 'knight' ? 1.3 : type === 'ram' || type === 'mangonel' ? 0.95 : type === 'scorpion' ? 0.7 : type === 'villager' ? 0.85 : 0.9;

/** Eight preset looks so crowds vary; picked by unit id. */
const LOOKS: Look[] = Array.from({ length: 8 }, (_, i) => ({
  female: i % 2 === 1,
  skin: SKINS[(i * 7 + 1) % SKINS.length],
  hair: HAIRS[(i * 3) % HAIRS.length],
  cloth: CLOTHS[(i * 5 + 2) % CLOTHS.length],
}));
export const lookIndex = (id: number) => (id * 2654435761) >>> 29;

/** The tech that upgrades each unit line (and changes its kit). */
export const UPGRADE_TECH: Partial<Record<UnitType, string>> = { militia: 'swordsman', spearman: 'pikeman', archer: 'crossbowman', scout: 'light_cavalry', ram: 'capped_ram', mangonel: 'onager' };

export interface UnitPose {
  view: View;
  /** Side view facing left. */
  left: boolean;
  /** Trebuchets: packed for travel. */
  packed?: boolean;
  anim: Anim;
  frame: number;
  tool: Tool;
  carry: ResourceKind | null;
}

export class UnitSprites {
  private readonly cache = new Map<string, Sprite>();

  constructor(readonly s: number) {}

  get(type: UnitType, player: number, look: number, p: UnitPose, elite = false): Sprite {
    const key = `${type}|${player}|${look}|${p.view}|${p.left ? 1 : 0}|${p.anim}|${p.frame}|${p.tool}|${p.carry ?? ''}|${elite ? 1 : 0}|${p.packed === false ? 0 : 1}`;
    let sp = this.cache.get(key);
    if (!sp) {
      sp = this.render(type, player, look, p, elite);
      this.cache.set(key, sp);
    }
    return sp;
  }

  /** A large head-and-shoulders render for the HUD portrait. */
  portrait(type: UnitType, player: number, look: number, px: number): HTMLCanvasElement {
    const d = DEFS[type];
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d')!;
    // Frame the upper body: villagers from the waist up, scouts the rider and horse's head.
    const mounted = type === 'scout' || type === 'knight';
    const engine = ['ram', 'mangonel', 'scorpion', 'siege_tower', 'trebuchet'].includes(type);
    if (engine) {
      // Engines are shown whole.
      const k = Math.min(px / (d.x1 - d.x0), px / (d.y1 - d.y0)) * 0.95;
      g.translate(px / 2 - ((d.x0 + d.x1) / 2) * k, px / 2 - ((d.y0 + d.y1) / 2) * k);
      g.scale(k, k);
      d.draw(g, this.spec(player, look, { view: 'side', left: false, anim: 'idle', frame: 0, tool: 'none', carry: null, packed: false }));
      return c;
    }
    const k = mounted ? px / 120 : px / 70;
    g.translate(px / 2 - (mounted ? 8 * k : 0), mounted ? px * 1.0 : px * 1.72);
    g.scale(k, k);
    d.draw(g, this.spec(player, look, { view: mounted ? 'side' : 'front', left: false, anim: 'idle', frame: 0, tool: 'none', carry: null }));
    return c;
  }

  private spec(player: number, look: number, p: UnitPose, elite = false): FigureSpec {
    return { view: p.view, anim: p.anim, frame: p.frame, tool: p.tool, carry: p.carry, team: PLAYER_COLORS[player % PLAYER_COLORS.length], look: LOOKS[look % LOOKS.length], elite, packed: p.packed };
  }

  private render(type: UnitType, player: number, look: number, p: UnitPose, elite: boolean): Sprite {
    const d = DEFS[type];
    const k = (this.s * d.tilesPer100) / 100; // device px per figure unit
    const c = document.createElement('canvas');
    c.width = Math.ceil((d.x1 - d.x0) * k);
    c.height = Math.ceil((d.y1 - d.y0) * k);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const ax = -d.x0 * k, ay = -d.y0 * k;
    g.translate(ax, ay);
    if (p.left) g.scale(-1, 1);
    g.scale(k, k);
    d.draw(g, this.spec(player, look, p, elite));
    grade(c, 0.05, look * 13 + p.frame);
    return { c, ax, ay };
  }
}
