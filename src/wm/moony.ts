import type { Gfx, Rect } from '../core/gfx';
import { lerp } from '../core/gfx';
import { C } from '../core/palette';
import { SANS, LINE_H, wrapText } from '../core/fonts';
import type { KeyEv, PointerEv } from '../core/input';
import type { MenuItem } from '../ui/menu';
import { ease } from '../core/scheduler';
import { buttonFace, dropShadow, softBox } from '../ui/theme';
import { launch, openPath } from '../apps/registry';
import { TITLE_H } from './window';
import { TOPBAR_H } from './topbar';
import { TASKBAR_H } from './taskbar';
import { MOON_R, TourNav, balloonWidth, layoutBalloon, placeMoon, type BalloonPlace, type Pt } from './moonylayout';
import { TIPS } from './moonytips';
import { drawMoon } from '../core/moonart';
import { invalidate, os } from '../os';

/**
 * Moony, the little moon that welcomes new users with a tour of Orbit and,
 * once parked on the desktop, hands out tips when clicked.
 */

type State = 'off' | 'parked' | 'tour' | 'tip' | 'leaving';

interface Btn {
  label: string;
  act: () => void;
  isDefault?: boolean;
}

interface Balloon {
  header: string;
  text: string;
  buttons: Btn[];
  onClose: () => void;
  /** what the tour is pointing at (highlighted) */
  target: Rect | null;
  // layout
  place?: BalloonPlace;
  lines?: string[];
  btnRects?: Rect[];
  closeRect?: Rect;
}

interface Step {
  target: () => Rect | null;
  /** builds the balloon text and any extra buttons for the current state of the screen */
  content: (target: Rect | null) => { text: string; extra?: Btn[] };
}

interface Flight {
  from: Pt;
  to: Pt;
  r0: number;
  r1: number;
  start: number;
  dur: number;
  arc: number;
  /** unit normal of the path, pointing toward the middle of the screen (the arc bows that way) */
  nx: number;
  ny: number;
  done?: () => void;
}

const README = '/Documents/README.TXT';
const PAD = 6;
const TEXT_TOP = 15;
const BTN_H = 16;
const BTN_GAP = 5;
/** one full (purely decorative) waxing and waning cycle */
const PHASE_MS = 120_000;
const HIDDEN_PHASE = 0.4;
/** flights move in steps at roughly the idle animation's frame rate, not smoothly */
const FLIGHT_STEP_MS = 130;
/** how far the pointer must move before a press on Moony becomes a drag */
const DRAG_SLOP = 3;

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
const within = (x: number, y: number, r: Rect) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

export class Moony {
  state: State = 'off';
  private pos: Pt = { x: 0, y: 0 };
  private radius = MOON_R;
  private flight: Flight | null = null;
  private balloon: Balloon | null = null;
  private nav = new TourNav(0);
  private steps: Step[] = this.buildSteps();
  private pressed: number | 'close' | 'moon' | 'hide' | null = null;
  private hovered = false;
  /** a press on Moony: where it started, the grab offset, and whether it became a drag */
  private grab: { sx: number; sy: number; dx: number; dy: number; moving: boolean } | null = null;
  private pressOver = false;
  private tipDeck: number[] = [];
  private lastKey = '';

  constructor() {
    // idle animation: repaint only when a visible part of Moony actually changes
    setInterval(() => {
      if (!this.visible || document.hidden || os.wm?.screensaver.active) return;
      const k = this.frameKey(performance.now());
      if (k !== this.lastKey) { this.lastKey = k; invalidate(); }
    }, 100);
  }

  // ------------------------------------------------------------- state

  get visible() { return this.state !== 'off'; }
  /** drawn above windows and bars (while talking or flying off) */
  get onTop() { return this.state === 'tour' || this.state === 'tip' || this.state === 'leaving' || !!this.grab?.moving; }
  get touring() { return this.state === 'tour'; }

  private get animOn() { return os.settings.get('animations'); }

  /** Called once the desktop is up. */
  boot() {
    const s = os.settings.get('moony');
    if (s === 'new') this.startTour();
    else if (s === 'parked') { this.pos = this.home(); this.state = 'parked'; invalidate(); }
    os.settings.onChange((k) => { if (k === 'moony') this.sync(); });
  }

