import type { Gfx, Rect } from '../core/gfx';
import { C } from '../core/palette';
import { SANS } from '../core/fonts';
import { icon, T as TRANSPARENT } from '../core/icons';
import type { PointerEv } from '../core/input';
import { buttonFace, dropShadow, TH } from '../ui/theme';
import type { MenuItem } from '../ui/menu';
import type { Window } from './window';
import { drawPlanet } from './logo';
import { invalidate, os } from '../os';

export const TASKBAR_H = 20;
const LAUNCH_W = 58;
const FULL_MAX = 124;
const ICON_W = 24;

interface Slot { win: Window; r: Rect; iconOnly: boolean }

/** The bottom bar: a Launch button, then one button per open window. */
export class Taskbar {
  /** window ids in the order they were opened (stable button order) */
  order: number[] = [];
  private slots: Slot[] = [];
  private overflow: Window[] = [];
  private pressed: 'launch' | number | 'more' | null = null;
  launcherOpen = false;
  onLaunch: (() => void) | null = null;

  get y() { return os.display.layout.h - TASKBAR_H; }

  /** The bar spans ~50% of the screen width (at least 480px), centered; full width on narrow screens. */
  barRect(): Rect {
    const W = os.display.layout.w;
    const w = W >= 800 ? Math.max(480, Math.round(W * 0.5)) : W;
    return { x: Math.floor((W - w) / 2), y: this.y, w, h: TASKBAR_H };
  }
  contains(x: number, y: number): boolean {
    const r = this.barRect();
    return y >= r.y && x >= r.x && x < r.x + r.w;
  }

  /** Windows that get a button (not dialogs, not popups). */
  private tasks(): Window[] {
    const wins = os.wm.windows.filter((w) => !w.closed && !w.modalFor && !w.popup);
    for (const w of wins) if (!this.order.includes(w.id)) this.order.push(w.id);
    this.order = this.order.filter((id) => wins.some((w) => w.id === id));
    return this.order.map((id) => wins.find((w) => w.id === id)!);
  }

  launchRect(): Rect {
    return { x: this.barRect().x + 3, y: this.y + 2, w: LAUNCH_W, h: TASKBAR_H - 4 };
  }

  private layout() {
    const bar = this.barRect();
    const tasks = this.tasks();
    const x0 = bar.x + LAUNCH_W + 9, avail = bar.x + bar.w - x0 - 4;
    let bw = tasks.length ? Math.floor(avail / tasks.length) - 2 : FULL_MAX;
    bw = Math.min(FULL_MAX, bw);
    const iconOnly = bw < 58;
    if (iconOnly) bw = ICON_W;
    const fit = Math.max(1, Math.floor((avail + 2) / (bw + 2)));
    const shown = tasks.length > fit ? tasks.slice(0, fit - 1) : tasks;
    this.overflow = tasks.length > fit ? tasks.slice(fit - 1) : [];
    this.slots = shown.map((win, i) => ({ win, iconOnly, r: { x: x0 + i * (bw + 2), y: this.y + 2, w: bw, h: TASKBAR_H - 4 } }));
  }

  /** Where a window's button is (used by minimize/restore animations). */
  buttonRect(win: Window): Rect {
    this.layout();
    const s = this.slots.find((sl) => sl.win === win);
    if (s) return s.r;
    return this.moreRect() ?? this.launchRect();
  }
  private moreRect(): Rect | null {
    if (!this.overflow.length) return null;
    const last = this.slots[this.slots.length - 1];
    const x = last ? last.r.x + last.r.w + 2 : this.barRect().x + LAUNCH_W + 9;
    return { x, y: this.y + 2, w: ICON_W, h: TASKBAR_H - 4 };
  }

