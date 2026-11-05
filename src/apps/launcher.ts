import { registerApp, launch, openPath, iconForPath, getApp } from './registry';
import { Window, BODY_X, BODY_Y, CHROME_W } from '../wm/window';
import { Widget, type WEvent } from '../ui/widget';
import { Label, ScrollBar, TextField } from '../ui/widgets';
import type { Gfx, Rect } from '../core/gfx';
import { C } from '../core/palette';
import { SANS, wrapText } from '../core/fonts';
import { icon, T as TRANSPARENT } from '../core/icons';
import type { KeyEv } from '../core/input';
import { TH, softRect } from '../ui/theme';
import { basename, extname, joinPath, TRASH } from '../fs/vfs';
import { GAME_FILES } from '../seed/games';
import { invalidate, os } from '../os';

interface Item {
  /** file behind the item, if any (used to avoid duplicates in search) */
  path?: string;
  label: string;
  icon: string;
  /** extra words to match in Quick Run */
  keys?: string;
  run: () => void;
}
interface Category { name: string; icon: string; items: () => Item[] }

const GAMES = GAME_FILES;

const app = (id: string, label?: string): Item | null => {
  const a = getApp(id);
  return a ? { label: label ?? a.name, icon: a.icon, keys: `${a.id} ${a.description ?? ''}`, run: () => launch(id) } : null;
};
const file = (path: string, label?: string): Item => ({
  label: label ?? prettyName(path),
  icon: iconForPath(path, os.fs.isDir(path)),
  keys: basename(path),
  path,
  run: () => openPath(path),
});
function prettyName(path: string) {
  const b = basename(path).replace(/\.(BAS|MUS|PIC|TXT|WRT|CSV|LNK)$/i, '');
  return b === b.toUpperCase() ? b.charAt(0) + b.slice(1).toLowerCase() : b;
}
const filesIn = (dir: string, filter: (name: string) => boolean = () => true): Item[] =>
  os.fs.isDir(dir) ? os.fs.list(dir).filter((n) => n.type === 'file' && filter(n.name)).map((n) => file(joinPath(dir, n.name))) : [];
const compact = (xs: (Item | null)[]) => xs.filter((x): x is Item => !!x);

const CATEGORIES: Category[] = [
  { name: 'Favorites', icon: 'bookmark', items: () => compact([app('write'), app('calc'), app('draw'), app('music'), app('browser', 'Navigator'), app('basic'), app('files'), app('console'), app('clock')]) },
  { name: 'Programs', icon: 'file-bas', items: () => filesIn('/Programs', (n) => extname(n) === 'BAS' && !GAMES.includes(n.toUpperCase())) },
  { name: 'Games', icon: 'file-app', items: () => filesIn('/Programs', (n) => GAMES.includes(n.toUpperCase())) },
  { name: 'Media', icon: 'music', items: () => compact([app('music'), app('draw'), ...filesIn('/Music', (n) => extname(n) === 'MUS'), ...filesIn('/Pictures')]) },
  { name: 'Tools', icon: 'config', items: () => compact([app('files'), app('calc'), app('clock'), app('console'), os.fs.exists('/Programs/CALC.BAS') ? file('/Programs/CALC.BAS', 'Calculator') : null]) },
  {
    name: 'Dev', icon: 'basic', items: () => compact([
      app('basic'), app('console'), app('write'),
      { label: 'BASIC Guide', icon: 'help', keys: 'reference language manual', run: () => launch('browser', { args: { url: 'orbit:help/basic' } }) },
      os.fs.isDir('/Screensavers') ? file('/Screensavers', 'Screensavers') : null,
    ]),
  },
  {
    name: 'System', icon: 'disk', items: () => compact([
      app('config'), { label: 'Orbit HD', icon: 'disk', keys: 'disk files root', run: () => launch('files', { path: '/' }) },
      { label: 'Trash', icon: os.fs.list(TRASH).length ? 'trash-full' : 'trash-empty', keys: 'bin deleted', run: () => launch('files', { path: TRASH }) },
      { label: 'Screensaver', icon: 'orbit', keys: 'screen saver', run: () => setTimeout(() => os.wm.screensaver.start(), 300) },
      { label: 'Help', icon: 'help', keys: 'manual', run: () => launch('browser', { args: { url: 'orbit:help' } }) },
      { label: 'Moony Tour', icon: 'moony', keys: 'moony moon tour welcome tutorial', run: () => os.wm.moony.startTour() },
      { label: "Moony's Tips", icon: 'moony', keys: 'moony moon tip tips hints', run: () => os.wm.moony.tipPlease() },
      app('about', 'About Orbit'),
    ]),
  },
];