  /** Follow the setting when something else changes it (Orbit menu, Config reset). */
  private sync() {
    const s = os.settings.get('moony');
    if (s === 'hidden' && this.state !== 'off' && this.state !== 'leaving') this.leave();
    else if (s === 'parked' && (this.state === 'off' || this.state === 'leaving')) this.appear();
  }

  /** Grow out of the Orbit logo and park. */
  private appear(done?: () => void) {
    this.balloon = null;
    this.state = 'parked';
    os.sound.sfx('restore');
    this.fly(this.home(), { from: this.logo(), r0: 3 }, done);
  }

  /** Shrink back into the Orbit logo and go away. */
  private leave() {
    this.balloon = null;
    this.pressed = null;
    this.state = 'leaving';
    os.sound.sfx('minimize');
    this.fly(this.logo(), { r1: 3 }, () => { this.state = 'off'; invalidate(); });
  }

  hide() {
    os.settings.set('moony', 'hidden');
  }

  show() {
    os.settings.set('moony', 'parked');
  }

  /** A tip on request (Launcher): brings Moony back first if he was hidden. */
  tipPlease() {
    if (this.state === 'off' || this.state === 'leaving') {
      this.appear(() => this.showTip());
      os.settings.set('moony', 'parked');
    } else this.showTip();
  }

  startTour() {
    const wasOff = this.state === 'off' || this.state === 'leaving';
    this.state = 'tour';
    this.nav = new TourNav(this.steps.length);
    if (wasOff) {
      this.pos = this.logo();
      os.sound.sfx('restore');
      this.showStep(3);
    } else this.showStep();
  }

  private finish(how: 'skip' | 'done') {
    this.balloon = null;
    this.pressed = null;
    if (how === 'skip') { this.hide(); return; }
    os.settings.set('moony', 'parked');
    this.fly(this.home(), {}, () => {
      this.say('Moony', "I'll wait up here. Click me for a tip. To send me away, use the little x that appears when you point at me; the Launcher can bring me back.", [
        { label: 'OK', act: () => this.closeBalloon(), isDefault: true },
      ]);
    });
  }

