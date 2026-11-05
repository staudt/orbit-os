import { Gfx, Surface, PATTERNS, type Rect, lerp, clamp } from '../core/gfx';
import { C, INVERT } from '../core/palette';
import type { InputSink, KeyEv, PointerEv } from '../core/input';
import { cursorImage, icon, type CursorName } from '../core/icons';
import { SANS } from '../core/fonts';
import { ease } from '../core/scheduler';
import { MenuLayer, comboOf, type MenuDef } from '../ui/menu';
import type { Widget, WEvent } from '../ui/widget';
import { Button } from '../ui/widgets';
import { caret } from '../ui/theme';
import { Window, BODY_X, BODY_Y, TITLE_H, type WinRegion } from './window';
import { TopBar, TOPBAR_H } from './topbar';
import { Desktop } from './desktop';
import { makeWallpaper } from './wallpaper';
import { launch } from '../apps/registry';
import { Screensaver } from './screensaver';
import { Taskbar, TASKBAR_H } from './taskbar';
import { Moony } from './moony';
import { invalidate, os } from '../os';

interface ZoomAnim {
  from: Rect;
  to: Rect;
  start: number;
  dur: number;
  done?: () => void;
}

type Drag =
  | { kind: 'move'; win: Window; dx: number; dy: number; outline: Rect | null }
  | { kind: 'resize'; win: Window; edge: string; start: Rect; mx: number; my: number; outline: Rect | null }
  | { kind: 'widget'; win: Window; widget: Widget }
  | { kind: 'box'; win: Window; box: WinRegion }
  | { kind: 'desktop' }
  | { kind: 'topbar' }
  | { kind: 'taskbar' }
  | { kind: 'moony' }
  | { kind: 'swallow' };

const TRAIL = 3;
const TRAIL_GAP = 0.16;

export class WindowManager implements InputSink {
  windows: Window[] = [];
  active: Window | null = null;
  menus = new MenuLayer();
  topbar = new TopBar();
  desktop = new Desktop();
  wallpaper: Surface = new Surface(1, 1);
  private drag: Drag | null = null;
  private hover: Widget | null = null;
  private anims: ZoomAnim[] = [];
  private phase = 0;
  /** where the next window should zoom out from (set when launching from an icon) */
  private origin: { r: Rect; t: number } | null = null;
  private cascade = 0;
  /** extra overlay painters (drag images etc.) */
  overlays = new Set<(g: Gfx) => void>();
  /** last pointer event (modifier state for drags) */
  lastPointer: PointerEv | null = null;
  screensaver = new Screensaver();
  taskbar = new Taskbar();
  moony = new Moony();
  /** files being dragged between windows and the desktop */
  fileDrag: { paths: string[]; icon: string } | null = null;

  constructor() {
    this.taskbar.onLaunch = () => launch('launcher');
    // caret blink: repaint twice a second while a text widget has focus
    setInterval(() => {
      if (this.active?.focused?.acceptsText) invalidate();
    }, 265);
  }

  get screenW() { return os.display.layout.w; }
  get screenH() { return os.display.layout.h; }

  /** Area available to windows (below the top bar). */
  deskRect(): Rect {
    return { x: 0, y: TOPBAR_H, w: this.screenW, h: this.screenH - TOPBAR_H - TASKBAR_H };
  }

  // ------------------------------------------------------------- lifecycle

  onScreenResize() {
    this.wallpaper = makeWallpaper(this.screenW, this.screenH, os.settings.get('wallpaper'));
    const D = this.deskRect();
    for (const w of this.windows) {
      if (w.state === 'maximized') w.setFrame(D.x, D.y, D.w, D.h);
      else {
        // shrink oversized windows, then keep the title bar reachable
        const nw = Math.min(w.w, D.w), nh = Math.min(w.h, D.h);
        w.setFrame(w.x, w.y, nw, nh);
        this.clampWindow(w);
      }
    }
    this.desktop.layout();
    this.moony.layout();
    invalidate();
  }

  regenWallpaper() {
    this.wallpaper = makeWallpaper(this.screenW, this.screenH, os.settings.get('wallpaper'));
    invalidate();
  }

