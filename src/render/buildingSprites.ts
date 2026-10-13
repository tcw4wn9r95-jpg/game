// Isometric buildings, modelled with the iso3d toolkit and rendered once per zoom
// level, player colour and variant. Age I style: timber, plaster, thatch and canvas.
import type { BuildingType } from '../sim/entities';
import { Rng } from '../sim/rng';
import { type G, P, box, boxShadow, boxTop, doorAt, gableRoof, hipRoof, line3, log, mat, onGround, poly3, post, setScale, shadeColor, softShadow, windowAt } from './iso3d';
import { grade } from './materials';
import { PLAYER_COLORS } from './palette';
import type { Sprite } from './sprites';

/** n: footprint in tiles; variant: building-specific state, e.g. a farm's crop stage (0 bare .. 3 ripe). */
type Painter = (g: G, n: number, team: string, rng: Rng, variant: number) => void;

/** Units of structure drawn above the footprint's north corner. */
const RISE = 150;
const PAD = 26;

const PLASTER = { base: '#d3c39f', frame: '#4a3019', plinth: 3 };
const STONE = { base: '#9a958b', mat: 'stone' as const };
const THATCH = { color: '#bf9f55', kind: 'thatch' as const };
const SHINGLE = { color: '#8a6a48', kind: 'shingle' as const };

function flag(g: G, x: number, y: number, z: number, team: string, s = 1): void {
  const [bx, by] = P(x, y, z);
  // Turned pole with a gilt finial.
  const pole = g.createLinearGradient(bx - 0.8, 0, bx + 0.8, 0);
  pole.addColorStop(0, '#8a6a44');
  pole.addColorStop(1, '#2e1d0e');
  g.fillStyle = pole;
  g.fillRect(bx - 0.7, by - 24 * s, 1.4, 24 * s);
  g.fillStyle = '#e0b54a';
  g.beginPath();
  g.arc(bx, by - 24.5 * s, 1.2, 0, Math.PI * 2);
  g.fill();
  // Pennant rippling in the wind, lit on the bellies of its folds.
  const top = by - 22.5 * s, bot = by - 14.5 * s, len = 15 * s;
  g.beginPath();
  g.moveTo(bx + 0.6, top);
  g.bezierCurveTo(bx + len * 0.35, top - 2.2 * s, bx + len * 0.65, top + 1.8 * s, bx + len, top + 1.5 * s);
  g.lineTo(bx + len * 0.82, (top + bot) / 2 + 1 * s);
  g.lineTo(bx + len * 0.97, bot + 1.5 * s);
  g.bezierCurveTo(bx + len * 0.6, bot + 2 * s, bx + len * 0.35, bot - 2 * s, bx + 0.6, bot);
  g.closePath();
  const cloth = g.createLinearGradient(bx, 0, bx + len, 0);
  cloth.addColorStop(0, shadeColor(team, 0.75));
  cloth.addColorStop(0.3, shadeColor(team, 1.2));
  cloth.addColorStop(0.55, shadeColor(team, 0.7));
  cloth.addColorStop(0.8, shadeColor(team, 1.1));
  cloth.addColorStop(1, shadeColor(team, 0.8));
  g.fillStyle = cloth;
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 0.4;
  g.stroke();
}

/** A heraldic banner hung on a wall (u along the wall, v up) with a gold charge and fringe. */
function banner(g: G, u: number, v: number, team: string): void {
  g.fillStyle = '#3a2614';
  g.fillRect(u - 3.8, v - 0.6, 7.6, 0.9);
  const cloth = g.createLinearGradient(u - 3, 0, u + 3, 0);
  cloth.addColorStop(0, shadeColor(team, 1.15));
  cloth.addColorStop(0.5, shadeColor(team, 0.85));
  cloth.addColorStop(0.75, shadeColor(team, 1.05));
  cloth.addColorStop(1, shadeColor(team, 0.7));
  g.fillStyle = cloth;
  g.beginPath();
  g.moveTo(u - 3, v);
  g.lineTo(u + 3, v);
  g.lineTo(u + 3, v - 11);
  g.lineTo(u, v - 9);
  g.lineTo(u - 3, v - 11);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(20,10,0,0.45)';
  g.lineWidth = 0.4;
  g.stroke();
  // Gold chevron and border.
  g.strokeStyle = '#e2bc4c';
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(u - 2, v - 3);
  g.lineTo(u, v - 5.5);
  g.lineTo(u + 2, v - 3);
  g.stroke();
  g.fillStyle = '#e2bc4c';
  g.fillRect(u - 3, v - 1.4, 6, 0.8);
}

/**
 * Trodden earth around a building, with a soft, irregular edge. Painted first,
 * onto the empty sprite, so its alpha can be feathered with destination-in.
 */