  paint(g: Gfx) {
    this.layout();
    const bar = this.barRect(), y = this.y;
    const full = bar.w === os.display.layout.w;
    // a tray with cut top corners; the wallpaper shows on both sides
    if (full) {
      g.fillRect(0, y + 1, bar.w, TASKBAR_H - 1, TH.menuBg);
      g.hline(0, bar.w - 1, y, TH.border);
    } else {
      dropShadow(g, bar.x, y, bar.w, TASKBAR_H + 2, 2);
      g.fillRect(bar.x + 1, y + 2, bar.w - 2, TASKBAR_H - 2, TH.menuBg);
      g.hline(bar.x + 2, bar.x + bar.w - 3, y + 1, TH.menuBg);
      g.hline(bar.x + 2, bar.x + bar.w - 3, y, TH.border);
      g.pset(bar.x + 1, y + 1, TH.border);
      g.pset(bar.x + bar.w - 2, y + 1, TH.border);
      g.vline(bar.x, y + 2, y + TASKBAR_H - 1, TH.border);
      g.vline(bar.x + bar.w - 1, y + 2, y + TASKBAR_H - 1, TH.border);
    }
    // launch button: planet + label
    const lr = this.launchRect();
    const lp = this.pressed === 'launch' || this.launcherOpen;
    buttonFace(g, lr.x, lr.y, lr.w, lr.h, lp);
    if (lp) g.fillRect(lr.x + 2, lr.y + 2, lr.w - 4, lr.h - 4, C.ORANGE);
    const o = lp ? 1 : 0;
    drawPlanet(g, lr.x + 10 + o, lr.y + 8 + o, 4, { gaps: false, ringColor: C.PLUM });
    SANS.draw(g, lr.x + 19 + o, lr.y + 4 + o, 'Launch', TH.text, { bold: true });
    g.vline(lr.x + LAUNCH_W + 2, y + 4, y + TASKBAR_H - 4, C.TAN);
    for (const s of this.slots) {
      const active = os.wm.active === s.win || (os.wm.active?.modalFor === s.win);
      const down = active && s.win.state !== 'minimized' || this.pressed === s.win.id;
      const { x, y: by, w, h } = s.r;
      buttonFace(g, x, by, w, h, down);
      if (down) g.fillPattern(x + 2, by + 2, w - 4, h - 4, [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55], C.CREAM, C.TAN);
      const ic = icon(s.win.icon, 16);
      const o2 = down ? 1 : 0;
      const ix = s.iconOnly ? x + Math.floor((w - 16) / 2) : x + 3;
      if (s.win.state === 'minimized') {
        // minimized: draw the icon dithered
        for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
          const v = ic.px[j * 16 + i];
          if (v !== TRANSPARENT && ((i + j) & 1) === 0) g.pset(ix + i + o2, by + j + o2, v);
        }
      } else g.blit(ic, ix + o2, by + o2, TRANSPARENT);
      if (!s.iconOnly) {
        g.clip(x, by, w - 3, h);
        const t = SANS.fit(s.win.title, w - 26, { bold: active });
        SANS.draw(g, x + 22 + o2, by + 4 + o2, t, s.win.state === 'minimized' ? C.GREY : TH.text, { bold: active });
        g.pop();
      }
    }
    const mr = this.moreRect();
    if (mr) {
      buttonFace(g, mr.x, mr.y, mr.w, mr.h, this.pressed === 'more');
      SANS.draw(g, mr.x + 5, mr.y + 4, `+${this.overflow.length}`, TH.text, { bold: true });
    }
  }

  private hit(x: number, y: number): 'launch' | 'more' | Window | null {
    if (!this.contains(x, y)) return null;
    const lr = this.launchRect();
    if (x >= lr.x && x < lr.x + lr.w) return 'launch';
    for (const s of this.slots) if (x >= s.r.x && x < s.r.x + s.r.w) return s.win;
    const mr = this.moreRect();
    if (mr && x >= mr.x && x < mr.x + mr.w) return 'more';
    return null;
  }

  pointer(e: PointerEv) {
    const h = this.hit(e.x, e.y);
    if (e.type === 'down') {
      this.pressed = h === null ? null : typeof h === 'string' ? h : h.id;
      if (e.button === 2 && h && typeof h !== 'string') { this.pressed = null; this.windowMenu(h, e.x, e.y); }
      else if (h === 'launch') { this.pressed = null; this.onLaunch?.(); }
      else if (h === 'more') this.moreMenu(e.x);
      invalidate();
      return;
    }
    if (e.type === 'up') {
      const was = this.pressed;
      this.pressed = null;
      if (h && typeof h !== 'string' && was === h.id && e.button === 0) this.clickWindow(h);
      invalidate();
    }
  }

  private clickWindow(win: Window) {
    const wm = os.wm;
    if (win.state === 'minimized') wm.restore(win);
    else if (wm.active === win || wm.active?.modalFor === win) wm.minimize(win);
    else wm.activate(win);
  }

  private windowMenu(win: Window, x: number, y: number) {
    const wm = os.wm;
    const items: MenuItem[] = [
      { label: 'Restore', disabled: win.state === 'normal', action: () => (win.state === 'minimized' ? wm.restore(win) : wm.toggleMaximize(win)) },
      { label: 'Minimize', disabled: win.state === 'minimized' || !win.minimizable, action: () => wm.minimize(win) },
      { label: 'Maximize', disabled: win.state === 'maximized' || !win.maximizable, action: () => { if (win.state === 'minimized') wm.restore(win); wm.toggleMaximize(win); } },
      { separator: true },
      { label: 'Close', shortcut: 'Ctrl+F4', action: () => wm.close(win) },
    ];
    wm.menus.open(items, x, y - items.length * 12 - 8);
  }

  private moreMenu(x: number) {
    const items: MenuItem[] = this.overflow.map((w) => ({ label: w.title, icon: w.icon, action: () => this.clickWindow(w) }));
    os.wm.menus.open(items, x, this.y - items.length * 12 - 6);
  }
}
