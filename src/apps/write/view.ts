import type { Gfx } from '../../core/gfx';
import { C } from '../../core/palette';
import { SANS, type TextStyle } from '../../core/fonts';
import type { KeyEv } from '../../core/input';
import { Widget, type WEvent } from '../../ui/widget';
import { ScrollBar } from '../../ui/widgets';
import { TH, caret } from '../../ui/theme';
import { os } from '../../os';
import { Doc, B, I, U, BIG, type Align, type LayoutLine, type Para, type Pos, cmpPos, layoutDoc, minPos, maxPos } from './doc';

const MARGIN = 10;
const LINE_H = 10;

export function styleOf(st: number): TextStyle {
  return { bold: !!(st & B), italic: !!(st & I), underline: !!(st & U), size: st & BIG ? 2 : 1 };
}
export const measurer = {
  advance: (ch: string, st: number) => SANS.advance(ch, { bold: !!(st & B), size: st & BIG ? 2 : 1 }),
};

interface Snap { paras: Para[]; caret: Pos; anchor: Pos }

/** Internal styled clipboard, used when the system clipboard text matches. */
const richClip: { text: string; paras: Para[] } = { text: '', paras: [] };

/** WYSIWYG styled text editor. */
export class RichText extends Widget {
  doc = new Doc();
  caretPos: Pos = { p: 0, o: 0 };
  anchor: Pos = { p: 0, o: 0 };
  /** style used for the next typed character */
  typing = 0;
  lines: LayoutLine[] = [];
  scroll = 0;
  modified = false;
  onChange: (() => void) | null = null;
  onCaretMove: (() => void) | null = null;
  private vbar: ScrollBar;
  private layoutW = -1;
  private dirty = true;
  private desiredX = -1;
  private undoStack: Snap[] = [];
  private redoStack: Snap[] = [];
  private lastKind = '';
  private lastTime = 0;
  private dragging = false;

  constructor() {
    super();
    this.focusable = true;
    this.acceptsText = true;
    this.cursor = 'ibeam';
    this.vbar = this.add(new ScrollBar(true, (v) => { this.scroll = v; this.invalidate(); }));
    this.vbar.step = LINE_H * 2;
  }

  setDoc(d: Doc) {
    this.doc = d;
    this.caretPos = { p: 0, o: 0 };
    this.anchor = { p: 0, o: 0 };
    this.typing = d.styleAt(this.caretPos);
    this.undoStack = [];
    this.redoStack = [];
    this.scroll = 0;
    this.modified = false;
    this.dirty = true;
    this.invalidate();
  }

  layout() {
    this.vbar.setBounds(this.w - 10, 0, 10, this.h);
    this.dirty = true;
  }
  private get textW() { return Math.max(40, this.w - 10 - MARGIN * 2); }
  private relayout() {
    if (!this.dirty && this.layoutW === this.textW) return;
    this.lines = layoutDoc(this.doc, this.textW, measurer, LINE_H);
    this.layoutW = this.textW;
    this.dirty = false;
    const last = this.lines[this.lines.length - 1];
    const total = last ? last.y + last.h + MARGIN * 2 : 0;
    this.vbar.set(total, this.h, this.scroll);
    this.scroll = this.vbar.value;
  }

  // ---------------------------------------------------------------- positions
  private lineIndexOf(pos: Pos): number {
    this.relayout();
    let found = -1;
    for (let i = 0; i < this.lines.length; i++) {
      const l = this.lines[i];
      if (l.p !== pos.p) { if (found >= 0) break; continue; }
      found = i;
      if (pos.o < l.end || (pos.o === l.end && (i + 1 >= this.lines.length || this.lines[i + 1].p !== pos.p))) return i;
    }
    return Math.max(0, found);
  }
  private xOf(pos: Pos): number {
    const l = this.lines[this.lineIndexOf(pos)];
    return l.x + l.xs[Math.max(0, Math.min(l.xs.length - 1, pos.o - l.start))];
  }
  private posAt(lx: number, ly: number): Pos {
    this.relayout();
    const y = ly - MARGIN + this.scroll;
    let li = this.lines.findIndex((l) => y < l.y + l.h);
    if (li < 0) li = this.lines.length - 1;
    const l = this.lines[li];
    const x = lx - MARGIN - l.x;
    let best = 0;
    for (let k = 0; k < l.xs.length; k++) {
      const mid = k < l.xs.length - 1 ? (l.xs[k] + l.xs[k + 1]) / 2 : Infinity;
      if (x < mid) { best = k; break; }
      best = k;
    }
    let o = l.start + best;
    // don't place the caret after a wrapped line's trailing space
    const isLastOfPara = li + 1 >= this.lines.length || this.lines[li + 1].p !== l.p;
    if (!isLastOfPara && o === l.end && o > l.start) o--;
    return { p: l.p, o };
  }

