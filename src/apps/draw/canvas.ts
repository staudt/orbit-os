import { Gfx, Surface, PATTERNS, patBit, type Pattern } from '../../core/gfx';
import { C } from '../../core/palette';
import { SANS } from '../../core/fonts';
import type { KeyEv } from '../../core/input';
import { Widget, type WEvent } from '../../ui/widget';
import { ScrollBar } from '../../ui/widgets';
import { caret } from '../../ui/theme';
import { invalidate, os } from '../../os';

export type Tool =
  | 'pencil' | 'brush' | 'line' | 'rect' | 'rect-fill' | 'ellipse' | 'ellipse-fill'
  | 'fill' | 'spray' | 'eraser' | 'text' | 'select' | 'picker' | 'zoom';

export const PATTERN_LIST: Pattern[] = [
  PATTERNS.solid, PATTERNS.d75, PATTERNS.d50, PATTERNS.d25, PATTERNS.d12, PATTERNS.hlines, PATTERNS.vlines,
  PATTERNS.diag, PATTERNS.diag2, PATTERNS.grid, PATTERNS.checker, PATTERNS.bricks, PATTERNS.weave, PATTERNS.scales, PATTERNS.zigzag,
];

export interface DrawState {
  tool: Tool;
  fg: number;
  bg: number;
  pattern: number;
  size: number; // 1..3
}

const ZOOMS = [1, 2, 4, 8];
let clip: Surface | null = null;

interface Sel { x: number; y: number; w: number; h: number; float: Surface | null; fx: number; fy: number }

/** The painting surface: tools, selection, zoom (FatBits), undo. */
export class DrawCanvas extends Widget {
  img: Surface;
  st: DrawState;
  zoom = 1;
  scrollX = 0;
  scrollY = 0;
  grid = true;
  modified = false;
  onChange: (() => void) | null = null;
  onPick: ((color: number, bg: boolean) => void) | null = null;
  onStatus: ((s: string) => void) | null = null;
  private hbar: ScrollBar;
  private vbar: ScrollBar;
  private undoStack: Surface[] = [];
  private redoStack: Surface[] = [];
  private base: Surface | null = null;
  private start: [number, number] | null = null;
  private last: [number, number] | null = null;
  private button = 0;
  private sprayTimer = 0;
  sel: Sel | null = null;
  private moving: { dx: number; dy: number } | null = null;
  private text: { x: number; y: number; s: string } | null = null;

  constructor(img: Surface, st: DrawState) {
    super();
    this.img = img;
    this.st = st;
    this.focusable = true;
    this.acceptsText = true;
    this.cursor = 'crosshair';
    this.hbar = this.add(new ScrollBar(false, (v) => { this.scrollX = v; invalidate(); }));
    this.vbar = this.add(new ScrollBar(true, (v) => { this.scrollY = v; invalidate(); }));
    // marching ants & caret blink
    setInterval(() => { if ((this.sel || this.text) && this.root().host && os.wm.windows.some((w) => w.body === this.root())) invalidate(); }, 140);
  }

  // ---------------------------------------------------------------- view geometry
  private get viewW() { return this.w - 10; }
  private get viewH() { return this.h - 10; }
  layout() {
    this.hbar.setBounds(0, this.h - 10, this.w - 9, 10);
    this.vbar.setBounds(this.w - 10, 0, 10, this.h - 9);
    this.updateBars();
  }
  updateBars() {
    this.hbar.step = this.vbar.step = 8 * this.zoom;
    this.hbar.set(this.img.w * this.zoom, this.viewW, this.scrollX);
    this.vbar.set(this.img.h * this.zoom, this.viewH, this.scrollY);
    this.scrollX = this.hbar.value;
    this.scrollY = this.vbar.value;
  }
  private origin(): [number, number] {
    const cw = this.img.w * this.zoom, ch = this.img.h * this.zoom;
    const ox = cw < this.viewW ? Math.floor((this.viewW - cw) / 2) : -this.scrollX;
    const oy = ch < this.viewH ? Math.floor((this.viewH - ch) / 2) : -this.scrollY;
    return [ox, oy];
  }
  private toImg(lx: number, ly: number): [number, number] {
    const [ox, oy] = this.origin();
    return [Math.floor((lx - ox) / this.zoom), Math.floor((ly - oy) / this.zoom)];
  }

