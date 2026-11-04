import { BitmapFont } from './font';
import { MONO_GLYPHS } from './mono-data';
import { SANS_GLYPHS } from './sans-data';

export { BitmapFont, wrapText, LINE_H, ROWS, BASELINE } from './font';
export type { TextStyle } from './font';

export const SANS = new BitmapFont('Orbit Sans', SANS_GLYPHS, false);
export const MONO = new BitmapFont('Orbit Mono', MONO_GLYPHS, true);
