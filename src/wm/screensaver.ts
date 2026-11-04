import { Gfx, Surface } from '../core/gfx';
import { C, DARKER } from '../core/palette';
import { SANS } from '../core/fonts';
import { drawPlanet } from './logo';
import { BasicScreen } from '../basic/screen';
import { VM } from '../basic/vm';
import { compile } from '../basic/compiler';
import { invalidate, os } from '../os';

export type SaverMode = 'cycle' | 'bounce' | 'flight' | 'orbits' | 'mystify';
export const SAVER_DIR = '/Screensavers';

/** BASIC screensaver programs on disk. */
export function saverPrograms(): string[] {
  if (!os.fs?.isDir(SAVER_DIR)) return [];
  return os.fs.list(SAVER_DIR).filter((n) => n.type === 'file' && /\.BAS$/i.test(n.name)).map((n) => `${SAVER_DIR}/${n.name}`);
}
export const SAVER_MODES: SaverMode[] = ['bounce', 'flight', 'orbits', 'mystify'];
const CYCLE_MS = 40_000;

interface Star { x: number; y: number; z: number }
interface Flyer { x: number; y: number; z: number; ring: number; spin: number }

const RING_COLORS = [C.YELLOW, C.ORANGE, C.CRIMSON, C.LAVENDER, C.GREEN, C.CREAM];

/** Full-screen screensavers built around the Orbit logo. Any input wakes the desktop. */
export class Screensaver {
  active = false;
  private mode: SaverMode = 'bounce';
  private started = 0;
  private last = 0;
  private lastInput = performance.now();
  private trail: Surface | null = null;
  // bounce
  private bx = 40; private by = 40; private vx = 38; private vy = 29; private ringIdx = 0;
  private sparks: { x: number; y: number; t: number }[] = [];
  // flight
  private stars: Star[] = [];
  private flyers: Flyer[] = [];
  private nextFlyer = 0;
  // mystify
  private shapes: { p: number[][]; v: number[][]; col: number }[] = [];
  private lastFade = 0;

  /** Fade every trail pixel one palette step toward ink, at most once per `everyMs`. */
  private fade(t: Surface, now: number, everyMs: number) {
    if (now - this.lastFade < everyMs) return;
    this.lastFade = now;
    const px = t.px;
    for (let i = 0; i < px.length; i++) if (px[i]) px[i] = DARKER[px[i]];
  }

  constructor() {
    setInterval(() => this.check(), 2000);
  }

  /** Called on every user input. Returns true if the input only woke the screensaver. */
  poke(): boolean {
    this.lastInput = performance.now();
    if (!this.active) return false;
    this.stop();
    return true;
  }

  private check() {
    const min = os.settings?.get('screensaverMinutes') ?? 0;
    if (this.active || !min || !os.wm) return;
    if (performance.now() - this.lastInput >= min * 60_000) this.start();
  }

  // ---- BASIC programs as screensavers
  private basScreen: BasicScreen | null = null;
  private vm: VM | null = null;
  private programs: string[] = [];
  private progIdx = 0;

  /** Start the saver. `choice` is 'cycle', a built-in mode, or a path to a .BAS program. */
  start(choice?: string) {
    const pref = choice ?? os.settings.get('screensaverMode');
    this.programs = [];
    const files = saverPrograms();
    if (pref.startsWith('/')) this.programs = files.includes(pref) ? [pref] : [];
    else if (pref === 'cycle') this.programs = files.sort(() => Math.random() - 0.5);
    else {
      // built-in names prefer their BASIC version when it exists
      const named = files.find((f) => f.toUpperCase().endsWith(`/${pref === 'mystify' ? 'RIBBONS' : pref.toUpperCase()}.BAS`));
      if (named) this.programs = [named];
    }
    this.progIdx = 0;
    const builtin = (SAVER_MODES as string[]).includes(pref) ? pref as SaverMode : SAVER_MODES[Math.floor(Math.random() * SAVER_MODES.length)];
    this.mode = builtin;
    this.cycling = pref === 'cycle';
    this.active = true;
    this.started = this.last = performance.now();
    os.wm.menus.close(false);
    os.display.cursorVisible = false;
    this.reset();
    if (this.programs.length) this.runProgram(this.programs[0]);
    os.scheduler.animate(() => this.active);
  }

  private async runProgram(path: string) {
    this.stopProgram();
    const { w, h } = os.display.layout;
    let src: string;
    try { src = await os.fs.readText(path); } catch { this.programs = []; return; }
    if (!this.active) return;
    let prog;
    try { prog = compile(src); } catch (e) { console.warn('screensaver', path, e); this.programs = []; return; }
    const screen = new BasicScreen(os.fs, SAVER_DIR, w, h);
    const vm = new VM(prog, screen);
    this.basScreen = screen;
    this.vm = vm;
    vm.onStatus = (st) => {
      // a program that crashes or ends falls back to the built-in savers
      if (this.vm === vm && (st === 'error' || st === 'done')) { if (vm.error) console.warn('screensaver', path, vm.error.format()); this.stopProgram(); this.programs = []; }
    };
    vm.start();
  }

