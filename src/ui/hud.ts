import ages from '../data/ages.json';
import { RESOURCE_KINDS, type ResourceKind, type World } from '../sim/world';
import { ICONS } from './icons';
import { tip } from './tooltip';

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
  onIdleVillager: () => void = () => {};
  onIdleMilitary: () => void = () => {};
  onAllMilitary: () => void = () => {};
  private readonly idleBtn: HTMLButtonElement;
  private readonly armyBtn: HTMLButtonElement;
  private readonly toasts: HTMLElement;
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

    const side = el('div', 'side-btns');
    const sideBtn = (key: string, icon: string, title: string, body: string, run: () => void, badge = true) => {
      const b = el('button', 'side-btn');
      b.setAttribute('aria-label', title);
      b.innerHTML = `${icon}${badge ? `<span class="badge" data-v="${key}">0</span>` : ''}`;
      if (badge) this.values.set(key, b.querySelector('[data-v]')!);
      b.addEventListener('click', run);
      tip(b, () => `<div class="tip-title">${title}</div><div class="tip-body">${body}</div>`);
      side.appendChild(b);
      return b;
    };
    this.idleBtn = sideBtn('idle', ICONS.villager, 'Idle Villagers', 'Jump to the next villager with nothing to do.', () => this.onIdleVillager());
    this.armyBtn = sideBtn('idleArmy', ICONS.helmet, 'Idle Military', 'Jump to the next soldier awaiting orders.', () => this.onIdleMilitary());
    sideBtn('army', ICONS.military, 'Select All Military', 'Select every soldier you command.', () => this.onAllMilitary(), false);
    sideBtn('ships', ICONS.ship, 'Select All Ships', 'Available once you have a Dock.', () => {}, false).disabled = true;
    root.appendChild(side);

    this.toasts = el('div', 'toasts');
    root.appendChild(this.toasts);

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
    const workers = (RESOURCE_KINDS as string[]).includes(key);
    s.innerHTML = `<span class="icon">${icon}</span><span class="stat-v" data-v="${key}">0</span>${workers ? `<span class="workers" data-v="${key}W">0</span>` : ''}`;
    s.querySelectorAll<HTMLElement>('[data-v]').forEach((n) => this.values.set(n.dataset.v!, n));
    tip(s, () => `<div class="tip-title">${title}</div><div class="tip-body">${workers ? 'Stockpile, and villagers gathering it.' : 'Population / capacity. Build houses to raise it.'}</div>`);
    return s;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.pauseMenu.hidden = !p;
  }

  /** Short message that fades after a few seconds. */
  toast(message: string): void {
    const t = el('div', 'toast frame');
    t.textContent = message;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => t.classList.add('fade'), 2200);
    setTimeout(() => t.remove(), 2800);
  }

  update(world: World, player: number, idleVillagers = 0, idleMilitary = 0): void {
    const ps = world.players[player];
    this.set('idle', String(idleVillagers));
    this.idleBtn.classList.toggle('has-idle', idleVillagers > 0);
    this.set('idleArmy', String(idleMilitary));
    this.armyBtn.classList.toggle('has-idle', idleMilitary > 0);
    // Villagers working each resource, as on the AoE resource bar.
    const workers = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const u of world.units(player)) {
      const o = u.order;
      if (o?.type === 'gather') workers[o.res]++;
      else if (o?.type === 'dropoff' && u.carry) workers[u.carry.res]++;
    }
    for (const k of RESOURCE_KINDS) this.set(`${k}W`, String(workers[k]));
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
