// The bottom-left command centre: a 3x2 command card (AoE-style sockets) and the
// selection info panel (portrait, health, stat block, status, or a portrait grid
// for groups). Appears only while something is selected or a building is being sited.
import type { Controller } from '../input/controller';
import { isGatherer } from '../sim/economy';
import { BUILDING_DEFS, type BuildingType, type Entity, UNIT_DEFS, type Unit } from '../sim/entities';
import type { World } from '../sim/world';
import { ICONS } from './icons';
import { portrait } from './portraits';
import { hideTip, tip } from './tooltip';

const RES_NAMES = { food: 'Food', wood: 'Wood', gold: 'Gold', stone: 'Stone' } as const;
type Res = keyof typeof RES_NAMES;
const ICON = ICONS as unknown as Record<string, string>;
const CAP = 10;

/** Build tabs; buildings arrive in later milestones and simply join their tab. */
const TABS: Array<{ key: string; name: string; icon: string; types: BuildingType[] }> = [
  { key: 'economy', name: 'Economy', icon: ICONS.economy, types: ['house', 'mill', 'lumber_camp', 'mining_camp'] },
  { key: 'military', name: 'Military', icon: ICONS.military, types: [] },
  { key: 'defense', name: 'Defense', icon: ICONS.meleeArmor, types: [] },
  { key: 'naval', name: 'Naval', icon: ICONS.ship, types: [] },
];

interface Cmd {
  icon: string;
  label: string;
  run: () => void;
  tip?: () => string;
  disabled?: () => boolean;
  /** Small caption under the icon, e.g. a cost. */
  caption?: string;
  active?: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
}

function costHtml(cost: Record<string, number>): string {
  return Object.entries(cost)
    .map(([k, v]) => `<span class="cost"><span class="icon">${ICON[k]}</span>${v}</span>`)
    .join('');
}

function tipHtml(title: string, body: string, cost?: Record<string, number>): string {
  return `<div class="tip-title">${title}</div>${cost ? `<div class="tip-cost">${costHtml(cost)}</div>` : ''}<div class="tip-body">${body}</div>`;
}

/** One-line account of what a unit is doing. */
function status(w: World, u: Unit): string {
  const o = u.order;
  if (!o) return 'Idle';
  switch (o.type) {
    case 'move':
      return 'Moving';
    case 'gather':
      return `${u.state === 'gather' ? 'Gathering' : 'Heading to'} ${RES_NAMES[o.res]}`;
    case 'dropoff': {
      const b = w.building(o.id);
      return `Returning to ${b ? BUILDING_DEFS[b.type].name : 'store'}`;
    }
    case 'build': {
      const b = w.building(o.id);
      return `${u.state === 'build' ? 'Building' : 'Going to build'} ${b ? BUILDING_DEFS[b.type].name : ''}`;
    }
  }
}

export class CommandCenter {
  private readonly root: HTMLElement;
  private readonly card: HTMLElement;
  private readonly info: HTMLElement;
  private shown = '';
  /** Which build tab is open, or null for the unit's main commands. */
  private tab: string | null = null;
  private live: Array<() => void> = [];

  constructor(
    parent: HTMLElement,
    private readonly ctl: Controller,
    private readonly world: World,
    private readonly player: number,
  ) {
    this.root = el('div', 'cc');
    this.card = el('div', 'cc-card frame');
    this.info = el('div', 'cc-info frame');
    this.root.append(this.card, this.info);
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
    hideTip();
  }

  update(): void {
    this.ctl.prune();
    const sig = `${this.ctl.version}|${this.tab}|${this.ctl.placing ? 'p' : ''}`;
    if (sig !== this.shown) {
      this.shown = sig;
      this.rebuild();
    }
    for (const f of this.live) f();
  }

  private rebuild(): void {
    this.live = [];
    hideTip();
    const ents = [...this.ctl.selection].map((id) => this.world.get(id)).filter((e): e is Entity => !!e);
    if (!ents.length && !this.ctl.placing) {
      this.root.hidden = true;
      this.tab = null;
      return;
    }
    this.root.hidden = false;
    this.renderCard(this.commands());
    if (this.ctl.placing) this.renderPlacingInfo();
    else if (ents.length === 1) this.renderSingle(ents[0]);
    else this.renderGroup(ents);
  }

  // ---------- command card ----------

