import { Gfx, Surface } from '../core/gfx';
import { MONO, SANS } from '../core/fonts';
import { DARKER } from '../core/palette';
import type { NoteEvent, PlayHandle } from '../core/sound';
import type { Vfs } from '../fs/vfs';
import type { BasicHost, GuiHost } from './vm';
import { os } from '../os';

const CW = 6;
const CH = 10;

/**
 * A program's screen: a 16-color surface with a QBasic-style text cursor on a 6x10 grid,
 * plus graphics, keyboard queue and line input.
 */
export class BasicScreen implements BasicHost {
  surf: Surface;
  g: Gfx;
  row = 0;
  col = 0;
  fgc = 9;
  bgc = 0;
  keys: string[] = [];
  fs: Vfs | null;
  cwd: string;
  gui?: GuiHost;
  onChange: (() => void) | null = null;
  onResize: (() => void) | null = null;
  /** active line input */
  private input: { buf: string; resolve: (s: string) => void } | null = null;
  private sleeper: { resolve: () => void; timer: number } | null = null;
  private players = new Set<PlayHandle>();
  mouse: [number, number, number] = [0, 0, 0];
  /** line-editing hook (shell history / completion): return a new buffer, or null to ignore the key */
  inputHook: ((key: string, buf: string) => string | null) | null = null;

  constructor(fs: Vfs | null, cwd: string, w = 320, h = 200) {
    this.fs = fs;
    this.cwd = cwd;
    this.surf = new Surface(w, h, 0);
    this.g = new Gfx(this.surf);
  }

  get cols() { return Math.max(1, Math.floor(this.surf.w / CW)); }
  get rows() { return Math.max(1, Math.floor(this.surf.h / CH)); }
  get inputActive() { return !!this.input; }

  private changed() {
    this.onChange?.();
  }

  // ---- text
  private newline() {
    this.col = 0;
    this.row++;
    if (this.row >= this.rows) {
      // scroll the whole screen (text and graphics) up one text row
      const { w, px } = this.surf;
      const used = this.rows * CH;
      px.copyWithin(0, CH * w, used * w);
      px.fill(this.bgc, (used - CH) * w, used * w);
      this.row = this.rows - 1;
    }
  }
  private putChar(ch: string) {
    if (ch === '\n') { this.newline(); return; }
    if (ch === '\r') return;
    if (ch === '\t') { const n = 8 - (this.col % 8); for (let i = 0; i < n; i++) this.putChar(' '); return; }
    if (this.col >= this.cols) this.newline();
    const x = this.col * CW, y = this.row * CH;
    this.g.fillRect(x, y, CW, CH, this.bgc);
    if (ch !== ' ') MONO.draw(this.g, x, y, ch, this.fgc);
    this.col++;
  }
  print(s: string) {
    for (const ch of s) this.putChar(ch);
    this.changed();
  }
  pos() { return Math.min(this.col, this.cols - 1); }
  width() { return this.cols; }
  csrlin() { return this.row + 1; }
  cls() {
    this.surf.px.fill(this.bgc);
    this.row = 0;
    this.col = 0;
    this.changed();
  }
  locate(row: number | null, col: number | null) {
    if (row !== null) this.row = Math.max(0, Math.min(this.rows - 1, row - 1));
    if (col !== null) this.col = Math.max(0, Math.min(this.cols - 1, col - 1));
  }
  color(fg: number | null, bg: number | null) {
    if (fg !== null) this.fgc = fg;
    if (bg !== null) this.bgc = bg;
  }
  fg() { return this.fgc; }
  screen(w: number, h: number) {
    this.surf = new Surface(w, h, this.bgc);
    this.g = new Gfx(this.surf);
    this.row = this.col = 0;
    this.onResize?.();
    this.changed();
  }