  private clampWindow(w: Window) {
    const D = this.deskRect();
    const x = clamp(w.x, -w.w + 48, D.x + D.w - 48);
    const y = clamp(w.y, D.y, D.y + D.h - TITLE_H - 2);
    if (x !== w.x || y !== w.y) w.setFrame(x, y, w.w, w.h);
  }

  /** Remember an icon rect so the next opened window zooms out of it. */
  setOrigin(r: Rect) {
    this.origin = { r, t: performance.now() };
  }

  open(win: Window) {
    const D = this.deskRect();
    // fit the desktop
    let w = Math.min(win.w, D.w), h = Math.min(win.h, D.h);
    let x = win.x, y = win.y;
    if (win.fit) {
      // app-preferred size relative to the desktop, opened centered (offset a little per extra window)
      const f = win.fit;
      w = Math.min(D.w, Math.max(w, Math.min(Math.round(D.w * f.w), f.maxW ?? Infinity)));
      h = Math.min(D.h, Math.max(h, Math.min(Math.round(D.h * f.h), f.maxH ?? Infinity)));
      const step = this.windows.filter((o) => o.app === win.app && !o.closed).length % 4;
      x = Math.max(0, Math.floor((D.w - w) / 2) + step * 14);
      y = D.y + Math.max(0, Math.floor((D.h - h) / 2) + step * 12);
      if (x + w > D.w) x = Math.max(0, D.w - w);
      if (y + h > D.y + D.h) y = Math.max(D.y, D.y + D.h - h);
    } else if (win.center || x < 0 || y < 0) {
      if (win.center) {
        const ref = win.modalFor && win.modalFor.visible ? win.modalFor.frame : D;
        x = ref.x + Math.floor((ref.w - w) / 2);
        y = ref.y + Math.max(0, Math.floor((ref.h - h) / 3));
      } else {
        [x, y] = this.smartPlace(w, h);
      }
    }
    w = Math.max(w, win.minW + 2);
    h = Math.max(h, win.minH + TITLE_H + 3);
    win.setFrame(x, y, w, h);
    this.clampWindow(win);
    if (win.modalFor) win.modalFor.modalChild = win;
    this.windows.push(win);
    this.activate(win);
    const from = this.origin && performance.now() - this.origin.t < 1500 ? this.origin.r : this.shrunk(win.frame, 0.15);
    this.origin = null;
    os.sound.sfx('open');
    this.zoom(from, win.frame, () => { win.revealed = true; this.refreshCursor(); }, win.modalFor ? 0.6 : 1);
    if (!this.animOn) { win.revealed = true; this.refreshCursor(); }
  }

  /** Re-evaluate the cursor shape under the pointer (after windows appear/disappear). */
  refreshCursor() {
    const p = this.lastPointer;
    if (p && !this.drag) this.updateHover({ ...p, type: 'move' });
  }

  /**
   * Smart (minimum-overlap) placement, as in fvwm and KDE's KWin: try positions along the
   * edges of the desktop and of existing windows, pick the one that covers the least of
   * the windows already on screen (desktop icons count half), ties going to the top-left.
   */
  smartPlace(w: number, h: number): [number, number] {
    const D = this.deskRect();
    const gap = 6;
    const wins = this.windows.filter((o) => o.visible && !o.popup && !o.closed).map((o) => o.frame);
    const icons = this.desktop.iconRects();
    const xs = new Set<number>([D.x + gap, D.x + D.w - w - gap]);
    const ys = new Set<number>([D.y + gap, D.y + D.h - h - gap]);
    for (const r of [...wins, ...icons]) {
      xs.add(r.x + r.w + gap); xs.add(r.x - w - gap); xs.add(r.x);
      ys.add(r.y + r.h + gap); ys.add(r.y - h - gap); ys.add(r.y);
    }
    const area = (a: Rect, x: number, y: number) => {
      const ox = Math.min(a.x + a.w, x + w) - Math.max(a.x, x);
      const oy = Math.min(a.y + a.h, y + h) - Math.max(a.y, y);
      return ox > 0 && oy > 0 ? ox * oy : 0;
    };
    let best: [number, number] | null = null, bestScore = Infinity;
    const sortedY = [...ys].sort((a, b) => a - b), sortedX = [...xs].sort((a, b) => a - b);
    for (const y of sortedY) {
      if (y < D.y || y + h > D.y + D.h) continue;
      for (const x of sortedX) {
        if (x < D.x || x + w > D.x + D.w) continue;
        let score = 0;
        for (const r of wins) score += area(r, x, y);
        for (const r of icons) score += area(r, x, y) * 0.5;
        if (score < bestScore) { bestScore = score; best = [x, y]; }
      }
    }
    if (best) return best;
    // larger than the free area: fall back to a gentle cascade
    const step = this.cascade++ % 8;
    return [Math.max(0, Math.min(D.w - w, 24 + step * 16)), Math.max(D.y, Math.min(D.y + D.h - h, D.y + 10 + step * 14))];
  }

