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

  it('prefers 3x pixels on desktops, stepping down when the desktop would be too small', () => {
    expect(computeLayout(2560, 1440, 1)).toMatchObject({ scale: 3, w: 853, h: 480 });
    expect(computeLayout(3840, 2160, 1)).toMatchObject({ scale: 3, w: 1280, h: 720 });
    expect(computeLayout(1920, 1080, 1)).toMatchObject({ scale: 3, w: 640, h: 360 });
    expect(computeLayout(1280, 720, 1)).toMatchObject({ scale: 2, w: 640, h: 360 });
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

describe('per-monitor pixel size', () => {
  const qhd = { w: 2560, h: 1440, phone: false };
  it('keeps the same pixel size when the browser window changes size', () => {
    const full = computeLayout(2560, 1440, 1, 0, qhd);
    const windowed = computeLayout(2000, 1300, 1, 0, qhd);
    expect(full.scale).toBe(3);
    expect(windowed.scale).toBe(full.scale);
    expect(windowed.w).toBeLessThan(full.w); // less desktop, same pixels
  });
  it('steps down in windows too small to use, so the desktop stays spacious', () => {
    const big = { w: 3840, h: 2160, phone: false };
    const L = computeLayout(800, 600, 1, 0, big);
    expect(L.w).toBeGreaterThanOrEqual(400);
    expect(L.h).toBeGreaterThanOrEqual(300);
    expect(L.scale).toBe(2);
  });
  it('uses 4x pixels on phones', () => {
    const phone = { w: 390, h: 844, phone: true };
    expect(computeLayout(390, 844, 3, 0, phone)).toMatchObject({ scale: 4, w: 292, h: 633 });
    // landscape still fits
    const land = computeLayout(844, 390, 3, 0, phone);
    expect(land.scale).toBe(4);
    expect(land.h).toBeGreaterThanOrEqual(240);
  });
});
