import { Surface } from './gfx';
import { paletteLUT } from './palette';

export const TARGET_H = 480;
/** Smallest desktop (in Orbit pixels) that is still comfortable to use; smaller windows get smaller pixels. */
export const MIN_W = 400;
export const MIN_H = 300;
/** Phones accept a slightly narrower desktop so things can be bigger. */
export const PHONE_MIN_W = 280;
export const PHONE_MIN_H = 240;

export interface ScreenLayout {
  /** integer device pixels per logical pixel */
  scale: number;
  /** logical framebuffer size */
  w: number;
  h: number;
  /** device-pixel size of the viewport */
  devW: number;
  devH: number;
  /** canvas CSS box (in CSS px) */
  cssW: number;
  cssH: number;
  cssLeft: number;
  cssTop: number;
}

/** The physical display the window is on (CSS px), and whether it's a phone. */
export interface MonitorInfo {
  w: number;
  h: number;
  phone: boolean;
}

/**
 * The preferred pixel size for a monitor. It depends on the monitor, not the window,
 * so resizing the browser changes how much desktop you get, not how big the pixels are.
 * - Desktops: a full-screen window is about 480 Orbit pixels tall.
 * - Phones: one third bigger pixels than that rule gives (things stay readable by touch).
 */
export function monitorScale(mon: MonitorInfo, dpr: number): number {
  const long = Math.max(mon.w, mon.h) * dpr, short = Math.min(mon.w, mon.h) * dpr;
  if (!mon.phone) return Math.max(1, Math.round((mon.h * dpr) / TARGET_H));
  // the old phone rule (portrait, ~480 tall but at least 320 wide), then 1/3 bigger
  let s = Math.max(1, Math.round(long / TARGET_H));
  while (s > 1 && short / s < 320) s--;
  return Math.max(1, Math.round((s * 4) / 3));
}

/** Pick an integer scale: the monitor's preferred size, stepped down until the desktop is usable. */
export function autoScale(devW: number, devH: number, mon?: MonitorInfo, dpr = 1): number {
  const monitor = mon ?? { w: devW / dpr, h: devH / dpr, phone: false };
  let s = monitorScale(monitor, dpr);
  const minW = monitor.phone ? PHONE_MIN_W : MIN_W, minH = monitor.phone ? PHONE_MIN_H : MIN_H;
  while (s > 1 && (devW / s < minW || devH / s < minH)) s--;
  return s;
}

/**
 * Pure layout math: the logical screen always uses square, integer-sized pixels.
 * The desktop changes shape with the viewport instead of stretching.
 */
export function computeLayout(cssW: number, cssH: number, dpr: number, scaleOverride = 0, mon?: MonitorInfo): ScreenLayout {
  const devW = Math.max(1, Math.round(cssW * dpr));
  const devH = Math.max(1, Math.round(cssH * dpr));
  let scale = scaleOverride > 0 ? scaleOverride : autoScale(devW, devH, mon, dpr);
  // never let an override produce a uselessly tiny screen
  while (scale > 1 && (devW / scale < 200 || devH / scale < 150)) scale--;
  const w = Math.floor(devW / scale);
  const h = Math.floor(devH / scale);
  const leftDev = Math.floor((devW - w * scale) / 2);
  const topDev = Math.floor((devH - h * scale) / 2);
  return {
    scale, w, h, devW, devH,
    cssW: (w * scale) / dpr,
    cssH: (h * scale) / dpr,
    cssLeft: leftDev / dpr,
    cssTop: topDev / dpr,
  };
}

/** Describe the current monitor from the browser (CSS px). */
export function currentMonitor(): MonitorInfo {
  const rawW = window.screen?.width || window.innerWidth, rawH = window.screen?.height || window.innerHeight;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  // a touch device whose short side is phone-sized; tablets behave like desktops
  const phone = coarse && Math.min(rawW, rawH) < 600;
  // never smaller than the window itself (some browsers under-report the screen)
  const sw = Math.max(rawW, phone ? 0 : window.innerWidth);
  const sh = Math.max(rawH, phone ? 0 : window.innerHeight);
  // use the landscape height on desktops (monitors are normally landscape)
  return phone ? { w: sw, h: sh, phone } : { w: Math.max(sw, sh), h: Math.min(sw, sh), phone };
}

export interface CursorImage {
  w: number;
  h: number;
  hx: number;
  hy: number;
  /** palette index per pixel, -1 = transparent */
  px: Int8Array;
}

export class Display {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  layout!: ScreenLayout;
  fb!: Surface;
  private img!: ImageData;
  private u32!: Uint32Array;
  private lut = paletteLUT();
  scaleOverride = 0;

