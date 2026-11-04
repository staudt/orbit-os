import { registerApp } from '../registry';
import { Window } from '../../wm/window';
import { Widget } from '../../ui/widget';
import { Button } from '../../ui/widgets';
import type { Gfx } from '../../core/gfx';
import { C } from '../../core/palette';
import { SANS } from '../../core/fonts';
import { invalidate, os } from '../../os';
import { drawDigit } from '../../core/sevenseg';

type Mode = 'clock' | 'analog' | 'stopwatch' | 'timer';

/** The LED display: big digits, small seconds, and a status line. */
class LedDisplay extends Widget {
  big = '12:00';
  small = '00';
  top = '';
  bottom = '';
  colon = true;
  flash = false;
  paint(g: Gfx) {
    const { w, h } = this;
    g.fillRect(0, 0, w, h, C.INK);
    g.rect(0, 0, w, h, C.PLUM);
    g.rect(1, 1, w - 2, h - 2, C.PLUM_DARK);
    const on = this.flash ? C.CRIMSON : C.ORANGE, off = C.PLUM_DARK;
    // size digits to the box: 4 big digits + colon + 2 small digits
    const dh = Math.max(14, Math.min(h - 32, Math.floor((w - 24) / 4.1 * 1.7)));
    const dw = Math.round(dh * 0.56), t = Math.max(2, Math.round(dh / 9));
    const sdh = Math.round(dh * 0.5), sdw = Math.round(sdh * 0.6), st = Math.max(2, t - 1);
    const gap = Math.max(3, Math.round(dw * 0.3));
    const total = dw * 4 + gap * 3 + gap * 2 + t + gap * 2 + sdw * 2 + gap;
    let x = Math.max(4, Math.floor((w - total) / 2));
    const y = 4 + Math.max(0, Math.floor((h - 16 - dh) / 2));
    const chars = this.big.padStart(5, ' ');
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === ':') {
        const col = this.colon ? on : off;
        g.fillRect(x + gap, y + Math.round(dh * 0.28), t, t, col);
        g.fillRect(x + gap, y + Math.round(dh * 0.68), t, t, col);
        x += gap * 2 + t;
        continue;
      }
      drawDigit(g, x, y, dw, dh, t, ch, on, off);
      x += dw + gap;
    }
    x += gap;
    for (let i = 0; i < 2; i++) {
      drawDigit(g, x, y + dh - sdh, sdw, sdh, st, this.small[i] ?? ' ', on, off);
      x += sdw + Math.max(2, gap - 1);
    }
    if (this.top) SANS.draw(g, 6, 4, this.top, C.ORANGE);
    if (this.bottom) {
      const bw = SANS.measure(this.bottom);
      SANS.draw(g, Math.floor((w - bw) / 2), h - 12, this.bottom, C.TAN);
    }
  }
}

/** A classic analog face: cream dial, tick marks, three hands. */
class AnalogFace extends Widget {
  paint(g: Gfx) {
    const { w, h } = this;
    g.fillRect(0, 0, w, h, C.CREAM);
    const r = Math.max(10, Math.floor(Math.min(w, h - 12) / 2) - 3);
    const cx = Math.floor(w / 2), cy = r + 3;
    g.ellipse(cx - r, cy - r, r * 2 + 1, r * 2 + 1, C.PALE, true);
    g.ellipse(cx - r, cy - r, r * 2 + 1, r * 2 + 1, C.PLUM);
    g.ellipse(cx - r + 1, cy - r + 1, r * 2 - 1, r * 2 - 1, C.PLUM);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const major = i % 5 === 0;
      const r1 = r - (major ? Math.max(4, r * 0.14) : 2) - 2, r2 = r - 3;
      g.line(Math.round(cx + Math.sin(a) * r1), Math.round(cy - Math.cos(a) * r1), Math.round(cx + Math.sin(a) * r2), Math.round(cy - Math.cos(a) * r2), major ? C.INK : C.GREY);
    }
    if (r > 30) {
      for (const [n, a] of [['12', 0], ['3', 0.25], ['6', 0.5], ['9', 0.75]] as [string, number][]) {
        const rr = r * 0.7, ang = a * Math.PI * 2;
        const tw = SANS.measure(n, { bold: true });
        SANS.draw(g, Math.round(cx + Math.sin(ang) * rr - tw / 2), Math.round(cy - Math.cos(ang) * rr - 4), n, C.PLUM, { bold: true });
      }
    }
    const now = new Date();
    const sec = now.getSeconds(), min = now.getMinutes() + sec / 60, hr = (now.getHours() % 12) + min / 60;
    const hand = (frac: number, len: number, col: number, thick: number) => {
      const a = frac * Math.PI * 2;
      const x = cx + Math.sin(a) * len, y = cy - Math.cos(a) * len;
      for (let t = -Math.floor(thick / 2); t <= Math.floor(thick / 2); t++) {
        const ox = Math.round(Math.cos(a) * t), oy = Math.round(Math.sin(a) * t);
        g.line(cx + ox, cy + oy, Math.round(x) + ox, Math.round(y) + oy, col);
      }
    };
    hand(hr / 12, r * 0.5, C.PLUM_DARK, r > 40 ? 3 : 2);
    hand(min / 60, r * 0.76, C.INK, r > 40 ? 2 : 1);
    hand(sec / 60, r * 0.84, C.CRIMSON, 1);
    g.fillRect(cx - 1, cy - 1, 3, 3, C.CRIMSON);
    const date = `${DAYS[now.getDay()].slice(0, 3)} ${MONTHS[now.getMonth()]} ${now.getDate()}`;
    const dw = SANS.measure(date);
    SANS.draw(g, Math.floor((w - dw) / 2), h - 11, date, C.PLUM);
  }
}

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const p2 = (n: number) => String(Math.floor(n)).padStart(2, '0');