  private commands(): Array<Cmd | null> {
    const { ctl } = this;
    if (ctl.placing) {
      const def = BUILDING_DEFS[ctl.placing.type];
      return [
        { icon: ICONS.check, label: `Place ${def.name}`, run: () => ctl.confirmPlacing(), disabled: () => !ctl.placementValid() },
        null,
        null,
        null,
        null,
        { icon: ICONS.close, label: 'Cancel', run: () => ctl.cancelPlacing() },
      ];
    }
    const own = ctl.ownUnits();
    const villagers = own.some(isGatherer);
    const res = this.world.players[this.player].resources;
    if (this.tab && villagers) {
      const tab = TABS.find((t) => t.key === this.tab)!;
      const slots: Array<Cmd | null> = tab.types.map((type) => {
        const def = BUILDING_DEFS[type];
        const cost = def.cost as Record<string, number>;
        return {
          icon: ICON[type],
          label: def.name,
          caption: Object.values(cost).join('/'),
          run: () => {
            this.tab = null;
            ctl.startPlacing(type);
          },
          disabled: () => Object.entries(cost).some(([k, v]) => res[k as Res] < v),
          tip: () => tipHtml(def.name, def.description, cost),
        };
      });
      while (slots.length < 5) slots.push(null);
      slots.length = 5;
      slots.push({ icon: ICONS.back, label: 'Back', run: () => (this.tab = null) });
      return slots;
    }
    const slots: Array<Cmd | null> = [];
    if (villagers) {
      for (const t of TABS.slice(0, 2))
        slots.push({
          icon: t.icon,
          label: `Build ${t.name}`,
          run: () => (this.tab = t.key),
          disabled: () => !t.types.length,
          tip: () => tipHtml(`Build ${t.name} Buildings`, t.types.length ? t.types.map((k) => BUILDING_DEFS[k].name).join(', ') : 'Available in a later age.'),
        });
    }
    if (own.length) slots.push({ icon: ICONS.stop, label: 'Stop', run: () => ctl.stop(), tip: () => tipHtml('Stop', 'Abandon the current task.') });
    while (slots.length < 5) slots.push(null);
    slots.push({ icon: ICONS.close, label: 'Deselect', run: () => ctl.deselect() });
    return slots;
  }

  private renderCard(cmds: Array<Cmd | null>): void {
    this.card.innerHTML = '';
    for (const c of cmds) {
      if (!c) {
        this.card.appendChild(el('div', 'socket'));
        continue;
      }
      const b = el('button', 'cmd-btn', `${c.icon}${c.caption ? `<span class="cmd-cap">${c.caption}</span>` : ''}`);
      b.setAttribute('aria-label', c.label);
      if (c.active) b.classList.add('active');
      b.addEventListener('click', () => {
        if (b.disabled) return;
        c.run();
      });
      tip(b, c.tip ?? (() => tipHtml(c.label, '')));
      if (c.disabled) {
        const d = c.disabled;
        const refresh = () => b.toggleAttribute('disabled', d());
        refresh();
        this.live.push(refresh);
      }
      this.card.appendChild(b);
    }
  }

  // ---------- info panel ----------

  private renderSingle(e: Entity): void {
    const name = e.kind === 'unit' ? UNIT_DEFS[e.type].name : e.kind === 'building' ? BUILDING_DEFS[e.type].name : e.type[0].toUpperCase() + e.type.slice(1);
    const owner = e.kind === 'resource' ? '' : e.owner === this.player ? 'Your realm' : `Player ${e.owner + 1}`;
    this.info.innerHTML = `
      <div class="pf-frame"><div class="pf">${portrait(e)}</div></div>
      <div class="ci-body">
        <div class="ci-head"><span class="ci-name">${name}</span><span class="ci-owner">${owner}</span></div>
        <div class="hp"><div class="hp-fill"></div><span class="hp-text"></span></div>
        <div class="stats"></div>
        <div class="ci-status"><span class="ci-status-text"></span><span class="carry"></span></div>
      </div>`;
    const fill = this.info.querySelector<HTMLElement>('.hp-fill')!;
    const hpText = this.info.querySelector<HTMLElement>('.hp-text')!;
    const statusEl = this.info.querySelector<HTMLElement>('.ci-status-text')!;
    const carryEl = this.info.querySelector<HTMLElement>('.carry')!;
    const stats = this.info.querySelector<HTMLElement>('.stats')!;
    this.renderStats(stats, e);
    let lastCarry = '';
    this.live.push(() => {
      const cur = this.world.get(e.id);
      if (!cur) return;
      let frac = 1, text = '', st = '', carry = '';
      if (cur.kind === 'unit') {
        const max = UNIT_DEFS[cur.type].hp;
        frac = cur.hp / max;
        text = `${Math.ceil(cur.hp)} / ${max}`;
        st = cur.owner === this.player ? status(this.world, cur) : '';
        if (cur.carry && cur.carry.amount > 0)
          carry = `<span class="icon">${ICON[cur.carry.res]}</span><span class="carry-bar"><span style="width:${(cur.carry.amount / CAP) * 100}%"></span></span><b>${cur.carry.amount}/${CAP}</b>`;
      } else if (cur.kind === 'building') {
        const def = BUILDING_DEFS[cur.type];
        frac = cur.complete ? cur.hp / def.hp : cur.progress;
        text = cur.complete ? `${Math.ceil(cur.hp)} / ${def.hp}` : `Building… ${Math.floor(cur.progress * 100)}%`;
        st = cur.complete ? def.description : 'Under construction';
      } else {
        text = `${cur.amount} food`;
        st = 'Select villagers, then tap it to gather.';
      }
      fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
      fill.classList.toggle('low', frac < 0.35);
      fill.classList.toggle('build', cur.kind === 'building' && !cur.complete);
      if (hpText.textContent !== text) hpText.textContent = text;
      if (statusEl.textContent !== st) statusEl.textContent = st;
      if (carry !== lastCarry) carryEl.innerHTML = lastCarry = carry;
    });
  }

