/**
 * Write's document model: paragraphs of characters with a per-character style mask.
 * Character-level storage keeps editing simple; files store compact runs.
 */

export const B = 1, I = 2, U = 4, BIG = 8;
export type Align = 'left' | 'center' | 'right';

export interface Para {
  align: Align;
  text: string;
  /** style bitmask per character (same length as text) */
  st: number[];
}

export interface Pos {
  p: number;
  o: number;
}

export interface WrtRun { t: string; b?: 1; i?: 1; u?: 1; s?: 2 }
export interface WrtFile {
  format: 'orbit-write';
  version: 1;
  paras: { align?: Align; runs: WrtRun[] }[];
}

export function emptyPara(align: Align = 'left'): Para {
  return { align, text: '', st: [] };
}

export function cmpPos(a: Pos, b: Pos): number {
  return a.p - b.p || a.o - b.o;
}
export function minPos(a: Pos, b: Pos) { return cmpPos(a, b) <= 0 ? a : b; }
export function maxPos(a: Pos, b: Pos) { return cmpPos(a, b) <= 0 ? b : a; }

export class Doc {
  paras: Para[] = [emptyPara()];

  clone(): Para[] {
    return this.paras.map((p) => ({ align: p.align, text: p.text, st: p.st.slice() }));
  }
  restore(paras: Para[]) {
    this.paras = paras.map((p) => ({ align: p.align, text: p.text, st: p.st.slice() }));
  }

  clamp(pos: Pos): Pos {
    const p = Math.max(0, Math.min(this.paras.length - 1, pos.p));
    return { p, o: Math.max(0, Math.min(this.paras[p].text.length, pos.o)) };
  }

  /** Insert text (may contain newlines) with a style; returns the position after it. */
  insert(at: Pos, text: string, style: number): Pos {
    const parts = text.replace(/\r\n?/g, '\n').split('\n');
    const para = this.paras[at.p];
    const headT = para.text.slice(0, at.o), tailT = para.text.slice(at.o);
    const headS = para.st.slice(0, at.o), tailS = para.st.slice(at.o);
    if (parts.length === 1) {
      para.text = headT + parts[0] + tailT;
      para.st = [...headS, ...parts[0].split('').map(() => style), ...tailS];
      return { p: at.p, o: at.o + parts[0].length };
    }
    const fill = (s: string) => s.split('').map(() => style);
    para.text = headT + parts[0];
    para.st = [...headS, ...fill(parts[0])];
    const middle: Para[] = parts.slice(1, -1).map((t) => ({ align: para.align, text: t, st: fill(t) }));
    const last = parts[parts.length - 1];
    const lastPara: Para = { align: para.align, text: last + tailT, st: [...fill(last), ...tailS] };
    this.paras.splice(at.p + 1, 0, ...middle, lastPara);
    return { p: at.p + parts.length - 1, o: last.length };
  }

  /** Insert styled paragraphs (from Write's own clipboard). */
  insertParas(at: Pos, frag: Para[]): Pos {
    if (!frag.length) return at;
    const para = this.paras[at.p];
    const tailT = para.text.slice(at.o), tailS = para.st.slice(at.o);
    para.text = para.text.slice(0, at.o) + frag[0].text;
    para.st = [...para.st.slice(0, at.o), ...frag[0].st];
    if (frag.length === 1) {
      const o = para.text.length;
      para.text += tailT;
      para.st.push(...tailS);
      return { p: at.p, o };
    }
    const rest = frag.slice(1).map((f) => ({ align: f.align, text: f.text, st: f.st.slice() }));
    const last = rest[rest.length - 1];
    const o = last.text.length;
    last.text += tailT;
    last.st.push(...tailS);
    this.paras.splice(at.p + 1, 0, ...rest);
    return { p: at.p + rest.length, o };
  }

  /** Delete between two positions (any order). Returns the start position. */
  delete(a: Pos, b: Pos): Pos {
    const s = minPos(a, b), e = maxPos(a, b);
    const ps = this.paras[s.p], pe = this.paras[e.p];
    ps.text = ps.text.slice(0, s.o) + pe.text.slice(e.o);
    ps.st = [...ps.st.slice(0, s.o), ...pe.st.slice(e.o)];
    if (e.p > s.p) this.paras.splice(s.p + 1, e.p - s.p);
    return { ...s };
  }

  /** Copy a range as styled paragraphs. */
  slice(a: Pos, b: Pos): Para[] {
    const s = minPos(a, b), e = maxPos(a, b);
    const out: Para[] = [];
    for (let i = s.p; i <= e.p; i++) {
      const p = this.paras[i];
      const from = i === s.p ? s.o : 0, to = i === e.p ? e.o : p.text.length;
      out.push({ align: p.align, text: p.text.slice(from, to), st: p.st.slice(from, to) });
    }
    return out;
  }

  textOf(a: Pos, b: Pos): string {
    return this.slice(a, b).map((p) => p.text).join('\n');
  }

  /** Apply (on=true) or clear a style bit over a range. */
  setStyle(a: Pos, b: Pos, bit: number, on: boolean) {
    const s = minPos(a, b), e = maxPos(a, b);
    for (let i = s.p; i <= e.p; i++) {
      const p = this.paras[i];
      const from = i === s.p ? s.o : 0, to = i === e.p ? e.o : p.text.length;
      for (let k = from; k < to; k++) p.st[k] = on ? p.st[k] | bit : p.st[k] & ~bit;
    }
  }

