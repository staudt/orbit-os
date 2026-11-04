import { Gfx, Surface, PATTERNS } from '../core/gfx';
import { C } from '../core/palette';
import { SANS, MONO, wrapText, type BitmapFont, type TextStyle } from '../core/fonts';
import { T as TRANSPARENT } from '../core/icons';
import type { KeyEv } from '../core/input';
import { Widget, type WEvent } from './widget';
import { TH, buttonFace, fieldFrame, caret, softRect } from './theme';
import { os } from '../os';

// ---------------------------------------------------------------- Label

export class Label extends Widget {
  text: string;
  color: number = TH.text;
  font: BitmapFont = SANS;
  style: TextStyle = {};
  align: 'left' | 'center' | 'right' = 'left';
  valign: 'top' | 'middle' = 'middle';
  wrap = false;
  bg = -1;
  constructor(text = '', opts: Partial<Pick<Label, 'color' | 'font' | 'style' | 'align' | 'wrap' | 'bg' | 'valign'>> = {}) {
    super();
    this.text = text;
    Object.assign(this, opts);
  }
  setText(t: string) {
    if (t !== this.text) { this.text = t; this.invalidate(); }
  }
  /** Natural width of the text. */
  get textWidth() {
    return this.font.measure(this.text, this.style);
  }
  paint(g: Gfx) {
    if (this.bg >= 0) g.fillRect(0, 0, this.w, this.h, this.bg);
    const lh = this.font.lineHeight(this.style);
    const lines = this.wrap ? wrapText(this.font, this.text, this.w, this.style) : this.text.split('\n');
    const total = lines.length * lh;
    let y = this.valign === 'middle' ? Math.floor((this.h - total) / 2) + 1 : 0;
    for (const line of lines) {
      const t = this.wrap ? line : this.font.fit(line, this.w, this.style);
      const tw = this.font.measure(t, this.style);
      const x = this.align === 'center' ? Math.floor((this.w - tw) / 2) : this.align === 'right' ? this.w - tw : 0;
      this.font.draw(g, x, y, t, this.enabled ? this.color : TH.textDim, this.style);
      y += lh;
    }
  }
}

// ---------------------------------------------------------------- Image

export class ImageView extends Widget {
  img: Surface | null;
  scale = 1;
  constructor(img: Surface | null, scale = 1) {
    super();
    this.img = img;
    this.scale = scale;
  }
  paint(g: Gfx) {
    if (!this.img) return;
    const iw = this.img.w * this.scale, ih = this.img.h * this.scale;
    g.blit(this.img, Math.floor((this.w - iw) / 2), Math.floor((this.h - ih) / 2), TRANSPARENT, this.scale);
  }
}

// ---------------------------------------------------------------- Button

export type ButtonKind = 'push' | 'tool' | 'flat';

export class Button extends Widget {
  text: string;
  icon: Surface | null = null;
  kind: ButtonKind = 'push';
  isDefault = false;
  toggle = false;
  selected = false;
  onClick: (() => void) | null = null;
  private pressed = false;
  private inside = false;

  constructor(text: string, onClick?: () => void, opts: Partial<Pick<Button, 'icon' | 'kind' | 'isDefault' | 'toggle' | 'selected' | 'tooltip'>> = {}) {
    super();
    this.text = text;
    this.onClick = onClick ?? null;
    Object.assign(this, opts);
    this.focusable = this.kind === 'push';
    if (!this.w) this.w = this.naturalWidth();
  }

  naturalWidth() {
    const tw = this.text ? SANS.measure(this.text) : 0;
    const iw = this.icon ? this.icon.w : 0;
    const pad = this.kind === 'push' ? 16 : 6;
    return Math.max(this.kind === 'push' ? 48 : 0, tw + iw + (tw && iw ? 3 : 0) + pad);
  }

