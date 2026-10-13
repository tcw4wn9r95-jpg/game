// Technologies and ages: what each player has researched, the effective unit and
// building stats that follow from it, and the rules for what can be researched,
// trained and built in each age.
import ages from '../data/ages.json';
import techs from '../data/techs.json';
import type { ResourceKind } from './constants';
import { BUILDING_DEFS, type Building, type BuildingType, UNIT_DEFS, type UnitClass, type UnitDef, type UnitType } from './entities';
import type { World } from './world';

export type TechId = keyof typeof techs;

export type TechEffect =
  | { type: 'age'; age: number }
  | {
      type: 'unit';
      units?: UnitType[];
      classes?: UnitClass[];
      attack?: number;
      meleeArmor?: number;
      pierceArmor?: number;
      range?: number;
      hp?: number;
      los?: number;
      speedMult?: number;
    }
  | { type: 'upgrade'; unit: UnitType; name: string }
  | { type: 'gather'; sources: string[]; mult: number }
  | { type: 'carry'; add: number }
  | { type: 'farm'; add: number }
  | { type: 'building'; los?: number; hpMult?: number; meleeArmor?: number; pierceArmor?: number }
  | { type: 'buildSpeed'; mult: number };

export interface TechDef {
  name: string;
  building: BuildingType;
  /** Age (0-3) needed to research it. */
  age: number;
  cost: Partial<Record<ResourceKind, number>>;
  /** Research time, seconds. */
  time: number;
  description: string;
  effects: TechEffect[];
  requires?: TechId;
  icon?: string;
}

export const TECH_DEFS = techs as unknown as Record<TechId, TechDef>;
export const TECH_IDS = Object.keys(TECH_DEFS) as TechId[];

export interface AgeDef {
  name: string;
  numeral: string;
  cost: Partial<Record<ResourceKind, number>>;
  researchSeconds: number;
  requires?: { age: number; buildings: number };
}
export const AGES = ages as AgeDef[];

/** Everything a player's research changes. Rebuilt from scratch whenever a tech completes. */
export interface PlayerMods {
  units: Record<UnitType, UnitDef>;
  /** Gather-rate multiplier per source (tree, gold, farm, ...). */
  gather: Record<string, number>;
  carry: number;
  farmFood: number;
  buildSpeed: number;
  building: { los: number; hpMult: number; meleeArmor: number; pierceArmor: number };
}

export function baseMods(): PlayerMods {
  const units = {} as Record<UnitType, UnitDef>;
  for (const k of Object.keys(UNIT_DEFS) as UnitType[]) units[k] = { ...UNIT_DEFS[k], bonus: { ...UNIT_DEFS[k].bonus } };
  return { units, gather: {}, carry: 0, farmFood: 0, buildSpeed: 1, building: { los: 0, hpMult: 1, meleeArmor: 0, pierceArmor: 0 } };
}

/** Applies one tech's effects to a player's modifiers (age changes are applied by the caller). */
export function applyEffects(m: PlayerMods, id: TechId): void {
  for (const e of TECH_DEFS[id].effects) {
    switch (e.type) {
      case 'unit':
        for (const k of Object.keys(m.units) as UnitType[]) {
          const d = m.units[k];
          if (!(e.units?.includes(k) || e.classes?.some((c) => d.classes.includes(c)))) continue;
          if (e.attack && d.attack > 0) d.attack += e.attack;
          if (e.meleeArmor) d.meleeArmor += e.meleeArmor;
          if (e.pierceArmor) d.pierceArmor += e.pierceArmor;
          if (e.range && d.range > 0) d.range += e.range;
          if (e.hp) d.hp += e.hp;
          if (e.los) d.los += e.los;
          if (e.speedMult) d.speed *= e.speedMult;
        }
        break;
      case 'upgrade':
        m.units[e.unit].name = e.name;
        break;
      case 'gather':
        for (const s of e.sources) m.gather[s] = (m.gather[s] ?? 1) * e.mult;
        break;
      case 'carry':
        m.carry += e.add;
        break;
      case 'farm':
        m.farmFood += e.add;
        break;
      case 'building':
        m.building.los += e.los ?? 0;
        m.building.hpMult *= e.hpMult ?? 1;
        m.building.meleeArmor += e.meleeArmor ?? 0;
        m.building.pierceArmor += e.pierceArmor ?? 0;
        break;
      case 'buildSpeed':
        m.buildSpeed *= e.mult;
        break;
      case 'age':
        break;
    }
  }
}

