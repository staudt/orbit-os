import type { SeedFile } from '../fs/seed';
import { makeWallpaper } from '../wm/wallpaper';
import { encodePic } from '../fs/pic';
import { TUNE_SEEDS } from './tunes';
import { M4_SEEDS } from './m4';
import { SCREENSAVER_SEEDS } from './m5';

const BUDGET = `Item,Jan,Feb,Mar,Total
Rent,650,650,650,=B2+C2+D2
Groceries,210.5,198,225.75,=B3+C3+D3
Power,48,52,45,=B4+C4+D4
Fun,60,35,80,=B5+C5+D5
Total,=B2+B3+B4+B5,=C2+C3+C4+C5,=D2+D3+D4+D5,=E2+E3+E4+E5
,,,,
Budget per month,1000,,,
Left in March,=B8-D6,,,
`;

/** Sample files for Draw, Calc, Internet Navigator and Music (seed version 3). */
export function m3Seeds(): SeedFile[] {
  return [
    { path: '/Desktop/Draw.LNK', content: JSON.stringify({ app: 'draw' }), since: 3 },
    { path: '/Desktop/Calc.LNK', content: JSON.stringify({ app: 'calc' }), since: 3 },
    { path: '/Desktop/Internet Navigator.LNK', content: JSON.stringify({ app: 'browser' }), since: 3 },
    { path: '/Desktop/Music.LNK', content: JSON.stringify({ app: 'music' }), since: 3 },
    { path: '/Pictures/SUNSET.PIC', content: encodePic(makeWallpaper(320, 200, 'sunset')), since: 3 },
    { path: '/Data/BUDGET.CSV', content: BUDGET, since: 3 },
    { path: '/Desktop/Console.LNK', content: JSON.stringify({ app: 'console' }), since: 4 },
    { path: '/Desktop/Clock.LNK', content: JSON.stringify({ app: 'clock' }), since: 4 },
    ...TUNE_SEEDS,
    ...M4_SEEDS,
    ...SCREENSAVER_SEEDS,
  ];
}
