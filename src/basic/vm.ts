import type { NoteEvent } from '../core/sound';
import type { Vfs } from '../fs/vfs';
import { BasicError, Cell, type Value, type VarKind, printNum, defaultOf } from './values';

/** Everything a program can do to the outside world. The IDE console and the headless runner implement this. */
export interface BasicHost {
  print(s: string): void;
  /** 0-based column of the text cursor */
  pos(): number;
  /** 1-based row of the text cursor */
  csrlin(): number;
  /** Read a line from the keyboard, echoing it and ending with a newline. */
  readLine(): Promise<string>;
  inkey(): string;
  /** SLEEP: wait `ms` (or until a key when ms < 0); resolves early on a key press */
  sleep(ms: number): Promise<void>;
  cls(): void;
  locate(row: number | null, col: number | null): void;
  color(fg: number | null, bg: number | null): void;
  fg(): number;
  screen(w: number, h: number): void;
  pset(x: number, y: number, c: number): void;
  line(x1: number, y1: number, x2: number, y2: number, c: number, box: 0 | 1 | 2): void;
  circle(x: number, y: number, r: number, c: number): void;
  paint(x: number, y: number, c: number, border: number): void;
  point(x: number, y: number): number;
  play(events: NoteEvent[], duration: number, wait: boolean): Promise<void>;
  beep(): void;
  fs: Vfs | null;
  cwd: string;
  /** text columns (comma zones that don't fit wrap to the next line) */
  width?: () => number;
  /** graphics extensions (Orbit) */
  screenSize?(): [number, number];
  fade?(): void;
  gprint?(x: number, y: number, text: string, color: number, size: number): void;
  /** optional GUI extension (window apps) */
  gui?: GuiHost;
}

export interface GuiHost {
  window(title: string, w: number, h: number): void;
  control(kind: 'button' | 'label' | 'textbox', id: number, text: string, x: number, y: number, w: number, h: number): void;
  setText(id: number, text: string): void;
  getText(id: number): string;
  waitEvent(timeoutMs: number): Promise<number>;
  mouse(): [number, number, number];
}

export type Instr = (vm: VM) => void;

export interface SubInfo {
  name: string;
  isFunc: boolean;
  entry: number;
  params: { slot: number; kind: VarKind; isArray: boolean }[];
  slotKinds: VarKind[];
  retSlot: number;
  line: number;
  defined: boolean;
}

export interface DataItem {
  s: string;
  quoted: boolean;
}

export interface Program {
  code: Instr[];
  lines: number[];
  mainSlots: VarKind[];
  data: DataItem[];
  subs: Map<string, SubInfo>;
}

interface Frame {
  cells: Cell[];
  retPc: number;
  gosub: number[];
  sub: SubInfo | null;
}

export interface FileHandle {
  path: string;
  mode: 'input' | 'output' | 'append';
  /** remaining input text */
  text: string;
  pos: number;
  out: string;
  col: number;
}

export type VMStatus = 'ready' | 'running' | 'waiting' | 'done' | 'error' | 'stopped';

const ZONE = 14;

/** Bytecode-ish VM: a list of closures executed in time slices so the desktop stays responsive. */
export class VM {
  prog: Program;
  host: BasicHost;
  pc = 0;
  stack: unknown[] = [];
  globals: Cell[];
  frame: Frame;
  frames: Frame[] = [];
  status: VMStatus = 'ready';
  error: BasicError | null = null;
  dataPtr = 0;
  files = new Map<number, FileHandle>();
  /** current PRINT target (null = screen) */
  out: FileHandle | null = null;
  private seed = 0x2f6b;
  lastRnd = 0;
  sliceMs = 8;
  private resolveDone: (() => void) | null = null;
  done: Promise<void>;
  private timer = 0;
  onStatus: ((s: VMStatus) => void) | null = null;
  /** last graphics point (LINE -(x,y), STEP) */
  lastX = 0;
  lastY = 0;
  /** playback state carried across PLAY statements */
  mml: Record<string, unknown> | undefined;