  onPointerDown(e: WEvent) {
    if (!this.enabled || e.button !== 0) return true;
    this.pressed = true;
    this.inside = true;
    this.invalidate();
    return true;
  }
  onPointerMove(e: WEvent) {
    const inside = e.lx >= 0 && e.ly >= 0 && e.lx < this.w && e.ly < this.h;
    if (inside !== this.inside) { this.inside = inside; this.invalidate(); }
  }
  onPointerUp(e: WEvent) {
    const fire = this.pressed && this.inside && e.button === 0;
    this.pressed = false;
    this.invalidate();
    if (fire) this.activate();
  }
  onKey(e: KeyEv) {
    if (e.key === ' ' || e.key === 'Enter') { this.activate(); return true; }
    return false;
  }
  activate() {
    if (!this.enabled) return;
    if (this.toggle) this.selected = !this.selected;
    os.sound?.sfx('click');
    this.onClick?.();
    this.invalidate();
  }

  paint(g: Gfx) {
    const down = (this.pressed && this.inside) || this.selected;
    const { w, h } = this;
    if (this.kind === 'push') {
      buttonFace(g, 0, 0, w, h, down, this.isDefault, this.enabled);
      if (this.hasFocus) g.dashedRect(3, 2, w - 6, h - 4, C.GREY, -1, 0, 1);
    } else if (this.kind === 'tool') {
      if (down) {
        g.fillRect(1, 1, w - 2, h - 2, this.selected ? C.ORANGE : TH.faceDown);
        softRect(g, 0, 0, w, h, TH.border);
      } else if (this.inside && this.pressed) {
        softRect(g, 0, 0, w, h, TH.border);
      }
    } else if (down) {
      g.fillRect(0, 0, w, h, TH.sel);
    }
    const tw = this.text ? SANS.measure(this.text) : 0;
    const iw = this.icon ? this.icon.w : 0;
    const total = tw + iw + (tw && iw ? 3 : 0);
    let x = Math.floor((w - total) / 2) + (down && this.kind === 'push' ? 1 : 0);
    const yo = down && this.kind === 'push' ? 1 : 0;
    if (this.icon) {
      if (this.enabled) g.blit(this.icon, x, Math.floor((h - this.icon.h) / 2) + yo, TRANSPARENT);
      else ghostBlit(g, this.icon, x, Math.floor((h - this.icon.h) / 2) + yo);
      x += iw + 3;
    }
    if (this.text) SANS.draw(g, x, Math.floor((h - 9) / 2) + 1 + yo, this.text, this.enabled ? TH.text : TH.textDim);
  }
}

/** Disabled-look blit: draws only every other pixel in grey. */
export function ghostBlit(g: Gfx, s: Surface, x: number, y: number) {
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const v = s.px[j * s.w + i];
    if (v !== TRANSPARENT && ((i + j) & 1) === 0) g.pset(x + i, y + j, C.GREY);
  }
}

// ---------------------------------------------------------------- Checkbox / Radio

export class Checkbox extends Widget {
  text: string;
  checked: boolean;
  radio = false;
  group: Checkbox[] | null = null;
  onChange: ((v: boolean) => void) | null = null;
  constructor(text: string, checked = false, onChange?: (v: boolean) => void, radio = false) {
    super();
    this.text = text;
    this.checked = checked;
    this.onChange = onChange ?? null;
    this.radio = radio;
    this.focusable = true;
    this.w = SANS.measure(text) + 14;
    this.h = 11;
  }
  onPointerDown(e: WEvent) {
    if (e.button === 0 && this.enabled) this.toggleValue();
    return true;
  }
  onKey(e: KeyEv) {
    if (e.key === ' ') { this.toggleValue(); return true; }
    return false;
  }
  toggleValue() {
    if (this.radio) {
      if (this.checked) return;
      for (const o of this.group ?? []) if (o !== this) o.checked = false;
      this.checked = true;
    } else this.checked = !this.checked;
    os.sound?.sfx('click');
    this.onChange?.(this.checked);
    this.invalidate();
  }
  paint(g: Gfx) {
    const y = Math.floor((this.h - 9) / 2);
    const col = this.enabled ? TH.border : C.GREY;
    if (this.radio) {
      g.ellipse(0, y, 9, 9, C.CREAM, true);
      g.ellipse(0, y, 9, 9, col);
      if (this.checked) g.ellipse(2, y + 2, 5, 5, C.PLUM, true);
    } else {
      g.fillRect(1, y + 1, 7, 7, C.CREAM);
      g.rect(0, y, 9, 9, col);
      if (this.checked) {
        // chunky check mark
        const pts = [[2, 4], [3, 5], [4, 6], [5, 5], [6, 4], [7, 3], [6, 2]];
        for (const [px, py] of pts) { g.pset(px, y + py, C.PLUM); g.pset(px, y + py - 1, C.PLUM); }
      }
    }
    SANS.draw(g, 13, y + 1, this.text, this.enabled ? TH.text : TH.textDim);
    if (this.hasFocus) g.dashedRect(11, y - 1, SANS.measure(this.text) + 4, 11, C.GREY, -1, 0, 1);
  }
}

