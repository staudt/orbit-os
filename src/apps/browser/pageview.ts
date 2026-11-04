import type { Gfx } from '../../core/gfx';
import { C } from '../../core/palette';
import { SANS, MONO, type BitmapFont, type TextStyle } from '../../core/fonts';
import type { KeyEv } from '../../core/input';
import { Widget, type WEvent } from '../../ui/widget';
import { ScrollBar } from '../../ui/widgets';
import type { Block, Inline, Page } from './markdown';
import { invalidate } from '../../os';

interface Seg {
  x: number;
  y: number;
  text: string;
  font: BitmapFont;
  style: TextStyle;
  color: number;
  link?: number;
  w: number;
}
interface Deco { kind: 'bar' | 'hr' | 'codebg'; x: number; y: number; w: number; h: number }

const M = 8;

/** Renders a parsed page with word wrap; links are clickable. */
export class PageView extends Widget {
  page: Page | null = null;
  message: { title: string; text: string } | null = null;
  scroll = 0;
  private segs: Seg[] = [];
  private decos: Deco[] = [];
  private height = 0;
  private laidW = -1;
  private vbar: ScrollBar;
  hoverLink = 0;
  onLink: ((n: number) => void) | null = null;
  onHoverLink: ((n: number) => void) | null = null;

  constructor() {
    super();
    this.focusable = true;
    this.vbar = this.add(new ScrollBar(true, (v) => { this.scroll = v; invalidate(); }));
    this.vbar.step = 20;
  }

  setPage(p: Page | null, scroll = 0) {
    this.page = p;
    this.message = null;
    this.laidW = -1;
    this.scroll = scroll;
    invalidate();
  }
  setMessage(title: string, text: string) {
    this.page = null;
    this.message = { title, text };
    this.laidW = -1;
    this.scroll = 0;
    invalidate();
  }

  layout() {
    this.vbar.setBounds(this.w - 10, 0, 10, this.h);
    this.laidW = -1;
  }

  private relayout() {
    const W = this.w - 10 - M * 2;
    if (this.laidW === W) return;
    this.laidW = W;
    this.segs = [];
    this.decos = [];
    let y = M;
    const blocks: Block[] = this.page?.blocks ?? (this.message ? [
      { t: 'h', level: 1, runs: [{ text: this.message.title }] },
      ...this.message.text.split('\n\n').map((t) => ({ t: 'p' as const, runs: [{ text: t }] })),
    ] : []);
    for (const b of blocks) {
      switch (b.t) {
        case 'h': {
          const big = b.level === 1;
          y += big ? 4 : 2;
          y = this.flow(b.runs, M, W, y, { bold: true, size: big ? 2 : 1, underline: b.level === 2 }, big ? C.PLUM : b.level === 2 ? C.PLUM : C.PLUM_DARK, big ? 20 : 11);
          y += big ? 4 : 3;
          break;
        }
        case 'p':
          y = this.flow(b.runs, M, W, y, {}, C.INK, 11);
          y += 5;
          break;
        case 'li': {
          const indent = 4 + b.depth * 10;
          const bw = SANS.measure(b.bullet) + 4;
          this.segs.push({ x: M + indent, y, text: b.bullet, font: SANS, style: {}, color: C.CRIMSON, w: bw });
          y = this.flow(b.runs, M + indent + Math.max(bw, 8), W - indent - Math.max(bw, 8), y, {}, C.INK, 11);
          y += 2;
          break;
        }
        case 'quote': {
          const y0 = y;
          y = this.flow(b.runs, M + 10, W - 10, y, { italic: true }, C.MAUVE, 11);
          this.decos.push({ kind: 'bar', x: M + 3, y: y0 - 1, w: 2, h: y - y0 });
          y += 4;
          break;
        }
        case 'code': {
          const y0 = y;
          const maxCols = Math.max(4, Math.floor((W - 6) / 6));
          for (const line of b.lines) {
            for (let k = 0; k === 0 || k < line.length; k += maxCols) {
              this.segs.push({ x: M + 4, y: y + 1, text: line.slice(k, k + maxCols), font: MONO, style: {}, color: C.PLUM_DARK, w: 0 });
              y += 10;
            }
          }
          this.decos.push({ kind: 'codebg', x: M, y: y0 - 1, w: W, h: y - y0 + 3 });
          y += 6;
          break;
        }
        case 'hr':
          this.decos.push({ kind: 'hr', x: M, y: y + 3, w: W, h: 1 });
          y += 9;
          break;
      }
    }
    this.height = y + M;
    this.vbar.set(this.height, this.h, this.scroll);
    this.scroll = this.vbar.value;
  }

