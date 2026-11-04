import { describe, expect, it } from 'vitest';
import { SANS, MONO, wrapText } from '../../src/core/fonts';

describe('bitmap fonts', () => {
  it('cover printable ASCII', () => {
    for (let c = 32; c < 127; c++) {
      const ch = String.fromCharCode(c);
      expect(SANS.advance(ch)).toBeGreaterThan(0);
      expect(MONO.advance(ch)).toBe(6);
    }
  });
  it('measure is additive and wraps', () => {
    expect(SANS.measure('ab')).toBe(SANS.measure('a') + SANS.measure('b'));
    expect(MONO.measure('hello')).toBe(30);
    const lines = wrapText(SANS, 'the quick brown fox jumps over the lazy dog', 60);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(SANS.measure(l)).toBeLessThanOrEqual(60);
  });
});
