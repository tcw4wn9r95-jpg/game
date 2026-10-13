import type { Controller } from '../input/controller';
import { isGatherer } from '../sim/economy';
import { BUILDING_DEFS, type BuildingType, type Entity, UNIT_DEFS, type Unit } from '../sim/entities';
import type { World } from '../sim/world';
import { ICONS } from './icons';

const RES_NAMES = { food: 'Food', wood: 'Wood', gold: 'Gold', stone: 'Stone' } as const;
const BUILD_MENU: BuildingType[] = ['house', 'lumber_camp', 'mining_camp', 'mill'];
const ICON_FOR: Record<string, string> = ICONS as unknown as Record<string, string>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
}

function costText(cost: Record<string, number>): string {
  return Object.entries(cost)
    .map(([k, v]) => `<span class="cost"><span class="icon">${ICON_FOR[k]}</span>${v}</span>`)
    .join('');
}

/** What a unit is up to, in words. */
function status(w: World, u: Unit): string {
  const o = u.order;
  const carry = u.carry && u.carry.amount > 0 ? ` · carrying ${u.carry.amount} ${RES_NAMES[u.carry.res]}` : '';
  if (!o) return `Idle${carry}`;
  switch (o.type) {
    case 'move':
      return `Moving${carry}`;
    case 'gather':
      return `${u.state === 'gather' ? 'Gathering' : 'Heading to'} ${RES_NAMES[o.res]}${carry}`;
    case 'dropoff': {
      const b = w.building(o.id);
      return `Taking ${u.carry?.amount ?? 0} ${u.carry ? RES_NAMES[u.carry.res] : ''} to ${b ? BUILDING_DEFS[b.type].name : 'store'}`;
    }
    case 'build': {
      const b = w.building(o.id);
      return `${u.state === 'build' ? 'Building' : 'Going to build'} ${b ? BUILDING_DEFS[b.type].name : ''}`;
    }
  }
}

/**
 * Bottom-centre panel for the current selection (portrait, health, status and
 * commands), the build menu, and the placement bar while siting a building.
 */
export class SelectionPanel {
  private readonly panel: HTMLElement;
  private readonly buildMenu: HTMLElement;
  private readonly placeBar: HTMLElement;
  private shownVersion = -1;
  private menuOpen = false;
  private live: Array<() => void> = [];

  constructor(
    root: HTMLElement,
    private readonly ctl: Controller,
    private readonly world: World,
    private readonly player: number,
  ) {
    this.panel = el('div', 'selpanel frame');
    this.buildMenu = el('div', 'buildmenu frame');
    this.placeBar = el('div', 'placebar frame');
    for (const e of [this.panel, this.buildMenu, this.placeBar]) {
      e.hidden = true;
      root.appendChild(e);
    }
  }

  update(): void {
    this.ctl.prune();
    const sig = this.ctl.version * 2 + (this.menuOpen ? 1 : 0);
    if (sig !== this.shownVersion) {
      this.shownVersion = sig;
      this.rebuild();
    }
    for (const f of this.live) f();
  }

  private rebuild(): void {
    this.live = [];
    const { ctl } = this;
    if (ctl.placing) {
      this.panel.hidden = this.buildMenu.hidden = true;
      return this.buildPlaceBar();
    }
    this.placeBar.hidden = true;
    const ents = [...ctl.selection].map((id) => this.world.get(id)).filter((e): e is Entity => !!e);
    if (!ents.length) {
      this.panel.hidden = this.buildMenu.hidden = true;
      this.menuOpen = false;
      return;
    }
    this.panel.hidden = false;
    this.panel.innerHTML = '';
    const info = el('div', 'sel-info');
    const cmds = el('div', 'sel-cmds');
    this.panel.append(info, cmds);

    if (ents.length === 1) this.single(info, ents[0]);
    else this.group(info, ents);

    const own = ctl.ownUnits();
    if (own.some(isGatherer)) cmds.appendChild(this.button(ICONS.hammer, 'Build', () => ((this.menuOpen = !this.menuOpen), (this.shownVersion = -1)), this.menuOpen));
    if (own.length) cmds.appendChild(this.button(ICONS.stop, 'Stop', () => ctl.stop()));
    cmds.appendChild(this.button(ICONS.close, 'Deselect', () => ctl.deselect()));

    this.buildMenu.hidden = !(this.menuOpen && own.some(isGatherer));
    if (!this.buildMenu.hidden) this.buildBuildMenu();
  }