  get hasSelection() { return cmpPos(this.caretPos, this.anchor) !== 0; }
  get selStart() { return minPos(this.caretPos, this.anchor); }
  get selEnd() { return maxPos(this.caretPos, this.anchor); }

  setCaret(pos: Pos, extend = false, keepX = false) {
    this.caretPos = this.doc.clamp(pos);
    if (!extend) this.anchor = { ...this.caretPos };
    if (!keepX) this.desiredX = -1;
    this.typing = this.doc.styleAt(this.caretPos);
    caret.reset();
    this.scrollToCaret();
    this.onCaretMove?.();
    this.invalidate();
  }
  scrollToCaret() {
    this.relayout();
    const l = this.lines[this.lineIndexOf(this.caretPos)];
    if (!l) return;
    const top = l.y + MARGIN, bot = l.y + l.h + MARGIN;
    if (top - this.scroll < 0) this.scroll = top - MARGIN;
    else if (bot - this.scroll > this.h) this.scroll = bot - this.h + MARGIN;
    this.vbar.setValue(this.scroll);
    this.scroll = this.vbar.value;
  }

  // ---------------------------------------------------------------- editing
  private record(kind: string) {
    const now = performance.now();
    if (kind !== this.lastKind || now - this.lastTime > 1200 || kind === 'other') {
      this.undoStack.push({ paras: this.doc.clone(), caret: { ...this.caretPos }, anchor: { ...this.anchor } });
      if (this.undoStack.length > 150) this.undoStack.shift();
      this.redoStack = [];
    }
    this.lastKind = kind;
    this.lastTime = now;
  }
  private changed() {
    this.modified = true;
    this.dirty = true;
    this.onChange?.();
    this.scrollToCaret();
    this.onCaretMove?.();
    caret.reset();
    this.invalidate();
  }
  undo() {
    const s = this.undoStack.pop();
    if (!s) { os.sound.sfx('beep'); return; }
    this.redoStack.push({ paras: this.doc.clone(), caret: { ...this.caretPos }, anchor: { ...this.anchor } });
    this.doc.restore(s.paras);
    this.caretPos = s.caret;
    this.anchor = s.anchor;
    this.lastKind = '';
    this.changed();
  }
  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push({ paras: this.doc.clone(), caret: { ...this.caretPos }, anchor: { ...this.anchor } });
    this.doc.restore(s.paras);
    this.caretPos = s.caret;
    this.anchor = s.anchor;
    this.lastKind = '';
    this.changed();
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  insertText(t: string, kind = 'other') {
    this.record(kind);
    const style = this.typing;
    let at = this.caretPos;
    if (this.hasSelection) at = this.doc.delete(this.caretPos, this.anchor);
    const end = this.doc.insert(at, t, style);
    this.caretPos = end;
    this.anchor = { ...end };
    this.typing = style;
    this.changed();
  }
  private insertParas(frag: Para[]) {
    this.record('other');
    let at = this.caretPos;
    if (this.hasSelection) at = this.doc.delete(this.caretPos, this.anchor);
    const end = this.doc.insertParas(at, frag);
    this.caretPos = end;
    this.anchor = { ...end };
    this.changed();
  }
  deleteSelection() {
    if (!this.hasSelection) return;
    this.record('other');
    const s = this.doc.delete(this.caretPos, this.anchor);
    this.caretPos = s;
    this.anchor = { ...s };
    this.changed();
  }

