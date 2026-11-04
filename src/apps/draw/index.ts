import { registerApp } from '../registry';
import { Window } from '../../wm/window';
import { Widget, type WEvent } from '../../ui/widget';
import { Label } from '../../ui/widgets';
import type { MenuDef } from '../../ui/menu';
import { messageBox, prompt, alert } from '../../ui/dialog';
import { Gfx, Surface } from '../../core/gfx';
import { C } from '../../core/palette';
import { icon, T as TRANSPARENT } from '../../core/icons';
import { extname } from '../../fs/vfs';
import { pickFiles, downloadBlob } from '../../fs/importexport';
import { encodePic, decodePic, isPic, encodePng, decodeImage } from '../../fs/pic';
import { DocController } from '../doccontroller';
import { DrawCanvas, PATTERN_LIST, type DrawState, type Tool } from './canvas';
import { softRect } from '../../ui/theme';
import { invalidate, os } from '../../os';

const TOOLS: [Tool, string, string][] = [
  ['select', 't-select', 'Select (S)'], ['picker', 't-picker', 'Color picker (I)'],
  ['pencil', 't-pencil', 'Pencil (P)'], ['brush', 't-brush', 'Brush (B)'],
  ['spray', 't-spray', 'Spray can (A)'], ['fill', 't-fill', 'Paint bucket (F)'],
  ['line', 't-line', 'Line (L)'], ['eraser', 't-eraser', 'Eraser (E)'],
  ['rect', 't-rect', 'Rectangle (R)'], ['rect-fill', 't-rect-fill', 'Filled rectangle'],
  ['ellipse', 't-ellipse', 'Ellipse (O)'], ['ellipse-fill', 't-ellipse-fill', 'Filled ellipse'],
  ['text', 't-text', 'Text (T)'], ['zoom', 't-zoom', 'Zoom (Z)'],
];
const KEYS: Record<string, Tool> = { s: 'select', i: 'picker', p: 'pencil', b: 'brush', a: 'spray', f: 'fill', l: 'line', e: 'eraser', r: 'rect', o: 'ellipse', t: 'text', z: 'zoom' };

/** Tool buttons in two columns, plus brush sizes. */
class Toolbox extends Widget {
  st: DrawState;
  onTool: ((t: Tool) => void) | null = null;
  constructor(st: DrawState) { super(); this.st = st; }
  onPointerDown(e: WEvent) {
    const col = Math.floor((e.lx - 2) / 20), row = Math.floor((e.ly - 2) / 20);
    const i = row * 2 + col;
    if (col >= 0 && col < 2 && i >= 0 && i < TOOLS.length) { this.onTool?.(TOOLS[i][0]); return true; }
    const sy = 2 + Math.ceil(TOOLS.length / 2) * 20 + 4;
    if (e.ly >= sy && e.ly < sy + 3 * 12) { this.st.size = Math.floor((e.ly - sy) / 12) + 1; invalidate(); }
    return true;
  }
  paint(g: Gfx) {
    g.fillRect(0, 0, this.w, this.h, C.TAN);
    TOOLS.forEach(([t, ic], i) => {
      const x = 2 + (i % 2) * 20, y = 2 + Math.floor(i / 2) * 20;
      const sel = this.st.tool === t;
      g.fillRect(x + 1, y + 1, 17, 17, sel ? C.ORANGE : C.CREAM);
      softRect(g, x, y, 19, 19, sel ? C.INK : C.GREY);
      g.blit(icon(ic), x + 2, y + 2, TRANSPARENT);
    });
    const sy = 2 + Math.ceil(TOOLS.length / 2) * 20 + 4;
    for (let s = 1; s <= 3; s++) {
      const y = sy + (s - 1) * 12;
      const sel = this.st.size === s;
      g.fillRect(2, y, 38, 11, sel ? C.ORANGE : C.CREAM);
      softRect(g, 2, y, 39, 11, sel ? C.INK : C.GREY);
      const d = [1, 3, 5][s - 1];
      g.fillRect(21 - Math.floor(d / 2), y + 5 - Math.floor(d / 2), d, d, C.INK);
    }
  }
}