  // cursor overlay state
  cursor: CursorImage | null = null;
  cursorX = -100;
  cursorY = -100;
  cursorVisible = true;
  private saved: Uint32Array = new Uint32Array(0);
  private savedRect = { x: 0, y: 0, w: 0, h: 0, valid: false };

  onResize: (() => void) | null = null;
  /** called after any layout change (size or scale) */
  onResizeHooks = new Set<() => void>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not available');
    this.ctx = ctx;
    this.relayout();
    const ro = new ResizeObserver(() => this.relayout());
    ro.observe(document.documentElement);
    window.addEventListener('resize', () => this.relayout());
    this.watchDpr();
  }

  private watchDpr() {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const fn = () => {
      mq.removeEventListener('change', fn);
      this.relayout();
      this.watchDpr();
    };
    mq.addEventListener('change', fn);
  }

  setScaleOverride(s: number) {
    this.scaleOverride = s;
    this.relayout();
  }

  relayout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const L = computeLayout(vw, vh, window.devicePixelRatio || 1, this.scaleOverride, currentMonitor());
    const prev = this.layout;
    const st = this.canvas.style;
    st.position = 'absolute';
    st.width = `${L.cssW}px`;
    st.height = `${L.cssH}px`;
    st.left = `${L.cssLeft}px`;
    st.top = `${L.cssTop}px`;
    this.layout = L;
    if (prev && prev.w === L.w && prev.h === L.h) {
      if (prev.scale !== L.scale) for (const h of this.onResizeHooks) h();
      return;
    }
    this.canvas.width = L.w;
    this.canvas.height = L.h;
    this.ctx.imageSmoothingEnabled = false;
    this.fb = new Surface(L.w, L.h);
    this.img = this.ctx.createImageData(L.w, L.h);
    this.u32 = new Uint32Array(this.img.data.buffer);
    this.savedRect.valid = false;
    this.onResize?.();
    for (const h of this.onResizeHooks) h();
  }

  /** Convert client (CSS) coordinates to logical pixel coordinates. */
  toLogical(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * this.layout.w);
    const y = Math.floor(((clientY - r.top) / r.height) * this.layout.h);
    return [x, y];
  }

  /** Full present: palette-convert the framebuffer, then overlay the cursor. */
  present() {
    const px = this.fb.px, u32 = this.u32, lut = this.lut;
    for (let i = 0, n = px.length; i < n; i++) u32[i] = lut[px[i] & 15];
    this.savedRect.valid = false;
    this.drawCursor();
    this.ctx.putImageData(this.img, 0, 0);
  }

  /** Cursor-only update: restore under-cursor pixels, draw at the new spot, push the two small rects. */
  presentCursor() {
    const old = { ...this.savedRect };
    this.restoreUnderCursor();
    this.drawCursor();
    const n = this.savedRect;
    const x0 = Math.min(old.valid ? old.x : n.x, n.x), y0 = Math.min(old.valid ? old.y : n.y, n.y);
    const x1 = Math.max(old.valid ? old.x + old.w : n.x + n.w, n.x + n.w);
    const y1 = Math.max(old.valid ? old.y + old.h : n.y + n.h, n.y + n.h);
    if (x1 > x0 && y1 > y0) this.ctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }

  private restoreUnderCursor() {
    const r = this.savedRect;
    if (!r.valid) return;
    const W = this.layout.w;
    for (let j = 0; j < r.h; j++) {
      for (let i = 0; i < r.w; i++) this.u32[(r.y + j) * W + r.x + i] = this.saved[j * r.w + i];
    }
    r.valid = false;
  }

  private drawCursor() {
    const c = this.cursor;
    if (!c || !this.cursorVisible) return;
    const W = this.layout.w, H = this.layout.h;
    const x0 = Math.max(0, this.cursorX - c.hx), y0 = Math.max(0, this.cursorY - c.hy);
    const x1 = Math.min(W, this.cursorX - c.hx + c.w), y1 = Math.min(H, this.cursorY - c.hy + c.h);
    if (x1 <= x0 || y1 <= y0) return;
    const rw = x1 - x0, rh = y1 - y0;
    if (this.saved.length < rw * rh) this.saved = new Uint32Array(rw * rh);
    for (let j = 0; j < rh; j++) {
      for (let i = 0; i < rw; i++) {
        const di = (y0 + j) * W + x0 + i;
        this.saved[j * rw + i] = this.u32[di];
        const v = c.px[(y0 + j - (this.cursorY - c.hy)) * c.w + (x0 + i - (this.cursorX - c.hx))];
        if (v >= 0) this.u32[di] = this.lut[v];
      }
    }
    this.savedRect = { x: x0, y: y0, w: rw, h: rh, valid: true };
  }
}
