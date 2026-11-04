import type { Display } from './display';

export interface PointerEv {
  type: 'down' | 'up' | 'move' | 'wheel';
  x: number;
  y: number;
  /** 0 = left, 1 = middle, 2 = right */
  button: number;
  /** bitmask of pressed buttons (1 = left, 2 = right, 4 = middle) */
  buttons: number;
  /** click count for 'down' (1 = single, 2 = double, ...) */
  clicks: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  /** wheel lines (positive = down) */
  wheel: number;
  touch: boolean;
}

export interface KeyEv {
  key: string;
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  repeat: boolean;
}

export interface InputSink {
  pointer(e: PointerEv): void;
  key(e: KeyEv): boolean | void;
  text(s: string): void;
  copy(cut: boolean): string | null;
  paste(s: string): void;
  dropFiles(x: number, y: number, files: File[]): void;
}

/** Keys we keep away from the browser even without modifiers. */
const CAPTURED_KEYS = new Set([
  'Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown', 'Insert',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F12',
]);

export class Input {
  private display: Display;
  private kbd: HTMLTextAreaElement;
  sink: InputSink | null = null;
  mouseX = -1;
  mouseY = -1;
  buttons = 0;
  /** WM sets this when a text-accepting widget has focus (shows the on-screen keyboard on touch devices). */
  private wantText = false;
  private lastDown = { t: 0, x: 0, y: 0, button: -1, clicks: 0 };
  private composing = false;
  private longPress: number | null = null;
  private touchActive = false;