/** 16 color swatches, the fg/bg indicator and the pattern row. */
class PaletteBar extends Widget {
  st: DrawState;
  onChange: (() => void) | null = null;
  constructor(st: DrawState) { super(); this.st = st; }
  private swW() { return Math.max(8, Math.min(14, Math.floor((this.w - 40 - 6) / 16))); }
  onPointerDown(e: WEvent) {
    const sw = this.swW();
    const x = e.lx - 34;
    if (x >= 0 && x < sw * 16 && e.ly < 11) {
      const c = Math.floor(x / sw);
      if (e.button === 2) this.st.bg = c; else this.st.fg = c;
    } else if (e.ly >= 12 && x >= 0) {
      const p = Math.floor(x / 14);
      if (p >= 0 && p < PATTERN_LIST.length) this.st.pattern = p;
    } else if (e.lx < 30) {
      [this.st.fg, this.st.bg] = [this.st.bg, this.st.fg]; // click the indicator to swap
    }
    this.onChange?.();
    invalidate();
    return true;
  }
  paint(g: Gfx) {
    g.fillRect(0, 0, this.w, this.h, C.TAN);
    g.hline(0, this.w - 1, 0, C.GREY);
    // fg/bg indicator
    g.fillRect(12, 9, 16, 12, this.st.bg);
    g.rect(12, 9, 16, 12, C.INK);
    g.fillRect(4, 3, 16, 12, this.st.fg);
    g.rect(4, 3, 16, 12, C.INK);
    const sw = this.swW();
    for (let c = 0; c < 16; c++) {
      const x = 34 + c * sw;
      g.fillRect(x, 2, sw - 1, 9, c);
      g.rect(x, 2, sw - 1, 9, c === this.st.fg ? C.CREAM : C.INK);
      if (c === this.st.fg) g.rect(x + 1, 3, sw - 3, 7, C.INK);
      if (c === this.st.bg) g.fillRect(x + sw - 4, 8, 2, 2, c === 9 ? C.INK : C.CREAM);
    }
    PATTERN_LIST.forEach((p, i) => {
      const x = 34 + i * 14;
      if (x + 13 > this.w) return;
      g.fillPattern(x + 1, 14, 11, 8, p, this.st.fg, this.st.bg);
      g.rect(x, 13, 13, 10, i === this.st.pattern ? C.CRIMSON : C.INK);
      if (i === this.st.pattern) g.rect(x - 1, 12, 15, 12, C.CRIMSON);
    });
  }
}

class DrawWindow {
  win: Window;
  canvas: DrawCanvas;
  doc: DocController;
  st: DrawState = { tool: 'pencil', fg: C.INK, bg: C.CREAM, pattern: 0, size: 2 };
  private status: Label;
  private tools: Toolbox;
  private pal: PaletteBar;

  constructor(path?: string) {
    this.win = new Window({ title: 'Draw', icon: 'draw', app: 'draw', w: 420, h: 280, minW: 240, minH: 180, fit: { w: 0.75, h: 0.86, maxW: 760, maxH: 560 } });
    const b = this.win.body;
    this.canvas = b.add(new DrawCanvas(new Surface(320, 200, C.CREAM), this.st));
    this.tools = b.add(new Toolbox(this.st));
    this.pal = b.add(new PaletteBar(this.st));
    this.status = b.add(new Label('', { color: C.GREY, align: 'right' }));
    b.layoutFn = (p) => {
      this.tools.setBounds(0, 0, 44, p.h - 26);
      this.canvas.setBounds(44, 0, p.w - 44, p.h - 26);
      this.pal.setBounds(0, p.h - 26, p.w, 26);
      this.status.setBounds(p.w - 70, p.h - 12, 66, 10);
    };
    this.tools.onTool = (t) => this.setTool(t);
    this.pal.onChange = () => invalidate();
    this.canvas.onPick = (c, bg) => { if (bg) this.st.bg = c; else this.st.fg = c; invalidate(); };
    this.canvas.onStatus = (s) => this.status.setText(s);
    this.doc = new DocController({
      win: this.win, appName: 'Draw', exts: ['PIC', 'PNG', 'JPG', 'JPEG', 'GIF', 'BMP', 'WEBP'], saveExts: ['PIC', 'PNG'],
      defaultExt: 'PIC', typeLabel: 'Pictures (.PIC, .PNG)', defaultDir: '/Pictures', untitled: 'Untitled',
      serialize: async (p) => {
        this.canvas.commitAll();
        return extname(p) === 'PNG' ? encodePng(this.canvas.img) : encodePic(this.canvas.img);
      },
      deserialize: () => { /* handled in loadPath (async decode) */ },
      isDirty: () => this.canvas.modified,
      markClean: () => { this.canvas.modified = false; },
    });
    // images need async decoding, so override load
    this.doc.load = (p: string) => this.loadPath(p);
    this.canvas.onChange = () => this.doc.updateTitle();
    this.win.menus = this.menus();
    this.win.onKey = (e) => {
      if (!e.ctrl && !e.alt && os.wm.active?.focused === this.canvas && KEYS[e.key.toLowerCase()] && !this.canvas.hasSelection) {
        // single-letter tool shortcuts (not while typing text)
        if (this.st.tool !== 'text') { this.setTool(KEYS[e.key.toLowerCase()]); return true; }
      }
      if (e.key === '+' || e.key === '=') { this.canvas.zoomIn(); return true; }
      if (e.key === '-') { this.canvas.zoomOut(); return true; }
      return false;
    };
    this.win.onDropFiles = async (files) => {
      const f = files.find((x) => x.type.startsWith('image/'));
      if (f) await this.importFile(f);
    };
    os.wm.open(this.win);
    this.win.focusWidget(this.canvas);
    if (path) this.loadPath(path);
  }