  showTip() {
    if (!this.tipDeck.length) {
      this.tipDeck = TIPS.map((_, i) => i);
      for (let i = this.tipDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.tipDeck[i], this.tipDeck[j]] = [this.tipDeck[j], this.tipDeck[i]];
      }
    }
    const tip = TIPS[this.tipDeck.pop()!];
    if (this.state === 'off') this.pos = this.home();
    this.say("Moony's tip", tip, [
      { label: 'Another tip', act: () => this.showTip() },
      { label: 'Thanks', act: () => this.closeBalloon(), isDefault: true },
    ]);
  }

  /** Open a parked-mode balloon (tips and notes). */
  private say(header: string, text: string, buttons: Btn[]) {
    this.state = 'tip';
    this.balloon = { header, text, buttons, onClose: () => this.closeBalloon(), target: null };
    this.layout();
    os.sound.sfx('click');
    invalidate();
  }

  private closeBalloon() {
    this.balloon = null;
    this.pressed = null;
    if (this.state === 'tip') this.state = 'parked';
    invalidate();
  }

  // ------------------------------------------------------------- the tour

  private buildSteps(): Step[] {
    const topWindow = () => {
      for (let i = os.wm.windows.length - 1; i >= 0; i--) {
        const w = os.wm.windows[i];
        if (w.visible && w.revealed && !w.popup && !w.modalFor) return w;
      }
      return null;
    };
    return [
      {
        target: () => null,
        content: () => ({ text: "Hi! I'm Moony, and I orbit around here. Want a quick tour of Orbit?" }),
      },
      {
        target: () => os.wm.desktop.iconRects()[0] ?? null,
        content: () => ({
          text: 'These are desktop icons. Double-click one to open it, right-click it for more options, or drag it somewhere else.',
        }),
      },
      {
        target: () => os.wm.taskbar.launchRect(),
        content: () => ({ text: 'The Launch button opens every application on Orbit. F9 opens it from the keyboard, too.' }),
      },
      {
        target: () => {
          const w = topWindow();
          return w ? { x: w.x, y: w.y, w: w.w, h: TITLE_H + 2 } : null;
        },
        content: (t) => {
          if (t) {
            return {
              text: 'This is a window. Drag its title bar to move it and pull any edge to resize it. ' +
                'The boxes on the right minimize, maximize and close it. Ctrl+` switches windows.',
            };
          }
          if (os.fs.exists(README)) {
            return {
              text: 'Everything you open shows up in a window. Shall I open the README so we can look at one?',
              extra: [{ label: 'Open README', act: () => { openPath(README); } }],
            };
          }
          return {
            text: 'Everything you open shows up in a window. Drag its title bar to move it; ' +
              'the boxes on the right minimize, maximize and close it.',
          };
        },
      },
      {
        target: () => os.wm.desktop.iconRectByLabel('BASIC Editor'),
        content: () => ({
          text: 'Orbit speaks BASIC! Programs you write are real apps: their own window and taskbar button, ' +
            'buttons and text boxes, music, and files on Orbit HD. Save one in /Programs and it shows up in ' +
            'the Launcher. The games and screensavers are BASIC, too.',
          extra: [{ label: 'BASIC Guide', act: () => { launch('browser', { args: { url: 'orbit:help/basic' } }); } }],
        }),
      },
      {
        target: () => os.wm.topbar.itemRect(0),
        content: () => ({
          text: 'Behind this little planet is the Orbit menu: About, the Launcher, Config and the screensaver. ' +
            'You can call me back from there, too. F10 opens the menus from the keyboard.',
        }),
      },
      {
        target: () => null,
        content: () => ({
          text: "Stuck? Press F1 for help with whatever you're using. Your files are kept on Orbit HD, " +
            'inside this browser. Back them up from Config > Disk.',
        }),
      },
    ];
  }

  private tourBalloon(target: Rect | null): Balloon {
    const i = this.nav.index, n = this.steps.length;
    const { text, extra = [] } = this.steps[i].content(target);
    const next = () => { if (this.nav.next() === 'finished') this.finish('done'); else this.showStep(); };
    const back = () => { if (this.nav.back()) this.showStep(); };
    let buttons: Btn[];
    if (this.nav.first) {
      buttons = [
        { label: 'No thanks', act: () => this.finish('skip') },
        { label: 'Show me', act: next, isDefault: true },
      ];
    } else if (this.nav.last) {
      buttons = [
        { label: 'Back', act: back },
        { label: 'Open Help', act: () => { launch('browser', { args: { url: 'orbit:help' } }); this.finish('done'); } },
        { label: 'Done', act: next, isDefault: true },
      ];
    } else {
      buttons = [
        { label: 'Skip tour', act: () => this.finish('skip') },
        ...extra,
        { label: 'Back', act: back },
        { label: 'Next', act: next, isDefault: true },
      ];
    }
    return {
      header: i === 0 ? 'Moony' : `Tour  ${i} of ${n - 1}`,
      text,
      buttons,
      onClose: () => this.finish('skip'),
      target,
    };
  }

  /** The current step's target in whole pixels (icon rects can be fractional). */
  private target(): Rect | null {
    const t = this.steps[this.nav.index].target();
    if (!t) return null;
    const x = Math.round(t.x), y = Math.round(t.y);
    return { x, y, w: Math.round(t.x + t.w) - x, h: Math.round(t.y + t.h) - y };
  }

  /** Fly to the current step's target, then talk. */
  private showStep(fromR?: number) {
    const target = this.target();
    this.balloon = null;
    this.pressed = null;
    this.fly(this.spotFor(target), { r0: fromR }, () => {
      if (this.state !== 'tour') return;
      this.balloon = this.tourBalloon(this.target());
      this.layout();
      os.sound.sfx('click');
    });
  }

  // ------------------------------------------------------------- geometry

  /** Where Moony rests: wherever he was dragged to, else the top-right corner. Always on screen. */
  private home(): Pt {
    const D = os.wm.deskRect();
    const saved = os.settings.get('moonyPos');
    return this.clampToDesk(saved ? { x: saved[0], y: saved[1] } : { x: D.x + D.w - MOON_R - 12, y: D.y + MOON_R + 10 });
  }

  /** Keep the whole moon, and the hide badge on his top-right edge, on the desktop. */
  private clampToDesk(p: Pt): Pt {
    const D = os.wm.deskRect();
    const minX = D.x + MOON_R + 2, maxX = Math.max(minX, D.x + D.w - MOON_R - 7);
    const minY = D.y + MOON_R + 4, maxY = Math.max(minY, D.y + D.h - MOON_R - 3);
    return { x: Math.max(minX, Math.min(maxX, Math.round(p.x))), y: Math.max(minY, Math.min(maxY, Math.round(p.y))) };
  }

  /** Next to the thing being explained, or in Moony's own corner when there is nothing to point at. */
  private spotFor(target: Rect | null): Pt {
    return target ? placeMoon(target, os.wm.deskRect()) : this.home();
  }

  private logo(): Pt {
    const r = os.wm.topbar.itemRect(0);
    return r ? { x: r.x + Math.floor(r.w / 2), y: r.y + 7 } : { x: 11, y: 7 };
  }

  private balloonArea(): Rect {
    const W = os.display.layout.w, H = os.display.layout.h;
    return { x: 4, y: TOPBAR_H + 2, w: W - 8, h: H - TOPBAR_H - TASKBAR_H - 4 };
  }

  /** Re-place Moony and its balloon (screen size changed, or the target moved). */
  layout() {
    if (this.flight) return;
    if ((this.state === 'parked' || this.state === 'tip') && !this.grab?.moving) this.pos = this.home();
    const b = this.balloon;
    if (!b) return;
    if (this.state === 'tour') this.pos = this.spotFor(b.target);
    // buttons fill rows left to right, each row right-aligned; the balloon widens for them when it can
    const widths = b.buttons.map((x) => Math.max(38, SANS.measure(x.label) + 14));
    const oneRow = widths.reduce((s, w) => s + w, 0) + BTN_GAP * (widths.length - 1) + PAD * 2;
    const bw = Math.min(os.display.layout.w - 12, Math.max(balloonWidth(os.display.layout.w), oneRow));
    const inner = bw - PAD * 2;
    b.lines = wrapText(SANS, b.text, inner);
    const rows: number[][] = [[]];
    let used = 0;
    widths.forEach((w, i) => {
      const row = rows[rows.length - 1];
      if (row.length && used + BTN_GAP + w > inner) { rows.push([i]); used = w; } else { row.push(i); used += (row.length > 1 ? BTN_GAP : 0) + w; }
    });
    const btnTop = TEXT_TOP + b.lines.length * LINE_H + 6;
    const bh = btnTop + rows.length * (BTN_H + 4) - 4 + 7;
    const avoid = b.target ? { x: b.target.x - 3, y: b.target.y - 3, w: b.target.w + 6, h: b.target.h + 6 } : null;
    const p = layoutBalloon(this.balloonArea(), this.pos, bw, bh, avoid);
    b.place = p;
    b.btnRects = [];
    rows.forEach((row, ri) => {
      const total = row.reduce((s, i) => s + widths[i], 0) + BTN_GAP * (row.length - 1);
      let x = p.x + bw - PAD - total;
      for (const i of row) {
        b.btnRects![i] = { x, y: p.y + btnTop + ri * (BTN_H + 4), w: widths[i], h: BTN_H };
        x += widths[i] + BTN_GAP;
      }
    });
    b.closeRect = { x: p.x + bw - 14, y: p.y + 3, w: 10, h: 10 };
    invalidate();
  }

  // ------------------------------------------------------------- animation

  private fly(to: Pt, o: { from?: Pt; r0?: number; r1?: number }, done?: () => void) {
    const from = o.from ?? this.currentPos(performance.now());
    if (!this.animOn) {
      this.flight = null;
      this.pos = to;
      this.radius = MOON_R;
      done?.();
      invalidate();
      return;
    }
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const f: Flight = {
      from, to,
      r0: o.r0 ?? MOON_R, r1: o.r1 ?? MOON_R,
      start: performance.now(),
      dur: Math.max(650, Math.min(1500, 450 + dist * 2.6)),
      arc: Math.min(36, dist / 3),
      ...this.arcNormal(from, to),
      done,
    };
    this.flight = f;
    this.hovered = false;
    // a repaint per step instead of per frame: deliberately choppy, like the idle bob
    const tick = () => {
      if (this.flight !== f) return;
      if (performance.now() - f.start >= f.dur) {
        this.flight = null;
        this.pos = to;
        this.radius = MOON_R;
        f.done?.();
      } else setTimeout(tick, FLIGHT_STEP_MS);
      invalidate();
    };
    invalidate();
    setTimeout(tick, FLIGHT_STEP_MS);
  }

  /** Flight progress 0..1, advanced in whole steps. */
  private progress(f: Flight, now: number): number {
    const steps = Math.floor((now - f.start) / FLIGHT_STEP_MS);
    return ease.inOut(Math.min(1, (steps * FLIGHT_STEP_MS) / f.dur));
  }

  /** Perpendicular to the path, on the side facing the middle of the screen, so arcs never bow off-screen. */
  private arcNormal(from: Pt, to: Pt): { nx: number; ny: number } {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return { nx: 0, ny: 0 };
    let nx = -dy / len, ny = dx / len;
    const L = os.display.layout;
    const toCenter = (L.w / 2 - (from.x + to.x) / 2) * nx + (L.h / 2 - (from.y + to.y) / 2) * ny;
    if (toCenter < 0) { nx = -nx; ny = -ny; }
    return { nx, ny };
  }

  private currentPos(now: number): Pt {
    const f = this.flight;
    if (!f) return this.pos;
    const e = this.progress(f, now);
    const bow = Math.sin(e * Math.PI) * f.arc;
    return {
      x: Math.round(lerp(f.from.x, f.to.x, e) + f.nx * bow),
      y: Math.round(lerp(f.from.y, f.to.y, e) + f.ny * bow),
    };
  }

  private currentRadius(now: number): number {
    const f = this.flight;
    if (!f) return this.radius;
    return Math.round(lerp(f.r0, f.r1, this.progress(f, now)));
  }

  private bob(now: number) { return this.animOn && !this.flight ? Math.round(Math.sin(now / 650) * 1.2) : 0; }
  private blinking(now: number) { return this.animOn && now % 4300 < 130; }
  private shadowOffset(now: number, r: number): number {
    // u in -1..1: 0 = full, ±1 = the most shadow on that side (never a new moon, so the face stays visible)
    const u = this.animOn ? Math.sin((now / PHASE_MS) * Math.PI * 2) : HIDDEN_PHASE;
    if (Math.abs(u) < 0.02) return 0;
    return Math.round(Math.sign(u) * (2.2 * r - 1.1 * r * Math.abs(u)));
  }

  private frameKey(now: number): string {
    const ants = this.balloon?.target && this.animOn ? Math.floor(now / 140) : 0;
    return `${this.bob(now)}|${this.blinking(now)}|${this.shadowOffset(now, MOON_R)}|${ants}`;
  }

  // ------------------------------------------------------------- painting

  /** Parked and quiet: painted with the desktop, under the windows. */
  paintBelow(g: Gfx) {
    if (this.state === 'parked' && !this.onTop) this.paintMoon(g, performance.now());
  }

  /** Talking, touring or flying away: painted over everything but menus. */
  paintAbove(g: Gfx) {
    if (!this.onTop) return;
    const now = performance.now();
    const b = this.balloon;
    if (b && this.state === 'tour' && !this.flight) {
      // follow the target if it moved, appeared or vanished (window dragged, README closed...)
      const t = this.target();
      if (!sameRect(t, b.target) && this.pressed === null) {
        if (!t !== !b.target) this.showStep(); // appeared or vanished: fly over to it
        else { this.balloon = this.tourBalloon(t); this.layout(); } // moved: follow it
      }
    }
    const bb = this.balloon;
    if (bb?.target) {
      const t = bb.target, ph = this.animOn ? Math.floor(now / 140) : 0;
      g.dashedRect(t.x - 2, t.y - 2, t.w + 4, t.h + 4, C.YELLOW, C.INK, ph, 3);
      g.dashedRect(t.x - 3, t.y - 3, t.w + 6, t.h + 6, C.INK, C.YELLOW, ph, 3);
    }
    if (bb?.place && !this.flight) this.paintBalloon(g, bb);
    this.paintMoon(g, now);
  }

  private paintMoon(g: Gfx, now: number) {
    const p = this.currentPos(now);
    const r = this.currentRadius(now);
    let look = 0;
    const bp = this.balloon?.place;
    if (bp && !this.flight) look = bp.x > p.x ? 1 : bp.x + bp.w < p.x ? -1 : 0;
    const bob = this.bob(now);
    drawMoon(g, p.x, p.y + bob, r, this.shadowOffset(now, r), this.blinking(now), look);
    if (this.badgeShown) {
      const br = this.badgeRect();
      const down = this.pressed === 'hide' && this.pressOver;
      g.fillRect(br.x + 1, br.y + 1 + bob, br.w - 2, br.h - 2, down ? C.TAN : C.CREAM);
      g.rect(br.x, br.y + bob, br.w, br.h, C.INK);
      g.line(br.x + 2, br.y + 2 + bob, br.x + br.w - 3, br.y + br.h - 3 + bob, C.INK);
      g.line(br.x + br.w - 3, br.y + 2 + bob, br.x + 2, br.y + br.h - 3 + bob, C.INK);
    }
  }

  // ------------------------------------------------------------- the hide badge

  /** The little close box on Moony: on hover, and always while a tip is showing (touch has no hover). */
  private get badgeShown() {
    if (this.flight) return false;
    return (this.state === 'parked' && (this.hovered || this.pressed === 'hide')) || this.state === 'tip';
  }

  private badgeRect(): Rect {
    return { x: this.pos.x + MOON_R - 4, y: this.pos.y - MOON_R - 3, w: 9, h: 9 };
  }

  private badgeHit(x: number, y: number): boolean {
    const r = this.badgeRect();
    return this.badgeShown && within(x, y, { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 });
  }

  /** Pointer moved: show the hide badge while over a parked Moony (`covered` = a window is on top). */
  hover(x: number, y: number, covered: boolean) {
    const over = !this.flight && (this.state === 'parked' || this.state === 'tip') &&
      (this.onTop || !covered) && (this.moonHit(x, y) || within(x, y, this.badgeRect()));
    if (over !== this.hovered) { this.hovered = over; invalidate(); }
  }

  private paintBalloon(g: Gfx, b: Balloon) {
    const p = b.place!;
    dropShadow(g, p.x, p.y, p.w, p.h);
    softBox(g, p.x, p.y, p.w, p.h, C.CREAM, C.INK);
    drawTail(g, p);
    SANS.draw(g, p.x + PAD, p.y + 4, b.header, C.GREY, { bold: true });
    // close box
    const cr = b.closeRect!;
    const cdown = this.pressed === 'close' && this.pressOver;
    if (cdown) g.fillRect(cr.x + 1, cr.y + 1, cr.w - 2, cr.h - 2, C.TAN);
    g.rect(cr.x, cr.y, cr.w, cr.h, C.INK);
    g.line(cr.x + 2, cr.y + 2, cr.x + cr.w - 3, cr.y + cr.h - 3, C.INK);
    g.line(cr.x + cr.w - 3, cr.y + 2, cr.x + 2, cr.y + cr.h - 3, C.INK);
    b.lines!.forEach((line, i) => SANS.draw(g, p.x + PAD, p.y + TEXT_TOP + i * LINE_H, line, C.INK));
    b.buttons.forEach((btn, i) => {
      const r = b.btnRects![i];
      const down = this.pressed === i && this.pressOver;
      buttonFace(g, r.x, r.y, r.w, r.h, down, btn.isDefault);
      const tw = SANS.measure(btn.label);
      SANS.draw(g, r.x + Math.floor((r.w - tw) / 2) + (down ? 1 : 0), r.y + 4 + (down ? 1 : 0), btn.label, C.INK);
    });
  }

  // ------------------------------------------------------------- input

  private moonHit(x: number, y: number): boolean {
    if (!this.visible || this.flight || this.state === 'leaving') return false;
    const dx = x - this.pos.x, dy = y - this.pos.y;
    return dx * dx + dy * dy <= (MOON_R + 2) * (MOON_R + 2);
  }

  private balloonPart(x: number, y: number): number | 'close' | 'body' | null {
    const b = this.balloon;
    if (!b?.place || this.flight || !within(x, y, b.place)) return null;
    if (within(x, y, b.closeRect!)) return 'close';
    const i = b.btnRects!.findIndex((r) => within(x, y, r));
    return i >= 0 ? i : 'body';
  }

  /** Is (x, y) on Moony or its balloon? */
  hit(x: number, y: number): boolean {
    return this.balloonPart(x, y) !== null || this.badgeHit(x, y) || this.moonHit(x, y);
  }

  /** A press. Returns true when Moony takes it (the WM then routes moves/ups to drag()). */
  down(e: PointerEv): boolean {
    const part = this.balloonPart(e.x, e.y);
    if (part !== null) {
      this.pressed = part === 'body' ? null : part;
      this.pressOver = true;
      invalidate();
      return true;
    }
    if (e.button === 0 && this.badgeHit(e.x, e.y)) {
      this.pressed = 'hide';
      this.pressOver = true;
      invalidate();
      return true;
    }
    if (!this.moonHit(e.x, e.y)) return false;
    if (e.button === 2) {
      if (this.state === 'parked' || this.state === 'tip') os.wm.menus.open(this.contextMenu(), e.x, e.y);
      this.pressed = null;
      return true;
    }
    this.pressed = 'moon';
    this.pressOver = true;
    // a resting Moony can also be picked up and moved
    if (this.state === 'parked' || this.state === 'tip') {
      this.grab = { sx: e.x, sy: e.y, dx: e.x - this.pos.x, dy: e.y - this.pos.y, moving: false };
    }
    return true;
  }

  drag(e: PointerEv) {
    const pr = this.pressed;
    if (pr === null) return;
    const gr = this.grab;
    if (pr === 'moon' && gr) {
      if (!gr.moving && Math.hypot(e.x - gr.sx, e.y - gr.sy) >= DRAG_SLOP) { gr.moving = true; this.hovered = false; }
      if (gr.moving) {
        this.pos = this.clampToDesk({ x: e.x - gr.dx, y: e.y - gr.dy });
        this.layout(); // a tip balloon follows, and stays on screen
        invalidate();
        if (e.type === 'up') {
          this.pressed = null;
          this.grab = null;
          os.settings.set('moonyPos', [this.pos.x, this.pos.y]);
          this.hover(e.x, e.y, false);
        }
        return;
      }
      if (e.type === 'up') this.grab = null;
    }
    let over: boolean;
    if (pr === 'moon') over = this.moonHit(e.x, e.y);
    else if (pr === 'hide') over = within(e.x, e.y, this.badgeRect());
    else over = this.balloonPart(e.x, e.y) === pr;
    if (over !== this.pressOver) { this.pressOver = over; invalidate(); }
    if (e.type !== 'up') return;
    this.pressed = null;
    invalidate();
    if (!over) return;
    if (pr === 'hide') { this.hide(); return; }
    if (pr === 'moon') { if (this.state === 'parked' || this.state === 'tip') this.showTip(); return; }
    const b = this.balloon;
    if (!b) return;
    if (pr === 'close') b.onClose();
    else b.buttons[pr]?.act();
  }

  /** Enter and Escape answer the balloon, but only while no window has the keyboard. */
  key(e: KeyEv): boolean {
    const b = this.balloon;
    if (!b || this.flight) return false;
    if (e.key === 'Escape') { b.onClose(); return true; }
    if (e.key === 'Enter') { b.buttons.find((x) => x.isDefault)?.act(); return true; }
    return false;
  }

  private contextMenu(): MenuItem[] {
    return [
      { label: 'Give Me a Tip', action: () => this.showTip() },
      { label: 'Take the Tour', action: () => this.startTour() },
      { separator: true },
      { label: 'Hide Moony', action: () => this.hide() },
    ];
  }
}