  constructor(prog: Program, host: BasicHost) {
    this.prog = prog;
    this.host = host;
    this.globals = prog.mainSlots.map((k) => new Cell(k));
    this.frame = { cells: this.globals, retPc: -1, gosub: [], sub: null };
    this.done = new Promise((r) => { this.resolveDone = r; });
  }

  start() {
    this.status = 'running';
    this.onStatus?.('running');
    this.schedule();
    return this.done;
  }

  stop() {
    if (this.status === 'done' || this.status === 'error' || this.status === 'stopped') return;
    this.finish('stopped');
  }

  private schedule() {
    // MessageChannel avoids setTimeout's 4ms clamp; fall back to setTimeout
    if (typeof MessageChannel !== 'undefined') {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); this.runSlice(); };
      ch.port2.postMessage(0);
    } else this.timer = setTimeout(() => this.runSlice(), 0) as unknown as number;
  }

  private runSlice() {
    if (this.status !== 'running') return;
    const code = this.prog.code;
    const t0 = performance.now();
    try {
      for (;;) {
        for (let n = 0; n < 2000; n++) {
          code[this.pc++](this);
          if (this.status !== 'running') return;
        }
        if (performance.now() - t0 > this.sliceMs) break;
      }
      this.schedule();
    } catch (e) {
      this.fail(e);
    }
  }

  fail(e: unknown) {
    let be: BasicError;
    if (e instanceof BasicError) be = e;
    else {
      console.error(e);
      be = new BasicError(e instanceof RangeError ? 'Out of stack space' : `Internal error: ${(e as Error)?.message ?? e}`);
    }
    if (!be.line) be.line = this.prog.lines[Math.max(0, this.pc - 1)] ?? 0;
    this.error = be;
    this.finish('error');
  }

  private finish(s: VMStatus) {
    if (this.status === 'done' || this.status === 'error' || this.status === 'stopped') return;
    this.status = s;
    clearTimeout(this.timer);
    this.flushFiles().finally(() => {
      this.onStatus?.(s);
      this.resolveDone?.();
    });
  }

  /** END: flush files then finish. */
  end() {
    this.finish('done');
  }

  /** Suspend until the promise settles; `then` runs with the result before resuming. */
  private waitId = 0;
  wait<T>(p: Promise<T>, then?: (v: T) => void) {
    this.status = 'waiting';
    const id = ++this.waitId;
    const line = this.prog.lines[this.pc - 1];
    p.then(
      (v) => {
        if (this.status !== 'waiting' || id !== this.waitId) return;
        try {
          then?.(v);
          // the callback may have started another wait (e.g. INPUT "Redo from start")
          if (id !== this.waitId) return;
        } catch (e) {
          if (e instanceof BasicError && !e.line) e.line = line;
          this.status = 'running';
          this.fail(e);
          return;
        }
        this.status = 'running';
        this.schedule();
      },
      (e) => {
        if (this.status !== 'waiting' || id !== this.waitId) return;
        this.status = 'running';
        const be = e instanceof BasicError ? e : new BasicError(String((e as Error)?.message ?? e));
        if (!be.line) be.line = line;
        this.fail(be);
      },
    );
  }

  // ---- stack helpers -------------------------------------------------------
  push(v: unknown) {
    this.stack.push(v);
  }
  pop(): Value {
    return this.stack.pop() as Value;
  }
  popNum(): number {
    const v = this.stack.pop();
    if (typeof v !== 'number') throw new BasicError('Type mismatch');
    return v;
  }
  popStr(): string {
    const v = this.stack.pop();
    if (typeof v !== 'string') throw new BasicError('Type mismatch');
    return v;
  }

  // ---- calls ----------------------------------------------------------------
  call(sub: SubInfo, args: unknown[]) {
    if (!sub.defined) throw new BasicError(`${sub.isFunc ? 'Function' : 'Sub'} not defined: ${sub.name}`);
    if (args.length !== sub.params.length) throw new BasicError('Argument-count mismatch');
    if (this.frames.length > 4000) throw new BasicError('Out of stack space');
    const cells = sub.slotKinds.map((k) => new Cell(k));
    sub.params.forEach((p, i) => {
      const a = args[i];
      if (p.isArray) {
        if (!(a instanceof Cell)) throw new BasicError('Type mismatch');
        cells[p.slot] = a;
      } else if (a instanceof Cell || (a && typeof a === 'object' && 'get' in (a as object))) {
        // by reference: alias the caller's variable / element
        cells[p.slot] = a as Cell;
      } else {
        const c = new Cell(p.kind);
        c.set(a as Value);
        cells[p.slot] = c;
      }
    });
    this.frames.push(this.frame);
    this.frame = { cells, retPc: this.pc, gosub: [], sub };
    this.pc = sub.entry;
  }

  ret() {
    const f = this.frame;
    const prev = this.frames.pop();
    if (!prev) { this.end(); return; }
    this.frame = prev;
    this.pc = f.retPc;
    if (f.sub?.isFunc) this.push(f.cells[f.sub.retSlot].get());
  }

  // ---- PRINT ----------------------------------------------------------------
  col(): number {
    return this.out ? this.out.col : this.host.pos();
  }
  write(s: string) {
    if (!s) return;
    if (this.out) {
      this.out.out += s;
      const nl = s.lastIndexOf('\n');
      this.out.col = nl >= 0 ? s.length - nl - 1 : this.out.col + s.length;
    } else this.host.print(s);
  }
  printValue(v: Value) {
    this.write(typeof v === 'number' ? printNum(v) : v);
  }
  printZone() {
    const c = this.col();
    const next = (Math.floor(c / ZONE) + 1) * ZONE;
    const width = this.out ? 0 : this.host.width?.() ?? 0;
    if (width && next + ZONE > width) this.write('\n');
    else this.write(' '.repeat(next - c));
  }
  printTab(n: number) {
    const target = Math.max(1, Math.round(n)) - 1;
    const c = this.col();
    if (c > target) this.write('\n' + ' '.repeat(target));
    else this.write(' '.repeat(target - c));
  }

  // ---- RND (deterministic after RANDOMIZE) -------------------------------------
  randomize(seed: number) {
    this.seed = (Math.floor(seed * 1000) ^ 0x5bd1e995) >>> 0 || 1;
  }
  rnd(): number {
    // mulberry32
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.lastRnd = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return this.lastRnd;
  }

  // ---- DATA -----------------------------------------------------------------
  readData(kind: VarKind): Value {
    const it = this.prog.data[this.dataPtr];
    if (!it) throw new BasicError('Out of DATA');
    this.dataPtr++;
    if (kind === 'str') return it.s;
    if (it.quoted) throw new BasicError('Type mismatch');
    const t = it.s.trim();
    if (t === '') return 0;
    const n = Number(t.replace(/^&H/i, '0x').replace(/[dD]/, 'e'));
    if (Number.isNaN(n)) throw new BasicError('Type mismatch');
    return n;
  }

  // ---- files -------------------------------------------------------------------
  file(n: number): FileHandle {
    const f = this.files.get(Math.round(n));
    if (!f) throw new BasicError('Bad file number');
    return f;
  }

  async flushFiles() {
    const fs = this.host.fs;
    const handles = [...this.files.values()];
    this.files.clear();
    if (!fs) return;
    for (const f of handles) {
      if (f.mode !== 'input') {
        try { await fs.write(f.path, f.out); } catch (e) { console.error(e); }
      }
    }
  }

  /** Reset a frame's locals (used by the compiler for default values) */
  static defaultFor(kind: VarKind) {
    return defaultOf(kind);
  }
}
