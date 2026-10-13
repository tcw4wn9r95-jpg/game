import ages from '../data/ages.json';
import { RESOURCE_KINDS, type ResourceKind, type World } from '../sim/world';
import { ICONS } from './icons';

const RESOURCE_NAMES: Record<ResourceKind, string> = { food: 'Food', wood: 'Wood', gold: 'Gold', stone: 'Stone' };

function formatClock(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * In-match HUD: resource bar, population, age plate and clock along the top, the
 * menu button, and the framed minimap slot. DOM text only changes when values do.
 */
export class Hud {
  readonly minimapSlot: HTMLElement;
  private readonly values = new Map<string, HTMLElement>();
  private readonly last = new Map<string, string>();
  private readonly pauseMenu: HTMLElement;
  onNewMatch: () => void = () => {};
  paused = false;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = '';
    const top = el('div', 'hud-top');

    const bar = el('div', 'resbar frame');
    for (const k of RESOURCE_KINDS) bar.appendChild(this.stat(k, ICONS[k], RESOURCE_NAMES[k]));
    bar.appendChild(this.stat('pop', ICONS.pop, 'Population', 'stat-pop'));
    top.appendChild(bar);

    const age = el('div', 'ageplate frame');
    age.innerHTML = `<span class="ageplate-icon">${ICONS.crown}</span><span class="ageplate-text"><b data-v="ageNum"></b><span data-v="ageName"></span></span>`;
    age.querySelectorAll<HTMLElement>('[data-v]').forEach((n) => this.values.set(n.dataset.v!, n));
    top.appendChild(age);

    const clock = el('div', 'clock frame');
    clock.innerHTML = `<span class="icon">${ICONS.clock}</span><span data-v="clock">00:00</span>`;
    this.values.set('clock', clock.querySelector('[data-v]')!);
    top.appendChild(clock);

    const menuBtn = el('button', 'round-btn');
    menuBtn.setAttribute('aria-label', 'Menu');
    menuBtn.innerHTML = ICONS.menu;
    menuBtn.addEventListener('click', () => this.setPaused(true));
    top.appendChild(menuBtn);
    root.appendChild(top);

    const debug = el('div', 'hud-debug');
    debug.innerHTML = `<div id="fps" class="hud-chip" hidden></div><div id="bench" class="hud-chip" hidden></div>`;
    root.appendChild(debug);

    this.minimapSlot = el('div', 'minimap-frame frame');
    root.appendChild(this.minimapSlot);

    this.pauseMenu = el('div', 'panel-backdrop');
    this.pauseMenu.hidden = true;
    this.pauseMenu.innerHTML = `
      <div class="panel frame">
        <h2 class="panel-title">Paused</h2>
        <button class="btn btn-gold" data-a="resume">Resume</button>
        <button class="btn btn-wood" data-a="new">New Match</button>
      </div>`;
    this.pauseMenu.querySelector('[data-a=resume]')!.addEventListener('click', () => this.setPaused(false));
    this.pauseMenu.querySelector('[data-a=new]')!.addEventListener('click', () => {
      this.setPaused(false);
      this.onNewMatch();
    });
    root.appendChild(this.pauseMenu);
  }

  private stat(key: string, icon: string, title: string, cls = ''): HTMLElement {
    const s = el('div', `stat ${cls}`);
    s.title = title;
    s.innerHTML = `<span class="icon">${icon}</span><span class="stat-v" data-v="${key}">0</span>`;
    this.values.set(key, s.querySelector('[data-v]')!);
    return s;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.pauseMenu.hidden = !p;
  }

  update(world: World, player: number): void {
    const ps = world.players[player];
    for (const k of RESOURCE_KINDS) this.set(k, String(Math.floor(ps.resources[k])));
    this.set('pop', `${ps.pop}/${ps.popCap}`);
    this.set('ageNum', ages[ps.age].numeral);
    this.set('ageName', `${ages[ps.age].name} Age`);
    this.set('clock', formatClock(world.time));
  }

  private set(key: string, text: string): void {
    if (this.last.get(key) === text) return;
    this.last.set(key, text);
    this.values.get(key)!.textContent = text;
  }

  destroy(): void {
    this.root.innerHTML = '';
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
