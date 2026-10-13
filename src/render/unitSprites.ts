// Procedural unit sprites per zoom level and player colour, drawn in 32-units-per-tile
// space. Each unit has a few animation poses, pre-rendered facing right and mirrored.
import type { UnitType } from '../sim/entities';
import { PLAYER_COLORS } from './palette';
import type { Sprite } from './sprites';

export type Pose = 'idle' | 'walk0' | 'walk1' | 'work0' | 'work1';

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = (c: RGB, k = 1) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;

type Painter = (g: CanvasRenderingContext2D, pose: Pose, team: RGB) => void;

function shadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  g.fillStyle = 'rgba(10,16,4,0.35)';
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

const SKIN = '#e0b48c';
const OUTLINE = 'rgba(25,15,5,0.85)';

const villager: Painter = (g, pose, team) => {
  const cx = 8, foot = 20;
  shadow(g, cx + 1, foot, 5, 1.6);
  const step = pose === 'walk0' ? 1.6 : pose === 'walk1' ? -1.6 : 0;
  const bob = pose === 'walk0' || pose === 'walk1' ? -0.5 : 0;
  // Legs.
  g.strokeStyle = '#3d2a18';
  g.lineWidth = 1.8;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - 1.2, foot - 6 + bob);
  g.lineTo(cx - 1.2 + step, foot - 0.8);
  g.moveTo(cx + 1.2, foot - 6 + bob);
  g.lineTo(cx + 1.2 - step, foot - 0.8);
  g.stroke();
  // Tunic in team colour, lit from the left.
  const grad = g.createLinearGradient(cx - 4, 0, cx + 4, 0);
  grad.addColorStop(0, rgb(team, 1.25));
  grad.addColorStop(1, rgb(team, 0.7));
  g.fillStyle = grad;
  g.strokeStyle = OUTLINE;
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(cx - 3, foot - 13 + bob);
  g.lineTo(cx + 3, foot - 13 + bob);
  g.lineTo(cx + 4, foot - 5.5 + bob);
  g.lineTo(cx - 4, foot - 5.5 + bob);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#5a3a1c';
  g.fillRect(cx - 3.6, foot - 8 + bob, 7.2, 1.1);
  // Arm / tool.
  const working = pose === 'work0' || pose === 'work1';
  if (working) {
    const up = pose === 'work0';
    g.strokeStyle = '#6b4a2a';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(cx + 2, foot - 11 + bob);
    g.lineTo(up ? cx + 3 : cx + 7, up ? foot - 19 : foot - 8);
    g.stroke();
    g.fillStyle = '#9ba3a8';
    g.beginPath();
    if (up) g.ellipse(cx + 3, foot - 19, 2.2, 1.1, -0.3, 0, Math.PI * 2);
    else g.ellipse(cx + 7.3, foot - 7.6, 1.1, 2.2, 0.4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = SKIN;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(cx + 1.5, foot - 12 + bob);
    g.lineTo(up ? cx + 2.6 : cx + 4.5, up ? foot - 15 : foot - 10);
    g.stroke();
  } else {
    g.strokeStyle = rgb(team, 0.8);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx + 2.6, foot - 12 + bob);
    g.lineTo(cx + 3.2 - step * 0.6, foot - 7.5 + bob);
    g.stroke();
  }
  // Head with a hood.
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(cx, foot - 15.2 + bob, 2.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7a5a36';
  g.beginPath();
  g.arc(cx - 0.3, foot - 15.8 + bob, 2.6, Math.PI * 0.95, Math.PI * 2.05);
  g.fill();
};

const scout: Painter = (g, pose, team) => {
  const foot = 22;
  shadow(g, 14, foot, 10, 2.2);
  const k = pose === 'walk0' ? 1 : pose === 'walk1' ? -1 : 0;
  // Horse legs.
  g.strokeStyle = '#4a2f18';
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  g.beginPath();
  for (const [x, dir] of [[7, 1], [10, -1], [18, -1], [21, 1]] as const) {
    g.moveTo(x, foot - 7);
    g.lineTo(x + k * dir * 1.8, foot - 0.6);
  }
  g.stroke();
  // Horse body and neck.
  const body = g.createLinearGradient(0, foot - 13, 0, foot - 5);
  body.addColorStop(0, '#9a6538');
  body.addColorStop(1, '#5e3a1c');
  g.fillStyle = body;
  g.strokeStyle = OUTLINE;
  g.lineWidth = 0.6;
  g.beginPath();
  g.ellipse(14, foot - 9, 8.5, 3.8, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(20, foot - 11);
  g.lineTo(24, foot - 17);
  g.lineTo(27, foot - 15.5);
  g.lineTo(23, foot - 8);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#2e1c0e';
  g.fillRect(4.5, foot - 11, 2, 5); // tail
  g.fillRect(21, foot - 17, 2.4, 6); // mane
  // Saddle cloth in team colour.
  g.fillStyle = rgb(team);
  g.fillRect(11, foot - 12.5, 6.5, 4.5);
  // Rider.
  g.fillStyle = rgb(team, 1.15);
  g.strokeStyle = OUTLINE;
  g.beginPath();
  g.moveTo(12, foot - 12.5);
  g.lineTo(16.5, foot - 12.5);
  g.lineTo(15.8, foot - 19);
  g.lineTo(12.6, foot - 19);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(14.2, foot - 21, 2.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8f979c';
  g.beginPath();
  g.arc(14.2, foot - 21.6, 2.4, Math.PI, 0);
  g.fill();
  // Lance.
  g.strokeStyle = '#6b4a2a';
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(17, foot - 13);
  g.lineTo(23, foot - 27);
  g.stroke();
};

/** Drawing box, feet anchor and an extra scale so figures read clearly at gameplay zoom. */
const DEFS: Record<UnitType, { w: number; h: number; ax: number; ay: number; scale: number; paint: Painter }> = {
  villager: { w: 16, h: 22, ax: 8, ay: 20, scale: 1.3, paint: villager },
  scout: { w: 28, h: 30, ax: 14, ay: 22, scale: 1.2, paint: scout },
};

/** Height of a unit's figure in tiles, for hit-testing taps. */
export const unitHeight = (type: UnitType) => (DEFS[type].ay * DEFS[type].scale) / 32;

/** All unit sprites for one zoom level: [type][player][pose][facing 0=right,1=left]. */
export class UnitSprites {
  private readonly cache = new Map<string, Sprite>();

  constructor(readonly s: number) {}

  get(type: UnitType, player: number, pose: Pose, left: boolean): Sprite {
    const key = `${type}|${player}|${pose}|${left ? 1 : 0}`;
    let sp = this.cache.get(key);
    if (!sp) {
      sp = this.render(type, player, pose, left);
      this.cache.set(key, sp);
    }
    return sp;
  }

  private render(type: UnitType, player: number, pose: Pose, left: boolean): Sprite {
    const d = DEFS[type];
    const u = (this.s / 32) * d.scale;
    const c = document.createElement('canvas');
    c.width = Math.ceil(d.w * u);
    c.height = Math.ceil(d.h * u);
    const g = c.getContext('2d')!;
    if (left) {
      g.translate(c.width, 0);
      g.scale(-1, 1);
    }
    g.scale(u, u);
    d.paint(g, pose, hex(PLAYER_COLORS[player % PLAYER_COLORS.length]));
    return { c, ax: (left ? d.w - d.ax : d.ax) * u, ay: d.ay * u };
  }
}