  private single(info: HTMLElement, e: Entity): void {
    const name = e.kind === 'unit' ? UNIT_DEFS[e.type].name : e.kind === 'building' ? BUILDING_DEFS[e.type].name : e.type[0].toUpperCase() + e.type.slice(1);
    info.innerHTML = `
      <div class="portrait">${ICON_FOR[e.type] ?? ''}</div>
      <div class="sel-text">
        <div class="sel-name">${name}</div>
        <div class="sel-bar"><div class="sel-bar-fill"></div><span class="sel-bar-text"></span></div>
        <div class="sel-status"></div>
      </div>`;
    const fill = info.querySelector<HTMLElement>('.sel-bar-fill')!;
    const barText = info.querySelector<HTMLElement>('.sel-bar-text')!;
    const statusEl = info.querySelector<HTMLElement>('.sel-status')!;
    this.live.push(() => {
      const cur = this.world.get(e.id);
      if (!cur) return;
      let frac = 1, text = '', st = '';
      if (cur.kind === 'unit') {
        const max = UNIT_DEFS[cur.type].hp;
        frac = cur.hp / max;
        text = `${Math.ceil(cur.hp)} / ${max}`;
        st = cur.owner === this.player ? status(this.world, cur) : 'Enemy';
      } else if (cur.kind === 'building') {
        const def = BUILDING_DEFS[cur.type];
        if (cur.complete) {
          frac = cur.hp / def.hp;
          text = `${Math.ceil(cur.hp)} / ${def.hp}`;
          const drop = (def.dropoff as string[]).map((r) => RES_NAMES[r as keyof typeof RES_NAMES]);
          st = [def.pop ? `+${def.pop} population` : '', drop.length ? `Stores ${drop.join(', ')}` : ''].filter(Boolean).join(' · ');
        } else {
          frac = cur.progress;
          text = `${Math.floor(cur.progress * 100)}%`;
          st = 'Under construction';
        }
      } else {
        frac = 1;
        text = `${cur.amount} food`;
        st = 'Send villagers to gather';
      }
      fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
      fill.dataset.low = String(frac < 0.35);
      if (barText.textContent !== text) barText.textContent = text;
      if (statusEl.textContent !== st) statusEl.textContent = st;
    });
  }

  private group(info: HTMLElement, ents: Entity[]): void {
    const counts = new Map<string, number>();
    for (const e of ents) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    info.innerHTML = `<div class="sel-group">${[...counts]
      .map(([t, n]) => `<div class="sel-chip"><span class="portrait sm">${ICON_FOR[t] ?? ''}</span><b>${n}</b></div>`)
      .join('')}</div>`;
  }

  private buildBuildMenu(): void {
    this.buildMenu.innerHTML = '';
    const res = this.world.players[this.player].resources;
    for (const type of BUILD_MENU) {
      const def = BUILDING_DEFS[type];
      const cost = def.cost as Record<string, number>;
      const b = el('button', 'build-card', `<span class="portrait">${ICON_FOR[type]}</span><span class="build-name">${def.name}</span><span class="build-cost">${costText(cost)}</span>`);
      const refresh = () => {
        const ok = Object.entries(cost).every(([k, v]) => res[k as keyof typeof res] >= v);
        b.classList.toggle('unaffordable', !ok);
      };
      refresh();
      this.live.push(refresh);
      b.addEventListener('click', () => {
        this.menuOpen = false;
        this.ctl.startPlacing(type);
      });
      this.buildMenu.appendChild(b);
    }
  }

  private buildPlaceBar(): void {
    const p = this.ctl.placing!;
    const def = BUILDING_DEFS[p.type];
    this.placeBar.hidden = false;
    this.placeBar.innerHTML = `
      <span class="portrait">${ICON_FOR[p.type]}</span>
      <div class="place-text"><b>${def.name}</b><span>Tap the map to move it</span></div>`;
    const ok = this.button(ICONS.check, 'Place', () => this.ctl.confirmPlacing());
    const cancel = this.button(ICONS.close, 'Cancel', () => this.ctl.cancelPlacing());
    this.placeBar.append(ok, cancel);
    this.live.push(() => ok.toggleAttribute('disabled', !this.ctl.placementValid()));
  }

  private button(icon: string, label: string, fn: () => void, active = false): HTMLButtonElement {
    const b = el('button', 'cmd-btn', icon);
    b.setAttribute('aria-label', label);
    b.title = label;
    if (active) b.classList.add('active');
    b.addEventListener('click', fn);
    return b;
  }

  destroy(): void {
    this.panel.remove();
    this.buildMenu.remove();
    this.placeBar.remove();
  }
}
