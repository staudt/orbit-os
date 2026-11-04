import type { Gfx } from '../core/gfx';
import { C } from '../core/palette';
import { MONO } from '../core/fonts';
import type { KeyEv } from '../core/input';
import { Widget, type WEvent } from './widget';
import { ScrollBar } from './widgets';
import { TH, caret } from './theme';
import { os } from '../os';

const CW = 6;
const LH = 10;

interface Pos { line: number; col: number }
interface Snapshot { text: string; caret: Pos; anchor: Pos }

/** Per-character colors for syntax highlighting: return null to use the default color. */
export type Colorizer = (line: string, lineIndex: number) => Uint8Array | null;

/** Multi-line monospace editor: code (BASIC), music (MML) and plain text. */
export class TextArea extends Widget {
  lines: string[] = [''];
  caretPos: Pos = { line: 0, col: 0 };
  anchor: Pos = { line: 0, col: 0 };
  top = 0;
  left = 0;
  gutter = false;
  readOnly = false;
  wrapNone = true;
  bg: number = TH.field;
  fgColor: number = TH.text;
  colorize: Colorizer | null = null;
  /** called with a line's text when the caret leaves it (used to upper-case BASIC keywords) */
  transformLine: ((s: string) => string) | null = null;
  /** highlighted line (e.g. error), -1 for none */
  markLine = -1;
  onChange: (() => void) | null = null;
  onCaret: (() => void) | null = null;
  tabSize = 2;
  private vbar: ScrollBar;
  private hbar: ScrollBar;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private lastEdit = { kind: '', t: 0 };
  private dragging = false;
  private dirtyLine = -1;
  modified = false;

  constructor(text = '') {
    super();
    this.focusable = true;
    this.acceptsText = true;
    this.cursor = 'ibeam';
    this.vbar = this.add(new ScrollBar(true, (v) => { this.top = v; this.invalidate(); }));
    this.hbar = this.add(new ScrollBar(false, (v) => { this.left = v; this.invalidate(); }));
    this.vbar.step = 1;
    this.hbar.step = 4;
    this.setText(text);
  }

  // ---------------------------------------------------------------- geometry
  get gutterW() { return this.gutter ? String(this.lines.length).length * CW + 8 : 0; }
  get textX() { return 3 + this.gutterW; }
  get rows() { return Math.max(1, Math.floor((this.h - 12) / LH)); }
  get cols() { return Math.max(1, Math.floor((this.w - this.textX - 12) / CW)); }

  layout() {
    this.vbar.setBounds(this.w - 10, 0, 10, this.h - 9);
    this.hbar.setBounds(0, this.h - 10, this.w - 9, 10);
    this.updateBars();
  }
  private updateBars() {
    const maxLen = this.lines.reduce((m, l) => Math.max(m, l.length), 0);
    this.vbar.set(this.lines.length + this.rows - 1, this.rows, this.top);
    this.hbar.set(maxLen + 1, this.cols, this.left);
  }

  // ---------------------------------------------------------------- text
  getText() {
    this.commitLine();
    return this.lines.join('\n');
  }
  setText(t: string, keepUndo = false) {
    this.lines = t.replace(/\r\n?/g, '\n').replace(/\t/g, ' '.repeat(this.tabSize)).split('\n');
    this.caretPos = { line: 0, col: 0 };
    this.anchor = { ...this.caretPos };
    this.top = this.left = 0;
    if (!keepUndo) { this.undoStack = []; this.redoStack = []; }
    this.modified = false;
    this.updateBars();
    this.invalidate();
  }