function groundPatch(g: G, n: number, color: string, spread = 0.2): void {
  const c = /rgba?\((\d+),(\d+),(\d+)/.exec(color.replace(/\s/g, ''));
  const hex = c ? '#' + [c[1], c[2], c[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('') : color;
  onGround(g, 0, 0, () => {
    const m = n * 32, pad = spread * 32;
    g.fillStyle = mat(g, 'earth', hex, 2);
    g.fillRect(-pad, -pad, m + pad * 2, m + pad * 2);
    g.globalCompositeOperation = 'destination-in';
    const r = m / 2 + pad;
    const fade = g.createRadialGradient(m / 2, m / 2, r * 0.55, m / 2, m / 2, r * 1.05);
    fade.addColorStop(0, 'rgba(0,0,0,0.95)');
    fade.addColorStop(0.6, 'rgba(0,0,0,0.6)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(-m, -m, m * 3, m * 3);
    g.globalCompositeOperation = 'source-over';
  });
}

function crate(g: G, x: number, y: number, s = 0.35): void {
  softShadow(g, [[x, y, 0], [x + s + 0.12, y - 0.08, 0], [x + s + 0.12, y + s, 0], [x, y + s, 0]], 2, 0.45);
  box(g, x, y, x + s, y + s, s * 30, { base: '#9a7040', mat: 'planks' }, {}, 17);
  boxTop(g, x, y, x + s, y + s, s * 30, 'planks', '#a57a48');
}

/** An oak barrel with iron hoops. */
function barrel(g: G, x: number, y: number, r = 3.4, h = 9): void {
  const [bx, by] = P(x, y, 0);
  g.save();
  g.fillStyle = 'rgba(8,12,4,0.4)';
  g.beginPath();
  g.ellipse(bx + 2.5, by, r * 1.3, r * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(bx - r, by);
  g.bezierCurveTo(bx - r * 1.2, by - h * 0.35, bx - r * 1.2, by - h * 0.65, bx - r, by - h);
  g.lineTo(bx + r, by - h);
  g.bezierCurveTo(bx + r * 1.2, by - h * 0.65, bx + r * 1.2, by - h * 0.35, bx + r, by);
  g.ellipse(bx, by, r, r * 0.45, 0, 0, Math.PI);
  g.closePath();
  g.fillStyle = mat(g, 'woodV', '#7a5230', 19);
  g.fill();
  const shade = g.createLinearGradient(bx - r, 0, bx + r, 0);
  shade.addColorStop(0, 'rgba(255,230,190,0.25)');
  shade.addColorStop(0.4, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(10,6,2,0.6)');
  g.fillStyle = shade;
  g.fill();
  g.strokeStyle = '#2d2925';
  g.lineWidth = 0.8;
  for (const f of [0.18, 0.82]) {
    g.beginPath();
    g.ellipse(bx, by - h * f, r * 1.12, r * 0.45, 0, 0, Math.PI);
    g.stroke();
  }
  g.fillStyle = mat(g, 'woodH', '#8a6038', 20);
  g.beginPath();
  g.ellipse(bx, by - h, r, r * 0.45, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(20,10,0,0.55)';
  g.lineWidth = 0.5;
  g.stroke();
  g.restore();
}

/** A tied grain sack slumped on the ground. */
function sack(g: G, x: number, y: number, s = 1): void {
  const [bx, by] = P(x, y, 0);
  g.fillStyle = 'rgba(8,12,4,0.35)';
  g.beginPath();
  g.ellipse(bx + 2, by, 4.5 * s, 1.8 * s, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(bx - 3.8 * s, by);
  g.bezierCurveTo(bx - 5 * s, by - 5 * s, bx - 2 * s, by - 8 * s, bx - 0.8 * s, by - 8.5 * s);
  g.lineTo(bx + 0.8 * s, by - 8.5 * s);
  g.bezierCurveTo(bx + 2 * s, by - 8 * s, bx + 5 * s, by - 5 * s, bx + 3.8 * s, by);
  g.closePath();
  g.fillStyle = mat(g, 'canvas', '#bba57a', 21);
  g.fill();
  const sh = g.createRadialGradient(bx - 1.5 * s, by - 5 * s, 0.5, bx, by - 3 * s, 6 * s);
  sh.addColorStop(0, 'rgba(255,245,220,0.3)');
  sh.addColorStop(1, 'rgba(20,12,4,0.5)');
  g.fillStyle = sh;
  g.fill();
  g.strokeStyle = '#6b5232';
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(bx - 1.2 * s, by - 7.6 * s);
  g.lineTo(bx + 1.2 * s, by - 7.6 * s);
  g.stroke();
}

/** A neat stack of split firewood, end grain facing the viewer. */
function woodpile(g: G, x: number, y: number, rows = 3, cols = 4): void {
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols - (r % 2); k++) log(g, [x + k * 0.11 + (r % 2) * 0.055, y - 0.45], [x + k * 0.11 + (r % 2) * 0.055, y], 1.5 + r * 2.6, 1.3);
}

function oreHeap(g: G, x: number, y: number, color: string, rng: Rng): void {
  const [cx, cy] = P(x, y, 0);
  g.fillStyle = 'rgba(8,12,4,0.38)';
  g.beginPath();
  g.ellipse(cx + 2, cy, 9, 3.5, 0, 0, Math.PI * 2);
  g.fill();
  for (let k = 0; k < 14; k++) {
    const a = rng.next() * Math.PI * 2, d = rng.next() * 0.22 * (1 - k / 18);
    const [px, py] = P(x + Math.cos(a) * d, y + Math.sin(a) * d, 0);
    const r = 1.4 + rng.next() * 1.4;
    const yy = py - 1 - k * 0.35;
    const grad = g.createRadialGradient(px - r * 0.4, yy - r * 0.5, 0.2, px, yy, r * 1.2);
    grad.addColorStop(0, shadeColor(color, 1.35));
    grad.addColorStop(0.5, shadeColor(color, 0.85 + rng.next() * 0.2));
    grad.addColorStop(1, shadeColor(color, 0.4));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(px - r, yy);
    g.lineTo(px - r * 0.4, yy - r * 0.9);
    g.lineTo(px + r * 0.6, yy - r * 0.8);
    g.lineTo(px + r, yy + r * 0.1);
    g.lineTo(px + r * 0.2, yy + r * 0.7);
    g.lineTo(px - r * 0.7, yy + r * 0.6);
    g.closePath();
    g.fill();
  }
}

/** A hay bale, banded with twine. */
function hayBale(g: G, x: number, y: number): void {
  box(g, x, y, x + 0.42, y + 0.26, 7, { base: '#c9ad62', mat: 'plaster' }, {}, 23);
  boxTop(g, x, y, x + 0.42, y + 0.26, 7, 'thatch', '#d6bd70');
  line3(g, [x + 0.14, y + 0.26, 0], [x + 0.14, y + 0.26, 7], 'rgba(90,60,25,0.8)', 0.5);
  line3(g, [x + 0.3, y + 0.26, 0], [x + 0.3, y + 0.26, 7], 'rgba(90,60,25,0.8)', 0.5);
}

/** Open canvas shelter on log posts with a team-coloured valance (camps). */
function shelter(g: G, x0: number, y0: number, x1: number, y1: number, h: number, team: string): void {
  boxShadow(g, x0, y0, x1, y1, h + 14);
  // Shaded interior floor so the open sides read as shade.
  softShadow(g, [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], 4, 0.45);
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) post(g, x, y, h, 2.6);
  post(g, (x0 + x1) / 2, y1, h, 2.2);
  // Ropes guying the corners.
  for (const [x, y, dx, dy] of [[x0, y1, -0.25, 0.25], [x1, y1, 0.3, 0.25]] as const) line3(g, [x, y, h], [x + dx, y + dy, 0], 'rgba(200,180,140,0.7)', 0.4);
  hipRoof(g, x0, y0, x1, y1, h, 14, { color: '#d8c79e', kind: 'canvas', trim: team }, 0.1);
}

const PAINTERS: Record<BuildingType, Painter> = {
  town_center: (g, n, team) => {
    groundPatch(g, n, '#7d6444', 0.35);
    boxShadow(g, 0.3, 0.3, n - 0.3, n - 0.3, 84);
    // Dressed-stone plinth with a flagged terrace, then the timber hall.
    box(g, 0.3, 0.3, n - 0.3, n - 0.3, 6, STONE, {}, 31);
    boxTop(g, 0.3, 0.3, n - 0.3, n - 0.3, 6, 'stone', '#9d978b');
    // Steps up to the door.
    for (let k = 0; k < 3; k++) {
      const y = n - 0.3 + 0.12 * (2 - k);
      box(g, n / 2 - 0.45, y - 0.12, n / 2 + 0.45, y, 2 * (k + 1), STONE, {}, 40 + k);
    }
    g.save();
    g.translate(0, -6);
    box(g, 0.5, 0.6, n - 0.6, n - 0.5, 34, PLASTER, {
      left: (len) => {
        doorAt(g, len / 2, 9, 14);
        for (const u of [len * 0.18, len * 0.34, len * 0.66, len * 0.82]) windowAt(g, u, 17, 4.5, 6);
        banner(g, len * 0.26, 29, team);
        banner(g, len * 0.74, 29, team);
      },
      right: (len) => {
        for (const u of [len * 0.2, len * 0.4, len * 0.6, len * 0.8]) windowAt(g, u, 17, 4.5, 6);
      },
    }, 33);
    gableRoof(g, 0.5, 0.6, n - 0.6, n - 0.5, 34, 30, THATCH, 'x', 0.2, 11);
    // Central bell tower rising through the roof, with an open belfry.
    const t0 = n / 2 - 0.55, t1 = n / 2 + 0.55;
    box(g, t0, t0, t1, t1, 84, PLASTER, {
      left: (len) => {
        windowAt(g, len / 2, 50, 4, 6);
        g.fillStyle = '#1a0f07';
        g.fillRect(len * 0.25, 68, len * 0.5, 10);
        g.fillStyle = '#c9a24a';
        g.beginPath();
        g.arc(len / 2, 74, 2.6, Math.PI, 0);
        g.fill();
      },
      right: (len) => {
        windowAt(g, len / 2, 50, 4, 6);
        g.fillStyle = '#1a0f07';
        g.fillRect(len * 0.25, 68, len * 0.5, 10);
      },
    }, 35);
    hipRoof(g, t0, t0, t1, t1, 84, 26, { color: '#b9a46a', kind: 'shingle' }, 0.15, 5);
    flag(g, n / 2, n / 2, 110, team, 1.2);
    // Chimney with a wisp of smoke.
    box(g, n - 1.3, 1.0, n - 1.0, 1.3, 64, STONE, {}, 37);
    boxTop(g, n - 1.3, 1.0, n - 1.0, 1.3, 64, 'stone', '#5a544c');
    const [sx, sy] = P(n - 1.15, 1.15, 66);
    for (let k = 0; k < 5; k++) {
      const grad = g.createRadialGradient(sx + k * 2, sy - k * 5, 0, sx + k * 2, sy - k * 5, 3 + k * 1.4);
      grad.addColorStop(0, `rgba(220,220,215,${0.3 - k * 0.05})`);
      grad.addColorStop(1, 'rgba(220,220,215,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(sx + k * 2, sy - k * 5, 3 + k * 1.4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // Stores by the door.
    barrel(g, n / 2 - 1.05, n - 0.12);
    barrel(g, n / 2 - 0.75, n - 0.02, 3, 8);
    sack(g, n / 2 + 0.8, n - 0.05);
    sack(g, n / 2 + 1.05, n - 0.15, 0.85);
    crate(g, 0.05, n - 0.55, 0.32);
  },
  house: (g, n, team) => {
    groundPatch(g, n, '#806a4a', 0.15);
    boxShadow(g, 0.25, 0.25, n - 0.2, n - 0.2, 44);
    box(g, 0.25, 0.3, n - 0.25, n - 0.2, 22, { ...PLASTER, plinth: 4 }, {
      left: (len) => {
        doorAt(g, len * 0.33, 6.5, 11);
        windowAt(g, len * 0.72, 9, 4, 5);
      },
      right: (len) => windowAt(g, len / 2, 9, 4, 5),
    }, 41);
    gableRoof(g, 0.25, 0.3, n - 0.25, n - 0.2, 22, 20, THATCH, 'y', 0.16, 3);
    box(g, 0.45, 0.55, 0.72, 0.82, 50, STONE, {}, 43);
    boxTop(g, 0.45, 0.55, 0.72, 0.82, 50, 'stone', '#4e4943');
    flag(g, n - 0.3, 0.3, 30, team, 0.7);
    woodpile(g, n - 0.05, n * 0.62, 2, 3);
    barrel(g, 0.15, n - 0.05, 2.8, 7.5);
  },
  lumber_camp: (g, n, team) => {
    groundPatch(g, n, '#7a6243', 0.25);
    // Sawdust and wood chips.
    onGround(g, 0, 0, () => {
      for (let k = 0; k < 70; k++) {
        const u = ((k * 37) % 61) / 61 * n * 32, v = ((k * 53) % 59) / 59 * n * 32;
        g.fillStyle = k % 3 ? 'rgba(222,190,130,0.7)' : 'rgba(160,120,70,0.7)';
        g.fillRect(u, v, 1.2, 0.6);
      }
    });
    shelter(g, 0.2, 0.2, n * 0.62, n - 0.25, 22, team);
    // Stacked logs, a sawhorse with a log on it and an axe in the chopping block.
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3 - r; k++) log(g, [n * 0.66 + k * 0.17 + r * 0.085, 0.3], [n * 0.66 + k * 0.17 + r * 0.085, 1.3], 1.8 + r * 3.3, 1.7);
    crate(g, n * 0.74, n * 0.72);
    line3(g, [n * 0.24, n * 0.88, 0], [n * 0.27, n * 0.85, 8], '#4a301a', 1.1);
    line3(g, [n * 0.3, n * 0.82, 0], [n * 0.27, n * 0.85, 8], '#4a301a', 1.1);
    line3(g, [n * 0.44, n * 0.88, 0], [n * 0.47, n * 0.85, 8], '#4a301a', 1.1);
    line3(g, [n * 0.5, n * 0.82, 0], [n * 0.47, n * 0.85, 8], '#4a301a', 1.1);
    log(g, [n * 0.18, n * 0.85], [n * 0.55, n * 0.85], 8.5, 1.5);
    const [bx, by] = P(n * 0.12, n * 0.62, 0);
    g.fillStyle = mat(g, 'woodV', '#6b4626', 13);
    g.fillRect(bx - 3, by - 5, 6, 5);
    g.fillStyle = '#d9b27a';
    g.beginPath();
    g.ellipse(bx, by - 5, 3, 1.3, 0, 0, Math.PI * 2);
    g.fill();
    line3(g, [n * 0.12, n * 0.62, 5], [n * 0.08, n * 0.6, 13], '#7a5430', 0.9);
    poly3(g, [[n * 0.12, n * 0.62, 5.5], [n * 0.15, n * 0.64, 6.5], [n * 0.14, n * 0.64, 8.5], [n * 0.11, n * 0.61, 7]], '#9aa3a8');
  },
  mining_camp: (g, n, team, rng) => {
    groundPatch(g, n, '#7b7266', 0.25);
    shelter(g, 0.2, 0.2, n * 0.62, n - 0.25, 22, team);
    // Ore cart on spoked wheels, heaped with gold; a pile of quarried stone.
    boxShadow(g, n * 0.68, n * 0.2, n * 0.95, n * 0.5, 14);
    box(g, n * 0.68, n * 0.2, n * 0.95, n * 0.5, 9, { base: '#7a5634', mat: 'planks' }, {}, 51);
    poly3(g, [[n * 0.68, n * 0.2, 9], [n * 0.95, n * 0.2, 9], [n * 0.95, n * 0.5, 9], [n * 0.68, n * 0.5, 9]], '#3a2a1a');
    oreHeap(g, n * 0.8, n * 0.33, '#f2c230', rng);
    for (const x of [n * 0.72, n * 0.9]) {
      const [wx, wy] = P(x, n * 0.5, 3.2);
      g.strokeStyle = '#3a2614';
      g.lineWidth = 1.1;
      g.beginPath();
      g.ellipse(wx, wy, 1.6, 3.2, -0.45, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 0.4;
      for (let a = 0; a < 3; a++) {
        g.beginPath();
        g.moveTo(wx + Math.cos(a) * 1.5, wy + Math.sin(a) * 3);
        g.lineTo(wx - Math.cos(a) * 1.5, wy - Math.sin(a) * 3);
        g.stroke();
      }
    }
    oreHeap(g, n * 0.78, n * 0.8, '#a9a9a2', rng);
    // Cut blocks and pickaxes leaning on the crate.
    for (const [x, y] of [[n * 0.95, n * 0.68], [n * 1.0, n * 0.82]] as const) {
      box(g, x - 0.15, y - 0.12, x, y, 4.5, STONE, {}, 53);
      boxTop(g, x - 0.15, y - 0.12, x, y, 4.5, 'stone', '#b0aaa0');
    }
    crate(g, n * 0.3, n * 0.82, 0.3);
    line3(g, [n * 0.46, n * 0.92, 0], [n * 0.4, n * 0.88, 13], '#7a5430', 0.9);
    line3(g, [n * 0.36, n * 0.86, 13], [n * 0.45, n * 0.9, 12.5], '#6d777d', 1.2);
  },
  mill: (g, n, team) => {
    groundPatch(g, n, '#7f6a4a', 0.2);
    boxShadow(g, 0.3, 0.3, n - 0.3, n - 0.3, 64);
    box(g, 0.3, 0.35, n - 0.3, n - 0.3, 18, STONE, {
      left: (len) => doorAt(g, len * 0.4, 6, 10),
    }, 61);
    box(g, 0.45, 0.5, n - 0.45, n - 0.45, 40, { ...PLASTER, plinth: 0 }, {
      left: (len) => windowAt(g, len * 0.5, 26, 4, 5),
      right: (len) => windowAt(g, len / 2, 26, 4, 5),
    }, 63);
    hipRoof(g, 0.45, 0.5, n - 0.45, n - 0.45, 40, 22, THATCH, 0.14, 9);
    // Four lattice sails clothed in canvas on the south-west face.
    const [hx, hy] = P(n / 2 - 0.1, n - 0.45, 46);
    g.save();
    g.translate(hx, hy);
    g.rotate(0.3);
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.fillStyle = mat(g, 'woodV', '#4a3218', 65);
      g.fillRect(-0.9, 0, 1.8, 35);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0.4, 0, 0.5, 35);
      g.fillStyle = mat(g, 'canvas', '#e6dcc4', 66);
      g.fillRect(1.3, 8, 7.5, 26);
      const sail = g.createLinearGradient(1.3, 0, 8.8, 0);
      sail.addColorStop(0, 'rgba(255,250,235,0.25)');
      sail.addColorStop(1, 'rgba(40,30,15,0.3)');
      g.fillStyle = sail;
      g.fillRect(1.3, 8, 7.5, 26);
      g.strokeStyle = 'rgba(70,50,25,0.75)';
      g.lineWidth = 0.45;
      for (let v = 11; v < 34; v += 3.6) {
        g.beginPath();
        g.moveTo(1.3, v);
        g.lineTo(8.8, v);
        g.stroke();
      }
      g.strokeRect(1.3, 8, 7.5, 26);
    }
    g.restore();
    const hub = g.createRadialGradient(hx - 0.8, hy - 0.8, 0.2, hx, hy, 3);
    hub.addColorStop(0, '#8a6a44');
    hub.addColorStop(1, '#2a1a0c');
    g.fillStyle = hub;
    g.beginPath();
    g.arc(hx, hy, 2.8, 0, Math.PI * 2);
    g.fill();
    sack(g, n - 0.25, n - 0.1);
    sack(g, n - 0.05, n - 0.35, 0.9);
    sack(g, n - 0.12, n + 0.05, 0.8);
    hayBale(g, 0.0, n - 0.4);
    flag(g, 0.4, 0.4, 40, team, 0.7);
  },
  barracks: (g, n, team) => {
    groundPatch(g, n, '#836748', 0.2);
    boxShadow(g, 0.2, 0.2, n - 0.2, n * 0.55, 50);
    box(g, 0.2, 0.2, n - 0.2, n * 0.55, 28, { ...PLASTER, plinth: 5 }, {
      left: (len) => {
        doorAt(g, len / 2, 9, 14);
        for (const u of [len * 0.18, len * 0.82]) windowAt(g, u, 14, 4.5, 6);
        banner(g, len * 0.33, 24, team);
        banner(g, len * 0.67, 24, team);
      },
      right: (len) => windowAt(g, len / 2, 14, 4.5, 6),
    }, 71);
    gableRoof(g, 0.2, 0.2, n - 0.2, n * 0.55, 28, 22, SHINGLE, 'x', 0.16, 21);
    // Training yard: sanded ground, a post-and-rail fence along the front.
    for (let x = 0.1; x <= n - 0.1; x += 0.45) post(g, x, n - 0.1, 9, 1.6);
    for (const z of [7, 3.5]) {
      line3(g, [0.1, n - 0.1, z], [n - 0.1, n - 0.1, z], '#4e331b', 1.5);
      line3(g, [0.1, n - 0.1, z + 0.4], [n - 0.1, n - 0.1, z + 0.4], 'rgba(255,220,170,0.25)', 0.4);
    }
    // Straw practice dummy on a post.
    const [dx, dy] = P(0.8, n * 0.8, 0);
    g.fillStyle = 'rgba(8,12,4,0.35)';
    g.beginPath();
    g.ellipse(dx + 3, dy, 5, 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = mat(g, 'woodV', '#5a3d22', 72);
    g.fillRect(dx - 1, dy - 19, 2, 19);
    g.fillRect(dx - 6.5, dy - 14.5, 13, 1.6);
    const straw = g.createRadialGradient(dx - 1.5, dy - 12, 0.5, dx, dy - 10, 6);
    straw.addColorStop(0, '#ead28c');
    straw.addColorStop(1, '#8e7638');
    g.fillStyle = straw;
    g.beginPath();
    g.ellipse(dx, dy - 10, 3.8, 5.4, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(dx, dy - 18.5, 2.9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6b5232';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(dx - 3.5, dy - 8);
    g.lineTo(dx + 3.5, dy - 8);
    g.stroke();
    // Weapon rack: spears with steel heads and team shields.
    line3(g, [n * 0.58, n * 0.78, 14], [n * 1.0, n * 0.78, 14], '#4e331b', 1.2);
    for (let k = 0; k < 4; k++) {
      line3(g, [n * 0.62 + k * 0.12, n * 0.78, 0], [n * 0.6 + k * 0.12, n * 0.78, 22], '#7a5430', 1.1);
      poly3(g, [[n * 0.595 + k * 0.12, n * 0.78, 22], [n * 0.605 + k * 0.12, n * 0.78, 22], [n * 0.6 + k * 0.12, n * 0.78, 26]], '#c9d0d4', null);
    }
    for (const x of [n * 0.66, n * 0.86]) {
      const [sx, sy] = P(x, n * 0.8, 8);
      const sh = g.createRadialGradient(sx - 1.5, sy - 1.5, 0.3, sx, sy, 4.8);
      sh.addColorStop(0, shadeColor(team, 1.35));
      sh.addColorStop(1, shadeColor(team, 0.55));
      g.fillStyle = sh;
      g.beginPath();
      g.ellipse(sx, sy, 4, 4.4, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#8a6a30';
      g.lineWidth = 0.7;
      g.stroke();
      const boss = g.createRadialGradient(sx - 0.4, sy - 0.4, 0.1, sx, sy, 1.4);
      boss.addColorStop(0, '#fff2c0');
      boss.addColorStop(1, '#8a6a20');
      g.fillStyle = boss;
      g.beginPath();
      g.arc(sx, sy, 1.3, 0, Math.PI * 2);
      g.fill();
    }
    barrel(g, n - 0.15, n * 0.6, 2.8, 7.5);
    flag(g, n - 0.25, 0.25, 40, team, 1);
  },
  farm: (g, n, _team, rng, stage) => {
    // Ploughed field: ridged furrows run along x; wheat thins as it is harvested.
    onGround(g, 0, 0, () => {
      const W = n * 32;
      g.fillStyle = mat(g, 'earth', '#6e5232', 81);
      g.fillRect(0, 0, W, W);
      for (let v = 2; v < W - 1; v += 3.2) {
        const ridge = g.createLinearGradient(0, v, 0, v + 3.2);
        ridge.addColorStop(0, 'rgba(230,190,140,0.28)');
        ridge.addColorStop(0.45, 'rgba(0,0,0,0)');
        ridge.addColorStop(1, 'rgba(30,18,6,0.45)');
        g.fillStyle = ridge;
        g.fillRect(1, v, W - 2, 3.2);
      }
      // Grassy margin.
      g.strokeStyle = 'rgba(90,110,40,0.55)';
      g.lineWidth = 1.6;
      g.strokeRect(0.8, 0.8, W - 1.6, W - 1.6);
    });
    const ripe = ['#6f8a34', '#a9a03c', '#cfae45', '#e2c155'][stage];
    const tip = ['#8fae48', '#d9c35c', '#f0d478', '#fbe08e'][stage];
    const fill = [0.12, 0.45, 0.75, 1][stage];
    for (let y = 0.12; y < n - 0.08; y += 0.1)
      for (let x = 0.08; x < n - 0.06; x += 0.085) {
        if (rng.next() > fill) continue;
        const [sx, sy] = P(x + (rng.next() - 0.5) * 0.03, y, 0);
        const h = 3 + stage * 2.2 + rng.next() * 2.2;
        const lean = (rng.next() - 0.35) * 1.8;
        g.strokeStyle = shadeColor(ripe, 0.75 + rng.next() * 0.4);
        g.lineWidth = 0.55;
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo(sx + lean * 0.3, sy - h * 0.6, sx + lean, sy - h);
        g.stroke();
        if (stage > 0) {
          // Ear of grain, lit on its left.
          g.fillStyle = shadeColor(tip, 0.85 + rng.next() * 0.3);
          g.beginPath();
          g.ellipse(sx + lean, sy - h - 1, 0.65, 1.5, lean * 0.15, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,250,220,0.35)';
          g.fillRect(sx + lean - 0.55, sy - h - 2, 0.4, 1.4);
        }
      }
    for (const [x, y] of [[0, 0], [n, 0], [0, n], [n, n], [n / 2, n], [n, n / 2]]) post(g, x, y, 7, 1.5);
    for (const z of [5, 2.5]) {
      line3(g, [0, n, z], [n, n, z], '#4e331b', 0.9);
      line3(g, [n, 0, z], [n, n, z], '#4e331b', 0.9);
    }
  },
  archery_range: (g, n, team) => {
    groundPatch(g, n, '#84694a', 0.2);
    // Open-fronted range house at the back, shooting lane and straw butts in front.
    boxShadow(g, 0.2, 0.2, n - 0.2, n * 0.45, 40);
    box(g, 0.2, 0.2, n - 0.2, n * 0.45, 22, { ...PLASTER, plinth: 4 }, {
      left: (len) => {
        for (const u of [len * 0.25, len * 0.5, len * 0.75]) {
          g.fillStyle = '#1e130a';
          g.fillRect(u - 4.5, 4, 9, 12);
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.fillRect(u - 4.5, 13, 9, 3);
        }
        banner(g, len * 0.12, 20, team);
        banner(g, len * 0.88, 20, team);
      },
      right: (len) => windowAt(g, len / 2, 10, 4, 5),
    }, 91);
    gableRoof(g, 0.2, 0.2, n - 0.2, n * 0.45, 22, 18, SHINGLE, 'x', 0.16, 23);
    // Straw butts with painted targets on easels.
    for (const x of [n * 0.25, n * 0.55, n * 0.85]) {
      const [tx, ty] = P(x, n * 0.85, 0);
      g.fillStyle = 'rgba(8,12,4,0.35)';
      g.beginPath();
      g.ellipse(tx + 3, ty, 6, 2, 0, 0, Math.PI * 2);
      g.fill();
      line3(g, [x - 0.08, n * 0.88, 0], [x, n * 0.85, 13], '#5a3d22', 1);
      line3(g, [x + 0.08, n * 0.82, 0], [x, n * 0.85, 13], '#5a3d22', 1);
      const straw = g.createRadialGradient(tx - 1.5, ty - 11, 0.5, tx, ty - 10, 6);
      straw.addColorStop(0, '#ecd590');
      straw.addColorStop(1, '#9a7c3a');
      g.fillStyle = straw;
      g.beginPath();
      g.ellipse(tx, ty - 10, 5, 5.6, 0, 0, Math.PI * 2);
      g.fill();
      for (const [r, c] of [[3.8, '#f2ece0'], [2.6, team], [1.4, '#f2ece0'], [0.6, '#b8352a']] as const) {
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(tx, ty - 10, r, r * 1.1, 0, 0, Math.PI * 2);
        g.fill();
      }
      // A couple of arrows stuck in.
      g.strokeStyle = '#3a2614';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(tx - 1, ty - 11);
      g.lineTo(tx - 6, ty - 12.5);
      g.moveTo(tx + 1.2, ty - 9);
      g.lineTo(tx - 4, ty - 9.5);
      g.stroke();
    }
    barrel(g, 0.1, n * 0.6, 2.6, 7);
    flag(g, n - 0.25, 0.25, 34, team, 0.9);
  },
  stable: (g, n, team) => {
    groundPatch(g, n, '#806446', 0.25);
    // Long timber stable with stall doors, a hay loft and a paddock in front.
    boxShadow(g, 0.2, 0.2, n - 0.2, n * 0.5, 44);
    box(g, 0.2, 0.2, n - 0.2, n * 0.5, 24, { base: '#7a5634', mat: 'planks', plinth: 3 }, {
      left: (len) => {
        for (const u of [len * 0.2, len * 0.4, len * 0.6, len * 0.8]) {
          // Dutch stall doors, top half open with a dark interior.
          g.fillStyle = mat(g, 'woodV', '#5a3a1c', 93);
          g.fillRect(u - 3.5, 0.5, 7, 6);
          g.fillStyle = '#140c06';
          g.fillRect(u - 3.5, 6.5, 7, 6.5);
          g.strokeStyle = '#2a1a0c';
          g.lineWidth = 0.5;
          g.strokeRect(u - 3.5, 0.5, 7, 12.5);
          g.beginPath();
          g.moveTo(u - 3.5, 0.5);
          g.lineTo(u + 3.5, 6.5);
          g.stroke();
        }
        g.fillStyle = '#140c06';
        g.fillRect(len / 2 - 3, 16, 6, 5);
        g.fillStyle = '#d6bd70';
        g.fillRect(len / 2 - 3, 16, 6, 2.2);
        banner(g, len * 0.1, 22, team);
      },
      right: (len) => windowAt(g, len / 2, 12, 4, 5),
    }, 95);
    gableRoof(g, 0.2, 0.2, n - 0.2, n * 0.5, 24, 20, THATCH, 'x', 0.18, 25);
    // Paddock rails and a water trough.
    for (let x = 0.1; x <= n - 0.1; x += 0.5) post(g, x, n - 0.1, 8, 1.5);
    for (let y = n * 0.55; y <= n - 0.1; y += 0.5) post(g, n - 0.1, y, 8, 1.5);
    for (const z of [6.5, 3.2]) {
      line3(g, [0.1, n - 0.1, z], [n - 0.1, n - 0.1, z], '#4e331b', 1.2);
      line3(g, [n - 0.1, n * 0.55, z], [n - 0.1, n - 0.1, z], '#4e331b', 1.2);
    }
    box(g, n * 0.25, n * 0.72, n * 0.55, n * 0.8, 5, { base: '#6b4626', mat: 'planks' }, {}, 97);
    poly3(g, [[n * 0.26, n * 0.73, 4.6], [n * 0.54, n * 0.73, 4.6], [n * 0.54, n * 0.79, 4.6], [n * 0.26, n * 0.79, 4.6]], '#3f6a7a', null);
    hayBale(g, n * 0.68, n * 0.62);
    hayBale(g, n * 0.72, n * 0.72);
    flag(g, n - 0.25, 0.25, 40, team, 1);
  },
  monastery: (g, n, team) => {
    groundPatch(g, n, '#8a7a5e', 0.2);
    // Stone chapel with a bell-cote, round-arched windows and a walled garth.
    boxShadow(g, 0.3, 0.3, n - 0.3, n * 0.6, 80);
    box(g, 0.3, 0.3, n - 0.3, n * 0.6, 34, STONE, {
      left: (len) => {
        doorAt(g, len / 2, 8, 15);
        for (const u of [len * 0.2, len * 0.8]) {
          g.fillStyle = '#1c140c';
          g.beginPath();
          g.moveTo(u - 2.2, 14);
          g.lineTo(u - 2.2, 22);
          g.arc(u, 22, 2.2, Math.PI, 0, true);
          g.lineTo(u + 2.2, 14);
          g.closePath();
          g.fill();
          g.fillStyle = 'rgba(80,140,220,0.35)';
          g.fill();
        }
        // Rose window.
        g.fillStyle = '#1c140c';
        g.beginPath();
        g.arc(len / 2, 26, 3.4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = shadeColor(team, 1.2);
        g.lineWidth = 0.6;
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          g.moveTo(len / 2, 26);
          g.lineTo(len / 2 + Math.cos(k) * 3, 26 + Math.sin(k) * 3);
          g.stroke();
        }
      },
      right: (len) => {
        for (const u of [len * 0.3, len * 0.7]) windowAt(g, u, 16, 3.5, 7);
      },
    }, 101);
    gableRoof(g, 0.3, 0.3, n - 0.3, n * 0.6, 34, 26, { color: '#8a5a40', kind: 'shingle' }, 'y', 0.14, 27);
    // Bell-cote on the gable with a cross.
    const bx = n / 2, by = n * 0.6;
    box(g, bx - 0.2, by - 0.1, bx + 0.2, by + 0.05, 74, STONE, {
      left: (len) => {
        g.fillStyle = '#140c06';
        g.fillRect(len * 0.2, 62, len * 0.6, 8);
        g.fillStyle = '#c9a24a';
        g.beginPath();
        g.arc(len / 2, 66, 2, Math.PI, 0);
        g.fill();
      },
    }, 103);
    const [cx, cy] = P(bx, by, 74);
    g.fillStyle = '#d9b44a';
    g.fillRect(cx - 0.6, cy - 12, 1.2, 12);
    g.fillRect(cx - 3, cy - 9, 6, 1.2);
    // Low cloister wall and a cypress in the garth.
    for (const [a, b] of [[[0.2, n - 0.1], [n - 0.1, n - 0.1]], [[n - 0.1, n * 0.62], [n - 0.1, n - 0.1]]] as const) {
      const [ax, ay] = a, [bx2, by2] = b;
      box(g, Math.min(ax, bx2), Math.min(ay, by2) - 0.08, Math.max(ax, bx2), Math.max(ay, by2), 6, STONE, {}, 105);
      boxTop(g, Math.min(ax, bx2), Math.min(ay, by2) - 0.08, Math.max(ax, bx2), Math.max(ay, by2), 6, 'stone', '#b0aa9e');
    }
    const [tx, ty] = P(n * 0.25, n * 0.8, 0);
    const tree = g.createLinearGradient(tx - 3, 0, tx + 3, 0);
    tree.addColorStop(0, '#4c7a3a');
    tree.addColorStop(1, '#1e3a1a');
    g.fillStyle = tree;
    g.beginPath();
    g.ellipse(tx, ty - 12, 3.4, 12, 0, 0, Math.PI * 2);
    g.fill();
    flag(g, 0.4, 0.4, 40, team, 0.8);
  },
};

/** Building sprites for one zoom level, cached per type, player and variant. */
export class BuildingSprites {
  private readonly cache = new Map<string, Sprite>();

  /** `tw`: device px across one tile diamond. */
  constructor(readonly tw: number) {}

  get(type: BuildingType, size: number, player: number, variant = 0): Sprite {
    const key = `${type}|${player}|${variant}`;
    let sp = this.cache.get(key);
    if (!sp) {
      sp = this.render(type, size, player, variant);
      this.cache.set(key, sp);
    }
    return sp;
  }

  private render(type: BuildingType, n: number, player: number, variant: number): Sprite {
    const k = this.tw / 64;
    const halfW = n * 32 + PAD;
    const c = document.createElement('canvas');
    c.width = Math.ceil(halfW * 2 * k);
    c.height = Math.ceil((RISE + n * 32 + PAD) * k);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.scale(k, k);
    g.translate(halfW, RISE);
    setScale(k);
    PAINTERS[type](g, n, PLAYER_COLORS[player % PLAYER_COLORS.length], new Rng(n * 31 + type.length), variant);
    grade(c, 0.06, n * 97 + variant);
    // Anchor = footprint's north corner.
    return { c, ax: halfW * k, ay: RISE * k };
  }
}
