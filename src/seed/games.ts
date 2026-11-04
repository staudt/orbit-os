import type { SeedFile } from '../fs/seed';
import TANKS from './games/tanks.bas?raw';
import NITEMAZE from './games/nitemaze.bas?raw';

/** BASIC games (seed version 7). */
export const GAME_SEEDS: SeedFile[] = [
  { path: '/Programs/TANKS.BAS', content: TANKS, since: 7 },
  { path: '/Programs/NITEMAZE.BAS', content: NITEMAZE, since: 7 },
];
