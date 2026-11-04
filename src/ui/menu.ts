import type { Gfx } from '../core/gfx';
import { C } from '../core/palette';
import { SANS } from '../core/fonts';
import type { KeyEv, PointerEv } from '../core/input';
import { TH, dropShadow, separator } from './theme';
import { invalidate, os } from '../os';

export interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  items?: MenuItem[] | (() => MenuItem[]);
  checked?: boolean | (() => boolean);
  disabled?: boolean | (() => boolean);
  separator?: boolean;
  icon?: string;
}

export interface MenuDef {
  label: string;
  items: MenuItem[] | (() => MenuItem[]);
}

const ITEM_H = 12;
const SEP_H = 5;

function val<T>(v: T | (() => T) | undefined, d: T): T {
  return v === undefined ? d : typeof v === 'function' ? (v as () => T)() : v;
}
export function resolveItems(items: MenuItem[] | (() => MenuItem[])): MenuItem[] {
  return typeof items === 'function' ? items() : items;
}

class PopupMenu {
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  items: MenuItem[];
  hover = -1;
  child: PopupMenu | null = null;
  constructor(items: MenuItem[], x: number, y: number, screenW: number, screenH: number, alignRightOf?: number) {
    this.items = items;
    let w = 60;
    for (const it of items) {
      if (it.separator) continue;
      const lw = SANS.measure(it.label ?? '') + (it.shortcut ? SANS.measure(it.shortcut) + 16 : 0) + (it.items ? 10 : 0);
      w = Math.max(w, lw + 26);
    }
    this.w = w;
    this.h = items.reduce((s, it) => s + (it.separator ? SEP_H : ITEM_H), 0) + 4;
    // keep on screen; flip submenus to the left when needed
    if (x + this.w > screenW - 2) x = alignRightOf !== undefined ? alignRightOf - this.w + 2 : screenW - this.w - 2;
    if (y + this.h > screenH - 2) y = Math.max(14, screenH - this.h - 2);
    this.x = Math.max(0, x);
    this.y = Math.max(0, y);
  }
  itemY(i: number) {
    let y = 2;
    for (let k = 0; k < i; k++) y += this.items[k].separator ? SEP_H : ITEM_H;
    return y;
  }
  indexAt(px: number, py: number): number {
    if (px < this.x || px >= this.x + this.w || py < this.y || py >= this.y + this.h) return -2;
    let y = this.y + 2;
    for (let i = 0; i < this.items.length; i++) {
      const ih = this.items[i].separator ? SEP_H : ITEM_H;
      if (py >= y && py < y + ih) return this.items[i].separator ? -1 : i;
      y += ih;
    }
    return -1;
  }
  enabled(i: number) {
    const it = this.items[i];
    return !!it && !it.separator && !val(it.disabled, false);
  }
  paint(g: Gfx) {
    const { x, y, w, h } = this;
    dropShadow(g, x, y, w, h, 2);
    g.fillRect(x, y, w, h, TH.menuBg);
    g.rect(x, y, w, h, TH.border);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const iy = y + this.itemY(i);
      if (it.separator) { separator(g, x + 3, iy + 2, w - 6); continue; }
      const en = this.enabled(i);
      const hot = i === this.hover && en;
      if (hot) g.fillRect(x + 2, iy, w - 4, ITEM_H, TH.sel);
      const col = en ? TH.text : TH.textDim;
      if (val(it.checked, false)) {
        const pts = [[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1]];
        for (const [px, py] of pts) { g.pset(x + 4 + px, iy + 2 + py, col); g.pset(x + 4 + px, iy + 3 + py, col); }
      }
      SANS.draw(g, x + 16, iy + 2, it.label ?? '', col);
      if (it.shortcut) {
        const sw = SANS.measure(it.shortcut);
        SANS.draw(g, x + w - sw - 6, iy + 2, it.shortcut, en ? TH.textDim : TH.textDim);
      }
      if (it.items) {
        const ax = x + w - 8, ay = iy + 3;
        for (let k = 0; k < 4; k++) g.vline(ax + k, ay + k, ay + 6 - k, col);
      }
    }
  }
}

/** Overlay that owns all open popup menus. The window manager routes input here first. */
export class MenuLayer {
  private root: PopupMenu | null = null;
  private onClose: (() => void) | null = null;
  /** menus opened from the top bar track their title index here */
  barIndex = -1;
  openedAt = 0;

  get isOpen() {
    return this.root !== null;
  }

  open(items: MenuItem[], x: number, y: number, onClose?: () => void, barIndex = -1) {
    this.close(false);
    const L = os.display.layout;
    this.root = new PopupMenu(items, x, y, L.w, L.h);
    this.onClose = onClose ?? null;
    this.barIndex = barIndex;
    this.openedAt = performance.now();
    invalidate();
  }

  close(notify = true) {
    if (!this.root) return;
    this.root = null;
    const cb = this.onClose;
    this.onClose = null;
    this.barIndex = -1;
    if (notify) cb?.();
    invalidate();
  }

