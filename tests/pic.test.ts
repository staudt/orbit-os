import { describe, expect, it } from 'vitest';
import { Surface } from '../src/core/gfx';
import { encodePic, decodePic, isPic, quantize } from '../src/fs/pic';
import { PALETTE_RGB } from '../src/core/palette';

describe('.PIC codec', () => {
  it('round-trips pixels, including long runs', () => {
    const s = new Surface(300, 7);
    for (let i = 0; i < s.px.length; i++) s.px[i] = i < 1000 ? 9 : (i * 7) % 16;
    const bytes = encodePic(s);
    expect(isPic(bytes)).toBe(true);
    const back = decodePic(bytes);
    expect([back.w, back.h]).toEqual([300, 7]);
    expect(Array.from(back.px)).toEqual(Array.from(s.px));
  });
  it('rejects non-pictures', () => {
    expect(() => decodePic(new Uint8Array([1, 2, 3]))).toThrow();
  });
  it('quantizes palette colors to themselves and transparency to the background', () => {
    const rgba = new Uint8ClampedArray(17 * 4);
    PALETTE_RGB.forEach(([r, g, b], i) => rgba.set([r, g, b, 255], i * 4));
    rgba.set([0, 0, 0, 0], 16 * 4);
    const s = quantize(rgba, 17, 1, false, 9);
    expect(Array.from(s.px)).toEqual([...Array.from({ length: 16 }, (_, i) => i), 9]);
  });
});
