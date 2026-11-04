import type { Gfx, Rect } from '../core/gfx';
import { C } from '../core/palette';
import { SANS } from '../core/fonts';
import type { KeyEv } from '../core/input';
import { Panel, Widget, type WindowLike } from '../ui/widget';
import type { MenuDef } from '../ui/menu';
import { TH, dropShadow, softRect } from '../ui/theme';
import { invalidate, os } from '../os';

export const TITLE_H = 14;
/** body offset inside the outer frame */
export const BODY_X = 1;
export const BODY_Y = TITLE_H + 2;
export const CHROME_W = 2;
export const CHROME_H = TITLE_H + 3;

export type WinRegion =
  | 'close' | 'min' | 'max' | 'title' | 'body'
  | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface WindowOpts {
  title: string;
  icon?: string;
  /** body (content) size */
  w: number;
  h: number;
  x?: number;
  y?: number;
  resizable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  minW?: number;
  minH?: number;
  menus?: MenuDef[];
  app?: string;
  bg?: number;
  /** modal dialog owned by this window (blocks it) */
  modalFor?: Window | null;
  /** center on screen (or over modalFor) */
  center?: boolean;
  /**
   * Preferred initial size as a fraction of the desktop (e.g. {w: 0.8, h: 0.9}),
   * capped by maxW/maxH (outer size) and never smaller than w/h. The window opens centered.
   */
  fit?: { w: number; h: number; maxW?: number; maxH?: number };
  /** pop-up (launcher): no title boxes, not draggable, closes when anything else is used */
  popup?: boolean;
  /** small text shown at the right of the title bar (e.g. a shortcut) */
  titleHint?: string;
}

let nextId = 1;

export class Window implements WindowLike {
  id = nextId++;
  title: string;
  icon: string;
  app: string;
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  resizable: boolean;
  minimizable: boolean;
  maximizable: boolean;
  minW: number;
  minH: number;
  menus: MenuDef[];
  body: Panel;
  focused: Widget | null = null;
  state: 'normal' | 'minimized' | 'maximized' = 'normal';
  restoreRect: Rect | null = null;
  modalFor: Window | null;
  modalChild: Window | null = null;
  /** hidden while the opening zoom animation plays */
  revealed = false;
  closed = false;
  center: boolean;
  fit: WindowOpts['fit'] | null;
  popup: boolean;
  titleHint: string;
  /** where the closing animation should shrink to (instead of the window center) */
  closeTarget: Rect | null = null;

  /** window-level key handler, runs after the focused widget declines a key */
  onKey: ((e: KeyEv) => boolean | void) | null = null;
  /** return false (or resolve false) to veto closing */
  onCloseRequest: (() => boolean | Promise<boolean>) | null = null;
  onClosed: (() => void) | null = null;
  onResize: (() => void) | null = null;
  onActivate: ((active: boolean) => void) | null = null;
  onDropFiles: ((files: File[], lx: number, ly: number) => void) | null = null;

  constructor(o: WindowOpts) {
    this.title = o.title;
    this.icon = o.icon ?? 'file-app';
    this.app = o.app ?? '';
    this.resizable = o.resizable ?? true;
    this.minimizable = o.minimizable ?? !o.modalFor;
    this.maximizable = o.maximizable ?? (o.resizable ?? true);
    this.minW = o.minW ?? 100;
    this.minH = o.minH ?? 40;
    this.menus = o.menus ?? [];
    this.modalFor = o.modalFor ?? null;
    this.center = o.center ?? !!o.modalFor;
    this.fit = o.fit ?? null;
    this.popup = !!o.popup;
    this.titleHint = o.titleHint ?? '';
    if (this.popup) { this.minimizable = false; this.maximizable = false; this.resizable = false; }
    this.body = new Panel(o.bg ?? TH.winBg);
    this.body.host = this;
    this.w = o.w + CHROME_W;
    this.h = o.h + CHROME_H;
    this.x = o.x ?? -1;
    this.y = o.y ?? -1;
  }

  get bodyW() { return this.w - CHROME_W; }
  get bodyH() { return this.h - CHROME_H; }
  get active() { return os.wm?.active === this; }
  get visible() { return this.state !== 'minimized' && !this.closed; }

  setTitle(t: string) {
    this.title = t;
    invalidate();
  }

  /** Set the outer frame rect and relayout the body. */
  setFrame(x: number, y: number, w: number, h: number) {
    w = Math.max(w, this.minW + CHROME_W);
    h = Math.max(h, this.minH + CHROME_H);
    const resized = w !== this.w || h !== this.h || this.body.w !== w - CHROME_W;
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.w = Math.round(w);
    this.h = Math.round(h);
    if (resized) {
      this.body.setBounds(0, 0, this.bodyW, this.bodyH);
      this.onResize?.();
    }
    invalidate();
  }

  setBodySize(w: number, h: number) {
    this.setFrame(this.x, this.y, w + CHROME_W, h + CHROME_H);
  }

