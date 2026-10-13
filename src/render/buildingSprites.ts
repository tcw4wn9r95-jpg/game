// Isometric buildings, modelled with the iso3d toolkit and rendered once per zoom
// level, player colour and variant. Age I style: timber, plaster, thatch and canvas.
import type { BuildingType } from '../sim/entities';
import { Rng } from '../sim/rng';
import { type G, P, box, boxShadow, doorAt, gableRoof, hipRoof, line3, log, onGround, poly3, post, shadeColor, windowAt } from './iso3d';
import { PLAYER_COLORS } from './palette';
import type { Sprite } from './sprites';

/** n: footprint in tiles; variant: building-specific state, e.g. a farm's crop stage (0 bare .. 3 ripe). */
type Painter = (g: G, n: number, team: string, rng: Rng, variant: number) => void;

/** Units of structure drawn above the footprint's north corner. */
const RISE = 150;
const PAD = 26;

const PLASTER = { base: '#ddcda6', frame: '#4e331b' };
const STONE = { base: '#9a958b', stone: true };
const PLANKS = { base: '#8a6440', planks: true };
const THATCH = { color: '#c9a656', kind: 'thatch' as const };

function flag(g: G, x: number, y: number, z: number, team: string, s = 1): void {
  const [bx, by] = P(x, y, z);
  g.strokeStyle = '#3a2614';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(bx, by);
  g.lineTo(bx, by - 22 * s);
  g.stroke();
  g.fillStyle = team;
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(bx, by - 22 * s);
  g.quadraticCurveTo(bx + 7 * s, by - 23 * s, bx + 13 * s, by - 19 * s);
  g.lineTo(bx, by - 14 * s);
  g.closePath();
  g.fill();
  g.stroke();
}

/** A banner hung on a wall (u along the wall, v up). */
function banner(g: G, u: number, v: number, team: string): void {
  g.fillStyle = team;
  g.strokeStyle = 'rgba(20,10,0,0.6)';
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(u - 3, v);
  g.lineTo(u + 3, v);
  g.lineTo(u + 3, v - 11);
  g.lineTo(u, v - 9);
  g.lineTo(u - 3, v - 11);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#e2bc4c';
  g.fillRect(u - 3, v - 1.5, 6, 1.5);
}

function groundPatch(g: G, n: number, color: string, inset = 0.05): void {
  poly3(g, [[inset, inset, 0], [n - inset, inset, 0], [n - inset, n - inset, 0], [inset, n - inset, 0]], color, null);
}

function crate(g: G, x: number, y: number, s = 0.35): void {
  box(g, x, y, x + s, y + s, s * 30, { base: '#9a7040', planks: true });
  poly3(g, [[x, y, s * 30], [x + s, y, s * 30], [x + s, y + s, s * 30], [x, y + s, s * 30]], '#b58a52');
}

