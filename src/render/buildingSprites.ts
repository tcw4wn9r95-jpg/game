// Procedural Age I buildings (timber and thatch) per zoom level and player colour.
// Drawn in 32-units-per-tile space over the footprint; roofs rise above it.
import { Rng } from '../sim/rng';
import type { BuildingType } from '../sim/entities';
import { PLAYER_COLORS } from './palette';
import type { Sprite } from './sprites';

/** variant: building-specific state, e.g. a farm's crop stage (0 bare .. 3 ripe). */
type Painter = (g: CanvasRenderingContext2D, W: number, team: string, rng: Rng, variant: number) => void;

const PAD = 8;
/** Units of roof/structure drawn above the footprint's top edge. */
const RISE = 50;

const WOOD = '#6e4b2a';
const WOOD_DARK = '#3f2914';
const PLASTER = '#d8c8a0';
const STONE = '#8e8a82';

function shadow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  g.fillStyle = 'rgba(8,14,4,0.32)';
  g.beginPath();
  g.moveTo(x0 + 6, y1);
  g.lineTo(x1 + 6, y1);
  g.lineTo(x1 + 10, y0 + 10);
  g.lineTo(x1, y0 + 4);
  g.closePath();
  g.fill();
}

/** Thatched gable roof seen from the front and above: lit front slope, darker back slope. */
function thatch(g: CanvasRenderingContext2D, x0: number, x1: number, back: number, ridge: number, eave: number, rng: Rng) {
  g.fillStyle = '#7c6633';
  g.beginPath();
  g.moveTo(x0 + 4, ridge);
  g.lineTo(x1 - 4, ridge);
  g.lineTo(x1 - 2, back);
  g.lineTo(x0 + 2, back);
  g.closePath();
  g.fill();
  const grad = g.createLinearGradient(0, ridge, 0, eave);
  grad.addColorStop(0, '#d9b864');
  grad.addColorStop(1, '#a5833c');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x0, eave);
  g.lineTo(x1, eave);
  g.lineTo(x1 - 4, ridge);
  g.lineTo(x0 + 4, ridge);
  g.closePath();
  g.fill();
  // Straw texture.
  for (let k = 0; k < (x1 - x0) * 1.2; k++) {
    const y = ridge + rng.next() * (eave - ridge);
    const x = x0 + 3 + rng.next() * (x1 - x0 - 6);
    g.strokeStyle = rng.next() < 0.5 ? 'rgba(90,64,20,0.45)' : 'rgba(255,236,160,0.4)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rng.next() - 0.5) * 1.5, y + 2 + rng.next() * 2.5);
    g.stroke();
  }
  // Ridge beam and eave shadow.
  g.fillStyle = '#5c4720';
  g.fillRect(x0 + 4, ridge - 1, x1 - x0 - 8, 2);
  g.fillStyle = 'rgba(30,20,5,0.35)';
  g.fillRect(x0, eave, x1 - x0, 1.6);
}

/** Half-timbered front wall with optional door and windows. */
function wall(g: CanvasRenderingContext2D, x0: number, x1: number, top: number, bottom: number, opts: { door?: number; windows?: number[]; stoneBase?: boolean }) {
  g.fillStyle = PLASTER;
  g.fillRect(x0, top, x1 - x0, bottom - top);
  const grad = g.createLinearGradient(x0, 0, x1, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(x0, top, x1 - x0, bottom - top);
  g.strokeStyle = WOOD_DARK;
  g.lineWidth = 1.4;
  g.strokeRect(x0, top, x1 - x0, bottom - top);
  const n = Math.max(2, Math.round((x1 - x0) / 14));
  for (let k = 1; k < n; k++) {
    const x = x0 + ((x1 - x0) * k) / n;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x, bottom);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(x0, (top + bottom) / 2);
  g.lineTo(x1, (top + bottom) / 2);
  g.stroke();
  if (opts.stoneBase) {
    g.fillStyle = STONE;
    g.fillRect(x0 - 1, bottom - 4, x1 - x0 + 2, 4);
    g.strokeStyle = 'rgba(40,36,30,0.6)';
    g.lineWidth = 0.6;
    for (let x = x0; x < x1; x += 4) g.strokeRect(x, bottom - 4, 4, 2), g.strokeRect(x + 2, bottom - 2, 4, 2);
  }
  for (const wx of opts.windows ?? []) {
    g.fillStyle = '#2a1c10';
    g.fillRect(wx - 2.5, top + 3, 5, 4.5);
    g.strokeStyle = WOOD;
    g.lineWidth = 0.8;
    g.strokeRect(wx - 2.5, top + 3, 5, 4.5);
  }
  if (opts.door !== undefined) {
    const dx = opts.door;
    g.fillStyle = '#3a2412';
    g.beginPath();
    g.moveTo(dx - 3.5, bottom);
    g.lineTo(dx - 3.5, bottom - 7);
    g.arc(dx, bottom - 7, 3.5, Math.PI, 0);
    g.lineTo(dx + 3.5, bottom);
    g.closePath();
    g.fill();
  }
}

function flag(g: CanvasRenderingContext2D, x: number, y: number, team: string, size = 1) {
  g.strokeStyle = WOOD_DARK;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - 14 * size);
  g.stroke();
  g.fillStyle = team;
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 0.5;
  g.beginPath();
  g.moveTo(x, y - 14 * size);
  g.lineTo(x + 8 * size, y - 12 * size);
  g.lineTo(x, y - 9 * size);
  g.closePath();
  g.fill();
  g.stroke();
}