  constructor(display: Display, kbd: HTMLTextAreaElement) {
    this.display = display;
    this.kbd = kbd;
    const cv = display.canvas;

    cv.addEventListener('pointerdown', (e) => this.onPointer(e, 'down'));
    window.addEventListener('pointermove', (e) => this.onPointer(e, 'move'));
    window.addEventListener('pointerup', (e) => this.onPointer(e, 'up'));
    window.addEventListener('pointercancel', (e) => this.onPointer(e, 'up'));
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [x, y] = display.toLogical(e.clientX, e.clientY);
      let lines = e.deltaMode === 1 ? e.deltaY : e.deltaMode === 2 ? e.deltaY * 20 : e.deltaY / 40;
      lines = lines > 0 ? Math.max(1, Math.round(lines)) : lines < 0 ? Math.min(-1, Math.round(lines)) : 0;
      if (!lines) return;
      this.sink?.pointer({ ...this.base(e), type: 'wheel', x, y, button: 0, clicks: 0, wheel: lines });
    }, { passive: false });

    document.addEventListener('pointerleave', () => { this.mouseX = -100; });
    window.addEventListener('blur', () => { this.buttons = 0; });

    kbd.addEventListener('keydown', (e) => this.onKeyDown(e));
    kbd.addEventListener('compositionstart', () => { this.composing = true; });
    kbd.addEventListener('compositionend', () => { this.composing = false; this.flushText(); });
    kbd.addEventListener('input', () => { if (!this.composing) this.flushText(); });
    kbd.addEventListener('blur', () => {
      // keep keyboard focus unless a touch user dismissed the keyboard
      if (!this.touchActive) setTimeout(() => this.focusKbd(), 0);
    });

    document.addEventListener('copy', (e) => this.onClip(e, false));
    document.addEventListener('cut', (e) => this.onClip(e, true));
    document.addEventListener('paste', (e) => {
      const t = e.clipboardData?.getData('text/plain');
      e.preventDefault();
      if (t) this.sink?.paste(t.replace(/\r\n?/g, '\n'));
    });

    window.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      const [x, y] = display.toLogical(e.clientX, e.clientY);
      this.sink?.dropFiles(x, y, files);
    });

    this.focusKbd();
  }

  setWantText(v: boolean) {
    this.wantText = v;
    if (this.touchActive) {
      if (v) this.kbd.focus({ preventScroll: true });
      else this.kbd.blur();
    }
  }

  focusKbd() {
    if (this.touchActive && !this.wantText) return;
    if (document.activeElement !== this.kbd) this.kbd.focus({ preventScroll: true });
  }

  private base(e: MouseEvent) {
    return { buttons: this.buttons, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, touch: this.touchActive };
  }

  private onPointer(e: PointerEvent, type: 'down' | 'up' | 'move') {
    const [x, y] = this.display.toLogical(e.clientX, e.clientY);
    this.mouseX = x;
    this.mouseY = y;
    this.touchActive = e.pointerType === 'touch';
    const button = e.button < 0 ? 0 : e.button;
    if (type === 'down') {
      e.preventDefault();
      try { this.display.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.buttons = e.buttons;
      const now = performance.now();
      const L = this.lastDown;
      const near = Math.abs(L.x - x) <= 4 && Math.abs(L.y - y) <= 4;
      const clicks = now - L.t < 450 && near && L.button === button ? L.clicks + 1 : 1;
      this.lastDown = { t: now, x, y, button, clicks };
      this.sink?.pointer({ ...this.base(e), type, x, y, button, clicks, wheel: 0 });
      this.focusKbd();
      if (this.touchActive && button === 0) {
        this.clearLongPress();
        this.longPress = window.setTimeout(() => {
          // long press = right click on touch screens
          this.longPress = null;
          this.sink?.pointer({ ...this.base(e), type: 'up', x, y, button: 0, buttons: 0, clicks: 1, wheel: 0 });
          this.sink?.pointer({ ...this.base(e), type: 'down', x, y, button: 2, buttons: 2, clicks: 1, wheel: 0 });
          this.sink?.pointer({ ...this.base(e), type: 'up', x, y, button: 2, buttons: 0, clicks: 1, wheel: 0 });
          this.buttons = 0;
        }, 550);
      }
    } else if (type === 'up') {
      if (this.longPress === null && this.touchActive && this.buttons === 0) return;
      this.clearLongPress();
      this.buttons = e.buttons;
      this.sink?.pointer({ ...this.base(e), type, x, y, button, clicks: this.lastDown.clicks, wheel: 0 });
    } else {
      if (this.longPress !== null) {
        const L = this.lastDown;
        if (Math.abs(L.x - x) > 3 || Math.abs(L.y - y) > 3) this.clearLongPress();
      }
      this.buttons = e.buttons;
      this.sink?.pointer({ ...this.base(e), type, x, y, button: 0, clicks: 0, wheel: 0 });
    }
  }

  private clearLongPress() {
    if (this.longPress !== null) { clearTimeout(this.longPress); this.longPress = null; }
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.isComposing || this.composing) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const ev: KeyEv = { key: e.key, code: e.code, ctrl, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, repeat: e.repeat };
    // Let the browser turn Ctrl+C/X/V into clipboard events (they carry the real system clipboard).
    if (ctrl && !e.altKey && ['c', 'x', 'v', 'C', 'X', 'V'].includes(e.key)) return;
    const printable = e.key.length === 1 && !ctrl && !e.altKey;
    if (printable) return; // arrives through the 'input' event (handles dead keys / IME)
    if (CAPTURED_KEYS.has(e.key) || ctrl || e.altKey) e.preventDefault();
    this.sink?.key(ev);
  }

  private flushText() {
    const v = this.kbd.value;
    if (!v) return;
    this.kbd.value = '';
    // newline from mobile keyboards arrives here; translate to Enter key
    for (const part of v.split(/(\n)/)) {
      if (part === '\n') this.sink?.key({ key: 'Enter', code: 'Enter', ctrl: false, alt: false, shift: false, meta: false, repeat: false });
      else if (part) this.sink?.text(part);
    }
  }

  private onClip(e: ClipboardEvent, cut: boolean) {
    const t = this.sink?.copy(cut);
    if (t == null) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', t);
  }
}