  setTool(t: Tool) {
    if (t !== this.st.tool) this.canvas.commitAll();
    this.st.tool = t;
    invalidate();
  }

  async loadPath(p: string): Promise<boolean> {
    try {
      const bytes = await os.fs.readBinary(p);
      const img = isPic(bytes) ? decodePic(bytes) : await decodeImage(bytes, false);
      this.canvas.setImage(img);
      this.doc.path = extname(p) === 'PIC' || extname(p) === 'PNG' ? p : null;
      this.canvas.modified = !this.doc.path;
      this.doc.updateTitle();
      return true;
    } catch (e) {
      await alert(`Could not open the picture:\n${(e as Error).message}`, { icon: 'error', parent: this.win });
      return false;
    }
  }

  async importFile(f: File) {
    const r = await messageBox(`Import "${f.name}"? It will be reduced to Orbit's 16 colors.`, {
      title: 'Import Image', icon: 'question', buttons: ['Dithered', 'Flat', 'Cancel'], defaultButton: 0, cancelButton: 2, parent: this.win,
    });
    if (r.button === 2) return;
    if (!(await this.doc.confirmDiscard())) return;
    try {
      const img = await decodeImage(new Uint8Array(await f.arrayBuffer()), r.button === 0);
      this.canvas.setImage(img);
      this.doc.path = null;
      this.canvas.modified = true;
      this.doc.updateTitle();
    } catch {
      await alert('That file could not be read as an image.', { icon: 'error', parent: this.win });
    }
  }

  async newImage() {
    if (!(await this.doc.confirmDiscard())) return;
    const s = await prompt('Picture size (width x height):', `${this.canvas.img.w}x${this.canvas.img.h}`, { title: 'New Picture', parent: this.win });
    if (!s) return;
    const m = /^\s*(\d+)\s*[x×, ]\s*(\d+)\s*$/i.exec(s);
    if (!m) { await alert('Please type a size like 320x200.', { icon: 'warning', parent: this.win }); return; }
    const w = Math.max(8, Math.min(1024, +m[1])), h = Math.max(8, Math.min(768, +m[2]));
    this.canvas.setImage(new Surface(w, h, this.st.bg));
    this.doc.path = null;
    this.canvas.modified = false;
    this.doc.updateTitle();
  }

  async resize() {
    const s = await prompt('Canvas size (width x height):', `${this.canvas.img.w}x${this.canvas.img.h}`, { title: 'Canvas Size', parent: this.win });
    const m = s && /^\s*(\d+)\s*[x×, ]\s*(\d+)\s*$/i.exec(s);
    if (!m) return;
    const w = Math.max(8, Math.min(1024, +m[1])), h = Math.max(8, Math.min(768, +m[2]));
    const bg = this.st.bg;
    this.canvas.transform((img) => {
      const out = new Surface(w, h, bg);
      new Gfx(out).blit(img, 0, 0);
      return out;
    });
  }