  get frame(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  // WindowLike
  focusWidget(w: Widget | null) {
    if (w === this.focused) return;
    const old = this.focused;
    this.focused = w;
    old?.onBlur();
    w?.onFocus();
    if (this.active) os.input?.setWantText(!!w?.acceptsText);
    invalidate();
  }

  /** Focus the next/previous focusable widget (Tab order = tree order). */
  cycleFocus(back: boolean) {
    const list: Widget[] = [];
    this.body.walk((w) => {
      if (w.focusable && w.visible && w.enabled && isShown(w)) list.push(w);
    });
    if (!list.length) return;
    const i = this.focused ? list.indexOf(this.focused) : -1;
    const n = (i + (back ? -1 : 1) + list.length) % list.length;
    this.focusWidget(list[back && i < 0 ? list.length - 1 : n]);
  }

  close() {
    os.wm.close(this);
  }

  region(px: number, py: number): WinRegion | null {
    const { x, y, w, h } = this;
    const lx = px - x, ly = py - y;
    const edge = 3;
    if (lx < -edge || ly < -edge || lx >= w + edge || ly >= h + edge) return null;
    const canResize = this.resizable && this.state === 'normal';
    if (canResize) {
      const n = ly < 2, s = ly >= h - 2, wv = lx < 2, e = lx >= w - 2;
      if (n && wv) return 'nw';
      if (n && e) return 'ne';
      if (s && wv) return 'sw';
      if (s && e) return 'se';
      if (n) return 'n';
      if (s) return 's';
      if (wv) return 'w';
      if (e) return 'e';
      if (lx >= w - 11 && ly >= h - 11) return 'se';
    }
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) return null;
    if (ly < BODY_Y) {
      const bx = this.boxX();
      if (ly >= 3 && ly < 12 && !this.popup) {
        if (lx >= bx.close && lx < bx.close + 9) return 'close';
        if (bx.max >= 0 && lx >= bx.max && lx < bx.max + 9) return 'max';
        if (bx.min >= 0 && lx >= bx.min && lx < bx.min + 9) return 'min';
      }
      return 'title';
    }
    return 'body';
  }

  private boxX() {
    if (this.popup) return { close: -100, max: -1, min: -1, left: this.w - 4 - (this.titleHint ? SANS.measure(this.titleHint, { bold: true }) + 10 : 0) };
    let x = this.w - 12;
    const close = x;
    x -= 11;
    const max = this.maximizable ? x : -1;
    if (this.maximizable) x -= 11;
    const min = this.minimizable ? x : -1;
    if (this.minimizable) x -= 11;
    return { close, max, min, left: x + 9 };
  }

  /** Box being pressed (drawn inverted). */
  pressedBox: WinRegion | null = null;

  paint(g: Gfx) {
    const { x, y, w, h } = this;
    const active = this.active;
    dropShadow(g, x, y, w, h, 2);
    // frame
    g.rect(x, y, w, h, TH.border);
    // title bar
    const tb = active ? TH.title : C.TAN;
    g.fillRect(x + 1, y + 1, w - 2, TITLE_H, tb);
    g.hline(x + 1, x + w - 2, y + TITLE_H + 1, TH.border);
    const bx = this.boxX();
    const tStyle = { bold: true };
    const maxTitle = bx.left - 8;
    const title = SANS.fit(this.title, Math.max(10, maxTitle), tStyle);
    const tw = SANS.measure(title, tStyle);
    SANS.draw(g, x + 6, y + 3, title, active ? TH.titleText : C.GREY, tStyle);
    if (active) {
      // sunset stripes between title and boxes
      const sx = x + 6 + tw + 5, ex = x + bx.left - 4;
      if (ex - sx > 6) for (let i = 0; i < 4; i++) g.hline(sx, ex, y + 4 + i * 2, [C.YELLOW, C.ORANGE, C.RED, C.CRIMSON][i]);
    }
    // boxes
    const box = (bxp: number, kind: 'close' | 'min' | 'max') => {
      if (bxp < 0) return;
      const X = x + bxp, Y = y + 3;
      const pressed = this.pressedBox === kind;
      g.fillRect(X + 1, Y + 1, 7, 7, pressed ? C.ORANGE : active ? C.CREAM : C.CREAM);
      softRect(g, X, Y, 9, 9, active ? TH.border : C.GREY);
      const ic = active ? TH.border : C.GREY;
      if (kind === 'close') {
        for (let i = 0; i < 5; i++) { g.pset(X + 2 + i, Y + 2 + i, ic); g.pset(X + 6 - i, Y + 2 + i, ic); }
      } else if (kind === 'min') {
        g.hline(X + 2, X + 6, Y + 6, ic);
      } else {
        g.rect(X + 2, Y + 2, 5, 5, ic);
        g.hline(X + 2, X + 6, Y + 3, ic);
      }
    };
    if (this.popup) {
      if (this.titleHint) {
        const hw = SANS.measure(this.titleHint, { bold: true });
        const hx = x + w - hw - 10;
        g.fillRect(hx - 2, y + 2, hw + 6, TITLE_H - 2, C.CREAM);
        softRect(g, hx - 3, y + 2, hw + 8, TITLE_H - 2, C.INK);
        SANS.draw(g, hx + 1, y + 3, this.titleHint, C.PLUM, { bold: true });
      }
    } else {
      box(bx.min, 'min');
      box(bx.max, 'max');
      box(bx.close, 'close');
    }
    // body
    g.push(x + BODY_X, y + BODY_Y, this.bodyW, this.bodyH);
    this.body.paint(g);
    g.pop();
    // resize grip
    if (this.resizable && this.state === 'normal') {
      const gx = x + w - 2, gy = y + h - 2;
      for (let i = 0; i < 3; i++) {
        g.line(gx - 2 - i * 3, gy, gx, gy - 2 - i * 3, C.GREY);
      }
    }
    // modal-blocked windows get a subtle dither
    if (this.modalChild) g.remap(x + 1, y + 1, w - 2, TITLE_H, [0, 0, 1, 2, 3, 4, 5, 6, 10, 10, 11, 12, 13, 1, 13, 13], [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55]);
  }
}

function isShown(w: Widget): boolean {
  let p: Widget | null = w;
  while (p) {
    if (!p.visible) return false;
    p = p.parent;
  }
  return true;
}
