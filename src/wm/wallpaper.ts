import { Gfx, Surface, PATTERNS } from '../core/gfx';
import { C } from '../core/palette';

export type WallpaperKind = 'sunset' | 'plain' | 'pattern';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1D ridge via midpoint displacement, values in [0,1]. */
function ridge(w: number, rand: () => number, rough: number, seedPeaks: number[]): number[] {
  const n = 1 << Math.ceil(Math.log2(Math.max(2, w)));
  const a = new Array(n + 1).fill(0);
  const segs = seedPeaks.length - 1;
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * segs;
    const k = Math.min(segs - 1, Math.floor(p));
    const f = p - k;
    a[i] = seedPeaks[k] * (1 - f) + seedPeaks[k + 1] * f;
  }
  // segs must divide n evenly (callers pass 2^k + 1 control points)
  let step = Math.max(2, Math.floor(n / Math.max(1, segs)));
  let amp = rough;
  while (step >= 2) {
    for (let i = step / 2; i < n; i += step) {
      a[i] = (a[i - step / 2] + a[i + step / 2]) / 2 + (rand() - 0.5) * amp;
    }
    step /= 2;
    amp *= 0.55;
  }
  return Array.from({ length: w }, (_, x) => {
    const v = a[Math.floor((x / w) * n)];
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.4;
  });
}

export function makeWallpaper(w: number, h: number, kind: WallpaperKind): Surface {
  const s = new Surface(w, h);
  const g = new Gfx(s);
  if (kind === 'plain') {
    g.fillPattern(0, 0, w, h, PATTERNS.d12, C.LAVENDER, C.PURPLE);
    return s;
  }
  if (kind === 'pattern') {
    g.fillPattern(0, 0, w, h, PATTERNS.weave, C.TAN, C.CREAM);
    return s;
  }
  drawSunset(g, w, h);
  return s;
}

/**
 * Flat horizontal bands with "venetian blind" scanline transitions between them —
 * every pixel is a solid palette color, no ordered dithering (as in the reference art).
 */
function bandedFill(g: Gfx, y0: number, y1: number, w: number, stops: { at: number; c: number }[], period: number) {
  const H = y1 - y0;
  const trans = period * 4;
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / H;
    let i = 0;
    while (i < stops.length - 1 && t >= stops[i + 1].at) i++;
    let c = stops[i].c;
    const next = stops[i + 1];
    if (next) {
      const boundary = y0 + Math.round(next.at * H);
      const k = boundary - y; // rows left before the boundary
      if (k > 0 && k <= trans) {
        // within the transition: block b (0..3) has b+1 of `period` rows in the next color
        const block = 3 - Math.floor((k - 1) / period);
        const row = (k - 1) % period;
        if (row < Math.min(period - 1, block + 1)) c = next.c;
      }
    }
    g.hline(0, w - 1, y, c);
  }
}

function sparkle(g: Gfx, x: number, y: number, big: boolean) {
  g.pset(x, y, C.CREAM);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.pset(x + dx, y + dy, C.PALE);
  if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) g.pset(x + dx, y + dy, C.YELLOW);
}

/** Flat 90s cloud: a few stacked capsules with a flat base. */
function cloud(g: Gfx, cx: number, cy: number, size: number, rand: () => number, body: number, under: number) {
  const parts = 3 + Math.floor(rand() * 2);
  const spans: [number, number, number][] = []; // x, w, h
  let x = cx - Math.round(size * 1.6);
  for (let i = 0; i < parts; i++) {
    const pw = Math.round(size * (0.9 + rand() * 0.8));
    const ph = Math.round(size * (0.35 + (i === 1 || i === 2 ? 0.35 : 0.15) * (0.7 + rand() * 0.6)));
    spans.push([x, pw, ph]);
    x += Math.round(pw * 0.6);
  }
  for (const [sx, sw, sh] of spans) {
    for (let j = 0; j < sh; j++) {
      // rounded top: inset the first rows
      const inset = j === 0 ? 2 : j === 1 ? 1 : 0;
      g.hline(sx + inset, sx + sw - 1 - inset, cy - sh + j, body);
    }
  }
  const left = spans[0][0], right = spans[spans.length - 1][0] + spans[spans.length - 1][1] - 1;
  g.hline(left, right, cy, under);
  g.hline(left + 2, right - 2, cy + 1, under);
}