  private get animOn() {
    return os.settings.get('animations');
  }

  private shrunk(r: Rect, f: number): Rect {
    const w = Math.max(8, Math.round(r.w * f)), h = Math.max(6, Math.round(r.h * f));
    return { x: r.x + Math.round((r.w - w) / 2), y: r.y + Math.round((r.h - h) / 2), w, h };
  }

  /** Close a window. Honors onCloseRequest unless forced. */
  async close(win: Window, force = false) {
    if (win.closed) return;
    if (win.modalChild && !win.modalChild.closed) {
      this.activate(win.modalChild);
      os.sound.sfx('error');
      return;
    }
    if (!force && win.onCloseRequest) {
      const ok = await win.onCloseRequest();
      if (!ok || win.closed) return;
    }
    win.closed = true;
    const i = this.windows.indexOf(win);
    if (i >= 0) this.windows.splice(i, 1);
    if (win.modalFor && win.modalFor.modalChild === win) win.modalFor.modalChild = null;
    if (this.hover && this.hover.root() === win.body) this.hover = null;
    if (this.drag && 'win' in this.drag && this.drag.win === win) this.drag = null;
    if (win.state !== 'minimized') {
      if (!win.popup) os.sound.sfx('close');
      this.zoom(win.frame, win.closeTarget ?? this.shrunk(win.frame, 0.15), undefined, win.modalFor ? 0.6 : 1);
    }
    if (this.active === win) {
      this.active = null;
      const next = win.modalFor && !win.modalFor.closed ? win.modalFor : this.topVisible();
      if (next) this.activate(next);
      else os.input.setWantText(false);
    }
    win.onClosed?.();
    this.desktop.layout();
    invalidate();
  }

  private topVisible(): Window | null {
    for (let i = this.windows.length - 1; i >= 0; i--) if (this.windows[i].visible) return this.windows[i];
    return null;
  }

  /** Close pop-ups (the launcher) except `keep`. */
  closePopups(keep?: Window | null) {
    for (const w of [...this.windows]) if (w.popup && w !== keep && !w.closed) this.close(w, true);
  }
  get launcherOpen() {
    return this.windows.some((w) => w.popup && !w.closed);
  }

  activate(win: Window) {
    // a blocked window passes activation to its modal dialog
    while (win.modalChild && !win.modalChild.closed) win = win.modalChild;
    if (!win.popup) this.closePopups();
    if (win.state === 'minimized') { this.restore(win); return; }
    const i = this.windows.indexOf(win);
    if (i < 0) return;
    // raise the window and keep its owner chain directly below it
    const chain: Window[] = [];
    let p: Window | null = win;
    while (p) { chain.unshift(p); p = p.modalFor; }
    for (const c of chain) {
      const k = this.windows.indexOf(c);
      if (k >= 0) { this.windows.splice(k, 1); this.windows.push(c); }
    }
    if (this.active !== win) {
      const old = this.active;
      this.active = win;
      old?.onActivate?.(false);
      win.onActivate?.(true);
    }
    os.input.setWantText(!!win.focused?.acceptsText);
    caret.reset();
    invalidate();
  }

