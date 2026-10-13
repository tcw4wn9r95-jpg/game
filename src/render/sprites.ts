// Procedural object sprites, drawn as vector shapes in a 32-unit-per-tile space and
// rasterised once per zoom level.

export interface Sprite {
  c: HTMLCanvasElement;
  /** Anchor in device px: this canvas point is placed on the object's ground point. */
  ax: number;
  ay: number;
}

type Painter = (g: CanvasRenderingContext2D) => void;

/** w, h, ax, ay in 32-unit tile space. */
function make(s: number, w: number, h: number, ax: number, ay: number, paint: Painter): Sprite {
  const u = s / 32;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * u);
  c.height = Math.ceil(h * u);
  const g = c.getContext('2d')!;
  g.scale(u, u);
  paint(g);
  return { c, ax: ax * u, ay: ay * u };
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function poly(g: CanvasRenderingContext2D, color: string, ...pts: number[]) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}

const SHADOW = 'rgba(0,0,0,0.28)';

function oak(dark: boolean): Painter {
  const [outline, base, mid, hi] = dark
    ? ['#173d18', '#2a6527', '#347a2e', '#4b9439']
    : ['#1d4a1c', '#33772d', '#3f8a35', '#5ca646'];
  return (g) => {
    ellipse(g, 22, 55, 13, 4, SHADOW);
    g.fillStyle = '#5a3d22';
    g.fillRect(19.5, 38, 5, 17);
    circle(g, 22, 27, 15, outline);
    circle(g, 13, 33, 9.5, outline);
    circle(g, 31, 33, 9.5, outline);
    circle(g, 22, 27, 13.5, base);
    circle(g, 14, 33, 8, base);
    circle(g, 30, 33, 8, base);
    circle(g, 19, 23, 8, mid);
    circle(g, 28, 29, 5, mid);
    circle(g, 17, 20, 4.5, hi);
    circle(g, 12, 30, 3, hi);
  };
}

function pine(tall: boolean): Painter {
  const top = tall ? 2 : 9;
  return (g) => {
    ellipse(g, 22, 55, 11, 3.5, SHADOW);
    g.fillStyle = '#5a3d22';
    g.fillRect(20, 44, 4, 11);
    poly(g, '#143f22', 22, top - 1, 6, 48, 38, 48);
    poly(g, '#1f5a2e', 22, top + 1, 8, 46, 36, 46);
    poly(g, '#2b7038', 22, top + 4, 11, 34, 33, 34);
    poly(g, '#3b8a47', 22, top + 4, 13, 32, 22, 32);
    poly(g, '#2b7038', 22, top + 18, 9, 46, 22, 46);
  };
}

function rocks(base: string, dark: string, light: string, nugget?: string): Painter {
  return (g) => {
    ellipse(g, 19, 30, 16, 5, SHADOW);
    poly(g, dark, 3, 30, 7, 17, 15, 12, 22, 16, 23, 31);
    poly(g, base, 5, 29, 8, 18, 15, 14, 20, 17, 21, 29);
    poly(g, dark, 16, 31, 20, 19, 28, 15, 35, 22, 34, 31);
    poly(g, base, 18, 30, 21, 20, 28, 17, 33, 23, 32, 30);
    poly(g, light, 9, 19, 15, 15, 17, 19, 11, 22);
    poly(g, light, 22, 20, 28, 18, 29, 21, 24, 23);
    if (nugget) {
      for (const [x, y, r] of [[11, 24, 2.6], [16, 21, 2], [25, 25, 2.8], [29, 21, 1.8], [14, 27, 1.6]]) {
        circle(g, x, y, r, nugget);
        circle(g, x - 0.6, y - 0.7, r * 0.45, '#fff3b0');
      }
    }
  };
}

const berries: Painter = (g) => {
  ellipse(g, 16, 27, 14, 4, SHADOW);
  circle(g, 16, 17, 11, '#1d4a1c');
  circle(g, 9, 21, 7, '#1d4a1c');
  circle(g, 23, 21, 7, '#1d4a1c');
  circle(g, 16, 17, 9.5, '#2f7a3a');
  circle(g, 10, 21, 5.5, '#2f7a3a');
  circle(g, 22, 21, 5.5, '#2f7a3a');
  circle(g, 13, 13, 4, '#45944c');
  for (const [x, y] of [[11, 16], [18, 13], [21, 19], [14, 22], [8, 20], [24, 23], [17, 19]]) {
    circle(g, x, y, 2.1, '#c2255c');
    circle(g, x - 0.6, y - 0.6, 0.8, '#f5a3c0');
  }
};

const sheep: Painter = (g) => {
  ellipse(g, 12, 17, 9, 2.5, SHADOW);
  g.fillStyle = '#3a3a3a';
  g.fillRect(6, 12, 2, 5);
  g.fillRect(15, 12, 2, 5);
  ellipse(g, 11, 10, 8.5, 6, '#8d8d86');
  ellipse(g, 11, 9.5, 7.5, 5, '#f3f2ea');
  circle(g, 8, 7.5, 2.5, '#ffffff');
  ellipse(g, 19, 9, 3, 2.5, '#3a3a3a');
};

const deer: Painter = (g) => {
  ellipse(g, 13, 22, 10, 2.5, SHADOW);
  g.fillStyle = '#6e4826';
  for (const x of [6, 9, 17, 20]) g.fillRect(x, 13, 1.8, 9);
  ellipse(g, 13, 12, 9, 4.5, '#9b6a3c');
  ellipse(g, 12, 13.5, 6, 2, '#c8a079');
  poly(g, '#9b6a3c', 19, 10, 21, 3, 24, 4, 22, 11);
  ellipse(g, 24, 4.5, 3.2, 2, '#8a5d33');
  g.strokeStyle = '#d9c3a0';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(22, 3);
  g.lineTo(20, -1 + 1);
  g.moveTo(21, 1.2);
  g.lineTo(23, 0.5);
  g.stroke();
};

const fish: Painter = (g) => {
  g.strokeStyle = 'rgba(230,245,255,0.55)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.ellipse(16, 12, 13, 6, 0, 0, Math.PI * 2);
  g.stroke();
  poly(g, 'rgba(18,50,84,0.75)', 6, 12, 13, 8, 21, 10, 24, 12, 21, 14, 13, 16);
  poly(g, 'rgba(18,50,84,0.75)', 24, 12, 29, 8, 28, 16);
  circle(g, 9, 11, 0.9, 'rgba(220,240,255,0.8)');
};

/** All object sprites for one zoom level (`s` device px per tile). */
export class SpriteSet {
  readonly trees: Sprite[];
  readonly gold: Sprite;
  readonly stone: Sprite;
  readonly berries: Sprite;
  readonly sheep: Sprite;
  readonly deer: Sprite;
  readonly fish: Sprite;

  constructor(readonly s: number) {
    this.trees = [
      make(s, 45, 60, 22, 54, oak(true)),
      make(s, 45, 60, 22, 54, oak(false)),
      make(s, 45, 60, 22, 54, pine(false)),
      make(s, 45, 60, 22, 54, pine(true)),
    ];
    this.gold = make(s, 38, 36, 19, 30, rocks('#7f6e52', '#5b4c36', '#a08c6c', '#f5c842'));
    this.stone = make(s, 38, 36, 19, 30, rocks('#9a9a96', '#66666a', '#cfcfcb'));
    this.berries = make(s, 32, 32, 16, 27, berries);
    this.sheep = make(s, 24, 20, 12, 17, sheep);
    this.deer = make(s, 28, 25, 13, 22, deer);
    this.fish = make(s, 32, 24, 16, 12, fish);
  }
}
