import type { Gfx } from './gfx';
import { C } from './palette';

/** Moony's radius at normal size; features scale from it. */
const BASE_R = 11;

const CRATERS = [
  { dx: 5, dy: -6, r: 2 },
  { dx: -6, dy: 5, r: 1.5 },
  { dx: 7, dy: 3, r: 1 },
  { dx: -3, dy: -8, r: 1 },
];

/**
 * The moon itself: a pale disc with craters, a dithered night side whose offset `shadow`
 * sets the phase (0 = full), and a face that blinks and looks left/right.
 */
export function drawMoon(g: Gfx, cx: number, cy: number, r: number, shadow: number, blink: boolean, look: number) {
  const r2 = (r + 0.5) * (r + 0.5);
  const scale = r / BASE_R;
  // outline: a disc one pixel larger
  const o2 = (r + 1.5) * (r + 1.5);
  for (let dy = -r - 1; dy <= r + 1; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, o2 - dy * dy)));
    g.hline(cx - half, cx + half, cy + dy, C.INK);
  }
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
    for (let dx = -half; dx <= half; dx++) {
      const dark = shadow !== 0 && (dx - shadow) * (dx - shadow) + dy * dy <= r2;
      let crater = false;
      for (const c of CRATERS) {
        const ex = dx - c.dx * scale, ey = dy - c.dy * scale, cr = c.r * scale + 0.3;
        if (ex * ex + ey * ey <= cr * cr) { crater = true; break; }
      }
      let col: number;
      if (dark) col = crater ? C.PURPLE : ((cx + dx + cy + dy) & 1) ? C.MAUVE : C.GREY;
      else if (crater) col = C.TAN;
      else col = dx + dy < -r * 0.9 ? C.CREAM : C.PALE;
      g.pset(cx + dx, cy + dy, col);
    }
  }
  if (r < 8) return;
  // face
  const ex = look;
  for (const sx of [-4, 3]) {
    const x = cx + sx + ex, y = cy - 3;
    if (blink) g.hline(x, x + 1, y + 2, C.INK);
    else {
      g.fillRect(x, y, 2, 3, C.INK);
      g.pset(x, y, C.CREAM);
    }
  }
  g.pset(cx - 4 + ex, cy + 2, C.INK);
  g.hline(cx - 3 + ex, cx + 3 + ex, cy + 3, C.INK);
  g.pset(cx + 4 + ex, cy + 2, C.INK);
  g.hline(cx - 7 + ex, cx - 6 + ex, cy + 1, C.ORANGE);
  g.hline(cx + 6 + ex, cx + 7 + ex, cy + 1, C.ORANGE);
}
