import type { SeedFile } from '../fs/seed';
import TANKS from './games/tanks.bas?raw';
import NITEMAZE from './games/nitemaze.bas?raw';
import TRADER from './games/trader.bas?raw';
import WORM from './games/worm.bas?raw';
import MINES from './games/mines.bas?raw';
import ADVENTUR from './games/adventur.bas?raw';

/** BASIC games (seed versions 7 and 8). */
export const GAME_SEEDS: SeedFile[] = [
  { path: '/Programs/TANKS.BAS', content: TANKS, since: 7 },
  { path: '/Programs/NITEMAZE.BAS', content: NITEMAZE, since: 7 },
  { path: '/Programs/TRADER.BAS', content: TRADER, since: 8 },
  { path: '/Programs/WORM.BAS', content: WORM, since: 8 },
  { path: '/Programs/MINES.BAS', content: MINES, since: 8 },
  { path: '/Programs/ADVENTUR.BAS', content: ADVENTUR, since: 8 },
];

/** File names of the games (the Launcher lists these under Games). */
export const GAME_FILES = ['GUESS.BAS', 'LANDER.BAS', ...GAME_SEEDS.map((f) => f.path.slice(f.path.lastIndexOf('/') + 1))];