  /** Word-wrap runs into segments. Returns the next y. */
  private flow(runs: Inline[], x0: number, width: number, y: number, base: TextStyle, color: number, lineH: number): number {
    let x = x0;
    const lh = base.size === 2 ? 20 : lineH;
    const put = (text: string, style: TextStyle, font: BitmapFont, col: number, link?: number) => {
      const w = font.measure(text, style);
      this.segs.push({ x, y, text, font, style, color: col, link, w });
      x += w;
    };
    const tokens: { text: string; style: TextStyle; font: BitmapFont; color: number; link?: number }[] = [];
    for (const r of runs) {
      const style: TextStyle = { ...base, bold: base.bold || r.b, italic: base.italic || r.i, underline: base.underline || !!r.link };
      const font = r.code ? MONO : SANS;
      const col = r.link ? C.MAGENTA : r.code ? C.PLUM_DARK : color;
      for (const part of r.text.split(/(\s+)/)) {
        if (!part) continue;
        tokens.push({ text: /^\s+$/.test(part) ? ' ' : part, style, font, color: col, link: r.link });
      }
      if (r.link) tokens.push({ text: `[${r.link}]`, style: { size: base.size }, font: SANS, color: C.GREY, link: r.link });
    }
    for (const t of tokens) {
      const w = t.font.measure(t.text, t.style);
      if (t.text === ' ') {
        if (x > x0) put(' ', t.style, t.font, t.color, t.link);
        continue;
      }
      if (x + w > x0 + width && x > x0) { x = x0; y += lh; }
      if (w > width) {
        // break very long words
        let chunk = '';
        for (const ch of t.text) {
          if (t.font.measure(chunk + ch, t.style) > x0 + width - x && chunk) {
            put(chunk, t.style, t.font, t.color, t.link);
            x = x0;
            y += lh;
            chunk = '';
          }
          chunk += ch;
        }
        if (chunk) put(chunk, t.style, t.font, t.color, t.link);
        continue;
      }
      put(t.text, t.style, t.font, t.color, t.link);
    }
    return y + lh;
  }

  private linkAt(lx: number, ly: number): number {
    const y = ly + this.scroll;
    for (const s of this.segs) {
      if (!s.link) continue;
      const h = s.style.size === 2 ? 20 : 11;
      if (lx >= s.x && lx < s.x + s.w && y >= s.y - 1 && y < s.y + h - 1) return s.link;
    }
    return 0;
  }

  onPointerDown(e: WEvent) {
    if (e.lx >= this.w - 10) return false;
    this.focus();
    const l = this.linkAt(e.lx, e.ly);
    if (l && e.button === 0) this.onLink?.(l);
    return true;
  }
  onHover(e: WEvent) {
    const l = this.linkAt(e.lx, e.ly);
    this.cursor = l ? 'hand' : 'arrow';
    if (l !== this.hoverLink) {
      this.hoverLink = l;
      this.onHoverLink?.(l);
      invalidate();
    }
  }
  onLeave() {
    if (this.hoverLink) { this.hoverLink = 0; this.onHoverLink?.(0); invalidate(); }
  }
  onWheel(e: WEvent) {
    this.vbar.setValue(this.scroll + e.wheel * 22);
    return true;
  }
  onKey(e: KeyEv) {
    const page = this.h - 20;
    const map: Record<string, number> = { ArrowDown: 22, ArrowUp: -22, PageDown: page, PageUp: -page, ' ': e.shift ? -page : page };
    if (e.key in map) { this.vbar.setValue(this.scroll + map[e.key]); return true; }
    if (e.key === 'Home') { this.vbar.setValue(0); return true; }
    if (e.key === 'End') { this.vbar.setValue(this.height); return true; }
    return false;
  }

  paint(g: Gfx) {
    this.relayout();
    const { w, h } = this;
    g.fillRect(0, 0, w - 10, h, C.CREAM);
    g.push(0, 0, w - 10, h);
    const sy = this.scroll;
    for (const d of this.decos) {
      const y = d.y - sy;
      if (y > h || y + d.h < 0) continue;
      if (d.kind === 'codebg') { g.fillRect(d.x, y, d.w, d.h, C.PALE); g.rect(d.x, y, d.w, d.h, C.TAN); }
      else g.fillRect(d.x, y, d.w, d.h, d.kind === 'hr' ? C.TAN : C.LAVENDER);
    }
    for (const s of this.segs) {
      const y = s.y - sy;
      if (y > h || y < -22) continue;
      const hot = s.link && s.link === this.hoverLink;
      if (hot && s.text !== ' ') g.fillRect(s.x - 1, y - 1, s.w + 1, (s.style.size === 2 ? 20 : 11), C.PALE);
      s.font.draw(g, s.x, y, s.text, hot ? C.CRIMSON : s.color, s.style);
    }
    g.pop();
    this.paintChildren(g);
  }
}
