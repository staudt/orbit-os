import type { Rect } from '../core/gfx';

/** Pure placement math for Moony and its speech balloon (no drawing, testable headless). */

export const MOON_R = 11;
export const BALLOON_MAX_W = 200;
/** distance kept between Moony's edge and what it points at */
const GAP = 5;

export interface Pt { x: number; y: number }
export type Side = 'right' | 'left' | 'above' | 'below';

export function balloonWidth(screenW: number): number {
  return Math.min(BALLOON_MAX_W, screenW - 12);
}

function inside(r: Rect, a: Rect): boolean {
  return r.x >= a.x && r.y >= a.y && r.x + r.w <= a.x + a.w && r.y + r.h <= a.y + a.h;
}

function overlap(a: Rect, b: Rect): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Where Moony's center should go to point at `target`, staying inside `area`
 * (the desktop between the bars). Without a target it sits a little above the middle.
 */
export function placeMoon(target: Rect | null, area: Rect, r = MOON_R): Pt {
  const minX = area.x + r + 2, maxX = area.x + area.w - r - 3;
  const minY = area.y + r + 2, maxY = area.y + area.h - r - 3;
  if (!target) return { x: Math.round(area.x + area.w / 2), y: Math.round(area.y + area.h * 0.4) };
  const cx = target.x + target.w / 2, cy = target.y + target.h / 2;
  const cands: Pt[] = [
    { x: target.x + target.w + GAP + r, y: cy },
    { x: cx, y: target.y + target.h + GAP + r },
    { x: cx, y: target.y - GAP - r },
    { x: target.x - GAP - r, y: cy },
  ].map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  for (const p of cands) {
    if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) return p;
  }
  // a wide target (a maximized title bar): stand just below its left part
  const p = cands[1];
  return { x: clampN(Math.round(target.x + Math.min(target.w / 2, 40)), minX, maxX), y: clampN(p.y, minY, maxY) };
}

export interface BalloonPlace extends Rect {
  side: Side;
  /** where the tail meets the balloon's edge, and its tip (near Moony) */
  tailBase: Pt;
  tailTip: Pt;
}

/**
 * Put a w×h balloon next to Moony (center `moon`), inside `area`, avoiding `avoid`
 * (the thing being pointed at) when possible.
 */
export function layoutBalloon(area: Rect, moon: Pt, w: number, h: number, avoid: Rect | null = null, r = MOON_R): BalloonPlace {
  const g = r + 7;
  const fitX = (x: number) => clampN(x, area.x, area.x + area.w - w);
  const fitY = (y: number) => clampN(y, area.y, area.y + area.h - h);
  const cands: { side: Side; x: number; y: number }[] = [
    { side: 'right', x: moon.x + g, y: fitY(moon.y - Math.round(h / 3)) },
    { side: 'left', x: moon.x - g - w, y: fitY(moon.y - Math.round(h / 3)) },
    { side: 'above', x: fitX(moon.x - Math.round(w / 2)), y: moon.y - g - h },
    { side: 'below', x: fitX(moon.x - Math.round(w / 2)), y: moon.y + g },
  ];
  const moonBox = { x: moon.x - r - 1, y: moon.y - r - 1, w: 2 * r + 3, h: 2 * r + 3 };
  let best: (typeof cands)[number] | null = null;
  let bestScore = Infinity;
  for (const c of cands) {
    const rect = { x: c.x, y: c.y, w, h };
    if (!inside(rect, area)) continue;
    const score = (avoid ? overlap(rect, avoid) : 0) + overlap(rect, moonBox) * 4;
    if (score === 0) { best = c; break; }
    if (score < bestScore) { bestScore = score; best = c; }
  }
  if (!best) {
    // nothing fits cleanly (tiny screen): clamp whichever of above/below has more room
    const roomAbove = moon.y - area.y, roomBelow = area.y + area.h - moon.y;
    best = roomBelow >= roomAbove
      ? { side: 'below', x: fitX(moon.x - Math.round(w / 2)), y: fitY(moon.y + g) }
      : { side: 'above', x: fitX(moon.x - Math.round(w / 2)), y: fitY(moon.y - g - h) };
  }
  const { side, x, y } = best;
  let tailBase: Pt, tailTip: Pt;
  if (side === 'right') {
    tailBase = { x, y: clampN(moon.y, y + 5, y + h - 6) };
    tailTip = { x: moon.x + r + 2, y: moon.y };
  } else if (side === 'left') {
    tailBase = { x: x + w - 1, y: clampN(moon.y, y + 5, y + h - 6) };
    tailTip = { x: moon.x - r - 2, y: moon.y };
  } else if (side === 'above') {
    tailBase = { x: clampN(moon.x, x + 6, x + w - 7), y: y + h - 1 };
    tailTip = { x: moon.x, y: moon.y - r - 2 };
  } else {
    tailBase = { x: clampN(moon.x, x + 6, x + w - 7), y };
    tailTip = { x: moon.x, y: moon.y + r + 2 };
  }
  return { x, y, w, h, side, tailBase, tailTip };
}

/** Step navigation for the tour: index bounds and what happens past the end. */
export class TourNav {
  constructor(public count: number, public index = 0) {}
  next(): 'moved' | 'finished' {
    if (this.index >= this.count - 1) return 'finished';
    this.index++;
    return 'moved';
  }
  back(): boolean {
    if (this.index === 0) return false;
    this.index--;
    return true;
  }
  get first() { return this.index === 0; }
  get last() { return this.index === this.count - 1; }
}