  private snapshot(): Snapshot {
    return { text: this.lines.join('\n'), caret: { ...this.caretPos }, anchor: { ...this.anchor } };
  }
  private restore(s: Snapshot) {
    this.lines = s.text.split('\n');
    this.caretPos = { ...s.caret };
    this.anchor = { ...s.anchor };
    this.changed();
  }
  /** Record an undo step; typing of the same kind within 1s coalesces. */
  private record(kind: string) {
    const now = performance.now();
    if (kind !== this.lastEdit.kind || now - this.lastEdit.t > 1000 || kind === 'other') {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
    }
    this.lastEdit = { kind, t: now };
  }
  undo() {
    const s = this.undoStack.pop();
    if (!s) { os.sound.sfx('beep'); return; }
    this.redoStack.push(this.snapshot());
    this.restore(s);
    this.lastEdit.kind = '';
  }
  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.snapshot());
    this.restore(s);
    this.lastEdit.kind = '';
  }
  get canUndo() { return this.undoStack.length > 0; }

  private changed() {
    this.modified = true;
    caret.reset();
    this.updateBars();
    this.scrollToCaret();
    this.onChange?.();
    this.invalidate();
  }

  private order(): [Pos, Pos] {
    const a = this.anchor, b = this.caretPos;
    return a.line < b.line || (a.line === b.line && a.col <= b.col) ? [a, b] : [b, a];
  }
  get hasSelection() {
    return this.anchor.line !== this.caretPos.line || this.anchor.col !== this.caretPos.col;
  }
  get selectedText(): string {
    const [a, b] = this.order();
    if (a.line === b.line) return this.lines[a.line].slice(a.col, b.col);
    const out = [this.lines[a.line].slice(a.col)];
    for (let i = a.line + 1; i < b.line; i++) out.push(this.lines[i]);
    out.push(this.lines[b.line].slice(0, b.col));
    return out.join('\n');
  }
  private deleteSelection() {
    const [a, b] = this.order();
    const head = this.lines[a.line].slice(0, a.col), tail = this.lines[b.line].slice(b.col);
    this.lines.splice(a.line, b.line - a.line + 1, head + tail);
    this.caretPos = { ...a };
    this.anchor = { ...a };
  }
  /** Insert text at the caret, replacing any selection. */
  insert(text: string, kind = 'other') {
    if (this.readOnly) return;
    this.record(kind);
    if (this.hasSelection) this.deleteSelection();
    const parts = text.replace(/\r\n?/g, '\n').replace(/\t/g, ' '.repeat(this.tabSize)).split('\n');
    const { line, col } = this.caretPos;
    const cur = this.lines[line];
    const head = cur.slice(0, col), tail = cur.slice(col);
    if (parts.length === 1) {
      this.lines[line] = head + parts[0] + tail;
      this.caretPos = { line, col: col + parts[0].length };
    } else {
      const newLines = [head + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + tail];
      this.lines.splice(line, 1, ...newLines);
      this.caretPos = { line: line + parts.length - 1, col: parts[parts.length - 1].length };
    }
    this.anchor = { ...this.caretPos };
    if (parts.length > 1) this.commitLines(line, line + parts.length - 2);
    this.dirtyLine = this.caretPos.line;
    this.changed();
  }

  private commitLines(from: number, to: number) {
    if (!this.transformLine) return;
    for (let i = from; i <= to; i++) this.lines[i] = this.transformLine(this.lines[i]);
  }
  /** Apply transformLine to the line the caret is leaving. */
  private commitLine() {
    if (this.dirtyLine >= 0 && this.transformLine && this.dirtyLine < this.lines.length) {
      const i = this.dirtyLine;
      const before = this.lines[i];
      const after = this.transformLine(before);
      if (after !== before && after.length === before.length) this.lines[i] = after;
    }
    this.dirtyLine = -1;
  }

  // ---------------------------------------------------------------- caret
  setCaret(line: number, col: number, extend = false) {
    line = Math.max(0, Math.min(this.lines.length - 1, line));
    col = Math.max(0, Math.min(this.lines[line].length, col));
    if (line !== this.caretPos.line) this.commitLine();
    this.caretPos = { line, col };
    if (!extend) this.anchor = { line, col };
    caret.reset();
    this.scrollToCaret();
    this.onCaret?.();
    this.invalidate();
  }
  gotoLine(n: number, select = false) {
    this.setCaret(n, 0);
    if (select) { this.anchor = { line: n, col: 0 }; this.caretPos = { line: n, col: this.lines[n]?.length ?? 0 }; }
    this.top = Math.max(0, n - Math.floor(this.rows / 2));
    this.updateBars();
    this.invalidate();
  }
  scrollToCaret() {
    const { line, col } = this.caretPos;
    if (line < this.top) this.top = line;
    if (line >= this.top + this.rows) this.top = line - this.rows + 1;
    if (col < this.left) this.left = Math.max(0, col - 4);
    if (col >= this.left + this.cols) this.left = col - this.cols + 4;
    this.updateBars();
  }
  selectAll() {
    this.anchor = { line: 0, col: 0 };
    this.caretPos = { line: this.lines.length - 1, col: this.lines[this.lines.length - 1].length };
    this.invalidate();
  }
  private wordAt(p: Pos): [number, number] {
    const s = this.lines[p.line];
    const isW = (ch: string) => /[A-Za-z0-9_$%]/.test(ch);
    let a = p.col, b = p.col;
    while (a > 0 && isW(s[a - 1])) a--;
    while (b < s.length && isW(s[b])) b++;
    return [a, b];
  }

  /** Find text (case-insensitive); selects and returns true when found. */
  find(text: string, fromCaret = true, matchCase = false): boolean {
    if (!text) return false;
    const norm = (s: string) => (matchCase ? s : s.toLowerCase());
    const needle = norm(text);
    const start = fromCaret ? this.order()[1] : { line: 0, col: 0 };
    for (let k = 0; k <= this.lines.length; k++) {
      const li = (start.line + k) % this.lines.length;
      const from = k === 0 ? start.col : 0;
      const i = norm(this.lines[li]).indexOf(needle, from);
      if (i >= 0) {
        this.anchor = { line: li, col: i };
        this.setCaret(li, i + text.length, true);
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- input
  onKey(e: KeyEv) {
    const ext = e.shift;
    const { line, col } = this.caretPos;
    const L = this.lines;
    switch (e.key) {
      case 'ArrowLeft':
        if (!ext && this.hasSelection) { const [a] = this.order(); this.setCaret(a.line, a.col); return true; }
        if (e.ctrl) { const [a] = this.wordAt({ line, col: Math.max(0, col - 1) }); this.setCaret(line, col > 0 ? a : col, ext); return true; }
        if (col > 0) this.setCaret(line, col - 1, ext);
        else if (line > 0) this.setCaret(line - 1, L[line - 1].length, ext);
        return true;
      case 'ArrowRight':
        if (!ext && this.hasSelection) { const [, b] = this.order(); this.setCaret(b.line, b.col); return true; }
        if (e.ctrl) { const [, b] = this.wordAt({ line, col: Math.min(L[line].length, col + 1) }); this.setCaret(line, b, ext); return true; }
        if (col < L[line].length) this.setCaret(line, col + 1, ext);
        else if (line < L.length - 1) this.setCaret(line + 1, 0, ext);
        return true;
      case 'ArrowUp': this.setCaret(line - 1, col, ext); return true;
      case 'ArrowDown': this.setCaret(line + 1, col, ext); return true;
      case 'PageUp': this.top = Math.max(0, this.top - this.rows); this.setCaret(line - this.rows, col, ext); return true;
      case 'PageDown': this.top = Math.min(L.length - 1, this.top + this.rows); this.setCaret(line + this.rows, col, ext); return true;
      case 'Home': {
        if (e.ctrl) { this.setCaret(0, 0, ext); return true; }
        const ind = L[line].length - L[line].trimStart().length;
        this.setCaret(line, col === ind ? 0 : ind, ext);
        return true;
      }
      case 'End': if (e.ctrl) this.setCaret(L.length - 1, L[L.length - 1].length, ext); else this.setCaret(line, L[line].length, ext); return true;
      case 'Enter': {
        if (this.readOnly) return true;
        this.commitLine();
        if (this.transformLine) this.lines[line] = this.transformLine(this.lines[line]);
        const indent = /^ */.exec(L[line])![0];
        this.insert('\n' + indent.slice(0, Math.min(indent.length, col)));
        return true;
      }
      case 'Backspace':
        if (this.readOnly) return true;
        if (this.hasSelection) { this.record('other'); this.deleteSelection(); this.changed(); return true; }
        if (col === 0 && line === 0) return true;
        this.record('del');
        if (col > 0) {
          // delete a whole indent step when in leading spaces
          const lead = /^ */.exec(L[line])![0].length;
          const n = col <= lead && col % this.tabSize === 0 && col > 0 ? this.tabSize : 1;
          L[line] = L[line].slice(0, col - n) + L[line].slice(col);
          this.caretPos = { line, col: col - n };
        } else {
          const prevLen = L[line - 1].length;
          L[line - 1] += L[line];
          L.splice(line, 1);
          this.caretPos = { line: line - 1, col: prevLen };
        }
        this.anchor = { ...this.caretPos };
        this.dirtyLine = this.caretPos.line;
        this.changed();
        return true;
      case 'Delete':
        if (this.readOnly) return true;
        if (this.hasSelection) { this.record('other'); this.deleteSelection(); this.changed(); return true; }
        this.record('del');
        if (col < L[line].length) L[line] = L[line].slice(0, col) + L[line].slice(col + 1);
        else if (line < L.length - 1) { L[line] += L[line + 1]; L.splice(line + 1, 1); }
        this.dirtyLine = line;
        this.changed();
        return true;
      case 'Tab': {
        if (this.readOnly) return true;
        if (this.hasSelection && this.anchor.line !== this.caretPos.line || e.shift) {
          // indent / outdent selected lines
          this.record('other');
          const [a, b] = this.order();
          for (let i = a.line; i <= b.line; i++) {
            if (e.shift) L[i] = L[i].replace(new RegExp(`^ {1,${this.tabSize}}`), '');
            else L[i] = ' '.repeat(this.tabSize) + L[i];
          }
          this.anchor = { line: a.line, col: 0 };
          this.caretPos = { line: b.line, col: L[b.line].length };
          this.changed();
          return true;
        }
        this.insert(' '.repeat(this.tabSize - (col % this.tabSize)), 'type');
        return true;
      }
    }
    if (e.ctrl && !e.alt) {
      const k = e.key.toLowerCase();
      if (k === 'a') { this.selectAll(); return true; }
      if (k === 'z' && !e.shift) { this.undo(); return true; }
      if (k === 'y' || (k === 'z' && e.shift)) { this.redo(); return true; }
    }
    return false;
  }
  onText(s: string) {
    this.insert(s, s === ' ' ? 'space' : 'type');
  }
  onCopy(cut: boolean) {
    if (!this.hasSelection) return null;
    const t = this.selectedText;
    if (cut && !this.readOnly) { this.record('other'); this.deleteSelection(); this.changed(); }
    return t;
  }
  onPaste(s: string) {
    this.insert(s);
  }
  onFocus() { caret.reset(); }
  onBlur() { this.commitLine(); this.invalidate(); }

  private posAt(lx: number, ly: number): Pos {
    const line = Math.max(0, Math.min(this.lines.length - 1, this.top + Math.floor((ly - 2) / LH)));
    const col = Math.max(0, Math.min(this.lines[line].length, this.left + Math.round((lx - this.textX) / CW)));
    return { line, col };
  }
  onPointerDown(e: WEvent) {
    if (e.lx >= this.w - 10 || e.ly >= this.h - 10) return false;
    this.focus();
    const p = this.posAt(e.lx, e.ly);
    if (e.clicks === 2) {
      const [a, b] = this.wordAt(p);
      this.anchor = { line: p.line, col: a };
      this.setCaret(p.line, b, true);
      return true;
    }
    if (e.clicks >= 3) {
      this.anchor = { line: p.line, col: 0 };
      this.setCaret(p.line, this.lines[p.line].length, true);
      return true;
    }
    this.setCaret(p.line, p.col, e.shift);
    this.dragging = true;
    return true;
  }
  onPointerMove(e: WEvent) {
    if (!this.dragging) return;
    const p = this.posAt(e.lx, e.ly);
    this.setCaret(p.line, p.col, true);
  }
  onPointerUp() {
    this.dragging = false;
  }
  onWheel(e: WEvent) {
    this.top = Math.max(0, Math.min(this.lines.length - 1, this.top + e.wheel * 3));
    this.updateBars();
    this.invalidate();
    return true;
  }

  // ---------------------------------------------------------------- paint
  paint(g: Gfx) {
    const { w, h } = this;
    const focused = this.hasFocus;
    g.fillRect(0, 0, w - 10, h - 10, this.bg);
    g.rect(0, 0, w - 9, h - 9, focused ? C.PLUM : TH.border);
    g.fillRect(w - 10, h - 10, 10, 10, C.TAN);
    const gw = this.gutterW;
    if (gw) {
      g.fillRect(1, 1, gw, h - 11, C.TAN);
      g.vline(gw + 1, 1, h - 11, C.GREY);
    }
    const [sa, sb] = this.order();
    const sel = this.hasSelection;
    g.push(1, 1, w - 11, h - 11);
    for (let r = 0; r < this.rows + 1; r++) {
      const li = this.top + r;
      if (li >= this.lines.length) break;
      const y = 1 + r * LH;
      const text = this.lines[li];
      if (li === this.markLine) g.fillRect(gw + 1, y, w, LH, C.PALE);
      if (gw) {
        const num = String(li + 1);
        MONO.draw(g, gw - 3 - num.length * CW, y + 1, num, li === this.caretPos.line && focused ? C.PLUM : C.GREY);
      }
      g.push(this.textX - 1, 0, w - this.textX - 10, h - 11);
      // selection
      if (sel && li >= sa.line && li <= sb.line) {
        const c0 = li === sa.line ? sa.col : 0;
        const c1 = li === sb.line ? sb.col : text.length + 1;
        const x0 = 1 + (c0 - this.left) * CW, x1 = 1 + (c1 - this.left) * CW;
        g.fillRect(x0, y - 1, Math.max(0, x1 - x0), LH, focused ? TH.sel : TH.selDim);
      }
      const colors = this.colorize?.(text, li) ?? null;
      const vis = text.slice(this.left, this.left + this.cols + 2);
      for (let i = 0; i < vis.length; i++) {
        const ch = vis[i];
        if (ch === ' ') continue;
        MONO.draw(g, 1 + i * CW, y + 1, ch, colors ? colors[this.left + i] : this.fgColor);
      }
      if (focused && li === this.caretPos.line && caret.on() && !this.readOnly) {
        const cx = 1 + (this.caretPos.col - this.left) * CW;
        g.vline(cx - 1, y - 1, y + LH - 2, C.PLUM);
      }
      g.pop();
    }
    g.pop();
    this.paintChildren(g);
  }
}