function oreHeap(g: G, x: number, y: number, color: string, rng: Rng): void {
  for (let k = 0; k < 7; k++) {
    const [px, py] = P(x + (rng.next() - 0.5) * 0.4, y + (rng.next() - 0.5) * 0.4, 0);
    g.fillStyle = shadeColor(color, 0.7 + rng.next() * 0.5);
    g.strokeStyle = 'rgba(20,15,10,0.6)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.ellipse(px, py - 1.5 - k * 0.4, 2.6, 1.9, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}

/** Open canvas shelter on log posts with a team-coloured trim (camps). */
function shelter(g: G, x0: number, y0: number, x1: number, y1: number, h: number, team: string): void {
  boxShadow(g, x0, y0, x1, y1, h + 14);
  // Dark interior floor so the open sides read as shade.
  poly3(g, [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], 'rgba(40,28,14,0.45)', null);
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) post(g, x, y, h, 2.6);
  post(g, (x0 + x1) / 2, y1, h, 2.2);
  hipRoof(g, x0, y0, x1, y1, h, 14, { color: '#d8c79e', kind: 'canvas', trim: team }, 0.1);
}

const PAINTERS: Record<BuildingType, Painter> = {
  town_center: (g, n, team) => {
    groundPatch(g, n, 'rgba(120,92,56,0.45)', -0.15);
    boxShadow(g, 0.4, 0.4, n - 0.4, n - 0.4, 70);
    // Stone plinth, then the timber hall.
    box(g, 0.3, 0.3, n - 0.3, n - 0.3, 6, STONE);
    poly3(g, [[0.3, 0.3, 6], [n - 0.3, 0.3, 6], [n - 0.3, n - 0.3, 6], [0.3, n - 0.3, 6]], '#8f8a80');
    g.save();
    g.translate(0, -6);
    box(g, 0.5, 0.6, n - 0.6, n - 0.5, 34, PLASTER, {
      left: (len) => {
        doorAt(g, len / 2, 9, 14);
        for (const u of [len * 0.18, len * 0.34, len * 0.66, len * 0.82]) windowAt(g, u, 18, 4.5, 6);
        banner(g, len * 0.26, 33, team);
        banner(g, len * 0.74, 33, team);
      },
      right: (len) => {
        for (const u of [len * 0.25, len * 0.5, len * 0.75]) windowAt(g, u, 18, 4.5, 6);
      },
    });
    gableRoof(g, 0.5, 0.6, n - 0.6, n - 0.5, 34, 30, THATCH, 'x', 0.18, 11);
    // Central bell tower rising through the roof.
    const t0 = n / 2 - 0.55, t1 = n / 2 + 0.55;
    box(g, t0, t0, t1, t1, 84, PLASTER, { left: (len) => windowAt(g, len / 2, 66, 5, 8), right: (len) => windowAt(g, len / 2, 66, 5, 8) });
    hipRoof(g, t0, t0, t1, t1, 84, 26, { color: '#b08a44', kind: 'thatch' }, 0.15, 5);
    flag(g, n / 2, n / 2, 110, team, 1.2);
    // Chimney.
    box(g, n - 1.3, 1.0, n - 1.0, 1.3, 64, STONE);
    g.restore();
  },
  house: (g, n, team) => {
    boxShadow(g, 0.25, 0.25, n - 0.2, n - 0.2, 40);
    box(g, 0.25, 0.3, n - 0.25, n - 0.2, 22, PLASTER, {
      left: (len) => {
        doorAt(g, len * 0.35, 7, 11);
        windowAt(g, len * 0.72, 10, 4, 5);
      },
      right: (len) => windowAt(g, len / 2, 10, 4, 5),
    });
    gableRoof(g, 0.25, 0.3, n - 0.25, n - 0.2, 22, 20, THATCH, 'y', 0.14, 3);
    box(g, 0.45, 0.55, 0.7, 0.8, 48, STONE);
    flag(g, n - 0.3, 0.3, 30, team, 0.7);
  },
  lumber_camp: (g, n, team) => {
    groundPatch(g, n, 'rgba(110,86,52,0.4)', 0);
    shelter(g, 0.2, 0.2, n * 0.62, n - 0.25, 22, team);
    // Stacked logs and a sawhorse in the open.
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3 - r; k++) log(g, [n * 0.66 + k * 0.17 + r * 0.08, 0.3], [n * 0.66 + k * 0.17 + r * 0.08, 1.3], 2 + r * 3.4, 1.7);
    crate(g, n * 0.72, n * 0.7);
    line3(g, [n * 0.25, n * 0.85, 0], [n * 0.25, n * 0.85, 8], '#5a3d22', 1.2);
    line3(g, [n * 0.45, n * 0.85, 0], [n * 0.45, n * 0.85, 8], '#5a3d22', 1.2);
    log(g, [n * 0.2, n * 0.85], [n * 0.5, n * 0.85], 8, 1.5);
  },
  mining_camp: (g, n, team, rng) => {
    groundPatch(g, n, 'rgba(110,98,84,0.45)', 0);
    shelter(g, 0.2, 0.2, n * 0.62, n - 0.25, 22, team);
    // Ore cart with gold and a heap of stone.
    box(g, n * 0.68, n * 0.2, n * 0.95, n * 0.5, 8, PLANKS);
    poly3(g, [[n * 0.68, n * 0.2, 8], [n * 0.95, n * 0.2, 8], [n * 0.95, n * 0.5, 8], [n * 0.68, n * 0.5, 8]], '#5a4a3a');
    oreHeap(g, n * 0.81, n * 0.35, '#f2c230', rng);
    oreHeap(g, n * 0.78, n * 0.78, '#a9a9a2', rng);
    crate(g, n * 0.3, n * 0.82, 0.3);
  },
  mill: (g, n, team) => {
    boxShadow(g, 0.3, 0.3, n - 0.3, n - 0.3, 60);
    box(g, 0.3, 0.35, n - 0.3, n - 0.3, 18, STONE);
    box(g, 0.45, 0.5, n - 0.45, n - 0.45, 40, PLASTER, {
      left: (len) => {
        doorAt(g, len * 0.4, 6, 10);
        windowAt(g, len * 0.5, 26, 4, 5);
      },
      right: (len) => windowAt(g, len / 2, 26, 4, 5),
    });
    hipRoof(g, 0.45, 0.5, n - 0.45, n - 0.45, 40, 22, THATCH, 0.12, 9);
    // Four sails on the south-west face.
    const [hx, hy] = P(n / 2 - 0.1, n - 0.45, 46);
    g.save();
    g.translate(hx, hy);
    g.rotate(0.3);
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.fillStyle = '#4a3218';
      g.fillRect(-0.8, 0, 1.6, 34);
      g.fillStyle = 'rgba(236,224,196,0.95)';
      g.fillRect(1.2, 8, 7, 25);
      g.strokeStyle = 'rgba(80,60,30,0.6)';
      g.lineWidth = 0.4;
      for (let v = 11; v < 33; v += 4) {
        g.beginPath();
        g.moveTo(1.2, v);
        g.lineTo(8.2, v);
        g.stroke();
      }
    }
    g.restore();
    g.fillStyle = '#2a1a0c';
    g.beginPath();
    g.arc(hx, hy, 2.6, 0, Math.PI * 2);
    g.fill();
    for (const [x, y] of [[n - 0.25, n - 0.1], [n - 0.05, n - 0.35]]) {
      const [sx, sy] = P(x, y, 0);
      g.fillStyle = '#cdb98a';
      g.strokeStyle = 'rgba(60,40,15,0.6)';
      g.beginPath();
      g.ellipse(sx, sy - 3, 3.2, 3.8, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    flag(g, 0.4, 0.4, 40, team, 0.7);
  },
  barracks: (g, n, team) => {
    groundPatch(g, n, 'rgba(126,98,60,0.5)', 0);
    boxShadow(g, 0.2, 0.2, n - 0.2, n * 0.55, 46);
    box(g, 0.2, 0.2, n - 0.2, n * 0.55, 28, PLASTER, {
      left: (len) => {
        doorAt(g, len / 2, 9, 14);
        for (const u of [len * 0.2, len * 0.8]) windowAt(g, u, 14, 4.5, 6);
        banner(g, len * 0.35, 27, team);
        banner(g, len * 0.65, 27, team);
      },
      right: (len) => windowAt(g, len / 2, 14, 4.5, 6),
    });
    gableRoof(g, 0.2, 0.2, n - 0.2, n * 0.55, 28, 22, THATCH, 'x', 0.15, 21);
    // Training yard fence along the front.
    for (let x = 0.1; x <= n - 0.1; x += 0.45) post(g, x, n - 0.1, 9, 1.6);
    line3(g, [0.1, n - 0.1, 7], [n - 0.1, n - 0.1, 7], '#6e4b2a', 1.3);
    line3(g, [0.1, n - 0.1, 3.5], [n - 0.1, n - 0.1, 3.5], '#6e4b2a', 1.3);
    // Straw dummy.
    const [dx, dy] = P(0.8, n * 0.8, 0);
    g.fillStyle = '#5a3d22';
    g.fillRect(dx - 1, dy - 18, 2, 18);
    g.fillRect(dx - 6, dy - 14, 12, 1.6);
    g.fillStyle = '#d6bf7a';
    g.beginPath();
    g.ellipse(dx, dy - 10, 3.6, 5.2, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(dx, dy - 18, 2.8, 0, Math.PI * 2);
    g.fill();
    // Weapon rack: spears and team shields.
    for (let k = 0; k < 4; k++) line3(g, [n * 0.62 + k * 0.12, n * 0.78, 0], [n * 0.6 + k * 0.12, n * 0.78, 22], '#7a5430', 1.1);
    for (const x of [n * 0.66, n * 0.86]) {
      const [sx, sy] = P(x, n * 0.8, 8);
      g.fillStyle = team;
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.ellipse(sx, sy, 4, 4.4, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#d9b44a';
      g.beginPath();
      g.arc(sx, sy, 1.2, 0, Math.PI * 2);
      g.fill();
    }
    flag(g, n - 0.25, 0.25, 40, team, 1);
  },
  farm: (g, n, _team, rng, stage) => {
    // Ploughed field: furrows run along x; wheat thins as it is harvested.
    poly3(g, [[0, 0, 0], [n, 0, 0], [n, n, 0], [0, n, 0]], '#6e5232', null);
    onGround(g, 0, 0, () => {
      const W = n * 32;
      const soil = g.createLinearGradient(0, 0, W, W);
      soil.addColorStop(0, '#8d6c44');
      soil.addColorStop(1, '#6a4c2c');
      g.fillStyle = soil;
      g.fillRect(2, 2, W - 4, W - 4);
      for (let v = 4; v < W - 3; v += 4) {
        g.fillStyle = 'rgba(40,24,10,0.35)';
        g.fillRect(3, v + 1.6, W - 6, 1.2);
        g.fillStyle = 'rgba(200,160,110,0.22)';
        g.fillRect(3, v, W - 6, 0.8);
      }
    });
    const ripe = ['#7d8f3a', '#b9a83e', '#d9b84a', '#e8c95a'][stage];
    const tip = ['#9aac4c', '#e0c860', '#f2d97a', '#fbe79a'][stage];
    const fill = [0.1, 0.45, 0.75, 1][stage];
    for (let y = 0.15; y < n - 0.1; y += 0.125)
      for (let x = 0.1; x < n - 0.08; x += 0.1) {
        if (rng.next() > fill) continue;
        const [sx, sy] = P(x, y, 0);
        const h = 3 + stage * 2 + rng.next() * 2;
        g.strokeStyle = ripe;
        g.lineWidth = 0.9;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + (rng.next() - 0.4) * 1.6, sy - h);
        g.stroke();
        g.fillStyle = tip;
        g.fillRect(sx - 0.6, sy - h - 1, 1.3, 1.8);
      }
    for (const [x, y] of [[0, 0], [n, 0], [0, n], [n, n], [n / 2, n], [n, n / 2]]) post(g, x, y, 7, 1.5);
    line3(g, [0, n, 5], [n, n, 5], '#5a3d22', 1);
    line3(g, [n, 0, 5], [n, n, 5], '#5a3d22', 1);
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
    const g = c.getContext('2d')!;
    g.scale(k, k);
    g.translate(halfW, RISE);
    PAINTERS[type](g, n, PLAYER_COLORS[player % PLAYER_COLORS.length], new Rng(n * 31 + type.length), variant);
    // Anchor = footprint's north corner.
    return { c, ax: halfW * k, ay: RISE * k };
  }
}
