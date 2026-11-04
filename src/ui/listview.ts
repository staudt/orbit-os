import type { Gfx } from '../core/gfx';
import { C, DARKER } from '../core/palette';
import { SANS, wrapText } from '../core/fonts';
import { icon, T as TRANSPARENT } from '../core/icons';
import type { KeyEv } from '../core/input';
import { Widget, type WEvent } from './widget';
import { ScrollBar, TextField } from './widgets';
import { TH } from './theme';

export interface ListItem {
  id: string;
  icon?: string;
  cells: string[];
  /** values used for sorting each column (defaults to cell text) */
  sortKeys?: (string | number)[];
  /** items that always sort first (e.g. folders) */
  group?: number;
  dim?: boolean;
}

export interface Column {
  title: string;
  w: number;
  align?: 'left' | 'right';
  /** grow to fill the remaining width */
  flex?: boolean;
}

const HEAD_H = 13;
const ROW_H = 16;
const CELL_W = 64;
const CELL_H = 50;

export class ListView extends Widget {
  columns: Column[];
  items: ListItem[] = [];
  selected = new Set<string>();
  focusIdx = -1;
  private anchorIdx = -1;
  scroll = 0;
  mode: 'list' | 'icons' = 'list';
  sortCol = 0;
  sortDir = 1;
  sortable = true;
  multi = true;
  emptyText = '';
  private vbar: ScrollBar;
  private editor: TextField | null = null;
  private editId = '';
  private press: { x: number; y: number; id: string | null; moved: boolean; band: boolean } | null = null;
  private typeBuf = '';
  private typeTime = 0;

  onActivate: ((items: ListItem[]) => void) | null = null;
  onSelect: ((items: ListItem[]) => void) | null = null;
  onContext: ((items: ListItem[], lx: number, ly: number) => void) | null = null;
  onRename: ((item: ListItem, name: string) => void) | null = null;
  onDragStart: ((items: ListItem[]) => void) | null = null;
  onDragMove: ((lx: number, ly: number) => void) | null = null;
  onDragEnd: ((lx: number, ly: number) => void) | null = null;
  onKeyExtra: ((e: KeyEv) => boolean) | null = null;

  constructor(columns: Column[]) {
    super();
    this.columns = columns;
    this.focusable = true;
    this.vbar = this.add(new ScrollBar(true, (v) => { this.scroll = v; this.invalidate(); }));
  }

  setItems(items: ListItem[], keepSelection = true) {
    this.items = items;
    if (keepSelection) {
      const ids = new Set(items.map((i) => i.id));
      for (const s of [...this.selected]) if (!ids.has(s)) this.selected.delete(s);
    } else this.selected.clear();
    this.sort();
    this.focusIdx = Math.min(this.focusIdx, this.items.length - 1);
    this.updateBar();
    this.invalidate();
  }

