import type { Gfx } from '../core/gfx';
import { C } from '../core/palette';

const BANDS = [C.YELLOW, C.YELLOW, C.ORANGE, C.ORANGE, C.RED, C.CRIMSON, C.MAGENTA, C.PLUM];

/**
 * The Orbit mark: a striped sunset planet with a tilted ring.
 * Drawn procedurally so it stays crisp at any pixel size.
 */
export function drawPlanet(g: Gfx, cx: number, cy: number, r: number, opts: { ring?: boolean; gaps?: boolean; ringColor?: number; outline?: number } = {}) {
  const ring = opts.ring ?? true;
  const ringColor = opts.ringColor ?? C.YELLOW;
  const tilt = -0.32;
  const rx = r * 1.75, ry = r * 0.42;
  const ringPts = (front: boolean, fn: (x: number, y: number) => void) => {
    const steps = Math.max(48, Math.round(rx * 10));
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
      if (ey > 0 !== front) continue;
      const x = ex * Math.cos(tilt) - ey * Math.sin(tilt);
      const y = ex * Math.sin(tilt) + ey * Math.cos(tilt);
      fn(Math.round(cx + x), Math.round(cy + y));
    }
  };
  const thick = r >= 10 ? 2 : 1;
  const drawRing = (front: boolean) => {
    ringPts(front, (x, y) => {
      if (opts.outline !== undefined) { g.pset(x, y - 1, opts.outline); g.pset(x, y + thick, opts.outline); }
    });
    ringPts(front, (x, y) => { for (let k = 0; k < thick; k++) g.pset(x, y + k, ringColor); });
  };
  if (ring) drawRing(false);
  // planet body
  const r2 = (r + 0.5) * (r + 0.5);
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
    const f = (dy + r) / (2 * r + 1);
    const col = BANDS[Math.min(BANDS.length - 1, Math.floor(f * BANDS.length))];
    // retro gaps in the lower half (thicker toward the bottom)
    if (opts.gaps !== false && dy > 0 && r >= 6) {
      const period = Math.max(3, Math.round(r / 3));
      const k = dy % period;
      const gap = Math.max(1, Math.round((dy / r) * (period - 1)));
      if (k < gap && dy > r * 0.2) continue;
    }
    if (opts.outline !== undefined) {
      g.pset(cx - half - 1, cy + dy, opts.outline);
      g.pset(cx + half + 1, cy + dy, opts.outline);
    }
    g.hline(cx - half, cx + half, cy + dy, col);
  }
  if (opts.outline !== undefined) {
    g.hline(cx - Math.floor(r / 2), cx + Math.floor(r / 2), cy - r - 1, opts.outline);
  }
  if (ring) drawRing(true);
}
