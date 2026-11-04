import { Gfx, Surface, BAYER4 } from './gfx';
import { C } from './palette';
import { drawDigit } from './sevenseg';

const TR = 255;

/** A ringed planet with continents — the Internet Navigator icon, drawn procedurally. */
export function navigatorIcon(size: 16 | 32): Surface {
  const s = new Surface(size, size, TR);
  const g = new Gfx(s);
  const big = size === 32;
  const cx = big ? 15.5 : 7.5, cy = big ? 16 : 8;
  const r = big ? 11 : 5.6;
  const tilt = -0.42;
  const rx = r * 1.62, ry = r * 0.38;
  const ring = (front: boolean, col: number, thick: number) => {
    for (let i = 0; i < 720; i++) {
      const t = (i / 720) * Math.PI * 2;
      const ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
      if (ey > 0 !== front) continue;
      const x = Math.round(cx + ex * Math.cos(tilt) - ey * Math.sin(tilt));
      const y = Math.round(cy + ex * Math.sin(tilt) + ey * Math.cos(tilt));
      for (let k = 0; k < thick; k++) g.pset(x, y + k, col);
    }
  };
  // back half of the ring (outline then color)
  ring(false, C.INK, big ? 3 : 2);
  ring(false, C.YELLOW, big ? 2 : 1);
  // the sphere: lavender, shaded toward the lower right with ordered dither, green continents
  const land = (x: number, y: number) => {
    const u = (x - cx) / r, v = (y - cy) / r;
    return (Math.sin(u * 4.1 + 1.3) + Math.cos(v * 3.7 - 0.4) + Math.sin((u + v) * 2.3)) > 1.15;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - cx - 0.5, dy = y + 0.5 - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > r + 0.6) continue;
    if (d > r - 0.4) { s.px[y * size + x] = C.INK; continue; }
    const shade = (dx + dy) / (r * 1.5) + 0.15;
    const dark = BAYER4[(y & 3) * 4 + (x & 3)] / 16 < shade;
    let c: number = dark ? C.PURPLE : C.LAVENDER;
    if (land(x, y)) c = dark ? C.PLUM_DARK : C.GREEN;
    // highlight
    if (dx < -r * 0.35 && dy < -r * 0.35 && d < r * 0.75 && d > r * 0.45) c = C.PALE;
    s.px[y * size + x] = c;
  }
  // front half of the ring
  ring(true, C.INK, big ? 3 : 2);
  ring(true, C.YELLOW, big ? 2 : 1);
  if (big) {
    // a little sparkle: the "star" you navigate by
    g.pset(28, 4, C.CREAM);
    g.pset(27, 4, C.YELLOW); g.pset(29, 4, C.YELLOW); g.pset(28, 3, C.YELLOW); g.pset(28, 5, C.YELLOW);
  }
  return s;
}

/** A little LED clock: dark rounded case with orange segments. */
export function clockIcon(size: 16 | 32): Surface {
  const s = new Surface(size, size, TR);
  const g = new Gfx(s);
  if (size === 32) {
    g.fillRect(2, 7, 28, 17, C.INK);
    g.rect(1, 6, 30, 19, C.PLUM_DARK);
    g.hline(2, 29, 5, C.INK); g.hline(2, 29, 25, C.INK); g.vline(0, 7, 23, C.INK); g.vline(31, 7, 23, C.INK);
    g.fillRect(3, 25, 4, 2, C.INK); g.fillRect(25, 25, 4, 2, C.INK);
    const digits = ['1', '2', '0', '0'];
    const xs = [4, 10, 18, 24];
    digits.forEach((d, i) => drawDigit(g, xs[i], 9, 5, 12, 1, d, C.ORANGE, C.PLUM_DARK));
    g.pset(16, 12, C.ORANGE); g.pset(16, 17, C.ORANGE);
  } else {
    g.fillRect(1, 3, 14, 10, C.INK);
    g.rect(0, 2, 16, 12, C.PLUM_DARK);
    drawDigit(g, 2, 4, 5, 8, 1, '1', C.ORANGE, -1);
    drawDigit(g, 9, 4, 5, 8, 1, '2', C.ORANGE, -1);
    g.pset(8, 6, C.ORANGE); g.pset(8, 9, C.ORANGE);
  }
  return s;
}

export const PROCEDURAL_ICONS: Record<string, (size: 16 | 32) => Surface> = {
  navigator: navigatorIcon,
  clock: clockIcon,
};
