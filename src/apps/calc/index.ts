import { registerApp } from '../registry';
import { Window } from '../../wm/window';
import { Widget, type WEvent } from '../../ui/widget';
import { Label, ScrollBar, TextField } from '../../ui/widgets';
import type { MenuDef } from '../../ui/menu';
import type { Gfx } from '../../core/gfx';
import { C } from '../../core/palette';
import { SANS } from '../../core/fonts';
import type { KeyEv } from '../../core/input';
import { TH } from '../../ui/theme';
import { DocController } from '../doccontroller';
import { Sheet, COLS, ROWS, cellId } from './engine';
import { invalidate, os } from '../../os';

const ROW_H = 12;
const HEAD_W = 22;
const HEAD_H = 12;
const DEF_W = 54;

interface Snap { cells: [string, string][] }
/** internal clipboard: raw cells relative to the copied range's top-left */
let clip: { text: string; origin: { c: number; r: number }; cells: { dc: number; dr: number; raw: string }[] } | null = null;

const colName = (c: number) => String.fromCharCode(65 + c);

/** The spreadsheet grid: headers, cells, selection, in-cell editing. */
class Grid extends Widget {
  sheet = new Sheet();
  widths: number[] = Array(COLS).fill(DEF_W);
  cur = { c: 0, r: 0 };
  anchor = { c: 0, r: 0 };
  top = 0;
  left = 0;
  editor: TextField | null = null;
  modified = false;
  onSelect: (() => void) | null = null;
  onChange: (() => void) | null = null;
  private vbar: ScrollBar;
  private hbar: ScrollBar;
  private undoStack: Snap[] = [];
  private redoStack: Snap[] = [];
  private dragging = false;
  private resizing: { c: number; x: number; w: number } | null = null;

  constructor() {
    super();
    this.focusable = true;
    this.vbar = this.add(new ScrollBar(true, (v) => { this.top = v; invalidate(); }));
    this.hbar = this.add(new ScrollBar(false, (v) => { this.left = v; invalidate(); }));
    this.vbar.step = 1;
    this.hbar.step = 1;
  }

  layout() {
    this.vbar.setBounds(this.w - 10, 0, 10, this.h - 9);
    this.hbar.setBounds(0, this.h - 10, this.w - 9, 10);
    this.updateBars();
    this.cancelEdit();
  }
  private get visRows() { return Math.max(1, Math.floor((this.h - 10 - HEAD_H) / ROW_H)); }
  private visCols(): number {
    let x = HEAD_W, n = 0;
    for (let c = this.left; c < COLS && x < this.w - 10; c++) { x += this.widths[c]; n++; }
    return Math.max(1, n - (x > this.w - 10 ? 1 : 0));
  }
  private updateBars() {
    this.vbar.set(ROWS, this.visRows, this.top);
    this.hbar.set(COLS, this.visCols(), this.left);
  }
  private colX(c: number): number {
    let x = HEAD_W;
    for (let k = this.left; k < c; k++) x += this.widths[k];
    return x;
  }
  private cellAt(lx: number, ly: number): { c: number; r: number } | null {
    if (lx < HEAD_W || ly < HEAD_H) return null;
    let x = HEAD_W, c = this.left;
    while (c < COLS && x + this.widths[c] <= lx) { x += this.widths[c]; c++; }
    const r = this.top + Math.floor((ly - HEAD_H) / ROW_H);
    if (c >= COLS || r >= ROWS) return null;
    return { c, r };
  }

  get id() { return cellId(this.cur.c, this.cur.r); }
  get range() {
    return { c0: Math.min(this.cur.c, this.anchor.c), c1: Math.max(this.cur.c, this.anchor.c), r0: Math.min(this.cur.r, this.anchor.r), r1: Math.max(this.cur.r, this.anchor.r) };
  }

  move(c: number, r: number, extend = false) {
    this.commitEdit();
    this.cur = { c: Math.max(0, Math.min(COLS - 1, c)), r: Math.max(0, Math.min(ROWS - 1, r)) };
    if (!extend) this.anchor = { ...this.cur };
    if (this.cur.r < this.top) this.top = this.cur.r;
    if (this.cur.r >= this.top + this.visRows) this.top = this.cur.r - this.visRows + 1;
    if (this.cur.c < this.left) this.left = this.cur.c;
    while (this.cur.c >= this.left + this.visCols() && this.left < COLS - 1) this.left++;
    this.updateBars();
    this.onSelect?.();
    invalidate();
  }