  sort() {
    if (!this.sortable) return;
    const c = this.sortCol, d = this.sortDir;
    this.items.sort((a, b) => {
      const g = (a.group ?? 0) - (b.group ?? 0);
      if (g) return g;
      const ka = a.sortKeys?.[c] ?? a.cells[c] ?? '', kb = b.sortKeys?.[c] ?? b.cells[c] ?? '';
      const r = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb), undefined, { numeric: true, sensitivity: 'base' });
      return r * d;
    });
  }

  get selectedItems(): ListItem[] {
    return this.items.filter((i) => this.selected.has(i.id));
  }

  select(ids: string[], focusId?: string) {
    this.selected = new Set(ids);
    const fi = this.items.findIndex((i) => i.id === (focusId ?? ids[0]));
    if (fi >= 0) { this.focusIdx = fi; this.anchorIdx = fi; this.ensureVisible(fi); }
    this.onSelect?.(this.selectedItems);
    this.invalidate();
  }

  // ---------------------------------------------------------------- geometry
  private get colsPerRow() { return Math.max(1, Math.floor((this.w - 12) / CELL_W)); }
  private get top() { return this.mode === 'list' ? HEAD_H : 2; }
  private get contentH() {
    return this.mode === 'list' ? this.items.length * ROW_H : Math.ceil(this.items.length / this.colsPerRow) * CELL_H;
  }
  private get viewH() { return this.h - this.top - 1; }
  private colWidths(): number[] {
    const avail = this.w - 12;
    const fixed = this.columns.reduce((s, c) => s + (c.flex ? 0 : c.w), 0);
    return this.columns.map((c) => (c.flex ? Math.max(c.w, avail - fixed) : c.w));
  }
  layout() {
    this.vbar.setBounds(this.w - 10, 0, 10, this.h);
    this.updateBar();
    if (this.editor) this.cancelEdit();
  }
  private updateBar() {
    this.vbar.step = this.mode === 'list' ? ROW_H : CELL_H / 2;
    this.vbar.set(this.contentH, this.viewH, this.scroll);
    this.scroll = this.vbar.value;
  }
  private itemRect(i: number): { x: number; y: number; w: number; h: number } {
    if (this.mode === 'list') return { x: 1, y: this.top + i * ROW_H - this.scroll, w: this.w - 12, h: ROW_H };
    const per = this.colsPerRow;
    return { x: 4 + (i % per) * CELL_W, y: this.top + Math.floor(i / per) * CELL_H - this.scroll, w: CELL_W, h: CELL_H };
  }
  indexAt(lx: number, ly: number): number {
    if (ly < this.top || lx >= this.w - 10) return -1;
    if (this.mode === 'list') {
      const i = Math.floor((ly - this.top + this.scroll) / ROW_H);
      return i >= 0 && i < this.items.length ? i : -1;
    }
    const col = Math.floor((lx - 4) / CELL_W);
    const row = Math.floor((ly - this.top + this.scroll) / CELL_H);
    if (col < 0 || col >= this.colsPerRow) return -1;
    const i = row * this.colsPerRow + col;
    return i >= 0 && i < this.items.length ? i : -1;
  }
  ensureVisible(i: number) {
    const r = this.itemRect(i);
    const y = r.y + this.scroll - this.top;
    if (y < this.scroll) this.scroll = y;
    else if (y + r.h > this.scroll + this.viewH) this.scroll = y + r.h - this.viewH;
    this.updateBar();
  }

  // ---------------------------------------------------------------- editing
  startRename(id: string, initial?: string) {
    const i = this.items.findIndex((it) => it.id === id);
    if (i < 0) return;
    this.ensureVisible(i);
    const r = this.itemRect(i);
    const item = this.items[i];
    const text = initial ?? item.cells[0];
    this.editId = id;
    const ed = new TextField(text, {
      onSubmit: (t) => this.commitEdit(t),
      onCancel: () => this.cancelEdit(),
    });
    ed.onBlur = () => { if (this.editor === ed) this.commitEdit(ed.text); };
    if (this.mode === 'list') ed.setBounds(r.x + 19, r.y + 1, Math.max(60, this.colWidths()[0] - 20), ROW_H - 2);
    else ed.setBounds(r.x, r.y + 33, CELL_W, 14);
    this.editor = this.add(ed);
    // select the name without its extension
    const dot = text.lastIndexOf('.');
    ed.anchor = 0;
    ed.caretPos = dot > 0 ? dot : text.length;
    ed.focus();
  }
  private commitEdit(t: string) {
    const item = this.items.find((i) => i.id === this.editId);
    this.cancelEdit();
    if (item && t && t !== item.cells[0]) this.onRename?.(item, t);
  }
  cancelEdit() {
    if (!this.editor) return;
    const ed = this.editor;
    this.editor = null;
    this.remove(ed);
    this.focus();
  }

  // ---------------------------------------------------------------- input
  onPointerDown(e: WEvent) {
    this.focus();
    if (this.mode === 'list' && e.ly < HEAD_H) {
      // sort by column
      if (!this.sortable) return true;
      const ws = this.colWidths();
      let x = 1;
      for (let c = 0; c < ws.length; c++) {
        if (e.lx >= x && e.lx < x + ws[c]) {
          if (this.sortCol === c) this.sortDir = -this.sortDir;
          else { this.sortCol = c; this.sortDir = 1; }
          this.sort();
          this.invalidate();
          break;
        }
        x += ws[c];
      }
      return true;
    }
    const i = this.indexAt(e.lx, e.ly);
    const item = i >= 0 ? this.items[i] : null;
    if (e.button === 2) {
      if (item && !this.selected.has(item.id)) this.select([item.id]);
      if (!item) { this.selected.clear(); this.onSelect?.([]); }
      this.onContext?.(this.selectedItems, e.lx, e.ly);
      this.invalidate();
      return true;
    }
    if (!item) {
      if (!e.ctrl && !e.shift) { this.selected.clear(); this.onSelect?.([]); }
      this.press = { x: e.lx, y: e.ly, id: null, moved: false, band: false };
      this.invalidate();
      return true;
    }
    if (e.shift && this.multi && this.anchorIdx >= 0) {
      const [a, b] = [Math.min(this.anchorIdx, i), Math.max(this.anchorIdx, i)];
      this.selected = new Set(this.items.slice(a, b + 1).map((x) => x.id));
      this.focusIdx = i;
    } else if (e.ctrl && this.multi) {
      if (this.selected.has(item.id)) this.selected.delete(item.id); else this.selected.add(item.id);
      this.focusIdx = this.anchorIdx = i;
    } else if (!this.selected.has(item.id)) {
      this.selected = new Set([item.id]);
      this.focusIdx = this.anchorIdx = i;
    } else {
      this.focusIdx = i;
    }
    this.onSelect?.(this.selectedItems);
    if (e.clicks === 2) { this.onActivate?.(this.selectedItems); this.press = null; }
    else this.press = { x: e.lx, y: e.ly, id: item.id, moved: false, band: false };
    this.invalidate();
    return true;
  }
  onPointerMove(e: WEvent) {
    const p = this.press;
    if (!p) return;
    if (!p.moved && Math.abs(e.lx - p.x) + Math.abs(e.ly - p.y) > 4) {
      p.moved = true;
      if (p.id && this.onDragStart) this.onDragStart(this.selectedItems);
    }
    if (p.moved && p.id) this.onDragMove?.(e.lx, e.ly);
  }
  onPointerUp(e: WEvent) {
    const p = this.press;
    this.press = null;
    if (!p) return;
    if (p.moved && p.id) this.onDragEnd?.(e.lx, e.ly);
    else if (!p.moved && p.id && !e.ctrl && !e.shift && this.selected.size > 1) {
      // click on one of several selected items narrows the selection
      this.select([p.id]);
    }
  }
  onWheel(e: WEvent) {
    this.vbar.setValue(this.scroll + e.wheel * (this.mode === 'list' ? ROW_H * 2 : CELL_H / 2));
    return true;
  }
  onKey(e: KeyEv) {
    if (this.onKeyExtra?.(e)) return true;
    const n = this.items.length;
    if (!n) return false;
    let i = this.focusIdx < 0 ? 0 : this.focusIdx;
    const per = this.mode === 'icons' ? this.colsPerRow : 1;
    const pageRows = Math.max(1, Math.floor(this.viewH / (this.mode === 'list' ? ROW_H : CELL_H)));
    switch (e.key) {
      case 'ArrowDown': i = Math.min(n - 1, this.focusIdx < 0 ? 0 : i + per); break;
      case 'ArrowUp': i = Math.max(0, i - per); break;
      case 'ArrowRight': if (this.mode !== 'icons') return false; i = Math.min(n - 1, i + 1); break;
      case 'ArrowLeft': if (this.mode !== 'icons') return false; i = Math.max(0, i - 1); break;
      case 'Home': i = 0; break;
      case 'End': i = n - 1; break;
      case 'PageDown': i = Math.min(n - 1, i + pageRows * per); break;
      case 'PageUp': i = Math.max(0, i - pageRows * per); break;
      case 'Enter': if (this.selected.size) this.onActivate?.(this.selectedItems); return true;
      default:
        if (e.ctrl && e.key.toLowerCase() === 'a' && this.multi) { this.select(this.items.map((x) => x.id)); return true; }
        return false;
    }
    if (e.shift && this.multi) {
      if (this.anchorIdx < 0) this.anchorIdx = this.focusIdx < 0 ? 0 : this.focusIdx;
      const [a, b] = [Math.min(this.anchorIdx, i), Math.max(this.anchorIdx, i)];
      this.selected = new Set(this.items.slice(a, b + 1).map((x) => x.id));
      this.focusIdx = i;
      this.onSelect?.(this.selectedItems);
    } else {
      this.select([this.items[i].id]);
    }
    this.ensureVisible(i);
    this.invalidate();
    return true;
  }
  onText(s: string) {
    // type-ahead find
    const now = performance.now();
    this.typeBuf = now - this.typeTime > 900 ? s : this.typeBuf + s;
    this.typeTime = now;
    const q = this.typeBuf.toLowerCase();
    const it = this.items.find((x) => x.cells[0].toLowerCase().startsWith(q));
    if (it) this.select([it.id]);
  }

  // ---------------------------------------------------------------- paint
  paint(g: Gfx) {
    const { w, h } = this;
    const focused = this.hasFocus || !!this.editor;
    g.fillRect(0, 0, w - 10, h, TH.field);
    g.rect(0, 0, w - 9, h, TH.border);
    if (this.mode === 'list') this.paintList(g, focused);
    else this.paintIcons(g, focused);
    if (!this.items.length && this.emptyText) {
      const tw = SANS.measure(this.emptyText);
      SANS.draw(g, Math.floor((w - 10 - tw) / 2), Math.floor(h / 2) - 4, this.emptyText, TH.textDim);
    }
    this.paintChildren(g);
  }

  private paintList(g: Gfx, focused: boolean) {
    const ws = this.colWidths();
    const { w, h } = this;
    // header
    g.fillRect(1, 1, w - 11, HEAD_H - 1, C.TAN);
    g.hline(1, w - 11, HEAD_H - 1, TH.border);
    let x = 1;
    ws.forEach((cw, c) => {
      const col = this.columns[c];
      const title = SANS.fit(col.title, cw - 10);
      const tw = SANS.measure(title, { bold: true });
      const tx = col.align === 'right' ? x + cw - tw - 6 : x + 4;
      SANS.draw(g, tx, 2, title, C.PLUM_DARK, { bold: true });
      if (this.sortable && c === this.sortCol) {
        const ax = col.align === 'right' ? tx - 7 : tx + tw + 3;
        for (let k = 0; k < 3; k++) {
          if (this.sortDir > 0) g.hline(ax + k, ax + 4 - k, 5 + k, C.GREY);
          else g.hline(ax + k, ax + 4 - k, 7 - k, C.GREY);
        }
      }
      if (c < ws.length - 1) g.vline(x + cw - 1, 2, HEAD_H - 3, C.GREY);
      x += cw;
    });
    g.push(1, HEAD_H, w - 11, h - HEAD_H - 1);
    const first = Math.floor(this.scroll / ROW_H);
    for (let i = first; i < this.items.length; i++) {
      const y = i * ROW_H - this.scroll;
      if (y > h) break;
      const it = this.items[i];
      const sel = this.selected.has(it.id);
      if (sel) g.fillRect(0, y, w - 11, ROW_H, focused ? TH.sel : TH.selDim);
      if (i === this.focusIdx && focused && !sel) g.dashedRect(0, y, w - 11, ROW_H, C.GREY, -1, 0, 1);
      let cx = 0;
      ws.forEach((cw, c) => {
        const col = this.columns[c];
        let tx = cx + 4;
        if (c === 0 && it.icon) {
          const ic = icon(it.icon, 16);
          g.blit(ic, cx + 2, y, TRANSPARENT);
          tx = cx + 21;
        }
        const avail = cw - (tx - cx) - 4;
        const txt = SANS.fit(it.cells[c] ?? '', avail);
        const tw = SANS.measure(txt);
        if (col.align === 'right') tx = cx + cw - tw - 6;
        SANS.draw(g, tx, y + 4, txt, it.dim ? TH.textDim : TH.text);
        cx += cw;
      });
    }
    g.pop();
  }

  private paintIcons(g: Gfx, focused: boolean) {
    const { w, h } = this;
    g.push(1, 1, w - 11, h - 2);
    for (let i = 0; i < this.items.length; i++) {
      const r = this.itemRect(i);
      if (r.y > h || r.y + r.h < 0) continue;
      const it = this.items[i];
      const sel = this.selected.has(it.id);
      const ic = icon(it.icon ?? 'file', 32);
      const ix = r.x + (CELL_W - 32) / 2 - 1, iy = r.y + 1;
      for (let j = 0; j < 32; j++) for (let k = 0; k < 32; k++) {
        const v = ic.px[j * 32 + k];
        if (v === TRANSPARENT) continue;
        g.pset(ix + k, iy + j, sel && (j + k) & 1 ? DARKER[v] : v);
      }
      const lines = wrapText(SANS, it.cells[0], CELL_W - 4).slice(0, 2);
      lines.forEach((l, k) => {
        const t = SANS.fit(l, CELL_W - 4);
        const tw = SANS.measure(t);
        const lx = r.x + Math.floor((CELL_W - tw) / 2) - 1, ly = iy + 33 + k * 10;
        if (sel) g.fillRect(lx - 2, ly - 1, tw + 3, 10, focused ? TH.sel : TH.selDim);
        SANS.draw(g, lx, ly, t, it.dim ? TH.textDim : TH.text);
      });
    }
    g.pop();
  }
}