export function radioGroup(items: { text: string; value: string }[], value: string, onChange: (v: string) => void): Checkbox[] {
  const group: Checkbox[] = [];
  for (const it of items) {
    const cb = new Checkbox(it.text, it.value === value, (on) => { if (on) onChange(it.value); }, true);
    cb.group = group;
    group.push(cb);
  }
  return group;
}

// ---------------------------------------------------------------- TextField

export class TextField extends Widget {
  text = '';
  caretPos = 0;
  anchor = 0;
  scrollX = 0;
  placeholder = '';
  font: BitmapFont = SANS;
  maxLength = 1000;
  readOnly = false;
  onChange: ((t: string) => void) | null = null;
  onSubmit: ((t: string) => void) | null = null;
  onCancel: (() => void) | null = null;
  /** key filter hook; return true to swallow */
  onKeyHook: ((e: KeyEv) => boolean) | null = null;
  private dragging = false;

  constructor(text = '', opts: Partial<Pick<TextField, 'placeholder' | 'font' | 'maxLength' | 'onChange' | 'onSubmit' | 'onCancel' | 'readOnly'>> = {}) {
    super();
    Object.assign(this, opts);
    this.text = text;
    this.caretPos = this.anchor = text.length;
    this.focusable = true;
    this.acceptsText = true;
    this.cursor = 'ibeam';
    this.h = 14;
  }

  setText(t: string, selectAll = false) {
    this.text = t.slice(0, this.maxLength);
    this.caretPos = this.text.length;
    this.anchor = selectAll ? 0 : this.caretPos;
    this.scrollX = 0;
    this.invalidate();
  }
  selectAll() {
    this.anchor = 0;
    this.caretPos = this.text.length;
    this.invalidate();
  }
  get selStart() { return Math.min(this.anchor, this.caretPos); }
  get selEnd() { return Math.max(this.anchor, this.caretPos); }
  get selectedText() { return this.text.slice(this.selStart, this.selEnd); }

  private replaceSel(s: string) {
    if (this.readOnly) return;
    const before = this.text.slice(0, this.selStart), after = this.text.slice(this.selEnd);
    s = s.replace(/\n/g, ' ');
    const room = this.maxLength - before.length - after.length;
    s = s.slice(0, Math.max(0, room));
    this.text = before + s + after;
    this.caretPos = this.anchor = before.length + s.length;
    this.changed();
  }
  private changed() {
    caret.reset();
    this.onChange?.(this.text);
    this.invalidate();
  }
  private move(pos: number, extend: boolean) {
    this.caretPos = Math.max(0, Math.min(this.text.length, pos));
    if (!extend) this.anchor = this.caretPos;
    caret.reset();
    this.invalidate();
  }
  private wordLeft(p: number) {
    while (p > 0 && /\s/.test(this.text[p - 1])) p--;
    while (p > 0 && !/\s/.test(this.text[p - 1])) p--;
    return p;
  }
  private wordRight(p: number) {
    while (p < this.text.length && !/\s/.test(this.text[p])) p++;
    while (p < this.text.length && /\s/.test(this.text[p])) p++;
    return p;
  }