// ------------------------------------------------------------- drawing helpers

/** The balloon's tail: a cream wedge from the balloon edge to near Moony, outlined in ink. */
function drawTail(g: Gfx, p: BalloonPlace) {
  const { tailBase: b, tailTip: t } = p;
  const vertical = p.side === 'left' || p.side === 'right';
  const half = 3;
  const a: Pt = vertical ? { x: b.x, y: b.y - half } : { x: b.x - half, y: b.y };
  const c: Pt = vertical ? { x: b.x, y: b.y + half } : { x: b.x + half, y: b.y };
  const minX = Math.min(a.x, c.x, t.x), maxX = Math.max(a.x, c.x, t.x);
  const minY = Math.min(a.y, c.y, t.y), maxY = Math.max(a.y, c.y, t.y);
  const side = (p1: Pt, p2: Pt, x: number, y: number) => (p2.x - p1.x) * (y - p1.y) - (p2.y - p1.y) * (x - p1.x);
  const area = side(a, c, t.x, t.y);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = side(c, t, x, y) * area, w1 = side(t, a, x, y) * area, w2 = side(a, c, x, y) * area;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) g.pset(x, y, C.CREAM);
    }
  }
  g.line(a.x, a.y, t.x, t.y, C.INK);
  g.line(c.x, c.y, t.x, t.y, C.INK);
}
