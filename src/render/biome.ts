import type { MapType } from '../sim/terrain';

/** Per-map-type look: ground palette, tree mix and small decorations. */
export interface Biome {
  grass: string;
  grassSpecks: string[];
  dirt: string;
  sand: string;
  shallow: string;
  deep: string;
  /** Relative weights for tree sprites: dark oak, light oak, pine, tall pine. */
  trees: [number, number, number, number];
  flowers: string[];
  /** Chance (0-1) that a grass tile carries a flower cluster. */
  flowerRate: number;
  /** Strength of large-scale light/dark ground patches. */
  patchStrength: number;
}

export const BIOMES: Record<MapType, Biome> = {
  heartland: {
    grass: '#5b9a3f',
    grassSpecks: ['#76b555', '#477f30', '#6aa84b'],
    dirt: '#9c7b4e',
    sand: '#dcc683',
    shallow: '#6cbcc8',
    deep: '#2b6aa3',
    trees: [3, 4, 1, 0],
    flowers: ['#f4e04d', '#ffffff', '#e86a8f'],
    flowerRate: 0.05,
    patchStrength: 0.2,
  },
  coastal: {
    grass: '#8f9f4c',
    grassSpecks: ['#a9b862', '#748838', '#b8c070'],
    dirt: '#b08e5e',
    sand: '#e6d391',
    shallow: '#74c4cc',
    deep: '#28689f',
    trees: [1, 2, 3, 1],
    flowers: ['#ffffff', '#f0d060'],
    flowerRate: 0.03,
    patchStrength: 0.22,
  },
  lakes: {
    grass: '#3f7f4f',
    grassSpecks: ['#55985f', '#2f6a3e', '#64a66a'],
    dirt: '#8d7552',
    sand: '#cfc08a',
    shallow: '#6ab4c4',
    deep: '#24618f',
    trees: [1, 1, 4, 3],
    flowers: ['#b6a4f0', '#ffffff'],
    flowerRate: 0.035,
    patchStrength: 0.18,
  },
  islands: {
    grass: '#5fb34a',
    grassSpecks: ['#7fd05a', '#469038', '#97d867'],
    dirt: '#a98a5c',
    sand: '#ecdca0',
    shallow: '#5cc6cf',
    deep: '#1f74a8',
    trees: [2, 3, 1, 1],
    flowers: ['#ff8a5c', '#ffe26a', '#ffffff'],
    flowerRate: 0.05,
    patchStrength: 0.2,
  },
};

/** Picks a tree sprite index from a hash using the biome's weights. */
export function pickTree(b: Biome, hash: number): number {
  const total = b.trees[0] + b.trees[1] + b.trees[2] + b.trees[3];
  let r = hash % total;
  for (let i = 0; i < 4; i++) {
    if (r < b.trees[i]) return i;
    r -= b.trees[i];
  }
  return 0;
}