const ROW_H = 18;

/** Category list on the left. */
class CategoryList extends Widget {
  index = 0;
  searching = false;
  onPick: ((i: number) => void) | null = null;
  onPointerDown(e: WEvent) {
    const i = Math.floor((e.ly - 4) / ROW_H);
    if (i >= 0 && i < CATEGORIES.length) this.onPick?.(i);
    return true;
  }
  paint(g: Gfx) {
    g.fillRect(0, 0, this.w, this.h, C.CREAM);
    softRect(g, 0, 0, this.w, this.h, TH.border);
    CATEGORIES.forEach((c, i) => {
      const y = 4 + i * ROW_H;
      const sel = i === this.index && !this.searching;
      if (sel) {
        g.fillRect(3, y, this.w - 6, ROW_H - 1, C.ORANGE);
        softRect(g, 3, y, this.w - 6, ROW_H - 1, C.INK);
      }
      // little expander triangle like the reference
      const tx = 7, ty = y + 5;
      for (let k = 0; k < 4; k++) g.vline(tx + k, ty + k, ty + 6 - k, sel ? C.INK : C.GREY);
      g.blit(icon(c.icon, 16), 14, y, TRANSPARENT);
      SANS.draw(g, 34, y + 4, c.name, TH.text, { bold: sel });
    });
  }
}

/** Big tiles for the selected category or search results. */
class TileGrid extends Widget {
  items: Item[] = [];
  selected = 0;
  hover = -1;
  scroll = 0;
  emptyText = '';
  onLaunch: ((it: Item, r: Rect) => void) | null = null;
  private vbar: ScrollBar;
  constructor() {
    super();
    this.vbar = this.add(new ScrollBar(true, (v) => { this.scroll = v; invalidate(); }));
  }
  get tw() { return Math.max(60, Math.min(92, Math.floor((this.w - 16) / Math.max(1, Math.floor((this.w - 16) / 66))))); }
  get th() { return 60; }
  get cols() { return Math.max(1, Math.floor((this.w - 16) / this.tw)); }
  layout() {
    this.vbar.setBounds(this.w - 10, 0, 10, this.h);
    this.update();
  }
  update() {
    this.vbar.step = this.th;
    this.vbar.set(Math.ceil(this.items.length / this.cols) * this.th + 8, this.h, this.scroll);
    this.scroll = this.vbar.value;
    this.vbar.visible = this.vbar.max > 0;
  }
  setItems(items: Item[]) {
    this.items = items;
    this.selected = 0;
    this.scroll = 0;
    this.update();
    invalidate();
  }
  tileRect(i: number): Rect {
    const x = 6 + (i % this.cols) * this.tw, y = 6 + Math.floor(i / this.cols) * this.th - this.scroll;
    return { x, y, w: this.tw - 4, h: this.th - 4 };
  }
  private indexAt(lx: number, ly: number) {
    for (let i = 0; i < this.items.length; i++) {
      const r = this.tileRect(i);
      if (lx >= r.x && ly >= r.y && lx < r.x + r.w && ly < r.y + r.h) return i;
    }
    return -1;
  }
  move(d: number) {
    if (!this.items.length) return;
    this.selected = Math.max(0, Math.min(this.items.length - 1, this.selected + d));
    const r = this.tileRect(this.selected);
    if (r.y < 0) this.vbar.setValue(this.scroll + r.y - 6);
    if (r.y + r.h > this.h) this.vbar.setValue(this.scroll + r.y + r.h - this.h + 6);
    invalidate();
  }
  launchSelected() {
    const it = this.items[this.selected];
    if (it) this.onLaunch?.(it, this.tileRect(this.selected));
  }
  onPointerDown(e: WEvent) {
    const i = this.indexAt(e.lx, e.ly);
    if (i >= 0) { this.selected = i; this.launchSelected(); }
    return true;
  }
  onHover(e: WEvent) {
    const i = this.indexAt(e.lx, e.ly);
    if (i !== this.hover) { this.hover = i; invalidate(); }
    this.cursor = i >= 0 ? 'hand' : 'arrow';
  }
  onLeave() { this.hover = -1; invalidate(); }
  onWheel(e: WEvent) { this.vbar.setValue(this.scroll + e.wheel * 24); return true; }
  paint(g: Gfx) {
    g.fillRect(0, 0, this.w, this.h, C.PALE);
    softRect(g, 0, 0, this.w, this.h, TH.border);
    g.clip(1, 1, this.w - 2, this.h - 2);
    this.items.forEach((it, i) => {
      const r = this.tileRect(i);
      if (r.y > this.h || r.y + r.h < 0) return;
      const sel = i === this.selected, hot = i === this.hover;
      g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, sel ? C.YELLOW : C.CREAM);
      softRect(g, r.x, r.y, r.w, r.h, sel ? C.ORANGE : hot ? C.PLUM : C.TAN);
      if (sel) softRect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, C.ORANGE);
      const ic = icon(it.icon, 32);
      const ix = r.x + Math.floor((r.w - 32) / 2), iy = r.y + 4;
      for (let j = 0; j < 32; j++) for (let k = 0; k < 32; k++) {
        const v = ic.px[j * 32 + k];
        if (v !== TRANSPARENT) g.pset(ix + k, iy + j, v);
      }
      const lines = wrapText(SANS, it.label, r.w - 4).slice(0, 2);
      lines.forEach((l, k) => {
        const t = SANS.fit(l, r.w - 4, { bold: sel });
        SANS.draw(g, r.x + Math.floor((r.w - SANS.measure(t, { bold: sel })) / 2), iy + 34 + k * 10, t, TH.text, { bold: sel });
      });
    });
    if (!this.items.length && this.emptyText) {
      const lines = wrapText(SANS, this.emptyText, this.w - 30);
      lines.forEach((l, k) => SANS.draw(g, 14, 14 + k * 11, l, C.GREY));
    }
    g.pop();
    this.paintChildren(g);
  }
}

