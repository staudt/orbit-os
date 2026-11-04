import { Gfx, Surface, BAYER4 } from '../core/gfx';
import { C } from '../core/palette';
import { SANS } from '../core/fonts';
import { drawPlanet } from './logo';

/** Draw the boot splash: logo, status line and a progress bar driven by real init steps. */
export function drawSplash(s: Surface, progress: number, status: string, error = false) {
  const g = new Gfx(s);
  const { w, h } = s;
  // dithered night-to-dusk backdrop
  for (let y = 0; y < h; y++) {
    const t = y / h;
    for (let x = 0; x < w; x++) {
      const f = t * 2;
      const i = Math.min(1, Math.floor(f));
      const frac = Math.floor((f - i) * 5) / 5;
      const cols = [C.INK, C.PLUM_DARK, C.PLUM];
      s.px[y * w + x] = BAYER4[(y & 3) * 4 + (x & 3)] / 16 < frac ? cols[i + 1] : cols[i];
    }
  }
  const cy = Math.floor(h * 0.42);
  const r = Math.max(14, Math.round(h * 0.07));
  const style = { bold: true, size: Math.max(2, Math.round(h / 160)) };
  const tw = SANS.measure('Orbit', style);
  const total = r * 2 + 14 + tw;
  const x0 = Math.floor((w - total) / 2);
  drawPlanet(g, x0 + r, cy, r, { ringColor: C.YELLOW });
  SANS.draw(g, x0 + r * 2 + 16, cy - Math.floor((7 * style.size) / 2), 'Orbit', C.CREAM, style);
  const sub = 'P E R S O N A L    S Y S T E M';
  SANS.draw(g, Math.floor((w - SANS.measure(sub)) / 2), cy + r + 10, sub, C.ORANGE);

  // progress bar
  const bw = Math.min(200, w - 40), bh = 7;
  const bx = Math.floor((w - bw) / 2), by = cy + r + 30;
  g.rect(bx, by, bw, bh, C.CREAM);
  const fill = Math.round((bw - 4) * Math.max(0, Math.min(1, progress)));
  const cols = [C.YELLOW, C.ORANGE, C.RED, C.CRIMSON];
  for (let i = 0; i < fill; i++) g.vline(bx + 2 + i, by + 2, by + bh - 3, cols[Math.floor((i / (bw - 4)) * cols.length)]);
  SANS.draw(g, Math.floor((w - SANS.measure(status)) / 2), by + 13, status, error ? C.YELLOW : C.LAVENDER);
}
