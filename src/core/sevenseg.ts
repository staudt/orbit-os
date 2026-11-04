import type { Gfx } from './gfx';

// segment layout: a top, b top-right, c bottom-right, d bottom, e bottom-left, f top-left, g middle
const DIGITS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc',
  '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '',
};

/** Draw one seven-segment digit: lit segments in `on`, unlit "ghost" segments in `off`. */
export function drawDigit(g: Gfx, x: number, y: number, w: number, h: number, t: number, ch: string, on: number, off: number) {
  const lit = DIGITS[ch] ?? '';
  const half = Math.floor(h / 2);
  const seg = (name: string, sx: number, sy: number, horiz: boolean, len: number) => {
    const col = lit.includes(name) ? on : off;
    if (col < 0) return;
    for (let k = 0; k < t; k++) {
      // bevelled ends: each row/column of the segment is shorter toward its edges
      const inset = Math.abs(k - (t - 1) / 2) | 0;
      if (horiz) g.hline(sx + inset + 1, sx + len - 2 - inset, sy + k, col);
      else g.vline(sx + k, sy + inset + 1, sy + len - 2 - inset, col);
    }
  };
  seg('a', x, y, true, w);
  seg('g', x, y + half - (t >> 1), true, w);
  seg('d', x, y + h - t, true, w);
  seg('f', x, y, false, half + 1);
  seg('e', x, y + half, false, h - half);
  seg('b', x + w - t, y, false, half + 1);
  seg('c', x + w - t, y + half, false, h - half);
}
