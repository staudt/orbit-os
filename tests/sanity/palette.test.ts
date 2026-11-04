import { describe, expect, it } from 'vitest';
import { PALETTE_HEX, paletteLUT, nearestColor, PALETTE_RGB, DARKER, LIGHTER } from '../../src/core/palette';
import { Gfx, Surface, PATTERNS } from '../../src/core/gfx';

describe('palette', () => {
  it('has exactly 16 distinct colors', () => {
    expect(PALETTE_HEX.length).toBe(16);
    expect(new Set(PALETTE_HEX).size).toBe(16);
    expect(DARKER.length).toBe(16);
    expect(LIGHTER.length).toBe(16);
  });

  it('framebuffer conversion only produces palette colors', () => {
    const s = new Surface(64, 48);
    const g = new Gfx(s);
    g.fillPattern(0, 0, 64, 48, PATTERNS.d50, 7, 2);
    g.ellipse(4, 4, 40, 30, 15, true);
    g.line(0, 0, 63, 47, 0);
    g.remap(0, 0, 64, 48, DARKER, PATTERNS.d25);
    const lut = paletteLUT();
    const allowed = new Set(Array.from(lut));
    for (const v of s.px) {
      expect(v).toBeLessThan(16);
      expect(allowed.has(lut[v])).toBe(true);
    }
  });

  it('nearestColor maps palette colors to themselves', () => {
    PALETTE_RGB.forEach(([r, g, b], i) => expect(nearestColor(r, g, b)).toBe(i));
  });
});