  minimize(win: Window) {
    if (!win.minimizable || win.state === 'minimized') return;
    win.restoreRect = win.state === 'maximized' ? win.restoreRect : win.frame;
    (win as Window & { wasMax?: boolean }).wasMax = win.state === 'maximized';
    win.state = 'minimized';
    this.desktop.layout();
    os.sound.sfx('minimize');
    this.zoom(win.frame, this.taskbar.buttonRect(win));
    if (this.active === win) {
      this.active = null;
      const next = this.topVisible();
      if (next) this.activate(next);
    }
    invalidate();
  }

  restore(win: Window) {
    if (win.state !== 'minimized') return;
    const slot = this.taskbar.buttonRect(win);
    win.state = (win as Window & { wasMax?: boolean }).wasMax ? 'maximized' : 'normal';
    win.revealed = false;
    os.sound.sfx('restore');
    this.zoom(slot, win.frame, () => { win.revealed = true; });
    if (!this.animOn) win.revealed = true;
    this.desktop.layout();
    this.activate(win);
  }

  toggleMaximize(win: Window) {
    if (!win.maximizable) return;
    const from = win.frame;
    if (win.state === 'maximized') {
      const r = win.restoreRect ?? this.shrunk(this.deskRect(), 0.7);
      win.state = 'normal';
      win.setFrame(r.x, r.y, r.w, r.h);
    } else {
      win.restoreRect = win.frame;
      const D = this.deskRect();
      win.state = 'maximized';
      win.setFrame(D.x, D.y, D.w, D.h);
    }
    this.zoom(from, win.frame, undefined, 0.7);
  }

  // ------------------------------------------------------------- animation

  zoom(from: Rect, to: Rect, done?: () => void, speed = 1) {
    if (!this.animOn) { done?.(); return; }
    const a: ZoomAnim = { from, to, start: performance.now(), dur: 170 * speed, done };
    this.anims.push(a);
    os.scheduler.animate((now) => {
      const t = (now - a.start) / a.dur;
      if (t - TRAIL * TRAIL_GAP >= 1) {
        this.anims.splice(this.anims.indexOf(a), 1);
        a.done?.();
        a.done = undefined;
        return false;
      }
      if (t >= 1 && a.done) { a.done(); a.done = undefined; }
      return true;
    });
  }

  // ------------------------------------------------------------- rendering

  render() {
    const fb = os.display.fb;
    const g = new Gfx(fb);
    if (this.screensaver.active) {
      this.screensaver.paint(g);
      os.display.present();
      return;
    }
    if (this.wallpaper.w === fb.w && this.wallpaper.h === fb.h) fb.px.set(this.wallpaper.px);
    else this.onScreenResize(), fb.px.set(this.wallpaper.px);
    this.desktop.paint(g);
    this.moony.paintBelow(g);
    for (const w of this.windows) if (w.visible && w.revealed) w.paint(g);
    const d = this.drag;
    this.phase = Math.floor(performance.now() / 70);
    if (d && (d.kind === 'move' || d.kind === 'resize') && d.outline) {
      // Windows 3-style frame: a thick hatched border that inverts what's beneath it
      const r = d.outline;
      const t = 3;
      g.remap(r.x, r.y, r.w, t, INVERT, PATTERNS.d50);
      g.remap(r.x, r.y + r.h - t, r.w, t, INVERT, PATTERNS.d50);
      g.remap(r.x, r.y + t, t, r.h - 2 * t, INVERT, PATTERNS.d50);
      g.remap(r.x + r.w - t, r.y + t, t, r.h - 2 * t, INVERT, PATTERNS.d50);
    }
    const now = performance.now();
    for (const a of this.anims) {
      const t = (now - a.start) / a.dur;
      for (let k = 0; k <= TRAIL; k++) {
        const tk = t - k * TRAIL_GAP;
        if (tk < 0 || tk > 1) continue;
        const e = ease.out(tk);
        const r = {
          x: Math.round(lerp(a.from.x, a.to.x, e)),
          y: Math.round(lerp(a.from.y, a.to.y, e)),
          w: Math.round(lerp(a.from.w, a.to.w, e)),
          h: Math.round(lerp(a.from.h, a.to.h, e)),
        };
        // marching-ants border; the lead rect is solid-ish, trailing rects fade to sparse dashes
        if (k === 0) g.dashedRect(r.x, r.y, r.w, r.h, C.CREAM, C.INK, this.phase, 2);
        else g.dashedRect(r.x, r.y, r.w, r.h, k === 1 ? C.YELLOW : C.ORANGE, -1, this.phase + k, 2);
      }
    }
    for (const o of this.overlays) o(g);
    if (this.fileDrag) this.paintFileDrag(g);
    this.taskbar.launcherOpen = this.launcherOpen;
    this.taskbar.paint(g);
    this.topbar.paint(g);
    this.moony.paintAbove(g);
    this.menus.paint(g);
    os.display.present();
  }