// ---------- effective stats ----------

/** A unit type's stats for its owner, after research. */
export function unitStats(w: World, owner: number, type: UnitType): UnitDef {
  return w.players[owner]?.mods.units[type] ?? UNIT_DEFS[type];
}

/** Max HP of a building for its owner. */
export function buildingMaxHp(w: World, b: Building): number {
  return Math.round(BUILDING_DEFS[b.type].hp * (w.players[b.owner]?.mods.building.hpMult ?? 1));
}

export function buildingArmor(w: World, b: Building): { melee: number; pierce: number } {
  const def = BUILDING_DEFS[b.type], m = w.players[b.owner]?.mods.building;
  return { melee: def.meleeArmor + (m?.meleeArmor ?? 0), pierce: def.pierceArmor + (m?.pierceArmor ?? 0) };
}

// ---------- rules ----------

/** Distinct building types of an age the player has completed (each age-up needs two). */
export function ageBuildings(w: World, owner: number, age: number): BuildingType[] {
  const seen = new Set<BuildingType>();
  for (const b of w.buildings(owner)) {
    const def = BUILDING_DEFS[b.type];
    if (b.complete && def.advance && def.age === age) seen.add(b.type);
  }
  return [...seen];
}

/** Why a tech can't be researched now, or null if it can. */
export function researchBlock(w: World, owner: number, id: TechId): string | null {
  const p = w.players[owner];
  const t = TECH_DEFS[id];
  if (p.techs.includes(id)) return 'Already researched';
  if (isResearching(w, owner, id)) return 'Already being researched';
  if (t.age > p.age) return `Requires the ${AGES[t.age].name} Age`;
  if (t.requires && !p.techs.includes(t.requires)) return `Requires ${TECH_DEFS[t.requires].name}`;
  const ageUp = t.effects.find((e) => e.type === 'age');
  if (ageUp) {
    const req = AGES[ageUp.age].requires;
    if (p.age !== ageUp.age - 1) return 'Not available';
    if (req) {
      const have = ageBuildings(w, owner, req.age).length;
      if (have < req.buildings) return `Needs ${req.buildings} ${AGES[req.age].name} Age buildings (you have ${have})`;
    }
    if (ageUpInProgress(w, owner)) return 'Already advancing';
  }
  return null;
}

export function isResearching(w: World, owner: number, id: TechId): boolean {
  for (const b of w.buildings(owner)) if (b.queue.some((q) => q.tech === id)) return true;
  return false;
}

function ageUpInProgress(w: World, owner: number): boolean {
  for (const b of w.buildings(owner)) if (b.queue.some((q) => q.tech && TECH_DEFS[q.tech].effects.some((e) => e.type === 'age'))) return true;
  return false;
}

/** Techs a building offers, in display order: the ones still to research and possible now or later. */
export function techsAt(type: BuildingType): TechId[] {
  return TECH_IDS.filter((id) => TECH_DEFS[id].building === type);
}

/** Finishes a tech: records it and applies its effects (raising existing units' HP with their max). */
export function completeTech(w: World, owner: number, id: TechId): void {
  const p = w.players[owner];
  if (p.techs.includes(id)) return;
  const before = baseMods();
  for (const t of p.techs) applyEffects(before, t);
  p.techs.push(id);
  const after = baseMods();
  for (const t of p.techs) applyEffects(after, t);
  p.mods = after;
  for (const e of TECH_DEFS[id].effects) if (e.type === 'age') p.age = e.age;
  // Existing units and buildings gain any added HP straight away.
  for (const u of w.units(owner)) u.hp += after.units[u.type].hp - before.units[u.type].hp;
  if (after.building.hpMult !== before.building.hpMult)
    for (const b of w.buildings(owner)) b.hp *= after.building.hpMult / before.building.hpMult;
  // Farms planted from now on yield more.
  w.events.push({ type: 'researched', owner, tech: id });
}