  // ---- edits with undo
  private snapshot(): Snap { return { cells: [...this.sheet.cells()] }; }
  private restoreSnap(s: Snap) {
    this.sheet = new Sheet();
    for (const [id, raw] of s.cells) this.sheet.set(id, raw);
  }
  private record() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
  }
  undo() {
    const s = this.undoStack.pop();
    if (!s) { os.sound.sfx('beep'); return; }
    this.redoStack.push(this.snapshot());
    this.restoreSnap(s);
    this.changed();
  }
  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.snapshot());
    this.restoreSnap(s);
    this.changed();
  }
  get canUndo() { return this.undoStack.length > 0; }
  private changed() {
    this.modified = true;
    this.onChange?.();
    this.onSelect?.();
    invalidate();
  }
  setRaw(id: string, raw: string, record = true) {
    if (this.sheet.raw(id) === raw) return;
    if (record) this.record();
    this.sheet.set(id, raw);
    this.changed();
  }
  clearRange() {
    const { c0, c1, r0, r1 } = this.range;
    this.record();
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.sheet.set(cellId(c, r), '');
    this.changed();
  }
  load(s: Sheet) {
    this.sheet = s;
    this.undoStack = [];
    this.redoStack = [];
    this.modified = false;
    this.move(0, 0);
  }

  // ---- in-cell editing
  startEdit(initial?: string) {
    if (this.editor) return;
    const x = this.colX(this.cur.c), y = HEAD_H + (this.cur.r - this.top) * ROW_H;
    const raw = initial ?? this.sheet.raw(this.id);
    const ed = new TextField(raw, { font: SANS });
    ed.h = ROW_H + 2;
    ed.setBounds(x - 1, y - 1, Math.max(this.widths[this.cur.c] + 2, 60), ROW_H + 2);
    ed.onKeyHook = (e) => {
      if (e.key === 'Enter') { this.commitEdit(); this.move(this.cur.c, this.cur.r + (e.shift ? -1 : 1)); return true; }
      if (e.key === 'Tab') { this.commitEdit(); this.move(this.cur.c + (e.shift ? -1 : 1), this.cur.r); return true; }
      if (e.key === 'Escape') { this.cancelEdit(); return true; }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shift) { this.commitEdit(); this.move(this.cur.c, this.cur.r + (e.key === 'ArrowUp' ? -1 : 1)); return true; }
      return false;
    };
    ed.onBlur = () => { if (this.editor === ed) this.commitEdit(); };
    this.editor = this.add(ed);
    ed.focus();
    invalidate();
  }
  commitEdit() {
    const ed = this.editor;
    if (!ed) return;
    this.editor = null;
    this.remove(ed);
    this.setRaw(this.id, ed.text);
    if (this.window?.focused === ed || !this.window?.focused) this.focus();
  }
  cancelEdit() {
    const ed = this.editor;
    if (!ed) return;
    this.editor = null;
    this.remove(ed);
    this.focus();
  }
  get editing() { return !!this.editor; }

  // ---- clipboard
  copyRange(cut: boolean): string {
    const { c0, c1, r0, r1 } = this.range;
    const cells: { dc: number; dr: number; raw: string }[] = [];
    const lines: string[] = [];
    for (let r = r0; r <= r1; r++) {
      const row: string[] = [];
      for (let c = c0; c <= c1; c++) {
        const id = cellId(c, r);
        cells.push({ dc: c - c0, dr: r - r0, raw: this.sheet.raw(id) });
        row.push(this.sheet.display(id));
      }
      lines.push(row.join('\t'));
    }
    const text = lines.join('\n');
    clip = { text, cells, origin: { c: c0, r: r0 } };
    if (cut) this.clearRange();
    return text;
  }
  pasteText(s: string) {
    this.record();
    const { c, r } = this.cur;
    if (clip && clip.text === s) {
      // shift formulas by the distance between the copy origin and the paste target
      const origin = clip.origin;
      for (const k of clip.cells) {
        const tc = c + k.dc, tr = r + k.dr;
        if (tc >= COLS || tr >= ROWS) continue;
        let raw = k.raw;
        if (raw.startsWith('=')) raw = Sheet.shiftFormula(raw, tc - (origin.c + k.dc), tr - (origin.r + k.dr));
        this.sheet.set(cellId(tc, tr), raw);
      }
    } else {
      const rows = s.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
      rows.forEach((line, dr) => {
        line.split(line.includes('\t') ? '\t' : ',').forEach((v, dc) => {
          if (c + dc < COLS && r + dr < ROWS) this.sheet.set(cellId(c + dc, r + dr), v.trim());
        });
      });
    }
    this.changed();
  }

  // ---- input
  onPointerDown(e: WEvent) {
    if (e.lx >= this.w - 10 || e.ly >= this.h - 10) return false;
    this.focus();
    // column resize handle in the header
    if (e.ly < HEAD_H) {
      let x = HEAD_W;
      for (let c = this.left; c < COLS; c++) {
        x += this.widths[c];
        if (Math.abs(e.lx - x) <= 2) { this.resizing = { c, x: e.lx, w: this.widths[c] }; return true; }
        if (x > this.w) break;
      }
      const cell = this.cellAt(e.lx, HEAD_H + 1);
      if (cell) { this.anchor = { c: cell.c, r: 0 }; this.cur = { c: cell.c, r: ROWS - 1 }; this.onSelect?.(); invalidate(); }
      return true;
    }
    if (e.lx < HEAD_W) {
      const cell = this.cellAt(HEAD_W + 1, e.ly);
      if (cell) { this.anchor = { c: 0, r: cell.r }; this.cur = { c: COLS - 1, r: cell.r }; this.onSelect?.(); invalidate(); }
      return true;
    }
    const cell = this.cellAt(e.lx, e.ly);
    if (!cell) return true;
    if (e.clicks === 2) { this.move(cell.c, cell.r); this.startEdit(); return true; }
    this.move(cell.c, cell.r, e.shift);
    this.dragging = true;
    return true;
  }
  onPointerMove(e: WEvent) {
    if (this.resizing) {
      this.widths[this.resizing.c] = Math.max(16, Math.min(200, this.resizing.w + e.lx - this.resizing.x));
      this.updateBars();
      invalidate();
      return;
    }
    if (!this.dragging) return;
    const cell = this.cellAt(Math.max(HEAD_W, e.lx), Math.max(HEAD_H, e.ly));
    if (cell) { this.cur = cell; this.onSelect?.(); invalidate(); }
  }
  onHover(e: WEvent) {
    let x = HEAD_W, near = false;
    if (e.ly < HEAD_H) for (let c = this.left; c < COLS && x < this.w; c++) { x += this.widths[c]; if (Math.abs(e.lx - x) <= 2) near = true; }
    this.cursor = near ? 'resize-ew' : 'arrow';
  }
  onPointerUp() { this.dragging = false; this.resizing = null; }
  onWheel(e: WEvent) {
    if (e.shift) this.hbar.setValue(this.left + e.wheel); else this.vbar.setValue(this.top + e.wheel * 3);
    return true;
  }
  onKey(e: KeyEv) {
    const { c, r } = this.cur;
    const ext = e.shift;
    switch (e.key) {
      case 'ArrowUp': this.move(c, r - 1, ext); return true;
      case 'ArrowDown': case 'Enter': this.move(c, r + 1, ext && e.key !== 'Enter'); return true;
      case 'ArrowLeft': this.move(c - 1, r, ext); return true;
      case 'ArrowRight': this.move(c + 1, r, ext); return true;
      case 'Tab': this.move(c + (e.shift ? -1 : 1), r); return true;
      case 'Home': this.move(e.ctrl ? 0 : 0, e.ctrl ? 0 : r, ext); return true;
      case 'End': { const u = this.sheet.usedRange(); this.move(Math.max(0, u.cols - 1), e.ctrl ? Math.max(0, u.rows - 1) : r, ext); return true; }
      case 'PageDown': this.move(c, r + this.visRows, ext); return true;
      case 'PageUp': this.move(c, r - this.visRows, ext); return true;
      case 'F2': this.startEdit(); return true;
      case 'Delete': case 'Backspace': this.clearRange(); return true;
    }
    if (e.ctrl && e.key.toLowerCase() === 'z') { this.undo(); return true; }
    if (e.ctrl && e.key.toLowerCase() === 'y') { this.redo(); return true; }
    if (e.ctrl && e.key.toLowerCase() === 'a') { this.anchor = { c: 0, r: 0 }; this.cur = { c: COLS - 1, r: ROWS - 1 }; invalidate(); return true; }
    return false;
  }
  onText(s: string) {
    // typing replaces the cell
    this.startEdit(s);
  }
  onCopy(cut: boolean) {
    return this.copyRange(cut);
  }
  onPaste(s: string) { this.pasteText(s); }

  // ---- paint
  paint(g: Gfx) {
    const { w, h } = this;
    const gw = w - 10, gh = h - 10;
    g.fillRect(0, 0, gw, gh, C.CREAM);
    const { c0, c1, r0, r1 } = this.range;
    const focused = this.hasFocus || !!this.editor;
    // column headers
    g.fillRect(0, 0, gw, HEAD_H, C.TAN);
    g.fillRect(0, 0, HEAD_W, gh, C.TAN);
    let x = HEAD_W;
    for (let c = this.left; c < COLS && x < gw; c++) {
      const cw = this.widths[c];
      const inSel = c >= c0 && c <= c1;
      if (inSel) g.fillRect(x, 0, cw, HEAD_H, C.PALE);
      const t = colName(c);
      SANS.draw(g, x + Math.floor((cw - SANS.measure(t)) / 2), 2, t, inSel ? C.PLUM : C.PLUM_DARK, { bold: inSel });
      g.vline(x + cw - 1, 0, gh - 1, C.TAN);
      g.vline(x + cw - 1, 0, HEAD_H - 1, C.GREY);
      x += cw;
    }
    for (let i = 0; i <= this.visRows; i++) {
      const r = this.top + i;
      if (r >= ROWS) break;
      const y = HEAD_H + i * ROW_H;
      const inSel = r >= r0 && r <= r1;
      if (inSel) g.fillRect(0, y, HEAD_W, ROW_H, C.PALE);
      const t = String(r + 1);
      SANS.draw(g, HEAD_W - 3 - SANS.measure(t), y + 2, t, inSel ? C.PLUM : C.PLUM_DARK, { bold: inSel });
      g.hline(HEAD_W, gw - 1, y + ROW_H - 1, C.TAN);
      g.hline(0, HEAD_W - 1, y + ROW_H - 1, C.GREY);
    }
    g.hline(0, gw - 1, HEAD_H - 1, C.GREY);
    g.vline(HEAD_W - 1, 0, gh - 1, C.GREY);
    // cells
    g.push(HEAD_W, HEAD_H, gw - HEAD_W, gh - HEAD_H);
    for (let i = 0; i <= this.visRows; i++) {
      const r = this.top + i;
      if (r >= ROWS) break;
      const y = i * ROW_H;
      let cx = 0;
      for (let c = this.left; c < COLS && cx < gw; c++) {
        const cw = this.widths[c];
        const inSel = c >= c0 && c <= c1 && r >= r0 && r <= r1 && (c0 !== c1 || r0 !== r1);
        if (inSel) g.fillRect(cx, y, cw - 1, ROW_H - 1, focused ? C.PALE : C.TAN);
        const id = cellId(c, r);
        const v = this.sheet.value(id);
        const txt = this.sheet.display(id);
        if (txt) {
          const isErr = typeof v === 'object';
          const isNum = typeof v === 'number';
          const col = isErr ? C.CRIMSON : C.INK;
          const fit = SANS.fit(txt, cw - 4);
          const tw = SANS.measure(fit);
          const tx = isNum || isErr ? cx + cw - tw - 3 : cx + 2;
          g.clip(cx, y, cw - 1, ROW_H);
          SANS.draw(g, tx, y + 2, isNum && SANS.measure(txt) > cw - 4 ? '#'.repeat(Math.max(1, Math.floor((cw - 4) / 6))) : fit, col);
          g.pop();
        }
        cx += cw;
      }
    }
    // active cell frame
    const ax = this.colX(this.cur.c) - HEAD_W, ay = (this.cur.r - this.top) * ROW_H;
    if (this.cur.r >= this.top) {
      g.rect(ax - 1, ay - 1, this.widths[this.cur.c] + 1, ROW_H + 1, focused ? C.PLUM : C.GREY);
      g.rect(ax, ay, this.widths[this.cur.c] - 1, ROW_H - 1, focused ? C.PLUM : C.GREY);
      g.fillRect(ax + this.widths[this.cur.c] - 3, ay + ROW_H - 3, 3, 3, C.PLUM);
    }
    g.pop();
    g.rect(0, 0, gw + 1, gh + 1, TH.border);
    g.fillRect(gw + 1, gh + 1, 9, 9, C.TAN);
    this.paintChildren(g);
  }
}