  private renderStats(box: HTMLElement, e: Entity): void {
    const items: Array<[string, string, string]> = [];
    if (e.kind === 'unit') {
      const d = UNIT_DEFS[e.type] as (typeof UNIT_DEFS)[keyof typeof UNIT_DEFS] & { attack: number; meleeArmor: number; pierceArmor: number; range: number };
      items.push(['attack', String(d.attack), 'Attack']);
      items.push(['meleeArmor', String(d.meleeArmor), 'Melee armor']);
      items.push(['pierceArmor', String(d.pierceArmor), 'Pierce armor']);
      if (d.range) items.push(['range', String(d.range), 'Range']);
      items.push(['speed', d.speed.toFixed(1), 'Speed (tiles per second)']);
      items.push(['los', String(d.los), 'Line of sight']);
    } else if (e.kind === 'building') {
      const d = BUILDING_DEFS[e.type];
      items.push(['meleeArmor', String(d.meleeArmor), 'Melee armor']);
      items.push(['pierceArmor', String(d.pierceArmor), 'Pierce armor']);
      items.push(['los', String(d.los), 'Line of sight']);
      if (d.pop) items.push(['pop', `+${d.pop}`, 'Population supported']);
      for (const r of d.dropoff) items.push([r, '', `Stores ${RES_NAMES[r as Res]}`]);
    }
    for (const [icon, value, label] of items) {
      const s = el('span', 'stat-chip', `<span class="icon">${ICON[icon]}</span>${value ? `<b>${value}</b>` : ''}`);
      tip(s, () => tipHtml(label, ''));
      box.appendChild(s);
    }
  }

  private renderGroup(ents: Entity[]): void {
    this.info.innerHTML = '';
    const grid = el('div', 'pgrid');
    const max = 16;
    for (const e of ents.slice(0, max)) {
      const t = el('button', 'ptile', `${portrait(e)}<span class="ptile-hp"><span></span></span>`);
      const bar = t.querySelector<HTMLElement>('.ptile-hp span')!;
      this.live.push(() => {
        const cur = this.world.get(e.id);
        if (cur?.kind === 'unit') bar.style.width = `${(cur.hp / UNIT_DEFS[cur.type].hp) * 100}%`;
      });
      t.addEventListener('click', () => this.ctl.select([e.id]));
      grid.appendChild(t);
    }
    if (ents.length > max) grid.appendChild(el('div', 'ptile more', `+${ents.length - max}`));
    const head = el('div', 'ci-head', `<span class="ci-name">${ents.length} selected</span><span class="ci-owner">Tap a portrait to pick one</span>`);
    const body = el('div', 'ci-body');
    body.append(head, grid);
    this.info.appendChild(body);
  }

  private renderPlacingInfo(): void {
    const p = this.ctl.placing!;
    const def = BUILDING_DEFS[p.type];
    this.info.innerHTML = `
      <div class="pf-frame"><div class="pf">${portrait({ kind: 'building', type: p.type, owner: this.player, id: 0, x: 0, y: 0, size: def.size, hp: 0, progress: 0, complete: true })}</div></div>
      <div class="ci-body">
        <div class="ci-head"><span class="ci-name">${def.name}</span><span class="ci-owner">${costHtml(def.cost as Record<string, number>)}</span></div>
        <div class="ci-status"><span class="ci-status-text">Tap the map to choose a spot, then confirm.</span></div>
        <div class="ci-status"><span class="ci-status-text dim">${def.description}</span></div>
      </div>`;
  }
}