  /** Toggle a style bit on the selection (or the typing style when nothing is selected). */
  toggleStyle(bit: number) {
    if (!this.hasSelection) {
      this.typing ^= bit;
      this.onCaretMove?.();
      return;
    }
    this.record('other');
    const on = !this.doc.allHave(this.caretPos, this.anchor, bit);
    this.doc.setStyle(this.caretPos, this.anchor, bit, on);
    this.typing = on ? this.typing | bit : this.typing & ~bit;
    this.changed();
  }
  /** Current state of a style at the caret/selection. */
  styleActive(bit: number): boolean {
    if (this.hasSelection) return this.doc.allHave(this.caretPos, this.anchor, bit);
    return !!(this.typing & bit);
  }
  setAlign(a: Align) {
    this.record('other');
    for (let i = this.selStart.p; i <= this.selEnd.p; i++) this.doc.paras[i].align = a;
    this.changed();
  }
  get align(): Align {
    return this.doc.paras[this.caretPos.p].align;
  }
  selectAll() {
    this.anchor = { p: 0, o: 0 };
    const last = this.doc.paras.length - 1;
    this.setCaret({ p: last, o: this.doc.paras[last].text.length }, true);
  }

  /** Find text after the caret (wrapping). */
  find(q: string, matchCase = false, fromStart = false): boolean {
    if (!q) return false;
    const norm = (s: string) => (matchCase ? s : s.toLowerCase());
    const needle = norm(q);
    const start = fromStart ? { p: 0, o: 0 } : this.selEnd;
    const n = this.doc.paras.length;
    for (let k = 0; k <= n; k++) {
      const pi = (start.p + k) % n;
      const from = k === 0 ? start.o : 0;
      const i = norm(this.doc.paras[pi].text).indexOf(needle, from);
      if (i >= 0) {
        this.anchor = { p: pi, o: i };
        this.setCaret({ p: pi, o: i + q.length }, true);
        return true;
      }
    }
    return false;
  }
  replaceSelection(q: string, rep: string, matchCase = false): boolean {
    const sel = this.doc.textOf(this.caretPos, this.anchor);
    if (this.hasSelection && (matchCase ? sel === q : sel.toLowerCase() === q.toLowerCase())) {
      this.insertText(rep);
      return true;
    }
    return false;
  }
  replaceAll(q: string, rep: string, matchCase = false): number {
    if (!q) return 0;
    this.record('other');
    let count = 0;
    const norm = (s: string) => (matchCase ? s : s.toLowerCase());
    for (const p of this.doc.paras) {
      let i = 0;
      for (;;) {
        const k = norm(p.text).indexOf(norm(q), i);
        if (k < 0) break;
        const st = p.st[k] ?? 0;
        p.text = p.text.slice(0, k) + rep + p.text.slice(k + q.length);
        p.st.splice(k, q.length, ...rep.split('').map(() => st));
        i = k + rep.length;
        count++;
      }
    }
    if (count) { this.setCaret(this.doc.clamp(this.caretPos)); this.changed(); }
    return count;
  }

  // ---------------------------------------------------------------- keys
  private wordLeft(pos: Pos): Pos {
    if (pos.o === 0) return pos.p > 0 ? { p: pos.p - 1, o: this.doc.paras[pos.p - 1].text.length } : pos;
    const t = this.doc.paras[pos.p].text;
    let o = pos.o;
    while (o > 0 && t[o - 1] === ' ') o--;
    while (o > 0 && t[o - 1] !== ' ') o--;
    return { p: pos.p, o };
  }
  private wordRight(pos: Pos): Pos {
    const t = this.doc.paras[pos.p].text;
    if (pos.o >= t.length) return pos.p < this.doc.paras.length - 1 ? { p: pos.p + 1, o: 0 } : pos;
    let o = pos.o;
    while (o < t.length && t[o] !== ' ') o++;
    while (o < t.length && t[o] === ' ') o++;
    return { p: pos.p, o };
  }
  private vertical(dir: number, extend: boolean, page = false) {
    this.relayout();
    const li = this.lineIndexOf(this.caretPos);
    if (this.desiredX < 0) this.desiredX = this.xOf(this.caretPos);
    const step = page ? Math.max(1, Math.floor(this.h / LINE_H) - 2) : 1;
    const ti = Math.max(0, Math.min(this.lines.length - 1, li + dir * step));
    if (ti === li) {
      this.setCaret(dir < 0 ? { p: 0, o: 0 } : { p: this.doc.paras.length - 1, o: this.doc.paras[this.doc.paras.length - 1].text.length }, extend);
      return;
    }
    const l = this.lines[ti];
    const pos = this.posAt(this.desiredX + MARGIN + 0, l.y + MARGIN - this.scroll + 1);
    const x = this.desiredX;
    this.setCaret(pos, extend, true);
    this.desiredX = x;
  }

