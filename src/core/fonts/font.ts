import type { Gfx } from '../gfx';

export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** integer size multiplier (1 or 2) */
  size?: number;
}

interface Glyph {
  w: number; // ink width
  bits: Uint8Array; // w * ROWS
}

export const ROWS = 9;
export const LINE_H = 10;
export const BASELINE = 7; // first row below the baseline

/** Typographic characters drawn with their closest ASCII look-alike. */
const SUBST: Record<string, string> = {
  '\u2013': '-', '\u2014': '-', '\u2012': '-', '\u2010': '-', '\u2011': '-', '\u2212': '-',
  '\u2018': "'", '\u2019': "'", '\u201a': ',', '\u201b': "'", '\u2032': "'", '\u00b4': "'",
  '\u201c': '"', '\u201d': '"', '\u201e': '"', '\u2033': '"', '\u00ab': '"', '\u00bb': '"', '\u2039': '<', '\u203a': '>',
  '\u00a0': ' ', '\u2002': ' ', '\u2003': ' ', '\u2009': ' ', '\u200a': ' ', '\u202f': ' ', '\u2007': ' ',
  '\u200b': '', '\u200c': '', '\u200d': '', '\ufeff': '', '\u2060': '',
  '\u2022': '\u2022', '\u25cf': '\u2022', '\u2219': '\u00b7', '\u2026': '\u2026', '\u2122': 'TM', '\u00ae': '(R)',
  '\u2192': '\u2192', '\u21d2': '\u2192', '\u2190': '\u2190', '\u2264': '<', '\u2265': '>', '\u2248': '~', '\u2260': '#',
  '\u00bd': '1/2', '\u00bc': '1/4', '\u00be': '3/4', '\u2153': '1/3', '\u00b2': '2', '\u00b3': '3', '\u00b9': '1',
};

const FALLBACK_ROWS = ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####', '.....', '.....'];

export class BitmapFont {
  readonly name: string;
  readonly mono: boolean;
  /** advance for monospace fonts */
  readonly cellW: number;
  private glyphs = new Map<string, Glyph>();
  private fallback: Glyph;

  constructor(name: string, data: Record<string, string[]>, mono: boolean) {
    this.name = name;
    this.mono = mono;
    for (const [ch, rows] of Object.entries(data)) this.glyphs.set(ch, compile(rows));
    this.fallback = compile(FALLBACK_ROWS);
    this.cellW = mono ? 6 : 0;
  }

  lineHeight(style?: TextStyle) {
    return LINE_H * (style?.size || 1);
  }

  glyph(ch: string): Glyph {
    let g = this.glyphs.get(ch);
    if (g) return g;
    const sub = SUBST[ch];
    if (sub !== undefined && sub.length === 1 && sub !== ch) {
      g = this.glyph(sub);
      this.glyphs.set(ch, g);
      return g;
    }
    // Fall back to the base letter for accented characters (É -> E)
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    g = (base && this.glyphs.get(base)) || (ch === '\t' ? this.glyphs.get(' ') : undefined);
    if (!g) {
      const lower = this.glyphs.get(ch.toLowerCase());
      g = lower ?? this.fallback;
    }
    this.glyphs.set(ch, g);
    return g;
  }

  /** Horizontal advance of one character. */
  advance(ch: string, style?: TextStyle): number {
    const s = style?.size || 1;
    const bold = style?.bold ? 1 : 0;
    if (this.mono) return this.cellW * s;
    return (this.glyph(ch).w + 1 + bold) * s;
  }

  measure(text: string, style?: TextStyle): number {
    let w = 0;
    for (const ch of text) w += this.advance(ch, style);
    if (style?.italic && text.length) w += style.size || 1;
    return w;
  }

  /** Draw text with its top-left at (x, y). Returns the advance width. */
  draw(g: Gfx, x: number, y: number, text: string, color: number, style?: TextStyle): number {
    const s = style?.size || 1;
    const bold = !!style?.bold;
    const italic = !!style?.italic;
    let cx = x;
    for (const ch of text) {
      const gl = this.glyph(ch);
      const adv = this.advance(ch, style);
      const offX = this.mono ? Math.floor((this.cellW - 1 - gl.w) / 2) * s : 0;
      for (let r = 0; r < ROWS; r++) {
        const shear = italic && r < 4 ? s : 0;
        const row = r * gl.w;
        for (let c = 0; c < gl.w; c++) {
          if (!gl.bits[row + c]) continue;
          const px = cx + offX + c * s + shear;
          const py = y + r * s;
          if (s === 1) {
            g.pset(px, py, color);
            if (bold) g.pset(px + 1, py, color);
          } else {
            g.fillRect(px, py, s + (bold ? s : 0), s, color);
          }
        }
      }
      cx += adv;
    }
    if (style?.underline) g.hline(x, cx - 1 + (italic ? s : 0), y + BASELINE * s + (s > 1 ? s - 1 : 0), color);
    return cx - x;
  }

  /** Truncate text with an ellipsis so it fits maxW. */
  fit(text: string, maxW: number, style?: TextStyle): string {
    if (this.measure(text, style) <= maxW) return text;
    const ell = '…';
    const ew = this.measure(ell, style);
    let out = '';
    let w = 0;
    for (const ch of text) {
      const a = this.advance(ch, style);
      if (w + a + ew > maxW) break;
      out += ch;
      w += a;
    }
    return out + ell;
  }

  /** Index of the character boundary closest to pixel offset px. */
  hitTest(text: string, px: number, style?: TextStyle): number {
    let w = 0;
    let i = 0;
    for (const ch of text) {
      const a = this.advance(ch, style);
      if (px < w + a / 2) return i;
      w += a;
      i += ch.length;
    }
    return text.length;
  }
}

function compile(rows: string[]): Glyph {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const bits = new Uint8Array(w * ROWS);
  for (let r = 0; r < ROWS; r++) {
    const row = rows[r] ?? '';
    for (let c = 0; c < w; c++) if (row[c] === '#') bits[r * w + c] = 1;
  }
  return { w, bits };
}

/** Greedy word wrap into lines that fit maxW. Hard newlines are respected. */
export function wrapText(font: BitmapFont, text: string, maxW: number, style?: TextStyle): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para === '') { out.push(''); continue; }
    const words = para.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      if (!word) continue;
      const cand = line + word;
      if (font.measure(cand.trimEnd(), style) <= maxW || line === '') {
        if (font.measure(word, style) > maxW && line === '') {
          // break a long word across lines
          let chunk = '';
          for (const ch of word) {
            if (font.measure(chunk + ch, style) > maxW && chunk) { out.push(chunk); chunk = ''; }
            chunk += ch;
          }
          line = chunk;
        } else line = cand;
      } else {
        out.push(line.trimEnd());
        line = /^\s+$/.test(word) ? '' : word;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