  private stopProgram() {
    if (this.vm && (this.vm.status === 'running' || this.vm.status === 'waiting')) this.vm.stop();
    this.basScreen?.stopAll();
    this.vm = null;
    this.basScreen = null;
  }
  private cycling = false;

  stop() {
    this.active = false;
    this.stopProgram();
    os.display.cursorVisible = true;
    this.lastInput = performance.now();
    invalidate();
  }

  private reset() {
    const { w, h } = os.display.layout;
    this.trail = new Surface(w, h, C.INK);
    this.bx = w * 0.3; this.by = h * 0.3;
    this.sparks = [];
    this.stars = Array.from({ length: 140 }, () => this.newStar(true));
    this.flyers = [];
    this.nextFlyer = 0;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    this.shapes = [C.ORANGE, C.LAVENDER].map((col) => ({
      p: Array.from({ length: 4 }, () => [rnd(0, w), rnd(0, h)]),
      v: Array.from({ length: 4 }, () => [rnd(-70, 70) || 30, rnd(-60, 60) || 25]),
      col,
    }));
  }

  private newStar(anywhere = false): Star {
    return { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: anywhere ? Math.random() : 1 };
  }

  paint(g: Gfx) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.programs.length) {
      if (this.cycling && this.programs.length > 1 && now - this.started > CYCLE_MS) {
        this.started = now;
        this.progIdx = (this.progIdx + 1) % this.programs.length;
        this.runProgram(this.programs[this.progIdx]);
      }
      if (this.basScreen) {
        const { w, h } = os.display.layout;
        g.fillRect(0, 0, w, h, C.INK);
        g.blit(this.basScreen.surf, 0, 0);
        return;
      }
    }
    if (this.cycling && now - this.started > CYCLE_MS) {
      const i = SAVER_MODES.indexOf(this.mode);
      this.mode = SAVER_MODES[(i + 1) % SAVER_MODES.length];
      this.started = now;
      this.reset();
    }
    const { w, h } = os.display.layout;
    if (!this.trail || this.trail.w !== w || this.trail.h !== h) this.reset();
    switch (this.mode) {
      case 'bounce': return this.bounce(g, w, h, dt, now);
      case 'flight': return this.flight(g, w, h, dt);
      case 'orbits': return this.orbits(g, w, h, now);
      case 'mystify': return this.mystify(g, w, h, dt);
    }
  }

  // ---- bouncing logo (corner hits make sparks)
  private bounce(g: Gfx, w: number, h: number, dt: number, now: number) {
    g.fillRect(0, 0, w, h, C.INK);
    // slow parallax stars
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(((i * 97 + now * 0.004 * (1 + (i % 3))) % w)), y = (i * 53) % h;
      g.pset(x, y, i % 4 ? C.PURPLE : C.LAVENDER);
    }
    const big = Math.min(w, h) >= 300;
    const style = { bold: true, size: big ? 3 : 2 };
    const tw = SANS.measure('Orbit', style);
    const r = big ? 16 : 10;
    const lw = r * 2 + 10 + tw, lh = r * 2 + 6;
    this.bx += this.vx * dt;
    this.by += this.vy * dt;
    let hitX = false, hitY = false;
    if (this.bx < 4) { this.bx = 4; this.vx = Math.abs(this.vx); hitX = true; }
    if (this.bx + lw > w - 4) { this.bx = w - 4 - lw; this.vx = -Math.abs(this.vx); hitX = true; }
    if (this.by < 4) { this.by = 4; this.vy = Math.abs(this.vy); hitY = true; }
    if (this.by + lh > h - 4) { this.by = h - 4 - lh; this.vy = -Math.abs(this.vy); hitY = true; }
    if (hitX || hitY) this.ringIdx = (this.ringIdx + 1) % RING_COLORS.length;
    if (hitX && hitY) for (let i = 0; i < 24; i++) this.sparks.push({ x: this.bx + lw / 2, y: this.by + lh / 2, t: now + i * 7 });
    const x = Math.round(this.bx), y = Math.round(this.by);
    drawPlanet(g, x + r + 4, y + r + 3, r, { ringColor: RING_COLORS[this.ringIdx] });
    SANS.draw(g, x + r * 2 + 12, y + Math.floor((lh - 7 * style.size) / 2), 'Orbit', RING_COLORS[(this.ringIdx + 2) % RING_COLORS.length], style);
    this.sparks = this.sparks.filter((s) => now - s.t < 900);
    for (const s of this.sparks) {
      const k = (now - s.t) / 900, a = (s.t % 360) * 0.0174;
      g.pset(Math.round(s.x + Math.cos(a) * k * 70), Math.round(s.y + Math.sin(a) * k * 50), k < 0.5 ? C.YELLOW : C.ORANGE);
    }
  }

  // ---- flying through space toward the Orbit planets
  private flight(g: Gfx, w: number, h: number, dt: number) {
    g.fillRect(0, 0, w, h, C.INK);
    const cx = w / 2, cy = h / 2, f = Math.min(w, h) * 0.6;
    for (const s of this.stars) {
      const pz = s.z;
      s.z -= dt * 0.35;
      if (s.z <= 0.02) { Object.assign(s, this.newStar()); continue; }
      const x0 = cx + (s.x / pz) * f * 0.5, y0 = cy + (s.y / pz) * f * 0.5;
      const x1 = cx + (s.x / s.z) * f * 0.5, y1 = cy + (s.y / s.z) * f * 0.5;
      if (x1 < 0 || y1 < 0 || x1 >= w || y1 >= h) { Object.assign(s, this.newStar()); continue; }
      const col = s.z < 0.25 ? C.CREAM : s.z < 0.5 ? C.LAVENDER : C.PURPLE;
      g.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), col);
    }
    this.nextFlyer -= dt;
    if (this.nextFlyer <= 0) {
      this.flyers.push({ x: (Math.random() - 0.5) * 1.4, y: (Math.random() - 0.5) * 1.0, z: 1, ring: Math.floor(Math.random() * RING_COLORS.length), spin: 0 });
      this.nextFlyer = 1.2 + Math.random() * 1.4;
    }
    // far ones first
    this.flyers.sort((a, b) => b.z - a.z);
    for (const fl of this.flyers) {
      fl.z -= dt * 0.22;
      const k = 1 / Math.max(0.05, fl.z);
      const r = Math.round(2 + k * 3.2);
      const x = Math.round(cx + fl.x * f * 0.5 * k * 0.35), y = Math.round(cy + fl.y * f * 0.5 * k * 0.35);
      if (r < 120) drawPlanet(g, x, y, r, { ringColor: RING_COLORS[fl.ring], outline: r > 6 ? C.INK : undefined });
    }
    this.flyers = this.flyers.filter((fl) => fl.z > 0.08);
  }

  // ---- a little solar system with fading trails
  private orbits(g: Gfx, w: number, h: number, now: number) {
    const t = this.trail!;
    const tg = new Gfx(t);
    this.fade(t, now, 320);
    const cx = w / 2, cy = h / 2;
    const base = Math.min(w, h) * 0.46;
    const planets = [
      { r: base * 0.28, s: 0.9, c: C.LAVENDER, size: 3 },
      { r: base * 0.46, s: 0.55, c: C.GREEN, size: 4 },
      { r: base * 0.66, s: 0.36, c: C.ORANGE, size: 5 },
      { r: base * 0.9, s: 0.22, c: C.CREAM, size: 6 },
    ];
    const sec = now / 1000;
    const pos = planets.map((p, i) => {
      const a = sec * p.s + i * 1.7;
      return [cx + Math.cos(a) * p.r * 1.35, cy + Math.sin(a) * p.r * 0.75] as [number, number];
    });
    pos.forEach(([x, y], i) => tg.pset(Math.round(x), Math.round(y), planets[i].c));
    g.blit(t, 0, 0);
    drawPlanet(g, Math.round(cx), Math.round(cy), Math.round(base * 0.12), { ringColor: C.YELLOW });
    pos.forEach(([x, y], i) => {
      const p = planets[i];
      g.ellipse(Math.round(x - p.size), Math.round(y - p.size), p.size * 2 + 1, p.size * 2 + 1, p.c, true);
      g.ellipse(Math.round(x - p.size), Math.round(y - p.size), p.size * 2 + 1, p.size * 2 + 1, C.INK);
    });
  }

  // ---- Mystify-style ribbons in sunset colors
  private mystify(g: Gfx, w: number, h: number, dt: number) {
    const t = this.trail!;
    const tg = new Gfx(t);
    this.fade(t, performance.now(), 70);
    for (const sh of this.shapes) {
      sh.p.forEach((p, i) => {
        p[0] += sh.v[i][0] * dt;
        p[1] += sh.v[i][1] * dt;
        if (p[0] < 0 || p[0] >= w) { sh.v[i][0] *= -1; p[0] = Math.max(0, Math.min(w - 1, p[0])); }
        if (p[1] < 0 || p[1] >= h) { sh.v[i][1] *= -1; p[1] = Math.max(0, Math.min(h - 1, p[1])); }
      });
      for (let i = 0; i < 4; i++) {
        const a = sh.p[i], b = sh.p[(i + 1) % 4];
        tg.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), sh.col);
      }
    }
    g.blit(t, 0, 0);
  }
}