  onKey(e: KeyEv) {
    const ext = e.shift;
    const pos = this.caretPos;
    const paras = this.doc.paras;
    switch (e.key) {
      case 'ArrowLeft':
        if (!ext && this.hasSelection) { this.setCaret(this.selStart); return true; }
        if (e.ctrl) { this.setCaret(this.wordLeft(pos), ext); return true; }
        this.setCaret(pos.o > 0 ? { p: pos.p, o: pos.o - 1 } : pos.p > 0 ? { p: pos.p - 1, o: paras[pos.p - 1].text.length } : pos, ext);
        return true;
      case 'ArrowRight':
        if (!ext && this.hasSelection) { this.setCaret(this.selEnd); return true; }
        if (e.ctrl) { this.setCaret(this.wordRight(pos), ext); return true; }
        this.setCaret(pos.o < paras[pos.p].text.length ? { p: pos.p, o: pos.o + 1 } : pos.p < paras.length - 1 ? { p: pos.p + 1, o: 0 } : pos, ext);
        return true;
      case 'ArrowUp': this.vertical(-1, ext); return true;
      case 'ArrowDown': this.vertical(1, ext); return true;
      case 'PageUp': this.vertical(-1, ext, true); return true;
      case 'PageDown': this.vertical(1, ext, true); return true;
      case 'Home': {
        if (e.ctrl) { this.setCaret({ p: 0, o: 0 }, ext); return true; }
        const l = this.lines[this.lineIndexOf(pos)];
        this.setCaret({ p: pos.p, o: l.start }, ext);
        return true;
      }
      case 'End': {
        if (e.ctrl) { const lp = paras.length - 1; this.setCaret({ p: lp, o: paras[lp].text.length }, ext); return true; }
        const li = this.lineIndexOf(pos);
        const l = this.lines[li];
        const lastOfPara = li + 1 >= this.lines.length || this.lines[li + 1].p !== l.p;
        let o = l.end;
        if (!lastOfPara) while (o > l.start && paras[l.p].text[o - 1] === ' ') o--;
        this.setCaret({ p: pos.p, o }, ext);
        return true;
      }
      case 'Enter': this.insertText('\n', 'other'); return true;
      case 'Tab': this.insertText('    ', 'type'); return true;
      case 'Backspace': {
        if (this.hasSelection) { this.deleteSelection(); return true; }
        const prev = e.ctrl ? this.wordLeft(pos) : pos.o > 0 ? { p: pos.p, o: pos.o - 1 } : pos.p > 0 ? { p: pos.p - 1, o: paras[pos.p - 1].text.length } : null;
        if (!prev) return true;
        this.record('del');
        const s = this.doc.delete(prev, pos);
        this.caretPos = s;
        this.anchor = { ...s };
        this.changed();
        return true;
      }
      case 'Delete': {
        if (this.hasSelection) { this.deleteSelection(); return true; }
        const nxt = e.ctrl ? this.wordRight(pos) : pos.o < paras[pos.p].text.length ? { p: pos.p, o: pos.o + 1 } : pos.p < paras.length - 1 ? { p: pos.p + 1, o: 0 } : null;
        if (!nxt) return true;
        this.record('del');
        this.doc.delete(pos, nxt);
        this.changed();
        return true;
      }
    }
    if (e.ctrl && !e.alt) {
      switch (e.key.toLowerCase()) {
        case 'a': this.selectAll(); return true;
        case 'z': if (e.shift) this.redo(); else this.undo(); return true;
        case 'y': this.redo(); return true;
        case 'b': this.toggleStyle(B); return true;
        case 'i': this.toggleStyle(I); return true;
        case 'u': this.toggleStyle(U); return true;
      }
    }
    return false;
  }
  onText(s: string) {
    this.insertText(s, s === ' ' ? 'space' : 'type');
  }
  onCopy(cut: boolean) {
    if (!this.hasSelection) return null;
    const text = this.doc.textOf(this.caretPos, this.anchor);
    richClip.text = text;
    richClip.paras = this.doc.slice(this.caretPos, this.anchor);
    if (cut) this.deleteSelection();
    return text;
  }
  onPaste(s: string) {
    if (s === richClip.text && richClip.paras.length) this.insertParas(richClip.paras);
    else this.insertText(s);
  }
  onFocus() { caret.reset(); }

