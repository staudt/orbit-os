import type { Gfx } from '../core/gfx';
import { C } from '../core/palette';
import { SANS } from '../core/fonts';
import type { KeyEv } from '../core/input';
import { Panel, Widget, type WEvent } from './widget';
import { TH } from './theme';
import { os } from '../os';

const TAB_H = 14;

/** Folder-style tabs; each tab owns a Panel page. */
export class Tabs extends Widget {
  pages: { title: string; page: Panel }[] = [];
  index = 0;
  onChange: ((i: number) => void) | null = null;

  constructor() {
    super();
    this.focusable = true;
  }

  addPage(title: string, layout?: (p: Panel) => void): Panel {
    const page = new Panel(TH.winBg);
    page.layoutFn = layout ?? null;
    page.visible = this.pages.length === this.index;
    this.add(page);
    this.pages.push({ title, page });
    this.layout();
    return page;
  }

  select(i: number) {
    if (i < 0 || i >= this.pages.length || i === this.index) return;
    this.index = i;
    this.pages.forEach((p, k) => { p.page.visible = k === i; });
    os.sound?.sfx('click');
    this.onChange?.(i);
    this.invalidate();
  }

  layout() {
    for (const p of this.pages) p.page.setBounds(1, TAB_H + 1, this.w - 2, this.h - TAB_H - 2);
  }

  private tabRects() {
    let x = 4;
    return this.pages.map((p) => {
      const w = SANS.measure(p.title) + 12;
      const r = { x, w };
      x += w - 1;
      return r;
    });
  }

  onPointerDown(e: WEvent) {
    if (e.ly >= TAB_H) return false;
    const i = this.tabRects().findIndex((r) => e.lx >= r.x && e.lx < r.x + r.w);
    if (i >= 0) this.select(i);
    return true;
  }

  onKey(e: KeyEv) {
    if (e.key === 'ArrowRight') { this.select((this.index + 1) % this.pages.length); return true; }
    if (e.key === 'ArrowLeft') { this.select((this.index - 1 + this.pages.length) % this.pages.length); return true; }
    return false;
  }

  paint(g: Gfx) {
    const rs = this.tabRects();
    g.rect(0, TAB_H, this.w, this.h - TAB_H, TH.border);
    rs.forEach((r, i) => {
      if (i === this.index) return;
      g.fillRect(r.x + 1, 3, r.w - 2, TAB_H - 3, C.TAN);
      g.hline(r.x + 1, r.x + r.w - 2, 2, TH.border);
      g.vline(r.x, 3, TAB_H - 1, TH.border);
      g.vline(r.x + r.w - 1, 3, TAB_H - 1, TH.border);
      SANS.draw(g, r.x + 6, 4, this.pages[i].title, TH.text);
    });
    const r = rs[this.index];
    if (r) {
      g.fillRect(r.x + 1, 1, r.w - 2, TAB_H, TH.winBg);
      g.hline(r.x + 1, r.x + r.w - 2, 0, TH.border);
      g.vline(r.x, 1, TAB_H, TH.border);
      g.vline(r.x + r.w - 1, 1, TAB_H, TH.border);
      SANS.draw(g, r.x + 6, 3, this.pages[this.index].title, this.hasFocus ? C.PLUM : TH.text);
    }
    this.paintChildren(g);
  }
}