let instance: ClockWindow | null = null;

class ClockWindow {
  win: Window;
  led: LedDisplay;
  face: AnalogFace;
  mode: Mode = 'clock';
  private timer = 0;
  // stopwatch
  private swStart = 0;
  private swAcc = 0;
  private swRunning = false;
  // countdown
  private cdSet = 5 * 60;
  private cdEnd = 0;
  private cdLeft = 5 * 60;
  private cdRunning = false;
  private ringing = 0;
  private modeBtns: Button[] = [];
  private actBtns: Button[] = [];

  constructor() {
    this.win = new Window({ title: 'Clock', icon: 'clock', app: 'clock', w: 236, h: 112, minW: 200, minH: 90 });
    const b = this.win.body;
    this.led = b.add(new LedDisplay());
    this.face = b.add(new AnalogFace());
    const modes: [Mode, string][] = [['clock', 'Digital'], ['analog', 'Analog'], ['stopwatch', 'Stopwatch'], ['timer', 'Timer']];
    this.modeBtns = modes.map(([m, label]) => b.add(new Button(label, () => this.setMode(m), { kind: 'tool', toggle: false })));
    this.actBtns = [0, 1, 2].map(() => b.add(new Button('', () => {})));
    b.layoutFn = (p) => {
      this.led.setBounds(4, 4, p.w - 8, p.h - 48);
      this.face.setBounds(4, 4, p.w - 8, p.h - 48);
      const bw = Math.floor((p.w - 8 - 6) / 4);
      this.modeBtns.forEach((mb, i) => mb.setBounds(4 + i * (bw + 2), p.h - 40, bw, 16));
      const aw = Math.floor((p.w - 8 - 8) / 3);
      this.actBtns.forEach((ab, i) => ab.setBounds(4 + i * (aw + 4), p.h - 20, aw, 16));
    };
    this.win.onKey = (e) => {
      if (e.key === ' ') { this.actBtns[0].activate(); return true; }
      return false;
    };
    this.win.onClosed = () => { clearInterval(this.timer); instance = null; };
    this.setMode('clock');
    this.timer = window.setInterval(() => this.tick(), 100);
    os.wm.open(this.win);
    this.tick();
  }

  private setButtons(labels: [string, () => void][]) {
    this.actBtns.forEach((b, i) => {
      const it = labels[i];
      b.visible = !!it;
      if (it) { b.text = it[0]; b.onClick = it[1]; }
    });
    invalidate();
  }

