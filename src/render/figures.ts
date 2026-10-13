// Articulated unit figures. Each figure is posed from a small skeleton (hips,
// shoulders, two-segment limbs) and drawn with outlined, shaded vector parts in
// "figure space": feet at y = 0, top of a standing villager's head at y = -100,
// +x is the direction the figure faces in side view.
import type { ResourceKind } from '../sim/constants';

export type View = 'front' | 'side' | 'back';
export type Anim = 'idle' | 'walk' | 'work';
export type Tool = 'none' | 'axe' | 'pick' | 'hammer' | 'basket' | 'knife' | 'spear';

export interface Look {
  female: boolean;
  skin: string;
  hair: string;
  /** Second clothing colour (trousers, skirt trim). */
  cloth: string;
}

export interface FigureSpec {
  view: View;
  anim: Anim;
  /** Animation frame (walk: 0-5, work: 0-3). */
  frame: number;
  tool: Tool;
  carry: ResourceKind | null;
  team: string;
  look: Look;
}

type G = CanvasRenderingContext2D;
type P = [number, number];

const D2R = Math.PI / 180;
const OUT = '#1d1208';
const BOOT = '#3a2614';
const LEATHER = '#5b3a1e';
const STEEL = '#b9c1c6';
const STEEL_DARK = '#6d777d';
const HANDLE = '#7a5430';

export const SKINS = ['#f1c9a5', '#dcab80', '#b07a52'];
export const HAIRS = ['#3b2716', '#6b4423', '#a8783f', '#d6b26e', '#1e1a18'];
export const CLOTHS = ['#6b5a42', '#4f5a4a', '#5e4a3a', '#575866'];

// ---------- colour helpers ----------

function parse(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(c: string, k: number): string {
  const [r, g, b] = parse(c);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ---------- drawing primitives ----------

/** End point of a limb segment: angle 0 points straight down, positive swings forward (+x). */
function seg(from: P, deg: number, len: number): P {
  return [from[0] + Math.sin(deg * D2R) * len, from[1] + Math.cos(deg * D2R) * len];
}

/** A rounded, outlined limb segment. */
function limb(g: G, a: P, b: P, w: number, color: string) {
  g.lineCap = 'round';
  g.strokeStyle = OUT;
  g.lineWidth = w + 2.4;
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(b[0], b[1]);
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = w;
  g.stroke();
}

function blob(g: G, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0, outline = true) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (outline) {
    g.strokeStyle = OUT;
    g.lineWidth = 2;
    g.stroke();
  }
  g.fillStyle = fill;
  g.fill();
}

function poly(g: G, pts: P[], fill: string | CanvasGradient, outline = true) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  if (outline) {
    g.strokeStyle = OUT;
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.stroke();
  }
  g.fillStyle = fill;
  g.fill();
}