function flower(g: Gfx, x: number, y: number, h: number, petal: number, big: boolean, rand: () => number) {
  // stem with a leaf
  g.vline(x, y + 1, y + h, C.GREEN);
  const ly = y + Math.round(h * 0.55);
  const side = rand() < 0.5 ? -1 : 1;
  g.pset(x + side, ly, C.GREEN);
  g.pset(x + side * 2, ly - 1, C.GREEN);
  if (big) {
    // 5x5 rounded bloom
    g.hline(x - 1, x + 1, y - 2, petal);
    g.hline(x - 2, x + 2, y - 1, petal);
    g.hline(x - 2, x + 2, y, petal);
    g.hline(x - 2, x + 2, y + 1, petal);
    g.hline(x - 1, x + 1, y + 2, petal);
    g.pset(x, y, C.RED);
    g.pset(x - 1, y - 1, C.PALE);
  } else {
    g.pset(x, y - 1, petal); g.pset(x - 1, y, petal); g.pset(x + 1, y, petal); g.pset(x, y + 1, petal);
    g.pset(x, y, C.RED);
  }
}

function drawSunset(g: Gfx, w: number, h: number) {
  const rand = rng(1991);
  const hy = Math.round(h * 0.66); // horizon
  // size celestial objects by the shorter side so portrait screens stay balanced
  const u = Math.min(h, w * 0.75);
  const period = Math.max(3, Math.round(h / 96));

  // ---- sky: flat bands, dark plum overhead to sunset yellow at the horizon
  bandedFill(g, 0, hy, w, [
    { at: 0, c: C.INK },
    { at: 0.16, c: C.PLUM_DARK },
    { at: 0.4, c: C.PLUM },
    { at: 0.56, c: C.MAGENTA },
    { at: 0.68, c: C.CRIMSON },
    { at: 0.79, c: C.RED },
    { at: 0.88, c: C.ORANGE },
    { at: 0.95, c: C.YELLOW },
  ], period);

  // ---- stars & sparkles in the dark upper sky
  const starCount = Math.round((w * hy) / 1400);
  for (let i = 0; i < starCount; i++) {
    const x = Math.floor(rand() * w), y = Math.floor(rand() * hy * 0.38);
    g.pset(x, y, rand() < 0.35 ? C.CREAM : C.PALE);
  }
  const sparkles = Math.max(4, Math.round(w / 90));
  for (let i = 0; i < sparkles; i++) {
    sparkle(g, Math.floor(rand() * w), 6 + Math.floor(rand() * hy * 0.36), rand() < 0.45);
  }

  // ---- crescent planet, upper right (pale peach with a tan shadow and a cream ring)
  const pr = Math.max(8, Math.round(u * 0.085));
  const pcx = Math.round(Math.min(w * 0.85, w - pr * 2.4)), pcy = Math.round(Math.max(pr * 1.6, h * 0.17));
  const sx = Math.round(pr * 0.45), sy = Math.round(pr * 0.3);
  const ringRx = pr * 1.9, ringRy = Math.max(2, pr * 0.32), tilt = -0.28;
  const ringPt = (t: number): [number, number] => {
    const ex = Math.cos(t) * ringRx, ey = Math.sin(t) * ringRy;
    return [Math.round(pcx + ex * Math.cos(tilt) - ey * Math.sin(tilt)), Math.round(pcy + ex * Math.sin(tilt) + ey * Math.cos(tilt))];
  };
  for (let i = 0; i < 360; i++) { const t = (i / 360) * Math.PI * 2; if (Math.sin(t) < 0) { const [x, y] = ringPt(t); g.pset(x, y, C.TAN); } }
  for (let dy = -pr; dy <= pr; dy++) {
    const half = Math.floor(Math.sqrt((pr + 0.5) ** 2 - dy * dy));
    for (let dx = -half; dx <= half; dx++) {
      // lit area = inside a circle shifted toward the upper left; the rest is the crescent shadow
      const lit = (dx + sx) ** 2 + (dy + sy) ** 2 <= (pr * 1.12) ** 2;
      const rim = lit && dx * dx + dy * dy > (pr - 1.2) ** 2 && dx + dy < -pr * 0.3;
      g.pset(pcx + dx, pcy + dy, rim ? C.CREAM : lit ? C.PALE : C.TAN);
    }
  }
  // a couple of craters
  g.hline(pcx - Math.round(pr * 0.4), pcx - Math.round(pr * 0.2), pcy - Math.round(pr * 0.25), C.TAN);
  g.hline(pcx + Math.round(pr * 0.1), pcx + Math.round(pr * 0.25), pcy + Math.round(pr * 0.35), C.TAN);
  for (let i = 0; i < 360; i++) { const t = (i / 360) * Math.PI * 2; if (Math.sin(t) >= 0) { const [x, y] = ringPt(t); g.pset(x, y, C.CREAM); } }

  // ---- striped sun sinking behind the mountains
  const sr = Math.max(12, Math.round(u * 0.14));
  const scx = Math.round(w * 0.33), scy = hy - Math.round(sr * 1.05);
  const gapPeriod = Math.max(4, Math.round(sr / 3.5));
  for (let dy = -sr; dy <= sr; dy++) {
    const y = scy + dy;
    if (y >= hy) break;
    // gaps widen toward the bottom
    if (dy > -sr * 0.05) {
      const k = (dy + sr) % gapPeriod;
      const gap = Math.max(1, Math.round(((dy + sr * 0.05) / (sr * 1.05)) * (gapPeriod - 1)));
      if (k < gap) continue;
    }
    const half = Math.floor(Math.sqrt((sr + 0.5) ** 2 - dy * dy));
    const t = (dy + sr) / (2 * sr);
    const c = t < 0.12 ? C.PALE : t < 0.55 ? C.YELLOW : C.ORANGE;
    g.hline(scx - half, scx + half, y, c);
  }

  // ---- flat clouds drifting in the sunset bands
  const clouds = Math.max(2, Math.round(w / 220));
  for (let i = 0; i < clouds; i++) {
    const cx = Math.round(((i + 0.5) / clouds) * w + (rand() - 0.5) * (w / clouds) * 0.6);
    const cy = Math.round(hy * (0.6 + rand() * 0.22));
    const size = Math.max(5, Math.round(u * (0.018 + rand() * 0.014)));
    cloud(g, cx, cy, size, rand, rand() < 0.5 ? C.PALE : C.TAN, C.ORANGE);
  }
  // one high, dim cloud
  cloud(g, Math.round(w * 0.12), Math.round(hy * 0.42), Math.max(4, Math.round(h * 0.014)), rand, C.MAUVE, C.MAGENTA);

  // ---- far mountains: purple with cream snow on the high peaks
  const far = ridge(w, rand, 0.5, [0.55, 0.8, 0.3, 0.15, 0.55, 0.9, 0.55, 0.75, 0.45]);
  const farH = h * 0.2;
  for (let x = 0; x < w; x++) {
    const top = Math.round(hy - far[x] * farH);
    const snow = far[x] > 0.6 ? Math.round(2 + (far[x] - 0.6) * 22 + ((x * 7) % 3)) : 0;
    for (let y = top; y < hy; y++) {
      const d = y - top;
      let c: number = C.PURPLE;
      if (d < snow) c = C.CREAM;
      else if (d < snow + 1 && snow) c = C.LAVENDER;
      else if (d === 0) c = C.LAVENDER;
      g.pset(x, y, c);
    }
  }
  // ---- near hills: dark plum with a magenta rim
  const near = ridge(w, rand, 0.45, [0.55, 0.2, 0.35, 0.15, 0.3, 0.45, 0.2, 0.3, 0.6]);
  const nearH = h * 0.11;
  for (let x = 0; x < w; x++) {
    const top = Math.round(hy + 2 - near[x] * nearH);
    for (let y = top; y < hy + 2; y++) g.pset(x, y, y === top ? C.MAGENTA : C.PLUM_DARK);
  }

  // ---- ground: rolling foreground hills in darker layers
  g.fillRect(0, hy + 2, w, h - hy - 2, C.PLUM_DARK);
  const hillLayer = (base: number, amp: number, peaks: number[], fill: number, rim: number) => {
    const r = ridge(w, rand, 0.12, peaks);
    for (let x = 0; x < w; x++) {
      const top = Math.round(base - r[x] * amp);
      g.vline(x, top, h - 1, fill);
      g.pset(x, top, rim);
    }
  };
  const gh = h - hy;
  hillLayer(hy + gh * 0.5, gh * 0.28, [0.3, 0.6, 0.4, 0.2, 0.5, 0.7, 0.4, 0.3, 0.55], C.PLUM, C.MAGENTA);
  hillLayer(hy + gh * 0.82, gh * 0.3, [0.7, 0.5, 0.2, 0.1, 0.15, 0.1, 0.25, 0.5, 0.75], C.INK, C.PLUM);

  // ---- flowers & grass in both bottom corners
  const band = Math.round(h * 0.11);
  const patch = (x0: number, x1: number) => {
    for (let x = x0; x < x1; x++) {
      if (rand() < 0.55) g.vline(x, h - 1 - Math.round(rand() * 4), h - 1, C.GREEN);
    }
    const n = Math.round((x1 - x0) / 9);
    for (let i = 0; i < n; i++) {
      const fx = Math.round(x0 + 3 + rand() * (x1 - x0 - 6));
      const fy = h - 4 - Math.round(rand() * band);
      const big = rand() < 0.45;
      flower(g, fx, fy, h - fy, rand() < 0.6 ? C.YELLOW : C.ORANGE, big, rand);
    }
  };
  patch(0, Math.round(w * 0.22));
  patch(Math.round(w * 0.76), w);
}
