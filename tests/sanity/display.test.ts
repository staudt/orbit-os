import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../src/core/display';

const cases: [number, number, number][] = [
  [1280, 720, 1], [1920, 1080, 1], [2560, 1440, 1], [3440, 1440, 1], [800, 1200, 2],
  [1366, 768, 1], [1440, 900, 2], [390, 844, 3], [1024, 768, 1.25], [640, 480, 1],
];

describe('screen layout never stretches', () => {
  it.each(cases)('%ix%i @%f', (w, h, dpr) => {
    const L = computeLayout(w, h, dpr);
    expect(Number.isInteger(L.scale)).toBe(true);
    expect(L.scale).toBeGreaterThanOrEqual(1);
    // logical pixels map to exactly `scale` device pixels in both axes (square, integer)
    expect(L.w * L.scale).toBeLessThanOrEqual(L.devW);
    expect(L.h * L.scale).toBeLessThanOrEqual(L.devH);
    expect(L.devW - L.w * L.scale).toBeLessThan(L.scale);
    expect(L.devH - L.h * L.scale).toBeLessThan(L.scale);
    // CSS box keeps the same aspect as the logical screen
    expect(L.cssW / L.cssH).toBeCloseTo(L.w / L.h, 6);
  });

  it('targets ~480 logical rows on common screens', () => {
    expect(computeLayout(2560, 1440, 1).h).toBe(480);
    expect(computeLayout(1920, 1080, 1).h).toBe(540);
    expect(computeLayout(1280, 720, 1).h).toBe(360);
  });

  it('changes shape with the viewport instead of stretching', () => {
    const wide = computeLayout(3440, 1440, 1), tall = computeLayout(800, 1200, 2);
    expect(wide.w / wide.h).toBeCloseTo(3440 / 1440, 1);
    expect(tall.w / tall.h).toBeCloseTo(800 / 1200, 1);
  });

  it('honours a scale override but never makes a uselessly tiny screen', () => {
    expect(computeLayout(1920, 1080, 1, 3).scale).toBe(3);
    expect(computeLayout(640, 480, 1, 6).scale).toBeLessThan(6);
  });
});