  setZoom(z: number, cx?: number, cy?: number) {
    z = Math.max(1, Math.min(8, z));
    if (z === this.zoom) return;
    const px = cx ?? Math.floor(this.img.w / 2), py = cy ?? Math.floor(this.img.h / 2);
    this.zoom = z;
    this.scrollX = px * z - Math.floor(this.viewW / 2);
    this.scrollY = py * z - Math.floor(this.viewH / 2);
    this.updateBars();
    this.onStatus?.(`Zoom ${z}×`);
    invalidate();
  }
  zoomIn(cx?: number, cy?: number) { this.setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(this.zoom) + 1)], cx, cy); }
  zoomOut(cx?: number, cy?: number) { this.setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(this.zoom) - 1)], cx, cy); }

  // ---------------------------------------------------------------- document
  setImage(s: Surface) {
    this.commitAll();
    this.img = s;
    this.undoStack = [];
    this.redoStack = [];
    this.sel = null;
    this.scrollX = this.scrollY = 0;
    this.modified = false;
    this.updateBars();
    invalidate();
  }
  pushUndo() {
    this.undoStack.push(this.img.clone());
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = [];
  }
  private changed() {
    this.modified = true;
    this.onChange?.();
    invalidate();
  }
  undo() {
    this.commitAll();
    const s = this.undoStack.pop();
    if (!s) { os.sound.sfx('beep'); return; }
    this.redoStack.push(this.img);
    this.img = s;
    this.updateBars();
    this.changed();
  }
  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.img);
    this.img = s;
    this.updateBars();
    this.changed();
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /** Replace the image (resize/flip) as one undoable step. */
  transform(fn: (s: Surface) => Surface) {
    this.commitAll();
    this.pushUndo();
    this.img = fn(this.img);
    this.updateBars();
    this.changed();
  }

  // ---------------------------------------------------------------- drawing helpers
  private get g() { return new Gfx(this.img); }
  private patColor(x: number, y: number, fg: number, bg: number) {
    return patBit(PATTERN_LIST[this.st.pattern] ?? PATTERNS.solid, x, y) ? fg : bg;
  }
  private colors(): [number, number] {
    return this.button === 2 ? [this.st.bg, this.st.fg] : [this.st.fg, this.st.bg];
  }
  private dab(x: number, y: number) {
    const [fg, bg] = this.colors();
    const r = [0, 1, 2][this.st.size - 1] ?? 0;
    const g = this.g;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + r) continue;
      g.pset(x + dx, y + dy, this.patColor(x + dx, y + dy, fg, bg));
    }
  }
  private erase(x: number, y: number) {
    const s = 4 + this.st.size * 2;
    this.g.fillRect(x - (s >> 1), y - (s >> 1), s, s, this.st.bg);
  }
  private spray(x: number, y: number) {
    const [fg, bg] = this.colors();
    const r = 4 + this.st.size * 3;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r;
      const px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d);
      this.g.pset(px, py, this.patColor(px, py, fg, bg));
    }
  }
  private shapeEnd(x: number, y: number, shift: boolean): [number, number] {
    if (!shift || !this.start) return [x, y];
    const [sx, sy] = this.start;
    const dx = x - sx, dy = y - sy;
    if (this.st.tool === 'line') {
      // snap to 0/45/90 degrees
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.max(Math.abs(dx), Math.abs(dy));
      return [sx + Math.round(Math.cos(ang) * len * (Math.abs(Math.cos(ang)) > 0.5 && Math.abs(Math.sin(ang)) > 0.5 ? 1 : 1)), sy + Math.round(Math.sin(ang) * len)];
    }
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    return [sx + Math.sign(dx || 1) * m, sy + Math.sign(dy || 1) * m];
  }
  private drawShape(x: number, y: number) {
    if (!this.start || !this.base) return;
    this.img.px.set(this.base.px);
    const [sx, sy] = this.start;
    const [fg, bg] = this.colors();
    const g = this.g;
    const x0 = Math.min(sx, x), y0 = Math.min(sy, y), w = Math.abs(x - sx) + 1, h = Math.abs(y - sy) + 1;
    switch (this.st.tool) {
      case 'line':
        Gfx.linePoints(sx, sy, x, y, (px, py) => this.dab(px, py));
        break;
      case 'rect': g.rect(x0, y0, w, h, fg); break;
      case 'rect-fill':
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.pset(x0 + i, y0 + j, this.patColor(x0 + i, y0 + j, fg, bg));
        g.rect(x0, y0, w, h, fg);
        break;
      case 'ellipse': g.ellipse(x0, y0, w, h, fg); break;
      case 'ellipse-fill': {
        const tmp = new Surface(w, h, 255);
        new Gfx(tmp).ellipse(0, 0, w, h, 1, true);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (tmp.px[j * w + i] === 1) g.pset(x0 + i, y0 + j, this.patColor(x0 + i, y0 + j, fg, bg));
        g.ellipse(x0, y0, w, h, fg);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- selection & text
  /** Merge any floating selection / pending text into the image. */
  commitAll() {
    this.commitText();
    if (this.sel?.float) {
      const s = this.sel;
      new Gfx(this.img).blit(s.float!, s.fx, s.fy);
      this.changed();
    }
    this.sel = null;
    this.moving = null;
  }
  private commitText() {
    const t = this.text;
    this.text = null;
    if (!t || !t.s) return;
    this.pushUndo();
    const g = this.g;
    t.s.split('\n').forEach((line, i) => SANS.draw(g, t.x, t.y + i * 10, line, this.st.fg));
    this.changed();
  }
  get hasSelection() { return !!this.sel; }
  selectAll() {
    this.commitAll();
    this.sel = { x: 0, y: 0, w: this.img.w, h: this.img.h, float: null, fx: 0, fy: 0 };
    invalidate();
  }
  private liftSelection() {
    const s = this.sel!;
    if (s.float) return;
    this.pushUndo();
    s.float = this.img.crop(s.x, s.y, s.w, s.h);
    s.fx = s.x;
    s.fy = s.y;
    this.g.fillRect(s.x, s.y, s.w, s.h, this.st.bg);
  }
  copySelection(cut: boolean): boolean {
    const s = this.sel;
    if (!s) return false;
    clip = s.float ? s.float.clone() : this.img.crop(s.x, s.y, s.w, s.h);
    if (cut) this.deleteSelection();
    return true;
  }
  deleteSelection() {
    const s = this.sel;
    if (!s) return;
    if (!s.float) { this.pushUndo(); this.g.fillRect(s.x, s.y, s.w, s.h, this.st.bg); }
    this.sel = null;
    this.changed();
  }
  paste(): boolean {
    if (!clip) return false;
    this.commitAll();
    this.pushUndo();
    const [ox, oy] = this.origin();
    const x = Math.max(0, Math.floor(-ox / this.zoom)), y = Math.max(0, Math.floor(-oy / this.zoom));
    this.sel = { x, y, w: clip.w, h: clip.h, float: clip.clone(), fx: x, fy: y };
    this.changed();
    return true;
  }
  static get hasClip() { return !!clip; }

  // ---------------------------------------------------------------- input
  onPointerDown(e: WEvent) {
    if (e.lx >= this.w - 10 || e.ly >= this.h - 10) return false;
    this.focus();
    const [x, y] = this.toImg(e.lx, e.ly);
    this.button = e.button;
    const t = this.st.tool;
    if (t !== 'text') this.commitText();
    if (t !== 'select' && this.sel) this.commitAll();
    switch (t) {
      case 'zoom':
        if (e.button === 2 || e.alt || e.shift) this.zoomOut(x, y); else this.zoomIn(x, y);
        return true;
      case 'picker': {
        const c = this.img.get(x, y);
        if (c >= 0) this.onPick?.(c, e.button === 2);
        return true;
      }
      case 'fill':
        if (this.img.get(x, y) < 0) return true;
        this.pushUndo();
        {
          const [fg, bg] = this.colors();
          const pat = PATTERN_LIST[this.st.pattern] ?? PATTERNS.solid;
          this.g.floodFill(x, y, fg, pat, pat === PATTERNS.solid ? -1 : bg);
        }
        this.changed();
        return true;
      case 'text':
        this.commitText();
        this.text = { x, y: y - 4, s: '' };
        caret.reset();
        invalidate();
        return true;
      case 'select': {
        const s = this.sel;
        if (s && x >= (s.float ? s.fx : s.x) && y >= (s.float ? s.fy : s.y) && x < (s.float ? s.fx : s.x) + s.w && y < (s.float ? s.fy : s.y) + s.h) {
          this.liftSelection();
          if (e.ctrl && s.float) {
            // Ctrl-drag duplicates: stamp a copy where it is now
            new Gfx(this.img).blit(s.float, s.fx, s.fy);
          }
          this.moving = { dx: x - s.fx, dy: y - s.fy };
          return true;
        }
        this.commitAll();
        this.start = [x, y];
        this.sel = null;
        return true;
      }
    }
    this.pushUndo();
    this.start = [x, y];
    this.last = [x, y];
    this.base = this.img.clone();
    if (t === 'pencil') this.g.pset(x, y, this.colors()[0]);
    else if (t === 'brush') this.dab(x, y);
    else if (t === 'eraser') this.erase(x, y);
    else if (t === 'spray') {
      this.spray(x, y);
      clearInterval(this.sprayTimer);
      this.sprayTimer = window.setInterval(() => { if (this.last) { this.spray(this.last[0], this.last[1]); invalidate(); } }, 50);
    } else this.drawShape(x, y);
    this.changed();
    return true;
  }

  onPointerMove(e: WEvent) {
    const [x, y] = this.toImg(e.lx, e.ly);
    const t = this.st.tool;
    if (t === 'select') {
      if (this.moving && this.sel) {
        this.sel.fx = x - this.moving.dx;
        this.sel.fy = y - this.moving.dy;
        invalidate();
      } else if (this.start) {
        const [sx, sy] = this.start;
        const x0 = Math.max(0, Math.min(sx, x)), y0 = Math.max(0, Math.min(sy, y));
        const x1 = Math.min(this.img.w - 1, Math.max(sx, x)), y1 = Math.min(this.img.h - 1, Math.max(sy, y));
        this.sel = x1 >= x0 && y1 >= y0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, float: null, fx: x0, fy: y0 } : null;
        this.onStatus?.(this.sel ? `${this.sel.w} × ${this.sel.h}` : '');
        invalidate();
      }
      return;
    }
    if (!this.start || !this.last) return;
    const [lx, ly] = this.last;
    if (t === 'pencil') Gfx.linePoints(lx, ly, x, y, (px, py) => this.g.pset(px, py, this.colors()[0]));
    else if (t === 'brush') Gfx.linePoints(lx, ly, x, y, (px, py) => this.dab(px, py));
    else if (t === 'eraser') Gfx.linePoints(lx, ly, x, y, (px, py) => this.erase(px, py));
    else if (t === 'spray') this.spray(x, y);
    else {
      const [ex, ey] = this.shapeEnd(x, y, e.shift);
      this.drawShape(ex, ey);
      this.onStatus?.(`${Math.abs(ex - this.start[0]) + 1} × ${Math.abs(ey - this.start[1]) + 1}`);
    }
    this.last = [x, y];
    invalidate();
  }

  onHover(e: WEvent) {
    const [x, y] = this.toImg(e.lx, e.ly);
    if (x >= 0 && y >= 0 && x < this.img.w && y < this.img.h) this.onStatus?.(`${x}, ${y}`);
    const s = this.sel;
    const inSel = s && x >= (s.float ? s.fx : s.x) && y >= (s.float ? s.fy : s.y) && x < (s.float ? s.fx : s.x) + s.w && y < (s.float ? s.fy : s.y) + s.h;
    this.cursor = this.st.tool === 'text' ? 'ibeam' : this.st.tool === 'select' && inSel ? 'move' : this.st.tool === 'zoom' ? 'arrow' : 'crosshair';
  }

  onPointerUp() {
    clearInterval(this.sprayTimer);
    if (this.st.tool === 'select') {
      this.start = null;
      this.moving = null;
      return;
    }
    this.start = null;
    this.last = null;
    this.base = null;
  }

  onWheel(e: WEvent) {
    if (e.ctrl) {
      const [x, y] = this.toImg(e.lx, e.ly);
      if (e.wheel < 0) this.zoomIn(x, y); else this.zoomOut(x, y);
      return true;
    }
    if (e.shift) this.hbar.setValue(this.scrollX + e.wheel * 16 * this.zoom);
    else this.vbar.setValue(this.scrollY + e.wheel * 16 * this.zoom);
    return true;
  }

  onKey(e: KeyEv) {
    if (this.text) {
      if (e.key === 'Enter') { this.text.s += '\n'; invalidate(); return true; }
      if (e.key === 'Backspace') { this.text.s = this.text.s.slice(0, -1); invalidate(); return true; }
      if (e.key === 'Escape') { this.commitText(); return true; }
    }
    if (this.sel) {
      if (e.key === 'Escape') { this.commitAll(); return true; }
      if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelection(); return true; }
      const d = e.shift ? 8 : 1;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
      if (mv[e.key]) {
        this.liftSelection();
        this.sel.fx += mv[e.key][0];
        this.sel.fy += mv[e.key][1];
        this.changed();
        return true;
      }
    }
    return false;
  }
  onText(s: string) {
    if (!this.text) return;
    this.text.s += s;
    caret.reset();
    invalidate();
  }
  onCopy(cut: boolean) {
    if (this.copySelection(cut)) return '[picture]';
    return null;
  }
  onPaste() {
    this.paste();
  }

  // ---------------------------------------------------------------- paint
  paint(g: Gfx) {
    const vw = this.viewW, vh = this.viewH;
    g.fillPattern(0, 0, vw, vh, PATTERNS.d50, C.GREY, C.TAN);
    const [ox, oy] = this.origin();
    const z = this.zoom;
    g.push(0, 0, vw, vh);
    // visible image region only
    const ix0 = Math.max(0, Math.floor(-ox / z)), iy0 = Math.max(0, Math.floor(-oy / z));
    const ix1 = Math.min(this.img.w, Math.ceil((vw - ox) / z)), iy1 = Math.min(this.img.h, Math.ceil((vh - oy) / z));
    g.rect(ox - 1, oy - 1, this.img.w * z + 2, this.img.h * z + 2, C.INK);
    g.blit(this.img, ox + ix0 * z, oy + iy0 * z, -1, z, ix0, iy0, ix1 - ix0, iy1 - iy0);
    const s = this.sel;
    if (s?.float) g.blit(s.float, ox + s.fx * z, oy + s.fy * z, -1, z);
    if (this.grid && z >= 4) {
      for (let x = ix0; x <= ix1; x++) g.vline(ox + x * z, oy + iy0 * z, oy + iy1 * z - 1, C.TAN);
      for (let y = iy0; y <= iy1; y++) g.hline(ox + ix0 * z, ox + ix1 * z - 1, oy + y * z, C.TAN);
    }
    if (this.text) {
      const t = this.text;
      const lines = t.s.split('\n');
      const tg = new Surface(Math.max(4, ...lines.map((l) => SANS.measure(l) + 2)), lines.length * 10, 255);
      lines.forEach((l, i) => SANS.draw(new Gfx(tg), 0, i * 10, l, this.st.fg));
      g.blit(tg, ox + t.x * z, oy + t.y * z, 255, z);
      if (caret.on()) {
        const last = lines[lines.length - 1];
        const cx = ox + (t.x + SANS.measure(last)) * z, cy = oy + (t.y + (lines.length - 1) * 10) * z;
        g.fillRect(cx, cy, Math.max(1, z), 9 * z, C.PLUM);
      }
    }
    if (s) {
      const x = s.float ? s.fx : s.x, y = s.float ? s.fy : s.y;
      g.dashedRect(ox + x * z - 1, oy + y * z - 1, s.w * z + 2, s.h * z + 2, C.INK, C.CREAM, Math.floor(performance.now() / 120), 3);
    }
    g.pop();
    g.fillRect(this.w - 10, this.h - 10, 10, 10, C.TAN);
    this.paintChildren(g);
  }
}
