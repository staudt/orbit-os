import { describe, expect, it } from 'vitest';
import { Doc, B, I, BIG, layoutDoc } from '../src/apps/write/doc';

const m = { advance: (_ch: string, st: number) => (st & BIG ? 10 : 5) };

describe('Write document model', () => {
  it('inserts, splits and joins paragraphs', () => {
    const d = Doc.fromText('hello world');
    const end = d.insert({ p: 0, o: 5 }, ',\nnew', B);
    expect(d.paras.map((p) => p.text)).toEqual(['hello,', 'new world']);
    expect(end).toEqual({ p: 1, o: 3 });
    expect(d.paras[1].st.slice(0, 3)).toEqual([B, B, B]);
    d.delete({ p: 0, o: 6 }, { p: 1, o: 0 });
    expect(d.plainText).toBe('hello,new world');
  });

  it('applies and detects styles over a range', () => {
    const d = Doc.fromText('abc\ndef');
    d.setStyle({ p: 0, o: 1 }, { p: 1, o: 2 }, I, true);
    expect(d.allHave({ p: 0, o: 1 }, { p: 1, o: 2 }, I)).toBe(true);
    expect(d.allHave({ p: 0, o: 0 }, { p: 1, o: 2 }, I)).toBe(false);
  });

  it('round-trips through .WRT runs', () => {
    const d = Doc.fromText('Title\nbody text');
    d.setStyle({ p: 0, o: 0 }, { p: 0, o: 5 }, B | BIG, true);
    d.paras[0].align = 'center';
    const back = Doc.fromWrt(d.toWrt());
    expect(back.paras).toEqual(d.paras);
    expect(JSON.parse(d.toWrt()).paras[0]).toEqual({ align: 'center', runs: [{ t: 'Title', b: 1, s: 2 }] });
  });

  it('word-wraps without exceeding the width', () => {
    const d = Doc.fromText('the quick brown fox jumps over the lazy dog again and again');
    const lines = layoutDoc(d, 60, m);
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) {
      const t = d.paras[0].text.slice(l.start, l.end).trimEnd();
      expect(t.length * 5).toBeLessThanOrEqual(60);
    }
    // every character is on exactly one line
    expect(lines.map((l) => d.paras[0].text.slice(l.start, l.end)).join('')).toBe(d.paras[0].text);
  });

  it('centers lines', () => {
    const d = Doc.fromText('ab');
    d.paras[0].align = 'center';
    expect(layoutDoc(d, 100, m)[0].x).toBe(45);
  });
});