class CalcWindow {
  win: Window;
  grid: Grid;
  doc: DocController;
  private cellLabel: Label;
  private bar: TextField;

  constructor(path?: string) {
    this.win = new Window({ title: 'Calc', icon: 'calc', app: 'calc', w: 380, h: 240, minW: 200, minH: 100 });
    const b = this.win.body;
    this.cellLabel = b.add(new Label('A1', { style: { bold: true }, align: 'center' }));
    this.bar = b.add(new TextField('', { placeholder: 'Type a value or =formula' }));
    this.grid = b.add(new Grid());
    b.layoutFn = (p) => {
      this.cellLabel.setBounds(2, 4, 30, 14);
      this.bar.setBounds(34, 4, p.w - 38, 14);
      this.grid.setBounds(0, 22, p.w, p.h - 22);
    };
    this.bar.onSubmit = (t) => {
      this.grid.setRaw(this.grid.id, t);
      this.grid.move(this.grid.cur.c, this.grid.cur.r + 1);
      this.grid.focus();
    };
    this.bar.onCancel = () => { this.sync(); this.grid.focus(); };
    this.grid.onSelect = () => this.sync();
    this.doc = new DocController({
      win: this.win, appName: 'Calc', exts: ['CSV', 'TXT'], defaultExt: 'CSV', typeLabel: 'Spreadsheets (.CSV)',
      defaultDir: '/Data', untitled: 'Untitled', saveExts: ['CSV'],
      serialize: () => { this.grid.commitEdit(); return this.grid.sheet.toCSV(); },
      deserialize: (_p, c) => this.grid.load(Sheet.fromCSV(typeof c === 'string' ? c : new TextDecoder().decode(c))),
      isDirty: () => this.grid.modified,
      markClean: () => { this.grid.modified = false; },
    });
    this.grid.onChange = () => this.doc.updateTitle();
    this.win.menus = this.menus();
    os.wm.open(this.win);
    this.win.focusWidget(this.grid);
    this.sync();
    if (path) this.doc.load(path);
  }