let current: Window | null = null;

/** example.com, en.wikipedia.org/wiki/X, https://… */
export function looksLikeUrl(s: string): boolean {
  if (/^https?:\/\/\S+$/i.test(s)) return true;
  // NAME.BAS, NOTES.TXT etc. are Orbit files, not web sites
  if (!s.includes('/') && /\.(bas|txt|wrt|csv|pic|mus|lnk|png|jpe?g|gif|bmp|md|log|ini|json|zip)$/i.test(s)) return false;
  return /^(www\.)?[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s);
}

function score(it: Item, q: string): number {
  const name = it.label.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (q.length >= 3 && name.includes(q)) return 40;
  // other words (ids, descriptions) only count when a word starts with the query
  if (q.length >= 2 && (it.keys ?? '').toLowerCase().split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 20;
  return 0;
}

function openLauncher() {
  const tb = os.wm.taskbar.launchRect();
  // on screens narrower than the launcher (phones), it fills the desktop
  const narrow = os.wm.deskRect().w < 404 + CHROME_W + 8;
  const win = new Window({
    title: 'Orbit Launcher', icon: 'orbit', app: 'launcher', w: 404, h: 236, minW: 200, minH: 180,
    popup: true, titleHint: 'F9', center: !narrow, ...(narrow ? { fit: { w: 1, h: 1 } } : {}),
  });
  current = win;
  win.closeTarget = tb;
  const b = win.body;
  const cats = b.add(new CategoryList());
  const grid = b.add(new TileGrid());
  const qlabel = b.add(new Label('Quick Run:', { style: { bold: true } }));
  const field = b.add(new TextField('', { placeholder: 'type to search, or a command' }));
  const hint = b.add(new Label('↑↓ Move  Enter Launch', { color: C.GREY, align: 'right' }));
  b.bg = C.TAN;
  b.layoutFn = (p) => {
    const cw = Math.max(104, Math.min(150, Math.floor(p.w * 0.27)));
    cats.setBounds(6, 6, cw, p.h - 6 - 30);
    grid.setBounds(cw + 12, 6, p.w - cw - 18, p.h - 6 - 30);
    qlabel.setBounds(8, p.h - 20, 60, 14);
    const hw = p.w >= 380 ? Math.min(150, Math.floor(p.w * 0.36)) : 0;
    hint.visible = hw > 0;
    field.setBounds(70, p.h - 21, Math.max(80, p.w - 70 - hw - 14), 15);
    hint.setBounds(p.w - hw - 6, p.h - 20, hw, 14);
  };

  const showCategory = (i: number) => {
    cats.index = i;
    cats.searching = false;
    const items = CATEGORIES[i].items();
    grid.emptyText = 'Nothing here yet.';
    grid.setItems(items);
  };
  const search = (q: string) => {
    q = q.trim().toLowerCase();
    if (!q) { showCategory(cats.index); return; }
    cats.searching = true;
    const seen = new Set<string>();
    const all: Item[] = [];
    for (const c of CATEGORIES) for (const it of c.items()) {
      const k = it.path ?? it.label + it.icon;
      if (!seen.has(k)) { seen.add(k); all.push(it); }
    }
    // files anywhere on the disk
    const walk = (dir: string, depth: number) => {
      for (const n of os.fs.list(dir)) {
        const p = joinPath(dir, n.name);
        if (p.toLowerCase().startsWith('/trash')) continue;
        if (n.type === 'dir' && depth < 4) walk(p, depth + 1);
        // shortcuts duplicate their targets; skip them
        if (extname(n.name) === 'LNK' || seen.has(p)) continue;
        if (n.name.toLowerCase().includes(q)) { seen.add(p); all.push(file(p)); }
      }
    };
    walk('/', 0);
    const ranked = all.map((it) => ({ it, s: score(it, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.it).slice(0, 40);
    const raw = field.text.trim();
    if (looksLikeUrl(raw)) {
      ranked.unshift({ label: `Go to ${raw}`, icon: 'navigator', run: () => launch('browser', { args: { url: raw } }) });
    }
    grid.emptyText = `Press Enter to run "${raw}" in the Console.`;
    grid.setItems(ranked);
  };

  const close = () => { if (!win.closed) os.wm.close(win, true); };
  grid.onLaunch = (it, r) => {
    const [gx, gy] = grid.rootPos();
    const screen = { x: win.x + BODY_X + gx + r.x, y: win.y + BODY_Y + gy + r.y, w: r.w, h: r.h };
    win.closeTarget = null;
    close();
    os.wm.setOrigin(screen);
    os.sound.sfx('click');
    setTimeout(() => it.run(), 0);
  };
  cats.onPick = (i) => { field.setText(''); showCategory(i); win.focusWidget(field); };
  field.onChange = (t) => search(t);
  field.onSubmit = (t) => {
    if (grid.items.length) grid.launchSelected();
    else if (t.trim()) { close(); launch('console', { args: { cmd: t.trim() } }); }
  };
  field.onCancel = () => close();
  field.onKeyHook = (e: KeyEv) => {
    const cols = grid.cols;
    if (e.key === 'ArrowDown') { grid.move(cols); return true; }
    if (e.key === 'ArrowUp') { grid.move(-cols); return true; }
    if (!field.text && e.key === 'ArrowRight') { grid.move(1); return true; }
    if (!field.text && e.key === 'ArrowLeft') { grid.move(-1); return true; }
    if (e.key === 'PageDown' || (e.key === 'Tab' && !e.shift)) { field.setText(''); showCategory((cats.index + 1) % CATEGORIES.length); return true; }
    if (e.key === 'PageUp' || (e.key === 'Tab' && e.shift)) { field.setText(''); showCategory((cats.index - 1 + CATEGORIES.length) % CATEGORIES.length); return true; }
    return false;
  };
  win.onKey = (e) => {
    if (e.key === 'Escape') { close(); return true; }
    return false;
  };
  win.onClosed = () => { if (current === win) current = null; };
  showCategory(0);
  os.wm.setOrigin(tb);
  os.wm.open(win);
  win.focusWidget(field);
}

registerApp({
  id: 'launcher',
  name: 'Orbit Launcher',
  icon: 'orbit',
  hidden: true,
  launch: () => {
    if (current && !current.closed) { os.wm.close(current, true); return; }
    openLauncher();
  },
});
