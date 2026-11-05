import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/core/gfx';
import { MOON_R, TourNav, balloonWidth, layoutBalloon, placeMoon } from '../../src/wm/moonylayout';
import { TIPS } from '../../src/wm/moonytips';

const TOP = 15, BOTTOM = 20;
const desk = (w: number, h: number): Rect => ({ x: 0, y: TOP, w, h: h - TOP - BOTTOM });
const balloonArea = (w: number, h: number): Rect => ({ x: 4, y: TOP + 2, w: w - 8, h: h - TOP - BOTTOM - 4 });
const inside = (r: Rect, a: Rect) => r.x >= a.x && r.y >= a.y && r.x + r.w <= a.x + a.w && r.y + r.h <= a.y + a.h;

const screens: [number, number][] = [[200, 150], [211, 480], [320, 480], [640, 480], [1280, 480]];

describe('Moony layout', () => {
  it.each(screens)('%ix%i: Moony and the balloon stay on screen', (W, H) => {
    const D = desk(W, H);
    const targets: (Rect | null)[] = [
      null,
      { x: 4, y: TOP + 6, w: 52, h: 44 }, // first desktop icon
      { x: Math.floor((W - Math.min(W, 480)) / 2) + 3, y: H - BOTTOM + 2, w: 58, h: 16 }, // Launch button
      { x: 2, y: 0, w: 18, h: 14 }, // Orbit logo
      { x: 0, y: TOP, w: W, h: 16 }, // maximized title bar
      { x: W - 120, y: TOP + 40, w: 110, h: 16 }, // title bar near the right edge
    ];
    for (const t of targets) {
      const m = placeMoon(t, D);
      expect(m.x - MOON_R).toBeGreaterThanOrEqual(D.x);
      expect(m.x + MOON_R).toBeLessThan(D.x + D.w);
      expect(m.y - MOON_R).toBeGreaterThanOrEqual(D.y);
      expect(m.y + MOON_R).toBeLessThan(D.y + D.h);
      for (const bh of [50, 80, 110]) {
        const A = balloonArea(W, H);
        const bw = balloonWidth(W);
        const p = layoutBalloon(A, m, bw, Math.min(bh, A.h), t);
        expect(inside(p, A)).toBe(true);
      }
    }
  });

  it('points next to its target rather than on top of it', () => {
    const D = desk(640, 480);
    const t = { x: 4, y: TOP + 6, w: 52, h: 44 };
    const m = placeMoon(t, D);
    const onTarget = m.x >= t.x && m.x < t.x + t.w && m.y >= t.y && m.y < t.y + t.h;
    expect(onTarget).toBe(false);
  });

  it('keeps the balloon off the highlighted target when there is room', () => {
    const D = desk(640, 480), A = balloonArea(640, 480);
    const t = { x: 3, y: 480 - BOTTOM + 2, w: 58, h: 16 };
    const p = layoutBalloon(A, placeMoon(t, D), balloonWidth(640), 70, t);
    const ox = Math.min(p.x + p.w, t.x + t.w) - Math.max(p.x, t.x);
    const oy = Math.min(p.y + p.h, t.y + t.h) - Math.max(p.y, t.y);
    expect(ox > 0 && oy > 0).toBe(false);
  });
});

describe('Moony tour navigation', () => {
  it('walks forward, back, and finishes after the last step', () => {
    const nav = new TourNav(3);
    expect(nav.first).toBe(true);
    expect(nav.back()).toBe(false);
    expect(nav.next()).toBe('moved');
    expect(nav.back()).toBe(true);
    expect(nav.index).toBe(0);
    nav.next(); nav.next();
    expect(nav.last).toBe(true);
    expect(nav.next()).toBe('finished');
    expect(nav.index).toBe(2);
  });
});

describe('Moony tips', () => {
  it('are short, printable and unique', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TIPS).size).toBe(TIPS.length);
    for (const t of TIPS) {
      expect(t.length).toBeLessThanOrEqual(110);
      expect(t).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});