  private sync() {
    const g = this.grid;
    const { c0, c1, r0, r1 } = g.range;
    this.cellLabel.setText(c0 === c1 && r0 === r1 ? g.id : `${cellId(c0, r0)}:`);
    if (!this.bar.hasFocus) this.bar.setText(g.sheet.raw(g.id));
    invalidate();
  }

  private fillDown() {
    const g = this.grid;
    const { c0, c1, r0, r1 } = g.range;
    if (r1 <= r0) return;
    for (let c = c0; c <= c1; c++) {
      const src = g.sheet.raw(cellId(c, r0));
      for (let r = r0 + 1; r <= r1; r++) g.setRaw(cellId(c, r), src.startsWith('=') ? Sheet.shiftFormula(src, 0, r - r0) : src, r === r0 + 1 && c === c0);
    }
  }

  private menus(): MenuDef[] {
    const g = this.grid;
    return [
      {
        label: 'File',
        items: () => [
          { label: 'New', action: () => this.doc.newDoc(() => g.load(new Sheet())) },
          { label: 'New Window', action: () => new CalcWindow() },
          { label: 'Open…', shortcut: 'Ctrl+O', action: () => this.doc.open() },
          { separator: true },
          { label: 'Save', shortcut: 'Ctrl+S', action: () => this.doc.save() },
          { label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: () => this.doc.saveAs() },
          { separator: true },
          { label: 'Close', shortcut: 'Ctrl+F4', action: () => this.win.close() },
        ],
      },
      {
        label: 'Edit',
        items: () => [
          { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !g.canUndo, action: () => g.undo() },
          { label: 'Redo', shortcut: 'Ctrl+Y', action: () => g.redo() },
          { separator: true },
          { label: 'Cut', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
          { label: 'Copy', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
          { label: 'Clear', shortcut: 'Del', action: () => g.clearRange() },
          { label: 'Fill Down', action: () => this.fillDown() },
          { separator: true },
          { label: 'Edit Cell', shortcut: 'F2', action: () => g.startEdit() },
        ],
      },
      {
        label: 'Help',
        items: () => [
          { label: 'Formulas start with =, like =A1*B1+2', disabled: true },
          { label: 'Operators: + - * / ^ and ( )', disabled: true },
          { label: '$ keeps a reference fixed when copying', disabled: true },
        ],
      },
    ];
  }
}

registerApp({
  id: 'calc',
  name: 'Calc',
  icon: 'calc',
  exts: ['CSV'],
  description: 'A simple spreadsheet: values, cell references and arithmetic formulas.',
  launch: ({ path }) => { new CalcWindow(path); },
});
