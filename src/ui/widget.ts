import type { Gfx } from '../core/gfx';
import type { KeyEv, PointerEv } from '../core/input';
import type { CursorName } from '../core/icons';
import { invalidate } from '../os';

/** Pointer event delivered to a widget, with coordinates local to that widget. */
export interface WEvent extends PointerEv {
  lx: number;
  ly: number;
}

export interface WindowLike {
  focusWidget(w: Widget | null): void;
  focused: Widget | null;
}

/** Base class for every UI element. Coordinates are relative to the parent. */
export class Widget {
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  parent: Widget | null = null;
  children: Widget[] = [];
  visible = true;
  enabled = true;
  focusable = false;
  /** accepts text input (shows the on-screen keyboard on touch devices) */
  acceptsText = false;
  cursor: CursorName = 'arrow';
  tooltip = '';
  /** set by Window for its root widget */
  host: WindowLike | null = null;

  add<T extends Widget>(child: T): T {
    child.parent = this;
    this.children.push(child);
    invalidate();
    return child;
  }
  remove(child: Widget) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parent = null;
    invalidate();
  }
  clear() {
    for (const c of this.children) c.parent = null;
    this.children = [];
    invalidate();
  }

  setBounds(x: number, y: number, w: number, h: number): this {
    const resized = w !== this.w || h !== this.h;
    this.x = x | 0;
    this.y = y | 0;
    this.w = Math.max(0, w | 0);
    this.h = Math.max(0, h | 0);
    if (resized) this.layout();
    invalidate();
    return this;
  }

  /** Position children. Override in containers. */
  layout(): void {}

  /** Paint self (local coords) and then children. */
  paint(g: Gfx): void {
    this.paintChildren(g);
  }
  paintChildren(g: Gfx) {
    for (const c of this.children) {
      if (!c.visible || c.w <= 0 || c.h <= 0) continue;
      g.push(c.x, c.y, c.w, c.h);
      if (!g.clipEmpty()) c.paint(g);
      g.pop();
    }
  }

  /** Deepest visible widget at local point. */
  hit(x: number, y: number): Widget | null {
    if (!this.visible || x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    for (let i = this.children.length - 1; i >= 0; i--) {
      const c = this.children[i];
      const h = c.hit(x - c.x, y - c.y);
      if (h) return h;
    }
    return this;
  }

  /** Position relative to the window root. */
  rootPos(): [number, number] {
    let x = 0, y = 0;
    let w: Widget | null = this;
    while (w) {
      x += w.x;
      y += w.y;
      w = w.parent;
    }
    return [x, y];
  }

  root(): Widget {
    let w: Widget = this;
    while (w.parent) w = w.parent;
    return w;
  }

  get window(): WindowLike | null {
    return this.root().host;
  }

  focus() {
    this.window?.focusWidget(this);
  }
  get hasFocus(): boolean {
    return this.window?.focused === this;
  }

  invalidate() {
    invalidate();
  }

  // ---- events: return true when handled -------------------------------------
  onPointerDown(_e: WEvent): boolean | void {}
  onPointerMove(_e: WEvent): void {}
  onPointerUp(_e: WEvent): void {}
  onHover(_e: WEvent): void {}
  onLeave(): void {}
  onWheel(_e: WEvent): boolean | void { return false; }
  onKey(_e: KeyEv): boolean | void { return false; }
  onText(_s: string): void {}
  onFocus(): void {}
  onBlur(): void {}
  onCopy(_cut: boolean): string | null { return null; }
  onPaste(_s: string): void {}

  /** Visit this and all descendants. */
  walk(fn: (w: Widget) => void) {
    fn(this);
    for (const c of this.children) c.walk(fn);
  }
}

/** A plain container that runs a custom layout function. */
export class Panel extends Widget {
  bg = -1;
  layoutFn: ((p: Panel) => void) | null = null;
  constructor(bg = -1) {
    super();
    this.bg = bg;
  }
  layout() {
    this.layoutFn?.(this);
  }
  paint(g: Gfx) {
    if (this.bg >= 0) g.fillRect(0, 0, this.w, this.h, this.bg);
    this.paintChildren(g);
  }
}

/** Simple box layout helpers. */
export function hbox(ws: (Widget | number)[], x: number, y: number, h: number, gap = 2) {
  let cx = x;
  for (const w of ws) {
    if (typeof w === 'number') { cx += w; continue; }
    w.setBounds(cx, y, w.w || 40, h);
    cx += w.w + gap;
  }
  return cx;
}