  onPointerDown(e: WEvent) {
    if (e.lx >= this.w - 10) return false;
    this.focus();
    const pos = this.posAt(e.lx, e.ly);
    if (e.clicks === 2) {
      const t = this.doc.paras[pos.p].text;
      let a = pos.o, b = pos.o;
      while (a > 0 && /\w/.test(t[a - 1])) a--;
      while (b < t.length && /\w/.test(t[b])) b++;
      this.anchor = { p: pos.p, o: a };
      this.setCaret({ p: pos.p, o: b }, true);
      return true;
    }
    if (e.clicks >= 3) {
      this.anchor = { p: pos.p, o: 0 };
      this.setCaret({ p: pos.p, o: this.doc.paras[pos.p].text.length }, true);
      return true;
    }
    this.setCaret(pos, e.shift);
    this.dragging = true;
    return true;
  }
  onPointerMove(e: WEvent) {
    if (!this.dragging) return;
    this.setCaret(this.posAt(e.lx, e.ly), true);
  }
  onPointerUp() { this.dragging = false; }
  onWheel(e: WEvent) {
    this.vbar.setValue(this.scroll + e.wheel * LINE_H * 3);
    return true;
  }

  // ---------------------------------------------------------------- paint
  paint(g: Gfx) {
    this.relayout();
    const { w, h } = this;
    const focused = this.hasFocus;
    g.fillRect(0, 0, w - 10, h, C.CREAM);
    // faint page margin guides
    g.vline(MARGIN - 3, 0, h - 1, C.PALE);
    g.vline(w - 10 - MARGIN + 2, 0, h - 1, C.PALE);
    const s = this.selStart, e = this.selEnd;
    const sel = this.hasSelection;
    const caretLine = this.lineIndexOf(this.caretPos);
    g.push(0, 0, w - 10, h);
    for (let li = 0; li < this.lines.length; li++) {
      const l = this.lines[li];
      const y = l.y + MARGIN - this.scroll;
      if (y + l.h < 0) continue;
      if (y > h) break;
      const para = this.doc.paras[l.p];
      const x0 = MARGIN + l.x;
      // selection background
      if (sel && cmpPos({ p: l.p, o: l.end }, s) >= 0 && cmpPos({ p: l.p, o: l.start }, e) <= 0) {
        const a = l.p === s.p && s.o > l.start ? s.o - l.start : 0;
        const lastOfPara = li + 1 >= this.lines.length || this.lines[li + 1].p !== l.p;
        const b = l.p === e.p && e.o <= l.end ? e.o - l.start : l.end - l.start;
        const extra = lastOfPara && !(l.p === e.p) ? 4 : 0;
        g.fillRect(x0 + l.xs[a], y, l.xs[b] - l.xs[a] + extra, l.h, focused ? TH.sel : TH.selDim);
      }
      for (let k = l.start; k < l.end; k++) {
        const ch = para.text[k];
        if (ch === ' ') {
          if (para.st[k] & U) g.hline(x0 + l.xs[k - l.start], x0 + l.xs[k - l.start + 1] - 1, y + (l.big ? 14 : 7) + (para.st[k] & BIG ? 1 : 0), TH.text);
          continue;
        }
        const st = para.st[k];
        const big = !!(st & BIG);
        const dy = l.big && !big ? 7 : 0;
        SANS.draw(g, x0 + l.xs[k - l.start], y + dy, ch, TH.text, styleOf(st));
      }
      if (li === caretLine && focused && !sel && caret.on()) {
        const cx = x0 + l.xs[Math.max(0, Math.min(l.xs.length - 1, this.caretPos.o - l.start))];
        const big = !!(this.typing & BIG) || l.big;
        g.vline(cx - 1, y - 1, y + (big ? 19 : 9), C.PLUM);
      }
    }
    g.pop();
    this.paintChildren(g);
  }
}