  onKey(e: KeyEv) {
    if (this.onKeyHook?.(e)) return true;
    const ext = e.shift;
    switch (e.key) {
      case 'ArrowLeft': this.move(e.ctrl ? this.wordLeft(this.caretPos) : (!ext && this.selStart !== this.selEnd ? this.selStart : this.caretPos - 1), ext); return true;
      case 'ArrowRight': this.move(e.ctrl ? this.wordRight(this.caretPos) : (!ext && this.selStart !== this.selEnd ? this.selEnd : this.caretPos + 1), ext); return true;
      case 'Home': this.move(0, ext); return true;
      case 'End': this.move(this.text.length, ext); return true;
      case 'Backspace':
        if (this.selStart === this.selEnd) this.anchor = e.ctrl ? this.wordLeft(this.caretPos) : Math.max(0, this.caretPos - 1);
        this.replaceSel('');
        return true;
      case 'Delete':
        if (this.selStart === this.selEnd) this.anchor = e.ctrl ? this.wordRight(this.caretPos) : Math.min(this.text.length, this.caretPos + 1);
        this.replaceSel('');
        return true;
      case 'Enter':
        if (this.onSubmit) { this.onSubmit(this.text); return true; }
        return false;
      case 'Escape':
        if (this.onCancel) { this.onCancel(); return true; }
        return false;
    }
    if (e.ctrl && (e.key === 'a' || e.key === 'A')) { this.selectAll(); return true; }
    return false;
  }
  onText(s: string) {
    this.replaceSel(s);
  }
  onCopy(cut: boolean) {
    const t = this.selectedText;
    if (!t) return null;
    if (cut) this.replaceSel('');
    return t;
  }
  onPaste(s: string) {
    this.replaceSel(s);
  }
  onFocus() {
    caret.reset();
  }

  private posAt(lx: number) {
    return this.font.hitTest(this.text, lx - 3 + this.scrollX);
  }
  onPointerDown(e: WEvent) {
    this.focus();
    if (e.clicks === 2) {
      this.anchor = this.wordLeft(this.posAt(e.lx));
      this.caretPos = this.wordRight(this.anchor);
      while (this.caretPos > this.anchor && /\s/.test(this.text[this.caretPos - 1])) this.caretPos--;
      this.invalidate();
      return true;
    }
    if (e.clicks >= 3) { this.selectAll(); return true; }
    this.move(this.posAt(e.lx), e.shift);
    this.dragging = true;
    return true;
  }
  onPointerMove(e: WEvent) {
    if (this.dragging) this.move(this.posAt(e.lx), true);
  }
  onPointerUp() {
    this.dragging = false;
  }

  paint(g: Gfx) {
    const focused = this.hasFocus;
    fieldFrame(g, 0, 0, this.w, this.h, focused, this.readOnly ? C.TAN : TH.field);
    const inner = this.w - 6;
    const caretX = this.font.measure(this.text.slice(0, this.caretPos));
    if (caretX - this.scrollX > inner) this.scrollX = caretX - inner;
    if (caretX - this.scrollX < 0) this.scrollX = caretX;
    if (this.scrollX > 0 && this.font.measure(this.text) - this.scrollX < inner) this.scrollX = Math.max(0, this.font.measure(this.text) - inner);
    g.push(2, 1, this.w - 4, this.h - 2);
    const ty = Math.floor((this.h - 2 - 9) / 2) + 1;
    const x0 = 1 - this.scrollX;
    if (!this.text && this.placeholder && !focused) {
      this.font.draw(g, x0, ty, this.placeholder, TH.textDim);
    }
    if (focused && this.selStart !== this.selEnd) {
      const a = this.font.measure(this.text.slice(0, this.selStart));
      const b = this.font.measure(this.text.slice(0, this.selEnd));
      g.fillRect(x0 + a, ty - 1, b - a, 10, TH.sel);
    }
    this.font.draw(g, x0, ty, this.text, this.enabled ? TH.text : TH.textDim);
    if (focused && caret.on() && !this.readOnly) g.vline(x0 + caretX - 1, ty - 1, ty + 8, C.PLUM);
    g.pop();
  }
}