  private chain(): PopupMenu[] {
    const out: PopupMenu[] = [];
    let m = this.root;
    while (m) { out.push(m); m = m.child; }
    return out;
  }

  private openSub(m: PopupMenu, i: number) {
    const it = m.items[i];
    if (!it.items || !m.enabled(i)) { m.child = null; return; }
    if (m.child && m.child.items === resolveItems(it.items)) return;
    const L = os.display.layout;
    m.child = new PopupMenu(resolveItems(it.items), m.x + m.w - 2, m.y + m.itemY(i) - 2, L.w, L.h, m.x);
  }

  private activate(m: PopupMenu, i: number) {
    const it = m.items[i];
    if (!m.enabled(i)) return;
    if (it.items) { this.openSub(m, i); invalidate(); return; }
    this.close();
    os.sound?.sfx('click');
    // run after closing so actions can open dialogs/menus
    setTimeout(() => it.action?.(), 0);
  }

  /** Returns true if the event was consumed by the menus. */
  pointer(e: PointerEv): boolean {
    if (!this.root) return false;
    const chain = this.chain();
    for (let d = chain.length - 1; d >= 0; d--) {
      const m = chain[d];
      const i = m.indexAt(e.x, e.y);
      if (i === -2) continue;
      if (e.type === 'move' || e.type === 'down') {
        if (m.hover !== i) {
          m.hover = i;
          for (let k = d + 1; k < chain.length; k++) chain[k - 1].child = null;
          if (i >= 0) this.openSub(m, i);
          invalidate();
        }
      } else if (e.type === 'up' && i >= 0) {
        this.activate(m, i);
      }
      return true;
    }
    // outside every menu
    if (e.type === 'move') {
      const last = chain[chain.length - 1];
      if (last.hover !== -1 && !last.child) { last.hover = -1; invalidate(); }
      return false;
    }
    if (e.type === 'down') {
      this.close();
      return this.barIndex >= 0 ? false : true; // swallow clicks that only close a context menu
    }
    return e.type === 'up';
  }

  key(e: KeyEv): boolean {
    if (!this.root) return false;
    const chain = this.chain();
    const m = chain[chain.length - 1];
    const step = (dir: number) => {
      const n = m.items.length;
      let i = m.hover;
      for (let k = 0; k < n; k++) {
        i = (i + dir + n) % n;
        if (!m.items[i].separator) break;
      }
      m.hover = i;
    };
    switch (e.key) {
      case 'Escape':
        if (chain.length > 1) chain[chain.length - 2].child = null;
        else this.close();
        break;
      case 'ArrowDown': step(1); break;
      case 'ArrowUp': step(-1); break;
      case 'ArrowRight':
        if (m.hover >= 0 && m.items[m.hover].items) { this.openSub(m, m.hover); if (m.child) m.child.hover = 0; }
        else if (this.barIndex >= 0) return false; // let the top bar move to the next menu
        break;
      case 'ArrowLeft':
        if (chain.length > 1) chain[chain.length - 2].child = null;
        else if (this.barIndex >= 0) return false;
        break;
      case 'Enter':
      case ' ':
        if (m.hover >= 0) this.activate(m, m.hover);
        break;
      default: {
        // first-letter navigation
        if (e.key.length === 1) {
          const ch = e.key.toLowerCase();
          const idx = m.items.findIndex((it, i) => i > m.hover && it.label?.toLowerCase().startsWith(ch));
          const idx2 = idx >= 0 ? idx : m.items.findIndex((it) => it.label?.toLowerCase().startsWith(ch));
          if (idx2 >= 0) m.hover = idx2;
        }
      }
    }
    invalidate();
    return true;
  }

  paint(g: Gfx) {
    for (const m of this.chain()) m.paint(g);
  }

  /** Find a menu item by shortcut text across MenuDefs (for keyboard accelerators). */
  static findShortcut(menus: MenuDef[], combo: string): MenuItem | null {
    const walk = (items: MenuItem[]): MenuItem | null => {
      for (const it of items) {
        if (it.shortcut && it.shortcut.toLowerCase() === combo.toLowerCase() && !val(it.disabled, false)) return it;
        if (it.items) {
          const r = walk(resolveItems(it.items));
          if (r) return r;
        }
      }
      return null;
    };
    for (const m of menus) {
      const r = walk(resolveItems(m.items));
      if (r) return r;
    }
    return null;
  }
}

/** Normalized shortcut text for a key event, e.g. "Ctrl+S", "F5", "Ctrl+Shift+Z". */
export function comboOf(e: KeyEv): string {
  const parts: string[] = [];
  if (e.ctrl) parts.push('Ctrl');
  if (e.alt) parts.push('Alt');
  if (e.shift) parts.push('Shift');
  let k = e.key;
  if (k.length === 1) k = k.toUpperCase();
  if (k === ' ') k = 'Space';
  if (k === 'Delete') k = 'Del';
  parts.push(k);
  return parts.join('+');
}

export const MENU_COLORS = { C };