  setMode(m: Mode) {
    const wasAnalog = this.mode === 'analog';
    this.mode = m;
    this.modeBtns.forEach((b, i) => { b.selected = ['clock', 'analog', 'stopwatch', 'timer'][i] === m; });
    this.led.visible = m !== 'analog';
    this.face.visible = m === 'analog';
    // the round face wants a taller window
    if (this.win.state === 'normal' && (m === 'analog') !== wasAnalog) {
      if (m === 'analog') this.win.setBodySize(Math.max(this.win.bodyW, 236), Math.max(this.win.bodyH, 230));
      else this.win.setBodySize(this.win.bodyW, 112);
    }
    this.ringing = 0;
    this.led.flash = false;
    if (m === 'analog') {
      this.setButtons([]);
    } else if (m === 'clock') {
      this.setButtons([[os.settings.get('clock24') ? '12-hour' : '24-hour', () => { os.settings.set('clock24', !os.settings.get('clock24')); this.setMode('clock'); }]]);
    } else if (m === 'stopwatch') {
      this.setButtons([
        [this.swRunning ? 'Stop' : 'Start', () => {
          if (this.swRunning) { this.swAcc += performance.now() - this.swStart; this.swRunning = false; }
          else { this.swStart = performance.now(); this.swRunning = true; }
          this.setMode('stopwatch');
        }],
        ['Reset', () => { this.swAcc = 0; this.swStart = performance.now(); if (!this.swRunning) this.swAcc = 0; this.setMode('stopwatch'); }],
      ]);
    } else {
      this.setButtons([
        [this.cdRunning ? 'Pause' : 'Start', () => {
          if (this.cdRunning) { this.cdLeft = Math.max(0, (this.cdEnd - performance.now()) / 1000); this.cdRunning = false; }
          else { if (this.cdLeft <= 0) this.cdLeft = this.cdSet; this.cdEnd = performance.now() + this.cdLeft * 1000; this.cdRunning = true; }
          this.setMode('timer');
        }],
        ['+1 min', () => { if (!this.cdRunning) { this.cdSet = Math.min(99 * 60, Math.ceil(this.cdLeft / 60) * 60 + 60); this.cdLeft = this.cdSet; } else this.cdEnd += 60_000; this.tick(); }],
        ['Reset', () => { this.cdRunning = false; this.cdSet = 5 * 60; this.cdLeft = this.cdSet; this.ringing = 0; this.setMode('timer'); }],
      ]);
    }
    this.tick();
  }

  private tick() {
    const L = this.led;
    const now = new Date();
    if (this.mode === 'analog') { invalidate(); return; }
    if (this.mode === 'clock') {
      const h24 = os.settings.get('clock24');
      const h = h24 ? now.getHours() : now.getHours() % 12 || 12;
      L.big = `${h24 ? p2(h) : String(h)}:${p2(now.getMinutes())}`;
      L.small = p2(now.getSeconds());
      L.colon = now.getMilliseconds() < 500;
      L.top = h24 ? '' : now.getHours() < 12 ? 'AM' : 'PM';
      L.bottom = `${DAYS[now.getDay()]}  ${MONTHS[now.getMonth()]} ${now.getDate()}  ${now.getFullYear()}`;
    } else if (this.mode === 'stopwatch') {
      const ms = this.swAcc + (this.swRunning ? performance.now() - this.swStart : 0);
      const s = ms / 1000;
      L.big = s >= 3600 ? `${p2(s / 3600)}:${p2((s / 60) % 60)}` : `${p2(s / 60)}:${p2(s % 60)}`;
      L.small = s >= 3600 ? p2(s % 60) : p2((ms / 10) % 100);
      L.colon = true;
      L.top = this.swRunning ? 'RUN' : ms ? 'STOP' : '';
      L.bottom = s >= 3600 ? 'HOURS : MINUTES  SECONDS' : 'MINUTES : SECONDS  1/100';
    } else {
      let left = this.cdLeft;
      if (this.cdRunning) {
        left = Math.max(0, (this.cdEnd - performance.now()) / 1000);
        if (left <= 0) {
          this.cdRunning = false;
          this.cdLeft = 0;
          this.ringing = 8;
          this.setMode('timer');
          this.ringing = 8;
        }
      }
      const s = Math.ceil(left);
      L.big = `${p2(s / 60)}:${p2(s % 60)}`;
      L.small = '  ';
      L.colon = !this.cdRunning || now.getMilliseconds() < 500;
      L.top = this.cdRunning ? 'TIMER' : left <= 0 ? 'DONE' : 'SET';
      L.bottom = this.ringing ? "TIME'S UP!" : 'MINUTES : SECONDS';
      if (this.ringing && now.getMilliseconds() < 100) {
        os.sound.sfx('alert');
        this.ringing--;
      }
      L.flash = this.ringing > 0 && now.getMilliseconds() < 500;
    }
    invalidate();
  }
}

registerApp({
  id: 'clock',
  name: 'Clock',
  icon: 'clock',
  description: 'A digital clock with a stopwatch and a countdown timer.',
  launch: () => {
    if (instance && !instance.win.closed) { os.wm.activate(instance.win); return; }
    instance = new ClockWindow();
  },
});