function banner(g: CanvasRenderingContext2D, x: number, y: number, team: string) {
  g.fillStyle = team;
  g.strokeStyle = 'rgba(20,10,0,0.6)';
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(x - 3, y);
  g.lineTo(x + 3, y);
  g.lineTo(x + 3, y + 10);
  g.lineTo(x, y + 8);
  g.lineTo(x - 3, y + 10);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255,230,140,0.9)';
  g.beginPath();
  g.arc(x, y + 4, 1.4, 0, Math.PI * 2);
  g.fill();
}

function logPile(g: CanvasRenderingContext2D, x: number, y: number, rows: number) {
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < rows - r; k++) {
      const lx = x + k * 4.4 + r * 2.2, ly = y - r * 3.8;
      g.fillStyle = '#7a5530';
      g.fillRect(lx - 10, ly - 2, 10, 4);
      g.fillStyle = '#d6b07a';
      g.strokeStyle = WOOD_DARK;
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(lx, ly, 2.1, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
}

function rocks(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
  for (const [dx, dy, r] of [[0, 0, 2.6], [4, 1, 2.2], [2, -2.5, 2]]) {
    g.fillStyle = color;
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.ellipse(x + dx, y + dy, r, r * 0.8, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}

/** Ploughed field with wheat rows; fuller and more golden at higher stages. */
const farm: Painter = (g, W, _team, rng, stage) => {
  // Low fence of posts and rails around the field.
  g.fillStyle = '#6e5232';
  g.fillRect(1, 1, W - 2, W - 2);
  const soil = g.createLinearGradient(0, 0, W, W);
  soil.addColorStop(0, '#8a6a42');
  soil.addColorStop(1, '#6a4c2c');
  g.fillStyle = soil;
  g.fillRect(4, 4, W - 8, W - 8);
  // Furrows.
  for (let y = 7; y < W - 6; y += 5.5) {
    g.fillStyle = 'rgba(40,24,10,0.35)';
    g.fillRect(5, y + 2.2, W - 10, 1.4);
    g.fillStyle = 'rgba(190,150,100,0.25)';
    g.fillRect(5, y, W - 10, 1);
  }
  // Wheat: tufts along the rows, their number and colour set by the stage.
  const ripe = ['#7d8f3a', '#b9a83e', '#d9b84a', '#e8c95a'][stage];
  const tip = ['#9aac4c', '#e0c860', '#f2d97a', '#fbe79a'][stage];
  const fill = [0.15, 0.45, 0.75, 1][stage];
  for (let y = 9; y < W - 6; y += 5.5)
    for (let x = 7; x < W - 6; x += 3.2) {
      if (rng.next() > fill) continue;
      const h = 3 + stage * 1.6 + rng.next() * 2;
      g.strokeStyle = ripe;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y + 1);
      g.lineTo(x + (rng.next() - 0.5) * 1.5, y + 1 - h);
      g.stroke();
      g.fillStyle = tip;
      g.fillRect(x - 0.6, y - h, 1.4, 1.8);
    }
  g.strokeStyle = '#4a3218';
  g.lineWidth = 1.2;
  g.strokeRect(2.5, 2.5, W - 5, W - 5);
  g.fillStyle = '#5a3d22';
  for (const [x, y] of [[2, 2], [W - 4, 2], [2, W - 4], [W - 4, W - 4], [W / 2 - 1, 2], [W / 2 - 1, W - 4]]) g.fillRect(x, y - 3, 2.5, 5);
};

/** Timber hall with a training yard: fence, straw dummy, rack of spears and shields. */
const barracks: Painter = (g, W, team, rng) => {
  shadow(g, 6, 16, W - 6, W * 0.62);
  // Yard.
  g.fillStyle = 'rgba(130,100,62,0.55)';
  g.fillRect(4, W * 0.6, W - 8, W * 0.38);
  g.strokeStyle = '#5a3d22';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(4, W - 4);
  g.lineTo(W - 4, W - 4);
  g.moveTo(4, W - 7);
  g.lineTo(W - 4, W - 7);
  g.stroke();
  for (let x = 4; x <= W - 4; x += 9) {
    g.fillStyle = '#5a3d22';
    g.fillRect(x - 1, W - 10, 2.4, 8);
  }
  wall(g, 8, W - 8, W * 0.3, W * 0.62, { door: W / 2, windows: [20, W - 20], stoneBase: true });
  thatch(g, 3, W - 3, -RISE / 2, 0, W * 0.33, rng);
  banner(g, 15, W * 0.34, team);
  banner(g, W - 15, W * 0.34, team);
  flag(g, W - 10, 0, team, 1.1);
  // Training dummy.
  const dx = 18, dy = W - 12;
  g.fillStyle = '#5a3d22';
  g.fillRect(dx - 1, dy - 16, 2.4, 16);
  g.fillRect(dx - 7, dy - 12, 14, 2);
  g.fillStyle = '#d6bf7a';
  g.beginPath();
  g.ellipse(dx + 0.2, dy - 9, 4, 5.5, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(dx + 0.2, dy - 17, 3, 0, Math.PI * 2);
  g.fill();
  // Weapon rack with spears and shields in team colour.
  const rx = W - 30, ry = W - 12;
  g.fillStyle = '#5a3d22';
  g.fillRect(rx, ry - 3, 20, 2.4);
  for (let k = 0; k < 4; k++) {
    g.strokeStyle = '#7a5430';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(rx + 3 + k * 5, ry + 1);
    g.lineTo(rx + 1 + k * 5, ry - 20);
    g.stroke();
    g.fillStyle = '#c9d1d6';
    g.beginPath();
    g.moveTo(rx + k * 5, ry - 20);
    g.lineTo(rx + 1 + k * 5, ry - 25);
    g.lineTo(rx + 2 + k * 5, ry - 20);
    g.fill();
  }
  for (const sx of [rx + 4, rx + 15]) {
    g.fillStyle = team;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.arc(sx, ry - 6, 4.2, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#d9b44a';
    g.beginPath();
    g.arc(sx, ry - 6, 1.2, 0, Math.PI * 2);
    g.fill();
  }
};

const PAINTERS: Record<BuildingType, Painter> = {
  farm,
  barracks,
  town_center: (g, W, team, rng) => {
    shadow(g, 6, 20, W - 6, W - 4);
    // Packed-earth yard.
    g.fillStyle = 'rgba(120,92,56,0.35)';
    g.beginPath();
    g.ellipse(W / 2, W - 10, W / 2 - 2, 12, 0, 0, Math.PI * 2);
    g.fill();
    wall(g, 10, W - 10, W * 0.5, W - 12, { door: W / 2, windows: [24, 40, W - 40, W - 24], stoneBase: true });
    thatch(g, 4, W - 4, -RISE + 10, 8, W * 0.52, rng);
    // Central tower with its own little roof and the realm's colours.
    wall(g, W / 2 - 14, W / 2 + 14, 4, W * 0.5 - 2, { windows: [W / 2] });
    thatch(g, W / 2 - 18, W / 2 + 18, -RISE - 2, -RISE + 8, 6, rng);
    flag(g, W / 2, -RISE + 2, team, 1.3);
    banner(g, 20, W * 0.52 + 2, team);
    banner(g, W - 20, W * 0.52 + 2, team);
    // Chimney.
    g.fillStyle = STONE;
    g.fillRect(W - 30, -14, 6, 14);
    g.fillStyle = '#5c5850';
    g.fillRect(W - 31, -15, 8, 2);
  },
  house: (g, W, team, rng) => {
    shadow(g, 4, 12, W - 4, W - 3);
    wall(g, 6, W - 6, W * 0.5, W - 6, { door: W * 0.35, windows: [W * 0.7] });
    thatch(g, 1, W - 1, -RISE / 2, 4, W * 0.52, rng);
    flag(g, W - 6, 6, team, 0.8);
  },
  lumber_camp: (g, W, team, rng) => {
    shadow(g, 4, 14, W - 4, W - 3);
    // Open shed: dark interior, posts, plank roof.
    g.fillStyle = '#2b1d10';
    g.fillRect(6, W * 0.42, W * 0.62, W * 0.4);
    g.fillStyle = WOOD;
    for (const x of [6, W * 0.37, W * 0.68 - 2]) g.fillRect(x, W * 0.42, 2.4, W * 0.42);
    thatch(g, 2, W * 0.74, -6, 6, W * 0.45, rng);
    logPile(g, W * 0.72, W - 8, 3);
    // Chopping block with axe.
    g.fillStyle = '#8a6238';
    g.fillRect(W * 0.3, W - 12, 7, 5);
    g.strokeStyle = WOOD_DARK;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(W * 0.3 + 3.5, W - 12);
    g.lineTo(W * 0.3 + 8, W - 19);
    g.stroke();
    g.fillStyle = '#9ba3a8';
    g.fillRect(W * 0.3 + 6.5, W - 21, 3.5, 2.5);
    flag(g, 8, W * 0.42, team, 0.8);
  },
  mining_camp: (g, W, team, rng) => {
    shadow(g, 4, 14, W - 4, W - 3);
    g.fillStyle = '#2b1d10';
    g.fillRect(6, W * 0.42, W * 0.62, W * 0.4);
    g.fillStyle = WOOD;
    for (const x of [6, W * 0.37, W * 0.68 - 2]) g.fillRect(x, W * 0.42, 2.4, W * 0.42);
    thatch(g, 2, W * 0.74, -6, 6, W * 0.45, rng);
    // Ore cart.
    g.fillStyle = '#5a4a3a';
    g.fillRect(W * 0.62, W - 17, 14, 8);
    g.strokeStyle = WOOD_DARK;
    g.strokeRect(W * 0.62, W - 17, 14, 8);
    g.fillStyle = '#222';
    g.beginPath();
    g.arc(W * 0.62 + 3, W - 8, 2.2, 0, Math.PI * 2);
    g.arc(W * 0.62 + 11, W - 8, 2.2, 0, Math.PI * 2);
    g.fill();
    rocks(g, W * 0.62 + 4, W - 18, '#e8b830');
    rocks(g, W * 0.2, W - 8, '#a9a9a4');
    flag(g, 8, W * 0.42, team, 0.8);
  },
  mill: (g, W, team, rng) => {
    shadow(g, 4, 12, W - 4, W - 3);
    wall(g, 9, W - 9, W * 0.45, W - 6, { door: W / 2, windows: [W * 0.3] });
    thatch(g, 4, W - 4, -12, 0, W * 0.47, rng);
    // Sails.
    const hx = W / 2, hy = W * 0.3;
    g.save();
    g.translate(hx, hy);
    g.rotate(0.35);
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.fillStyle = WOOD_DARK;
      g.fillRect(-0.8, 0, 1.6, 26);
      g.fillStyle = 'rgba(238,226,196,0.95)';
      g.fillRect(1, 6, 6, 19);
      g.strokeStyle = 'rgba(80,60,30,0.6)';
      g.lineWidth = 0.4;
      g.strokeRect(1, 6, 6, 19);
    }
    g.restore();
    g.fillStyle = WOOD_DARK;
    g.beginPath();
    g.arc(hx, hy, 2.4, 0, Math.PI * 2);
    g.fill();
    // Sacks of grain.
    for (const [x, y] of [[W - 14, W - 6], [W - 9, W - 5]]) {
      g.fillStyle = '#cdb98a';
      g.beginPath();
      g.ellipse(x, y, 3, 3.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    flag(g, W - 8, W * 0.45, team, 0.8);
  },
};

/** Building sprites for one zoom level, cached per type and player. */
export class BuildingSprites {
  private readonly cache = new Map<string, Sprite>();

  constructor(readonly s: number) {}

  get(type: BuildingType, size: number, player: number, variant = 0): Sprite {
    const key = `${type}|${player}|${variant}`;
    let sp = this.cache.get(key);
    if (!sp) {
      sp = this.render(type, size, player, variant);
      this.cache.set(key, sp);
    }
    return sp;
  }

  private render(type: BuildingType, size: number, player: number, variant: number): Sprite {
    const u = this.s / 32;
    const W = size * 32;
    const c = document.createElement('canvas');
    c.width = Math.ceil((W + PAD * 2) * u);
    c.height = Math.ceil((W + RISE + PAD) * u);
    const g = c.getContext('2d')!;
    g.scale(u, u);
    g.translate(PAD, RISE);
    PAINTERS[type](g, W, PLAYER_COLORS[player % PLAYER_COLORS.length], new Rng(size * 31 + type.length), variant);
    // Anchor = footprint top-left.
    return { c, ax: PAD * u, ay: RISE * u };
  }
}