// ---------------------------------------------------------------- ScrollBar

export class ScrollBar extends Widget {
  vertical: boolean;
  value = 0;
  /** total content size */
  total = 1;
  /** visible size */
  page = 1;
  step = 10;
  onChange: ((v: number) => void) | null = null;
  private drag: { start: number; value: number } | null = null;
  private repeat = 0;

  constructor(vertical = true, onChange?: (v: number) => void) {
    super();
    this.vertical = vertical;
    this.onChange = onChange ?? null;
    if (vertical) this.w = 10; else this.h = 10;
  }
  get max() { return Math.max(0, this.total - this.page); }
  set(total: number, page: number, value = this.value) {
    this.total = Math.max(1, total);
    this.page = Math.max(1, page);
    this.value = Math.max(0, Math.min(this.max, value));
    this.invalidate();
  }
  setValue(v: number) {
    v = Math.max(0, Math.min(this.max, Math.round(v)));
    if (v !== this.value) {
      this.value = v;
      this.onChange?.(v);
      this.invalidate();
    }
  }
  private get len() { return this.vertical ? this.h : this.w; }
  private get track() { return Math.max(0, this.len - 20); }
  private thumb(): [number, number] {
    const t = this.track;
    const size = this.max <= 0 ? t : Math.max(8, Math.floor((t * this.page) / this.total));
    const pos = this.max <= 0 ? 0 : Math.floor(((t - size) * this.value) / this.max);
    return [10 + pos, size];
  }
  onPointerDown(e: WEvent) {
    const p = this.vertical ? e.ly : e.lx;
    const [tp, ts] = this.thumb();
    const act = () => {
      if (p < 10) this.setValue(this.value - this.step);
      else if (p >= this.len - 10) this.setValue(this.value + this.step);
      else if (p < tp) this.setValue(this.value - this.page);
      else if (p >= tp + ts) this.setValue(this.value + this.page);
    };
    if (p >= tp && p < tp + ts && p >= 10 && p < this.len - 10) {
      this.drag = { start: p, value: this.value };
    } else {
      act();
      clearInterval(this.repeat);
      let n = 0;
      this.repeat = window.setInterval(() => { if (++n > 4) act(); }, 60);
    }
    return true;
  }
  onPointerMove(e: WEvent) {
    if (!this.drag) return;
    const p = this.vertical ? e.ly : e.lx;
    const [, ts] = this.thumb();
    const room = this.track - ts;
    if (room > 0) this.setValue(this.drag.value + ((p - this.drag.start) * this.max) / room);
  }
  onPointerUp() {
    this.drag = null;
    clearInterval(this.repeat);
  }
  paint(g: Gfx) {
    const { w, h } = this;
    g.fillPattern(0, 0, w, h, PATTERNS.d50, C.TAN, C.CREAM);
    g.rect(0, 0, w, h, TH.border);
    const arrow = (x: number, y: number, dir: 'u' | 'd' | 'l' | 'r') => {
      g.fillRect(x, y, 10, 10, C.CREAM);
      g.rect(x, y, 10, 10, TH.border);
      const cx = x + 4, cy = y + 4;
      for (let i = 0; i < 3; i++) {
        if (dir === 'u') g.hline(cx - i, cx + i + 1 - 1, cy - 1 + i, TH.border);
        if (dir === 'd') g.hline(cx - i, cx + i, cy + 2 - i, TH.border);
        if (dir === 'l') g.vline(cx - 1 + i, cy - i, cy + i, TH.border);
        if (dir === 'r') g.vline(cx + 2 - i, cy - i, cy + i, TH.border);
      }
    };
    const [tp, ts] = this.thumb();
    if (this.vertical) {
      arrow(0, 0, 'u');
      arrow(0, h - 10, 'd');
      if (this.max > 0) {
        g.fillRect(1, tp, w - 2, ts, C.CREAM);
        g.rect(0, tp, w, ts, TH.border);
        if (ts > 8) for (let i = -1; i <= 1; i++) g.hline(3, w - 4, tp + Math.floor(ts / 2) + i * 2, C.GREY);
      }
    } else {
      arrow(0, 0, 'l');
      arrow(w - 10, 0, 'r');
      if (this.max > 0) {
        g.fillRect(tp, 1, ts, h - 2, C.CREAM);
        g.rect(tp, 0, ts, h, TH.border);
        if (ts > 8) for (let i = -1; i <= 1; i++) g.vline(tp + Math.floor(ts / 2) + i * 2, 3, h - 4, C.GREY);
      }
    }
  }
}