function groundShadow(g: G, rx: number, ry: number, dx = 4) {
  const grad = g.createRadialGradient(dx, 0, 0, dx, 0, rx);
  grad.addColorStop(0, 'rgba(8,12,4,0.42)');
  grad.addColorStop(1, 'rgba(8,12,4,0)');
  g.save();
  g.scale(1, ry / rx);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(dx, 0, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// ---------- villager ----------

interface Pose {
  /** Vertical body offset (negative = up). */
  bob: number;
  /** Torso lean in degrees (positive = forward). */
  lean: number;
  /** [thigh, shin] angles for near and far leg. */
  near: [number, number];
  far: [number, number];
  /** [upper arm, forearm] angles for near and far arm. */
  armN: [number, number];
  armF: [number, number];
}

function walkPose(frame: number): Pose {
  const p = (frame / 6) * Math.PI * 2;
  const s = Math.sin(p);
  // The trailing leg's knee folds as it lifts off; kept modest so the foot never kicks out flat.
  const bend = (v: number) => Math.max(0, -v) * 22 + 5;
  return {
    bob: -Math.abs(Math.cos(p)) * 2.5,
    lean: 4,
    near: [26 * s, 26 * s - bend(s)],
    far: [-26 * s, -26 * s - bend(-s)],
    armN: [-24 * s, -24 * s + 18],
    armF: [24 * s, 24 * s + 18],
  };
}

const IDLE: Pose = { bob: 0, lean: 0, near: [4, 2], far: [-4, -2], armN: [8, 22], armF: [-6, 14] };

/** Work cycles per tool: four key frames each. */
function workPose(tool: Tool, frame: number): Pose {
  const legs = { near: [14, 6] as [number, number], far: [-12, -6] as [number, number] };
  switch (tool) {
    case 'axe':
    case 'pick': {
      const k = [
        { lean: -6, n: [-165, -175], f: [-150, -165] },
        { lean: -2, n: [-110, -70], f: [-100, -60] },
        { lean: 14, n: [55, 80], f: [62, 85] },
        { lean: 8, n: [25, 45], f: [30, 50] },
      ][frame];
      const low = tool === 'pick' ? 12 : 0;
      return { bob: 0, lean: k.lean + low * 0.4, ...legs, armN: [k.n[0], k.n[1] + low] as [number, number], armF: [k.f[0], k.f[1] + low] as [number, number] };
    }
    case 'hammer': {
      const k = [[-70, -120], [-30, -50], [45, 70], [15, 30]][frame];
      return { bob: 0, lean: 8, ...legs, armN: [k[0], k[1]], armF: [10, 40] };
    }
    case 'basket': {
      const k = [[70, 105], [50, 70], [30, 30], [55, 90]][frame];
      return { bob: 4, lean: 26, near: [24, 4], far: [-10, -14], armN: [k[0], k[1]], armF: [20, 60] };
    }
    case 'knife': {
      const k = [[40, 95], [60, 125], [45, 100], [65, 130]][frame];
      return { bob: 12, lean: 34, near: [55, -20], far: [10, -40], armN: [k[0], k[1]], armF: [35, 80] };
    }
    case 'spear': {
      const k = [[-20, 40], [10, 70], [45, 95], [20, 60]][frame];
      return { bob: 0, lean: 10, ...legs, armN: [k[0], k[1]], armF: [k[0] - 15, k[1] - 10] };
    }
    default:
      return IDLE;
  }
}

/** Draws a tool gripped at `hand`, oriented by the forearm angle. */
function drawTool(g: G, tool: Tool, hand: P, fore: number) {
  if (tool === 'none' || tool === 'basket') return;
  // Hafted tools are held roughly at right angles to the forearm.
  const dir = (fore + (tool === 'spear' ? 0 : 90)) * D2R;
  const ux = Math.sin(dir), uy = Math.cos(dir);
  const len = tool === 'spear' ? 46 : tool === 'knife' ? 9 : tool === 'hammer' ? 18 : 26;
  const back = tool === 'spear' ? 18 : tool === 'knife' ? 1 : 4;
  const a: P = [hand[0] - ux * back, hand[1] - uy * back];
  const b: P = [hand[0] + ux * len, hand[1] + uy * len];
  if (tool === 'knife') {
    poly(g, [[hand[0], hand[1]], [b[0] - uy * 1.5, b[1] + ux * 1.5], [b[0] + ux * 3, b[1] + uy * 3], [b[0] + uy * 1.5, b[1] - ux * 1.5]], STEEL);
    return;
  }
  limb(g, a, b, 2.6, HANDLE);
  // Head at the far end, perpendicular to the haft.
  const px = -uy, py = ux;
  if (tool === 'axe') {
    poly(g, [[b[0] - ux * 2, b[1] - uy * 2], [b[0] + px * 9 - ux * 4, b[1] + py * 9 - uy * 4], [b[0] + px * 10 + ux * 5, b[1] + py * 10 + uy * 5], [b[0] + ux * 2, b[1] + uy * 2]], STEEL);
    limb(g, [b[0] + px * 9 - ux * 3, b[1] + py * 9 - uy * 3], [b[0] + px * 9.5 + ux * 4, b[1] + py * 9.5 + uy * 4], 1, '#eef3f5');
  } else if (tool === 'pick') {
    poly(g, [[b[0] - px * 12 - ux * 2, b[1] - py * 12 - uy * 2], [b[0] - ux * 2.5, b[1] - uy * 2.5], [b[0] + px * 12 - ux * 2, b[1] + py * 12 - uy * 2], [b[0] + ux * 2, b[1] + uy * 2]], STEEL_DARK);
  } else if (tool === 'hammer') {
    poly(g, [[b[0] - px * 5 - ux * 3, b[1] - py * 5 - uy * 3], [b[0] + px * 5 - ux * 3, b[1] + py * 5 - uy * 3], [b[0] + px * 5 + ux * 3, b[1] + py * 5 + uy * 3], [b[0] - px * 5 + ux * 3, b[1] - py * 5 + uy * 3]], STEEL_DARK);
  } else if (tool === 'spear') {
    poly(g, [[b[0] + px * 2.5, b[1] + py * 2.5], [b[0] + ux * 9, b[1] + uy * 9], [b[0] - px * 2.5, b[1] - py * 2.5]], STEEL);
  }
}

function basket(g: G, x: number, y: number, full: string | null) {
  poly(g, [[x - 7, y - 4], [x + 7, y - 4], [x + 5.5, y + 5], [x - 5.5, y + 5]], '#a8834e');
  g.strokeStyle = 'rgba(70,45,15,0.7)';
  g.lineWidth = 0.8;
  for (let k = -4; k <= 4; k += 2.6) {
    g.beginPath();
    g.moveTo(x + k, y - 4);
    g.lineTo(x + k * 0.8, y + 5);
    g.stroke();
  }
  if (full) for (const [dx, dy] of [[-3, -5], [0, -6], [3, -5], [-1.5, -3.5], [1.5, -3.5]]) blob(g, x + dx, y + dy, 1.9, 1.9, full, 0, false);
}

/** What the figure is carrying, drawn on the shoulder, back or hip. */
function drawCarry(g: G, carry: ResourceKind, view: View, shoulder: P, hip: P, behind: boolean) {
  if (carry === 'wood') {
    // Two logs across the shoulder.
    const [x, y] = shoulder;
    for (const dy of [0, -4.5]) {
      if (view === 'side') {
        limb(g, [x - 16, y + dy - 2], [x + 10, y + dy + 1], 5.2, '#8a5d32');
        blob(g, x + 10, y + dy + 1, 2.2, 2.6, '#d9b27a', 0);
      } else {
        limb(g, [x - 11, y + dy], [x + 11, y + dy], 5.2, '#8a5d32');
        if (view === 'front') blob(g, x + 11, y + dy, 2.6, 2.6, '#d9b27a');
      }
    }
    return;
  }
  if (carry === 'food') {
    if (!behind) basket(g, hip[0] + (view === 'side' ? -2 : 9), hip[1] + 4, '#c0303e');
    return;
  }
  // Gold and stone: a heavy sack on the back.
  if (!behind && view !== 'back') return;
  const [x, y] = view === 'side' ? [shoulder[0] - 10, shoulder[1] + 8] : [shoulder[0], shoulder[1] + 9];
  blob(g, x, y, 7.5, 9, '#b39a6c');
  limb(g, [x - 1, y - 9], [x + 1, y - 12], 2.2, '#8a744c');
  const glint = carry === 'gold' ? '#f6cf3a' : '#c8c8c2';
  blob(g, x - 2, y - 5, 2.4, 1.8, glint, 0, true);
  blob(g, x + 2.5, y - 6.5, 2, 1.6, glint, 0, true);
}

function head(g: G, view: View, x: number, y: number, look: Look, team: string) {
  const r = 9;
  const skin = g.createRadialGradient(x - 3, y - 3, 1, x, y, r + 2);
  skin.addColorStop(0, shade(look.skin, 1.12));
  skin.addColorStop(1, shade(look.skin, 0.82));
  if (view === 'back') {
    blob(g, x, y, r, r, look.female ? '#e9e1cc' : look.hair);
    if (!look.female) blob(g, x, y + 4, r * 0.75, 4, shade(look.hair, 0.85), 0, false);
    return;
  }
  blob(g, x, y, r, r, skin);
  if (view === 'side') {
    // Nose, eye, ear.
    poly(g, [[x + r - 1, y - 1], [x + r + 2.6, y + 2], [x + r - 1, y + 3]], shade(look.skin, 0.95), false);
    blob(g, x + 4, y - 1, 1.2, 1.4, '#1a120c', 0, false);
    blob(g, x - 2, y + 1, 1.6, 2.4, shade(look.skin, 0.85), 0, false);
  } else {
    blob(g, x - 3.2, y - 0.5, 1.2, 1.4, '#1a120c', 0, false);
    blob(g, x + 3.2, y - 0.5, 1.2, 1.4, '#1a120c', 0, false);
    g.strokeStyle = shade(look.skin, 0.65);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x - 2, y + 4.5);
    g.lineTo(x + 2, y + 4.5);
    g.stroke();
  }
  if (look.female) {
    // Headscarf tied at the back, with a team-coloured band.
    g.fillStyle = '#e9e1cc';
    g.strokeStyle = OUT;
    g.lineWidth = 2;
    g.beginPath();
    if (view === 'side') {
      g.moveTo(x + 6, y - 5);
      g.quadraticCurveTo(x, y - 14, x - 9, y - 4);
      g.quadraticCurveTo(x - 12, y + 4, x - 7, y + 8);
      g.lineTo(x - 2, y + 2);
      g.quadraticCurveTo(x + 1, y - 4, x + 6, y - 5);
    } else {
      g.moveTo(x - 9.5, y + 2);
      g.quadraticCurveTo(x - 10, y - 12, x, y - 11);
      g.quadraticCurveTo(x + 10, y - 12, x + 9.5, y + 2);
      g.quadraticCurveTo(x + 6, y - 5, x, y - 5.5);
      g.quadraticCurveTo(x - 6, y - 5, x - 9.5, y + 2);
    }
    g.closePath();
    g.stroke();
    g.fill();
    g.strokeStyle = team;
    g.lineWidth = 1.6;
    g.beginPath();
    if (view === 'side') g.arc(x - 1, y - 2, 8, Math.PI * 1.1, Math.PI * 1.75);
    else g.arc(x, y + 1, 9, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  } else {
    // Short hair; a beard on some.
    g.fillStyle = look.hair;
    g.strokeStyle = OUT;
    g.lineWidth = 2;
    g.beginPath();
    if (view === 'side') {
      g.moveTo(x + 7, y - 4);
      g.quadraticCurveTo(x + 2, y - 13, x - 8, y - 6);
      g.quadraticCurveTo(x - 11, y + 2, x - 5, y + 5);
      g.lineTo(x - 2, y - 3);
      g.quadraticCurveTo(x + 2, y - 6, x + 7, y - 4);
    } else {
      g.moveTo(x - 9.5, y);
      g.quadraticCurveTo(x - 9, y - 12, x, y - 11);
      g.quadraticCurveTo(x + 9, y - 12, x + 9.5, y);
      g.quadraticCurveTo(x + 5, y - 6, x, y - 6.5);
      g.quadraticCurveTo(x - 5, y - 6, x - 9.5, y);
    }
    g.closePath();
    g.stroke();
    g.fill();
    if (look.hair === HAIRS[1] || look.hair === HAIRS[4]) {
      g.fillStyle = look.hair;
      g.beginPath();
      if (view === 'side') g.ellipse(x + 3, y + 6, 5, 3.5, 0.3, 0, Math.PI * 2);
      else g.ellipse(x, y + 6.5, 5.5, 3.5, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** The tunic or dress, lit from the front-left. */
function torso(g: G, view: View, sh: P, hip: P, look: Look, team: string) {
  const [sx, sy] = sh, [hx, hy] = hip;
  const half = view === 'side' ? 8.5 : 12.5;
  const hipHalf = view === 'side' ? 9.5 : 11.5;
  const hem = look.female ? 40 : 18;
  const grad = g.createLinearGradient(sx - half, 0, sx + half, 0);
  const lit = view === 'back' ? 0.9 : 1;
  grad.addColorStop(0, shade(team, 1.25 * lit));
  grad.addColorStop(0.5, shade(team, 0.95 * lit));
  grad.addColorStop(1, shade(team, 0.6 * lit));
  const flare = look.female ? 5 : 2;
  poly(g, [
    [sx - half, sy],
    [sx + half, sy],
    [hx + hipHalf + flare, hy + hem],
    [hx - hipHalf - flare, hy + hem],
  ], grad);
  // Hem trim and sleeves' cuff colour.
  g.fillStyle = look.cloth;
  g.fillRect(hx - hipHalf - flare + 1, hy + hem - 3, (hipHalf + flare) * 2 - 2, 2.5);
  if (look.female && view !== 'back') {
    // Apron.
    const ax = view === 'side' ? hx + 3 : hx;
    poly(g, [[ax - 6, hy - 6], [ax + 6, hy - 6], [ax + 8, hy + hem - 4], [ax - 8, hy + hem - 4]], '#ece4cf');
  }
  // Belt with buckle and a pouch.
  g.fillStyle = LEATHER;
  g.fillRect(hx - hipHalf - 0.5, hy - 4, hipHalf * 2 + 1, 4);
  g.fillStyle = '#d9b44a';
  g.fillRect(view === 'side' ? hx + 4 : hx - 1.5, hy - 4, 3, 4);
  if (view !== 'back') blob(g, view === 'side' ? hx - 6 : hx + 7, hy + 2, 3, 3.6, '#7a5230');
  // Collar.
  g.strokeStyle = shade(look.cloth, 1.2);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(sx - 5, sy + 1);
  g.lineTo(sx + 5, sy + 1);
  g.stroke();
}

function legs(g: G, pose: Pose, view: View, hip: P, look: Look, which: 'near' | 'far') {
  const trouser = shade(look.cloth, which === 'far' ? 0.75 : 1);
  if (view === 'side') {
    const [t, s] = which === 'near' ? pose.near : pose.far;
    const knee = seg(hip, t, 24);
    const foot = seg(knee, s, 24);
    limb(g, hip, knee, 7.5, trouser);
    limb(g, knee, foot, 6.2, trouser);
    blob(g, foot[0] + 3, foot[1] - 1, 5, 2.6, which === 'far' ? shade(BOOT, 0.8) : BOOT, 0);
    return;
  }
  // Front/back: legs side by side; the stepping leg rises and its foot comes forward.
  const side = which === 'near' ? 1 : -1;
  const lift = Math.max(0, Math.sin(((pose.near[0] * side) / 26) * (Math.PI / 2))) * 5;
  const x = hip[0] + side * 5.5;
  const knee: P = [x, hip[1] + 24 - lift];
  const foot: P = [x, -1 - lift * 0.6];
  limb(g, [x, hip[1]], knee, 7.5, trouser);
  limb(g, knee, foot, 6.2, trouser);
  blob(g, x, foot[1] - 0.5, 3.6, 2.6, BOOT, 0);
}

function arm(g: G, pose: Pose, view: View, sh: P, look: Look, team: string, which: 'near' | 'far'): { hand: P; fore: number } {
  const sleeve = shade(team, which === 'far' ? 0.6 : 0.9);
  if (view === 'side') {
    const [u, f] = which === 'near' ? pose.armN : pose.armF;
    const elbow = seg(sh, u, 17);
    const hand = seg(elbow, f, 16);
    limb(g, sh, elbow, 6, sleeve);
    limb(g, elbow, hand, 5, look.skin);
    blob(g, hand[0], hand[1], 2.6, 2.6, look.skin, 0, false);
    return { hand, fore: f };
  }
  const side = which === 'near' ? 1 : -1;
  const swing = (which === 'near' ? pose.armN[0] : pose.armF[0]) * 0.12;
  const s0: P = [sh[0] + side * 12.5, sh[1] + 2];
  const elbow: P = [s0[0] + side * 2, s0[1] + 16 - Math.abs(swing) * 0.3];
  const hand: P = [elbow[0] + side * 1, elbow[1] + 15 + swing * (view === 'front' ? 0.3 : -0.3)];
  limb(g, s0, elbow, 6, sleeve);
  limb(g, elbow, hand, 5, look.skin);
  return { hand, fore: 0 };
}

export function drawVillager(g: G, f: FigureSpec): void {
  const pose = f.anim === 'walk' ? walkPose(f.frame) : f.anim === 'work' ? workPose(f.tool, f.frame) : IDLE;
  const hip: P = [0, -48 + pose.bob];
  const sh = seg(hip, 180 + pose.lean, 30);
  const headC: P = [sh[0] + (f.view === 'side' ? 2 : 0) + Math.sin(pose.lean * D2R) * 4, sh[1] - 13];
  groundShadow(g, 15, 5);

  if (f.view === 'back' && f.carry) drawCarry(g, f.carry, f.view, sh, hip, true);
  legs(g, pose, f.view, hip, f.look, 'far');
  const farArm = f.view === 'side' ? arm(g, pose, f.view, sh, f.look, f.team, 'far') : null;
  if (f.view === 'side' && f.carry && f.carry !== 'food' && f.carry !== 'wood') drawCarry(g, f.carry, f.view, sh, hip, true);
  legs(g, pose, f.view, hip, f.look, 'near');
  torso(g, f.view, sh, hip, f.look, f.team);
  if (f.view !== 'side') {
    arm(g, pose, f.view, sh, f.look, f.team, 'far');
  }
  head(g, f.view, headC[0], headC[1], f.look, f.team);
  if (f.carry === 'wood') drawCarry(g, f.carry, f.view, sh, hip, false);
  const near = arm(g, pose, f.view, sh, f.look, f.team, 'near');
  if (f.carry === 'food') drawCarry(g, f.carry, f.view, sh, hip, false);
  if (f.view !== 'back' && f.carry && f.carry !== 'food' && f.carry !== 'wood' && f.view === 'front') {
    // Front view: the sack's top shows over the shoulder.
    blob(g, sh[0] - 9, sh[1] - 1, 4.5, 3.5, '#b39a6c');
  }
  if (f.anim === 'work' && f.tool === 'basket' && farArm) basket(g, farArm.hand[0], farArm.hand[1] + 5, '#c0303e');
  if (f.tool !== 'none' && f.view === 'side') drawTool(g, f.tool, near.hand, near.fore);
}

// ---------- scout (horse and rider) ----------

/** Leg angles [upper, lower] for a gallop cycle; phase offset per leg. */
function gallop(frame: number, offset: number, hind: boolean): [number, number] {
  const p = ((frame / 6 + offset) % 1) * Math.PI * 2;
  const s = Math.sin(p);
  const upper = (hind ? -8 : 8) + s * 32;
  // Front knees fold backward, hocks forward, as the leg comes through.
  const lower = upper + (hind ? 1 : -1) * Math.max(0, Math.cos(p)) * 45;
  return [upper, lower];
}

export function drawScout(g: G, f: FigureSpec): void {
  const moving = f.anim === 'walk';
  const bob = moving ? -Math.abs(Math.sin((f.frame / 6) * Math.PI * 2)) * 3 : 0;
  const coat = '#7b4f2b', coatDark = '#5a3619', mane = '#2a1a0e';
  groundShadow(g, f.view === 'side' ? 40 : 22, 8, 6);

  if (f.view === 'side') {
    const body: P = [0, -50 + bob];
    const legsAt: Array<{ x: number; off: number; hind: boolean; far: boolean }> = [
      { x: 20, off: 0.0, hind: false, far: true },
      { x: -20, off: 0.5, hind: true, far: true },
      { x: 24, off: 0.15, hind: false, far: false },
      { x: -16, off: 0.65, hind: true, far: false },
    ];
    const drawLeg = (l: (typeof legsAt)[number]) => {
      const [u, lo] = moving ? gallop(f.frame, l.off, l.hind) : [l.hind ? -4 : 4, 0];
      const top: P = [body[0] + l.x, body[1] + 6];
      const knee = seg(top, u, 18);
      const hoof = seg(knee, lo, 20);
      const c = l.far ? coatDark : coat;
      limb(g, top, knee, l.hind ? 9 : 7.5, c);
      limb(g, knee, hoof, 5, c);
      blob(g, hoof[0], hoof[1], 3.2, 2.2, '#2a2420', 0);
    };
    legsAt.filter((l) => l.far).forEach(drawLeg);
    // Tail.
    g.strokeStyle = mane;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(body[0] - 32, body[1] - 4);
    g.quadraticCurveTo(body[0] - 44, body[1] + 4 + (moving ? (f.frame % 2) * 3 : 0), body[0] - 40, body[1] + 20);
    g.stroke();
    // Barrel, chest and haunch.
    const grad = g.createLinearGradient(0, body[1] - 14, 0, body[1] + 14);
    grad.addColorStop(0, shade(coat, 1.2));
    grad.addColorStop(1, coatDark);
    blob(g, body[0], body[1], 32, 13, grad);
    blob(g, body[0] - 22, body[1] - 2, 13, 13, grad);
    blob(g, body[0] + 22, body[1] - 1, 12, 13, grad);
    legsAt.filter((l) => !l.far).forEach(drawLeg);
    // Neck and head.
    poly(g, [[body[0] + 20, body[1] - 8], [body[0] + 34, body[1] - 36], [body[0] + 42, body[1] - 32], [body[0] + 34, body[1] + 2]], grad);
    poly(g, [[body[0] + 33, body[1] - 40], [body[0] + 54, body[1] - 26], [body[0] + 52, body[1] - 20], [body[0] + 36, body[1] - 26]], coat);
    poly(g, [[body[0] + 35, body[1] - 41], [body[0] + 37, body[1] - 49], [body[0] + 40, body[1] - 40]], coat); // ear
    blob(g, body[0] + 41, body[1] - 33, 1.4, 1.4, '#120a04', 0, false);
    g.strokeStyle = mane;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(body[0] + 33, body[1] - 40);
    g.quadraticCurveTo(body[0] + 22, body[1] - 22, body[0] + 18, body[1] - 10);
    g.stroke();
    // Bridle.
    g.strokeStyle = LEATHER;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(body[0] + 50, body[1] - 25);
    g.lineTo(body[0] + 12, body[1] - 28);
    g.stroke();
    // Caparison in team colour with a gold hem.
    poly(g, [[body[0] - 18, body[1] - 12], [body[0] + 16, body[1] - 12], [body[0] + 20, body[1] + 10], [body[0] - 22, body[1] + 10]], f.team);
    g.fillStyle = '#e2bc4c';
    g.fillRect(body[0] - 22, body[1] + 8, 42, 2.5);
    // Rider.
    const seat: P = [body[0] - 1, body[1] - 14];
    limb(g, seat, [seat[0] + 8, seat[1] + 14], 7, '#6b5a42');
    limb(g, [seat[0] + 8, seat[1] + 14], [seat[0] + 6, seat[1] + 26], 5.5, BOOT);
    const sh: P = [seat[0] + 2, seat[1] - 26];
    const mail = g.createLinearGradient(seat[0] - 9, 0, seat[0] + 9, 0);
    mail.addColorStop(0, '#c9cfd2');
    mail.addColorStop(1, '#6f787d');
    poly(g, [[sh[0] - 8, sh[1]], [sh[0] + 8, sh[1]], [seat[0] + 9, seat[1] + 2], [seat[0] - 9, seat[1] + 2]], mail);
    poly(g, [[sh[0] - 5, sh[1] + 2], [sh[0] + 6, sh[1] + 2], [seat[0] + 6, seat[1] + 3], [seat[0] - 5, seat[1] + 3]], f.team);
    // Shield slung on the far side.
    blob(g, sh[0] - 9, sh[1] + 12, 6.5, 9, f.team);
    blob(g, sh[0] - 9, sh[1] + 12, 2, 2, '#e2bc4c', 0, false);
    // Head with helmet and nasal.
    blob(g, sh[0] + 2, sh[1] - 9, 7.5, 7.5, f.look.skin);
    poly(g, [[sh[0] - 6, sh[1] - 10], [sh[0] + 2, sh[1] - 22], [sh[0] + 10, sh[1] - 10]], STEEL);
    limb(g, [sh[0] + 7, sh[1] - 11], [sh[0] + 8, sh[1] - 4], 1.5, STEEL_DARK);
    // Arm and spear.
    const elbow = seg(sh, 40, 12);
    const hand = seg(elbow, -60, 11);
    limb(g, sh, elbow, 5, '#9aa3a8');
    limb(g, elbow, hand, 4.5, f.look.skin);
    drawTool(g, 'spear', hand, -150);
    return;
  }

  // Front and back views: the horse seen head-on or from behind, rider above.
  const body: P = [0, -48 + bob];
  const legPhase = (k: number) => (moving ? Math.sin((f.frame / 6 + k * 0.25) * Math.PI * 2) * 4 : 0);
  for (const [x, k] of [[-9, 0], [9, 2]] as const) {
    limb(g, [x, body[1] + 6], [x, -2 - Math.max(0, legPhase(k))], 6.5, coatDark);
    blob(g, x, -1.5 - Math.max(0, legPhase(k)), 3.4, 2.2, '#2a2420', 0);
  }
  const grad = g.createRadialGradient(-6, body[1] - 6, 2, 0, body[1], 22);
  grad.addColorStop(0, shade(coat, 1.25));
  grad.addColorStop(1, coatDark);
  blob(g, body[0], body[1], 17, 16, grad);
  poly(g, [[-15, body[1] - 6], [15, body[1] - 6], [16, body[1] + 12], [-16, body[1] + 12]], f.team);
  g.fillStyle = '#e2bc4c';
  g.fillRect(-16, body[1] + 10, 32, 2.5);
  if (f.view === 'front') {
    poly(g, [[-6, body[1] - 12], [6, body[1] - 12], [5, body[1] + 14], [-5, body[1] + 14]], coat);
    blob(g, 0, body[1] + 14, 5, 4, shade(coat, 0.8));
    blob(g, -3, body[1] - 4, 1.4, 1.4, '#120a04', 0, false);
    blob(g, 3, body[1] - 4, 1.4, 1.4, '#120a04', 0, false);
    poly(g, [[-6, body[1] - 12], [-8, body[1] - 20], [-3, body[1] - 13]], coat);
    poly(g, [[6, body[1] - 12], [8, body[1] - 20], [3, body[1] - 13]], coat);
  } else {
    // Tail hanging below the caparison.
    g.strokeStyle = mane;
    g.lineWidth = 4.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, body[1] + 13);
    g.quadraticCurveTo(2, body[1] + 22, 1, body[1] + 30);
    g.stroke();
  }
  const sh: P = [0, body[1] - 38];
  const mail = g.createLinearGradient(-10, 0, 10, 0);
  mail.addColorStop(0, '#c9cfd2');
  mail.addColorStop(1, '#6f787d');
  poly(g, [[-10, sh[1]], [10, sh[1]], [9, body[1] - 12], [-9, body[1] - 12]], mail);
  poly(g, [[-5, sh[1] + 2], [5, sh[1] + 2], [5, body[1] - 12], [-5, body[1] - 12]], f.team);
  if (f.view === 'back') {
    blob(g, 0, sh[1] + 13, 8, 11, f.team);
    blob(g, 0, sh[1] + 13, 2.2, 2.2, '#e2bc4c', 0, false);
  }
  blob(g, 0, sh[1] - 9, 7.5, 7.5, f.view === 'back' ? STEEL_DARK : f.look.skin);
  poly(g, [[-8, sh[1] - 10], [0, sh[1] - 22], [8, sh[1] - 10]], STEEL);
  if (f.view === 'front') limb(g, [0, sh[1] - 11], [0, sh[1] - 4], 1.6, STEEL_DARK);
  limb(g, [12, sh[1] + 4], [14, sh[1] + 18], 4.5, '#9aa3a8');
  limb(g, [14, sh[1] + 30], [14, sh[1] - 34], 2.4, HANDLE);
  poly(g, [[12, sh[1] - 34], [14, sh[1] - 44], [16, sh[1] - 34]], STEEL);
}