  /** True when every character in the range has the style bit. */
  allHave(a: Pos, b: Pos, bit: number): boolean {
    const s = minPos(a, b), e = maxPos(a, b);
    let any = false;
    for (let i = s.p; i <= e.p; i++) {
      const p = this.paras[i];
      const from = i === s.p ? s.o : 0, to = i === e.p ? e.o : p.text.length;
      for (let k = from; k < to; k++) { any = true; if (!(p.st[k] & bit)) return false; }
    }
    return any;
  }

  styleAt(pos: Pos): number {
    const p = this.paras[pos.p];
    if (pos.o > 0) return p.st[pos.o - 1] ?? 0;
    return p.st[0] ?? 0;
  }

  get plainText(): string {
    return this.paras.map((p) => p.text).join('\n');
  }

  wordCount(): number {
    return (this.plainText.match(/\S+/g) ?? []).length;
  }

  // ---------------------------------------------------------------- files

  static fromText(t: string): Doc {
    const d = new Doc();
    d.paras = t.replace(/\r\n?/g, '\n').split('\n').map((line) => ({ align: 'left' as Align, text: line, st: line.split('').map(() => 0) }));
    return d;
  }

  static fromWrt(json: string): Doc {
    const f = JSON.parse(json) as WrtFile;
    if (f.format !== 'orbit-write' || !Array.isArray(f.paras)) throw new Error('Not a Write document');
    const d = new Doc();
    d.paras = f.paras.map((p) => {
      let text = '';
      const st: number[] = [];
      for (const r of p.runs ?? []) {
        const s = (r.b ? B : 0) | (r.i ? I : 0) | (r.u ? U : 0) | (r.s === 2 ? BIG : 0);
        text += r.t;
        for (let k = 0; k < r.t.length; k++) st.push(s);
      }
      return { align: p.align ?? 'left', text, st };
    });
    if (!d.paras.length) d.paras = [emptyPara()];
    return d;
  }

  toWrt(): string {
    const f: WrtFile = {
      format: 'orbit-write',
      version: 1,
      paras: this.paras.map((p) => {
        const runs: WrtRun[] = [];
        for (let k = 0; k < p.text.length;) {
          const s = p.st[k];
          let j = k;
          while (j < p.text.length && p.st[j] === s) j++;
          const r: WrtRun = { t: p.text.slice(k, j) };
          if (s & B) r.b = 1;
          if (s & I) r.i = 1;
          if (s & U) r.u = 1;
          if (s & BIG) r.s = 2;
          runs.push(r);
          k = j;
        }
        return p.align === 'left' ? { runs } : { align: p.align, runs };
      }),
    };
    return JSON.stringify(f);
  }

  toHtml(title: string): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = this.paras.map((p) => {
      let html = '';
      for (let k = 0; k < p.text.length;) {
        const s = p.st[k];
        let j = k;
        while (j < p.text.length && p.st[j] === s) j++;
        let t = esc(p.text.slice(k, j));
        if (s & B) t = `<b>${t}</b>`;
        if (s & I) t = `<i>${t}</i>`;
        if (s & U) t = `<u>${t}</u>`;
        if (s & BIG) t = `<span style="font-size:1.6em">${t}</span>`;
        html += t;
        k = j;
      }
      return `<p style="text-align:${p.align};margin:0 0 .2em">${html || '&nbsp;'}</p>`;
    }).join('\n');
    return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc(title)}</title></head>\n<body style="font-family:Georgia,serif;max-width:40em;margin:2em auto;line-height:1.4">\n${body}\n</body></html>\n`;
  }
}

// ---------------------------------------------------------------- layout

export interface Measurer {
  advance(ch: string, style: number): number;
}

export interface LayoutLine {
  p: number;
  start: number;
  end: number;
  y: number;
  h: number;
  /** x offset of the line (alignment) */
  x: number;
  /** x position of each character boundary from start..end (length end-start+1) */
  xs: number[];
  big: boolean;
}

/** Word-wrap every paragraph into lines no wider than `width`. */
export function layoutDoc(doc: Doc, width: number, m: Measurer, lineH = 10, paraGap = 2): LayoutLine[] {
  const lines: LayoutLine[] = [];
  let y = 0;
  doc.paras.forEach((para, pi) => {
    const t = para.text;
    let start = 0;
    if (!t.length) {
      const big = !!((para.st[0] ?? 0) & BIG);
      const h = lineH * (big ? 2 : 1);
      const off = para.align === 'center' ? Math.floor(width / 2) : para.align === 'right' ? width : 0;
      lines.push({ p: pi, start: 0, end: 0, y, h, x: off, xs: [0], big });
      y += h + paraGap;
      return;
    }
    while (start < t.length) {
      let w = 0;
      let k = start;
      let lastBreak = -1;
      while (k < t.length) {
        const a = m.advance(t[k], para.st[k]);
        if (w + a > width && k > start) break;
        w += a;
        if (t[k] === ' ') lastBreak = k + 1;
        k++;
      }
      let end = k;
      if (k < t.length && lastBreak > start) end = lastBreak;
      // swallow trailing spaces onto this line
      while (end < t.length && t[end] === ' ') end++;
      const xs = [0];
      let x = 0;
      let big = false;
      for (let q = start; q < end; q++) {
        x += m.advance(t[q], para.st[q]);
        xs.push(x);
        if (para.st[q] & BIG) big = true;
      }
      // alignment ignores trailing spaces
      let visible = end;
      while (visible > start && t[visible - 1] === ' ') visible--;
      const vw = xs[visible - start];
      const off = para.align === 'center' ? Math.floor((width - vw) / 2) : para.align === 'right' ? width - vw : 0;
      const h = lineH * (big ? 2 : 1);
      lines.push({ p: pi, start, end, y, h, x: Math.max(0, off), xs, big });
      y += h;
      start = end;
    }
    y += paraGap;
  });
  return lines;
}