  // ------------------------------------------------------------- file drag & drop

  beginFileDrag(paths: string[], iconName: string) {
    this.fileDrag = { paths, icon: iconName };
    invalidate();
  }

  private paintFileDrag(g: Gfx) {
    const d = this.fileDrag!;
    const x = os.input.mouseX - 16, y = os.input.mouseY - 12;
    const ic = icon(d.icon, 32);
    // dithered "ghost" of the icon
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const v = ic.px[j * 32 + i];
      if (v !== 255 && ((i + j) & 1) === 0) g.pset(x + i, y + j, v);
    }
    if (d.paths.length > 1) {
      const t = String(d.paths.length);
      const tw = SANS.measure(t, { bold: true });
      g.fillRect(x + 26, y - 2, tw + 6, 11, C.CRIMSON);
      SANS.draw(g, x + 29, y, t, C.CREAM, { bold: true });
    }
    if (this.lastPointer?.ctrl) {
      g.fillRect(x + 24, y + 22, 9, 9, C.CREAM);
      g.rect(x + 24, y + 22, 9, 9, C.INK);
      g.hline(x + 26, x + 30, y + 26, C.INK);
      g.vline(x + 28, y + 24, y + 28, C.INK);
    }
  }

  /** Finish a file drag at screen point (x, y). Ctrl = copy instead of move. */
  async endFileDrag(x: number, y: number) {
    const d = this.fileDrag;
    this.fileDrag = null;
    invalidate();
    if (!d) return;
    const copy = !!this.lastPointer?.ctrl;
    const hit = this.windowAt(x, y);
    if (hit) {
      const handler = (hit.win as Window & { onDropPaths?: (p: string[], lx: number, ly: number, copy: boolean) => void }).onDropPaths;
      if (handler && hit.region === 'body') handler(d.paths, x - hit.win.x - BODY_X, y - hit.win.y - BODY_Y, copy);
      return;
    }
    if (y >= TOPBAR_H) await this.desktop.dropPathsAt(d.paths, x, y, copy);
  }

  // ------------------------------------------------------------- hit testing

  windowAt(x: number, y: number): { win: Window; region: WinRegion } | null {
    for (let i = this.windows.length - 1; i >= 0; i--) {
      const w = this.windows[i];
      if (!w.visible || !w.revealed) continue;
      const r = w.region(x, y);
      if (r) return { win: w, region: r };
    }
    return null;
  }

  private widgetEvent(e: PointerEv, win: Window, w: Widget): WEvent {
    const [rx, ry] = w.rootPos();
    return { ...e, lx: e.x - (win.x + BODY_X + rx), ly: e.y - (win.y + BODY_Y + ry) };
  }

  private setCursor(name: CursorName) {
    const c = cursorImage(name);
    if (os.display.cursor !== c) os.display.cursor = c;
  }

  // ------------------------------------------------------------- input sink

  pointer(e: PointerEv) {
    // any input wakes the screensaver (and that input is not passed on)
    if (this.screensaver.poke()) { this.drag = null; return; }
    this.lastPointer = e;
    // fingers don't need an arrow: hide the cursor while using touch
    const showCursor = !e.touch;
    if (os.display.cursorVisible !== showCursor) { os.display.cursorVisible = showCursor; invalidate(); }
    if (this.fileDrag && e.type === 'move') invalidate();
    os.display.cursorX = e.x;
    os.display.cursorY = e.y;
    os.scheduler.cursorMoved();

    if (this.menus.isOpen) {
      if (this.menus.pointer(e)) { this.setCursor('arrow'); return; }
      if (this.menus.isOpen && this.menus.barIndex >= 0 && e.y < TOPBAR_H) { this.topbar.pointer(e); return; }
      if (e.type === 'move' || e.type === 'up') { this.setCursor('arrow'); return; }
      if (this.menus.isOpen) return;
    }

    const d = this.drag;
    if (d && (e.type === 'move' || e.type === 'up')) {
      this.continueDrag(d, e);
      if (e.type === 'up') {
        this.drag = null;
        this.updateHover(e);
      }
      return;
    }

    if (e.type === 'down') return this.pointerDown(e);
    if (e.type === 'wheel') return this.wheel(e);
    if (e.type === 'move') this.updateHover(e);
  }

  private pointerDown(e: PointerEv) {
    // a talking Moony floats above everything
    if (this.moony.onTop && this.moony.down(e)) { this.drag = { kind: 'moony' }; return; }
    if (e.y < TOPBAR_H) {
      this.closePopups();
      this.topbar.pointer(e);
      this.drag = { kind: 'topbar' };
      return;
    }
    if (this.taskbar.contains(e.x, e.y)) {
      const lr = this.taskbar.launchRect();
      if (!(e.x >= lr.x && e.x < lr.x + lr.w)) this.closePopups();
      this.taskbar.pointer(e);
      this.drag = { kind: 'taskbar' };
      return;
    }
    const hit = this.windowAt(e.x, e.y);
    if (!hit) {
      this.closePopups();
      // a parked Moony sits on the desktop, under the windows
      if (!this.moony.onTop && this.moony.down(e)) { this.drag = { kind: 'moony' }; return; }
      this.drag = { kind: 'desktop' };
      this.desktop.pointer(e);
      return;
    }
    const { win, region } = hit;
    if (win.modalChild && !win.modalChild.closed) {
      this.activate(win);
      os.sound.sfx('error');
      this.drag = { kind: 'swallow' };
      return;
    }
    this.activate(win);
    switch (region) {
      case 'close': case 'min': case 'max':
        if (e.button !== 0) { this.drag = { kind: 'swallow' }; return; }
        win.pressedBox = region;
        this.drag = { kind: 'box', win, box: region };
        invalidate();
        return;
      case 'title':
        if (win.popup) { this.drag = { kind: 'swallow' }; return; }
        if (e.button === 0 && e.clicks === 2 && win.maximizable) {
          this.toggleMaximize(win);
          this.drag = { kind: 'swallow' };
          return;
        }
        if (e.button !== 0 || win.state === 'maximized') { this.drag = { kind: 'swallow' }; return; }
        this.drag = { kind: 'move', win, dx: e.x - win.x, dy: e.y - win.y, outline: os.settings.get('outlineDrag') ? win.frame : null };
        this.setCursor('move');
        return;
      case 'body': {
        const lx = e.x - win.x - BODY_X, ly = e.y - win.y - BODY_Y;
        const w = win.body.hit(lx, ly) ?? win.body;
        // focus the nearest focusable ancestor
        let f: Widget | null = w;
        while (f && !(f.focusable && f.enabled)) f = f.parent;
        if (f) win.focusWidget(f);
        if (w.enabled) {
          // bubble the press up until someone handles it, then capture to that widget
          let target: Widget | null = w;
          while (target) {
            if (target.enabled && target.onPointerDown(this.widgetEvent(e, win, target)) === true) break;
            target = target.parent;
          }
          this.drag = { kind: 'widget', win, widget: target ?? w };
        } else this.drag = { kind: 'swallow' };
        return;
      }
      default:
        // resize edges
        if (e.button !== 0) { this.drag = { kind: 'swallow' }; return; }
        this.drag = { kind: 'resize', win, edge: region, start: win.frame, mx: e.x, my: e.y, outline: os.settings.get('outlineDrag') ? win.frame : null };
        return;
    }
  }

  private continueDrag(d: Drag, e: PointerEv) {
    switch (d.kind) {
      case 'move': {
        const D = this.deskRect();
        const x = clamp(e.x - d.dx, -d.win.w + 48, D.w - 48);
        const y = clamp(e.y - d.dy, D.y, D.y + D.h - TITLE_H - 2);
        if (d.outline) {
          d.outline = { x, y, w: d.win.w, h: d.win.h };
          if (e.type === 'up') d.win.setFrame(x, y, d.win.w, d.win.h);
          invalidate();
        } else d.win.setFrame(x, y, d.win.w, d.win.h);
        break;
      }
      case 'resize': {
        const r = this.resizeRect(d, e.x, e.y);
        if (d.outline) {
          d.outline = r;
          if (e.type === 'up') d.win.setFrame(r.x, r.y, r.w, r.h);
          invalidate();
        } else d.win.setFrame(r.x, r.y, r.w, r.h);
        break;
      }
      case 'widget':
        if (e.type === 'move') d.widget.onPointerMove(this.widgetEvent(e, d.win, d.widget));
        else d.widget.onPointerUp(this.widgetEvent(e, d.win, d.widget));
        break;
      case 'box': {
        const over = d.win.region(e.x, e.y) === d.box;
        d.win.pressedBox = over && e.type === 'move' ? d.box : null;
        invalidate();
        if (e.type === 'up' && over) {
          if (d.box === 'close') this.close(d.win);
          else if (d.box === 'min') this.minimize(d.win);
          else if (d.box === 'max') this.toggleMaximize(d.win);
        }
        break;
      }
      case 'desktop':
        this.desktop.pointer(e);
        break;
      case 'topbar':
        this.topbar.pointer(e);
        break;
      case 'taskbar':
        this.taskbar.pointer(e);
        break;
      case 'moony':
        this.moony.drag(e);
        break;
    }
  }

  private resizeRect(d: Extract<Drag, { kind: 'resize' }>, mx: number, my: number): Rect {
    const s = d.start, w = d.win;
    const dx = mx - d.mx, dy = my - d.my;
    let { x, y, w: ww, h: hh } = s;
    const minW = w.minW + 2, minH = w.minH + TITLE_H + 3;
    const D = this.deskRect();
    if (d.edge.includes('e')) ww = Math.max(minW, s.w + dx);
    if (d.edge.includes('s')) hh = Math.max(minH, Math.min(s.h + dy, D.y + D.h - s.y));
    if (d.edge.includes('w')) { ww = Math.max(minW, s.w - dx); x = s.x + s.w - ww; }
    if (d.edge.includes('n')) {
      const ny = Math.max(D.y, s.y + dy);
      hh = Math.max(minH, s.y + s.h - ny);
      y = s.y + s.h - hh;
    }
    return { x, y, w: ww, h: hh };
  }

  private wheel(e: PointerEv) {
    const hit = this.windowAt(e.x, e.y);
    if (!hit || hit.region !== 'body' || hit.win.modalChild) return;
    const win = hit.win;
    let w: Widget | null = win.body.hit(e.x - win.x - BODY_X, e.y - win.y - BODY_Y);
    while (w) {
      if (w.enabled && w.onWheel(this.widgetEvent(e, win, w)) === true) return;
      w = w.parent;
    }
  }

  private updateHover(e: PointerEv) {
    this.moony.hover(e.x, e.y, e.y < TOPBAR_H || this.taskbar.contains(e.x, e.y) || !!this.windowAt(e.x, e.y));
    if (this.moony.onTop && this.moony.hit(e.x, e.y)) { this.setHover(null); this.setCursor('arrow'); return; }
    if (e.y < TOPBAR_H || this.taskbar.contains(e.x, e.y)) { this.setHover(null); this.setCursor('arrow'); return; }
    const hit = this.windowAt(e.x, e.y);
    if (!hit) {
      this.setHover(null);
      this.setCursor('arrow');
      return;
    }
    const { win, region } = hit;
    const cursors: Partial<Record<WinRegion, CursorName>> = {
      n: 'resize-ns', s: 'resize-ns', e: 'resize-ew', w: 'resize-ew',
      ne: 'resize-nesw', sw: 'resize-nesw', nw: 'resize-nwse', se: 'resize-nwse',
    };
    if (region !== 'body') {
      this.setHover(null);
      this.setCursor(cursors[region] ?? 'arrow');
      return;
    }
    const w = win.body.hit(e.x - win.x - BODY_X, e.y - win.y - BODY_Y);
    this.setHover(w);
    if (w && !win.modalChild) {
      w.onHover(this.widgetEvent(e, win, w));
      this.setCursor(w.enabled ? w.cursor : 'arrow');
    } else this.setCursor('arrow');
  }

  private setHover(w: Widget | null) {
    if (w === this.hover) return;
    this.hover?.onLeave();
    this.hover = w;
  }

  key(e: KeyEv) {
    if (this.screensaver.poke()) return;
    if (this.menus.isOpen) {
      if (this.menus.key(e)) return;
      if (this.topbar.keyNav(e)) return;
      return;
    }
    if (e.key === 'F10' || (e.key === 'Alt' && !e.ctrl)) {
      if (e.key === 'F10') this.topbar.openMenu(0);
      return;
    }
    if (!this.active && this.moony.key(e)) return;
    const win = this.active;
    if (win && !win.closed) {
      if (win.focused && win.focused.enabled && win.focused.onKey(e) === true) return;
      if (e.key === 'Tab' && !e.ctrl && !e.alt) { win.cycleFocus(e.shift); return; }
      if (win.onKey?.(e) === true) return;
      const item = MenuLayer.findShortcut(this.menusFor(win), comboOf(e));
      if (item?.action) { item.action(); return; }
      if (e.key === 'Enter') {
        let def: Button | null = null;
        win.body.walk((w) => { if (w instanceof Button && w.isDefault && w.visible && w.enabled) def = w; });
        if (def) { (def as Button).activate(); return; }
      }
    }
    // global shortcuts
    const combo = comboOf(e);
    if (combo === 'Ctrl+F4' && win) { this.close(win); return; }
    if (combo === 'Ctrl+`' || combo === 'Alt+`') { this.cycleWindows(); return; }
    if (combo === 'F9') { launch('launcher'); return; }
    if (combo === 'F1') {
      const topics: Record<string, string> = { files: 'files', write: 'write', basic: 'basic', 'basic-run': 'basic', draw: 'draw', calc: 'calc', browser: 'browser', navigator: 'browser', music: 'music', config: 'config', console: 'console', clock: 'clock' };
      const topic = win ? topics[win.app] ?? '' : 'desktop';
      launch('browser', { args: { url: topic ? `orbit:help/${topic}` : 'orbit:help' } });
      return;
    }
    const gi = MenuLayer.findShortcut(this.topbar.globalMenus(), combo);
    if (gi?.action) { gi.action(); return; }
    if (!win) this.desktop.key(e);
  }

  menusFor(win: Window): MenuDef[] {
    return win.menus;
  }

  cycleWindows() {
    const vis = this.windows.filter((w) => !w.modalFor && !w.popup);
    if (vis.length < 2 && !vis.some((w) => w.state === 'minimized')) return;
    const first = vis[0];
    if (first) this.activate(first);
  }

  text(s: string) {
    if (this.screensaver.poke()) return;
    if (this.menus.isOpen) return;
    const f = this.active?.focused;
    if (f && f.enabled) f.onText(s);
    else if (!this.active) this.desktop.typeSelect(s);
  }

  copy(cut: boolean): string | null {
    const f = this.active?.focused;
    return f ? f.onCopy(cut) : null;
  }

  paste(s: string) {
    const f = this.active?.focused;
    if (f && f.enabled) f.onPaste(s);
  }

  dropFiles(x: number, y: number, files: File[]) {
    const hit = this.windowAt(x, y);
    if (hit && hit.win.onDropFiles) {
      this.activate(hit.win);
      hit.win.onDropFiles(files, x - hit.win.x - BODY_X, y - hit.win.y - BODY_Y);
      return;
    }
    if (!hit) this.desktop.importFiles(files, x, y);
  }
}