  private flip(horizontal: boolean) {
    this.canvas.transform((img) => {
      const out = new Surface(img.w, img.h);
      for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
        const sx = horizontal ? img.w - 1 - x : x, sy = horizontal ? y : img.h - 1 - y;
        out.px[y * img.w + x] = img.px[sy * img.w + sx];
      }
      return out;
    });
  }

  private async exportPng() {
    this.canvas.commitAll();
    const r = await messageBox('Export size:', { title: 'Export PNG', icon: 'file-pic', buttons: ['1×', '2×', '4×', 'Cancel'], defaultButton: 1, cancelButton: 3, parent: this.win });
    if (r.button === 3) return;
    const bytes = await encodePng(this.canvas.img, [1, 2, 4][r.button]);
    downloadBlob(`${this.doc.name.replace(/\.[^.]+$/, '')}.png`, new Blob([bytes as BlobPart], { type: 'image/png' }));
  }

  private menus(): MenuDef[] {
    const c = this.canvas;
    return [
      {
        label: 'File',
        items: () => [
          { label: 'New…', action: () => this.newImage() },
          { label: 'New Window', action: () => new DrawWindow() },
          { label: 'Open…', shortcut: 'Ctrl+O', action: () => this.doc.open() },
          { separator: true },
          { label: 'Save', shortcut: 'Ctrl+S', action: () => this.doc.save() },
          { label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: () => this.doc.saveAs() },
          { separator: true },
          { label: 'Import Image…', action: async () => { const [f] = await pickFiles('image/*', false); if (f) this.importFile(f); } },
          { label: 'Export PNG…', action: () => this.exportPng() },
          { separator: true },
          { label: 'Close', shortcut: 'Ctrl+F4', action: () => this.win.close() },
        ],
      },
      {
        label: 'Edit',
        items: () => [
          { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !c.canUndo, action: () => c.undo() },
          { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !c.canRedo, action: () => c.redo() },
          { separator: true },
          { label: 'Cut', shortcut: 'Ctrl+X', disabled: !c.hasSelection, action: () => c.copySelection(true) },
          { label: 'Copy', shortcut: 'Ctrl+C', disabled: !c.hasSelection, action: () => c.copySelection(false) },
          { label: 'Paste', shortcut: 'Ctrl+V', disabled: !DrawCanvas.hasClip, action: () => { if (c.paste()) this.setTool('select'); } },
          { label: 'Delete', shortcut: 'Del', disabled: !c.hasSelection, action: () => c.deleteSelection() },
          { label: 'Select All', shortcut: 'Ctrl+A', action: () => { this.setTool('select'); c.selectAll(); } },
        ],
      },
      {
        label: 'Image',
        items: () => [
          { label: 'Canvas Size…', action: () => this.resize() },
          { label: 'Flip Horizontal', action: () => this.flip(true) },
          { label: 'Flip Vertical', action: () => this.flip(false) },
          { separator: true },
          { label: 'Clear', action: () => { const bg = this.st.bg; c.transform((img) => new Surface(img.w, img.h, bg)); } },
        ],
      },
      {
        label: 'View',
        items: () => [
          { label: 'Zoom In', shortcut: '+', disabled: c.zoom >= 8, action: () => c.zoomIn() },
          { label: 'Zoom Out', shortcut: '-', disabled: c.zoom <= 1, action: () => c.zoomOut() },
          { label: 'Actual Size', checked: c.zoom === 1, action: () => c.setZoom(1) },
          { separator: true },
          { label: 'Pixel Grid', checked: c.grid, action: () => { c.grid = !c.grid; invalidate(); } },
        ],
      },
    ];
  }
}

registerApp({
  id: 'draw',
  name: 'Draw',
  icon: 'draw',
  exts: ['PIC', 'PNG', 'JPG', 'JPEG', 'GIF', 'BMP', 'WEBP'],
  description: 'Paint pictures with 16 colors, patterns and FatBits zoom.',
  launch: ({ path }) => { new DrawWindow(path); },
});