  // ---- graphics
  pset(x: number, y: number, c: number) { this.g.pset(x, y, c); this.changed(); }
  line(x1: number, y1: number, x2: number, y2: number, c: number, box: 0 | 1 | 2) {
    if (box === 0) this.g.line(x1, y1, x2, y2, c);
    else {
      const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1) + 1, h = Math.abs(y2 - y1) + 1;
      if (box === 2) this.g.fillRect(x, y, w, h, c);
      else this.g.rect(x, y, w, h, c);
    }
    this.changed();
  }
  circle(x: number, y: number, r: number, c: number) {
    this.g.ellipse(x - r, y - r, r * 2 + 1, r * 2 + 1, c);
    this.changed();
  }
  paint(x: number, y: number, c: number, border: number) {
    const { w, h, px } = this.surf;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const start = px[y * w + x];
    if (start === border || start === c) return;
    const seen = new Uint8Array(w * h);
    const stack = [x, y];
    while (stack.length) {
      const yy = stack.pop()!, xx = stack.pop()!;
      const i = yy * w + xx;
      if (seen[i] || px[i] === border) continue;
      let l = xx, r = xx;
      while (l > 0 && px[yy * w + l - 1] !== border && !seen[yy * w + l - 1]) l--;
      while (r < w - 1 && px[yy * w + r + 1] !== border && !seen[yy * w + r + 1]) r++;
      for (let k = l; k <= r; k++) { seen[yy * w + k] = 1; px[yy * w + k] = c; }
      for (const ny of [yy - 1, yy + 1]) {
        if (ny < 0 || ny >= h) continue;
        for (let k = l; k <= r; k++) {
          const j = ny * w + k;
          if (!seen[j] && px[j] !== border) stack.push(k, ny);
        }
      }
    }
    this.changed();
  }
  point(x: number, y: number) { return this.surf.get(x, y); }
  screenSize(): [number, number] { return [this.surf.w, this.surf.h]; }
  /** FADE: every pixel moves one step darker through the palette (trail effects). */
  fade() {
    const px = this.surf.px;
    for (let i = 0; i < px.length; i++) px[i] = DARKER[px[i]];
    this.changed();
  }
  /** GPRINT: text at a pixel position in the UI font, optionally enlarged. */
  gprint(x: number, y: number, text: string, color: number, size: number) {
    SANS.draw(this.g, x, y, text, color, { size: Math.max(1, Math.min(8, size)) });
    this.changed();
  }

  // ---- sound
  play(events: NoteEvent[], _duration: number, wait: boolean): Promise<void> {
    const h = os.sound.play(events);
    this.players.add(h);
    h.done.then(() => this.players.delete(h));
    return wait ? h.done : Promise.resolve();
  }
  beep() { os.sound.sfx('beep'); }

  // ---- keyboard
  inkey(): string {
    return this.keys.shift() ?? '';
  }
  /** Characters typed while the program runs. */
  keyText(s: string) {
    if (this.input) {
      for (const ch of s) {
        if (this.col >= this.cols - 1 && this.input.buf.length > 200) break;
        this.input.buf += ch;
        this.print(ch);
      }
      return;
    }
    for (const ch of s) this.pushKey(ch);
  }
  /** Special keys: Enter, Backspace, Escape, arrows… */
  keySpecial(key: string) {
    if (this.input) {
      if (key === 'Enter') {
        const inp = this.input;
        this.input = null;
        this.print('\n');
        inp.resolve(inp.buf);
      } else if (key === 'Backspace' && this.input.buf.length) {
        this.input.buf = this.input.buf.slice(0, -1);
        this.eraseChar();
        this.changed();
      } else if (this.inputHook) {
        const nb = this.inputHook(key, this.input.buf);
        if (nb !== null && this.input) this.replaceInput(nb);
      }
      return;
    }
    const map: Record<string, string> = {
      Enter: '\r', Backspace: '\b', Escape: '\x1b', Tab: '\t',
      ArrowUp: '\0H', ArrowDown: '\0P', ArrowLeft: '\0K', ArrowRight: '\0M',
      Home: '\0G', End: '\0O', PageUp: '\0I', PageDown: '\0Q', Insert: '\0R', Delete: '\0S',
      F1: '\0;', F2: '\0<', F3: '\0=', F4: '\0>', F5: '\0?', F6: '\0@', F7: '\0A', F8: '\0B', F9: '\0C', F10: '\0D',
    };
    const v = map[key];
    if (v) this.pushKey(v);
  }
  private pushKey(k: string) {
    if (this.keys.length < 32) this.keys.push(k);
    if (this.sleeper) {
      const s = this.sleeper;
      this.sleeper = null;
      clearTimeout(s.timer);
      s.resolve();
    }
  }
  private eraseChar() {
    if (this.col > 0) this.col--;
    else if (this.row > 0) { this.row--; this.col = this.cols - 1; }
    this.g.fillRect(this.col * CW, this.row * CH, CW, CH, this.bgc);
  }
  /** Replace the text typed so far in the active line input. */
  replaceInput(s: string) {
    if (!this.input) return;
    for (let i = 0; i < this.input.buf.length; i++) this.eraseChar();
    this.input.buf = s;
    this.print(s);
  }
  get inputText() {
    return this.input?.buf ?? '';
  }
  readLine(): Promise<string> {
    return new Promise((resolve) => {
      this.input = { buf: '', resolve };
      this.changed();
    });
  }
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = ms >= 0 ? window.setTimeout(() => { this.sleeper = null; resolve(); }, ms) : 0;
      this.sleeper = { resolve, timer };
    });
  }

  /** Cursor position in pixels (for the blinking input cursor). */
  cursorRect(): [number, number] {
    return [Math.min(this.col, this.cols - 1) * CW, this.row * CH];
  }

  /** Stop any sounds still playing (program ended or window closed). */
  stopAll() {
    for (const p of this.players) p.stop();
    this.players.clear();
    if (this.sleeper) { clearTimeout(this.sleeper.timer); this.sleeper = null; }
    this.input = null;
  }
}