// ---------------------------------------------------------------- Slider

export class Slider extends Widget {
  value: number;
  onChange: ((v: number) => void) | null;
  private dragging = false;
  constructor(value: number, onChange?: (v: number) => void) {
    super();
    this.value = value;
    this.onChange = onChange ?? null;
    this.h = 12;
    this.focusable = true;
  }
  private setFrom(lx: number) {
    const v = Math.max(0, Math.min(1, (lx - 3) / Math.max(1, this.w - 7)));
    this.value = Math.round(v * 20) / 20;
    this.onChange?.(this.value);
    this.invalidate();
  }
  onPointerDown(e: WEvent) { this.dragging = true; this.setFrom(e.lx); return true; }
  onPointerMove(e: WEvent) { if (this.dragging) this.setFrom(e.lx); }
  onPointerUp() { this.dragging = false; }
  onKey(e: KeyEv) {
    const d = e.key === 'ArrowLeft' ? -0.05 : e.key === 'ArrowRight' ? 0.05 : 0;
    if (!d) return false;
    this.value = Math.max(0, Math.min(1, Math.round((this.value + d) * 20) / 20));
    this.onChange?.(this.value);
    this.invalidate();
    return true;
  }
  paint(g: Gfx) {
    const cy = Math.floor(this.h / 2);
    g.fillRect(3, cy - 1, this.w - 6, 3, C.TAN);
    g.rect(2, cy - 2, this.w - 4, 5, TH.border);
    const kx = 3 + Math.round(this.value * (this.w - 7));
    g.fillRect(3, cy - 1, kx - 3, 3, C.ORANGE);
    g.fillRect(kx - 2, 0, 5, this.h, C.CREAM);
    softRect(g, kx - 3, 0, 7, this.h, TH.border);
    if (this.hasFocus) g.hline(kx - 1, kx + 1, this.h - 3, C.PLUM);
  }
}

// ---------------------------------------------------------------- GroupBox

export class GroupBox extends Widget {
  title: string;
  constructor(title: string) {
    super();
    this.title = title;
  }
  paint(g: Gfx) {
    g.rect(0, 4, this.w, this.h - 4, C.TAN);
    if (this.title) {
      const tw = SANS.measure(this.title, { bold: true });
      g.fillRect(5, 0, tw + 6, 10, TH.winBg);
      SANS.draw(g, 8, 0, this.title, C.PLUM, { bold: true });
    }
    this.paintChildren(g);
  }
}

// ---------------------------------------------------------------- Meter

export class Meter extends Widget {
  value = 0; // 0..1
  segments = 0; // 0 = continuous
  paint(g: Gfx) {
    g.rect(0, 0, this.w, this.h, TH.border);
    g.fillRect(1, 1, this.w - 2, this.h - 2, C.CREAM);
    const fill = Math.round((this.w - 2) * Math.max(0, Math.min(1, this.value)));
    if (this.segments > 0) {
      const sw = (this.w - 2) / this.segments;
      for (let i = 0; i < this.segments; i++) {
        if ((i + 0.5) * sw > fill) break;
        g.fillRect(1 + Math.round(i * sw), 1, Math.max(1, Math.round(sw) - 1), this.h - 2, C.PLUM);
      }
    } else g.fillRect(1, 1, fill, this.h - 2, C.ORANGE);
  }
}

export { MONO, SANS };
