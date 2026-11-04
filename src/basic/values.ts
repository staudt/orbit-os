/** Runtime values, references and formatting for Orbit BASIC. */

export type Value = number | string;
export type VarKind = 'num' | 'int' | 'str' | 'any';

export class BasicError extends Error {
  /** 1-based source line, filled in by the VM/compiler */
  line = 0;
  constructor(msg: string, line = 0) {
    super(msg);
    this.line = line;
  }
  format(): string {
    return this.line ? `${this.message} in line ${this.line}` : this.message;
  }
}

export class SyntaxError_ extends BasicError {
  detail: string;
  constructor(detail: string, line: number) {
    super('Syntax error', line);
    this.detail = detail;
  }
  format(): string {
    return `Syntax error in line ${this.line}${this.detail ? ': ' + this.detail : ''}`;
  }
}

export const err = {
  typeMismatch: () => new BasicError('Type mismatch'),
  divZero: () => new BasicError('Division by zero'),
  subscript: () => new BasicError('Subscript out of range'),
  illegal: (why = '') => new BasicError('Illegal function call' + (why ? `: ${why}` : '')),
  outOfData: () => new BasicError('Out of DATA'),
  overflow: () => new BasicError('Overflow'),
};

export function kindOfName(name: string): VarKind {
  if (name.endsWith('$')) return 'str';
  if (name.endsWith('%') || name.endsWith('&')) return 'int';
  return 'num';
}

export function defaultOf(kind: VarKind): Value {
  return kind === 'str' ? '' : 0;
}

/** Coerce a value for storage in a variable of `kind`. */
export function coerce(v: Value, kind: VarKind): Value {
  if (kind === 'any') return v;
  if (kind === 'str') {
    if (typeof v !== 'string') throw err.typeMismatch();
    return v;
  }
  if (typeof v !== 'number') throw err.typeMismatch();
  if (kind === 'int') {
    if (!Number.isFinite(v) || Math.abs(v) > 2147483647) throw err.overflow();
    return Math.trunc(v) || 0;
  }
  return v;
}

export interface Ref {
  get(): Value;
  set(v: Value): void;
  kind: VarKind;
}

/** A variable box. Parameters passed by reference share the caller's Cell. */
export class Cell implements Ref {
  v: Value;
  kind: VarKind;
  /** array stored in this variable slot (arrays live in their own namespace) */
  arr: BasicArray | null = null;
  constructor(kind: VarKind, v: Value = defaultOf(kind)) {
    this.kind = kind;
    this.v = v;
  }
  get() {
    return this.v;
  }
  set(v: Value) {
    this.v = coerce(v, this.kind);
  }
}

export class BasicArray {
  lo: number[];
  hi: number[];
  data: Value[];
  kind: VarKind;
  private strides: number[];
  constructor(bounds: [number, number][], kind: VarKind) {
    this.lo = bounds.map((b) => b[0]);
    this.hi = bounds.map((b) => b[1]);
    this.kind = kind;
    let size = 1;
    this.strides = [];
    for (let i = bounds.length - 1; i >= 0; i--) {
      const n = this.hi[i] - this.lo[i] + 1;
      if (n <= 0) throw err.subscript();
      this.strides[i] = size;
      size *= n;
    }
    if (size > 4_000_000) throw new BasicError('Out of memory');
    this.data = new Array(size).fill(defaultOf(kind));
  }
  index(idx: number[]): number {
    if (idx.length !== this.lo.length) throw err.subscript();
    let off = 0;
    for (let i = 0; i < idx.length; i++) {
      const k = Math.round(idx[i]);
      if (k < this.lo[i] || k > this.hi[i]) throw err.subscript();
      off += (k - this.lo[i]) * this.strides[i];
    }
    return off;
  }
}

export class ElemRef implements Ref {
  arr: BasicArray;
  i: number;
  kind: VarKind;
  constructor(arr: BasicArray, i: number) {
    this.arr = arr;
    this.i = i;
    this.kind = arr.kind;
  }
  get() {
    return this.arr.data[this.i];
  }
  set(v: Value) {
    this.arr.data[this.i] = coerce(v, this.kind);
  }
}

// ------------------------------------------------------------------ formatting

/** Number text without the PRINT padding (QBasic style, 7 significant digits). */
export function numText(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? 'Inf' : '-Inf';
  if (Object.is(n, -0)) n = 0;
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const a = Math.abs(n);
  if (a >= 1e15 || a < 1e-7 || (!Number.isInteger(n) && a >= 1e7)) {
    // exponent form: 1.234568E+20
    let [m, e] = n.toExponential(6).split('e');
    m = m.replace(/\.?0+$/, '');
    const ev = parseInt(e, 10);
    return `${m}E${ev < 0 ? '-' : '+'}${String(Math.abs(ev)).padStart(2, '0')}`;
  }
  let s = String(Number(n.toPrecision(7)));
  if (s.includes('e')) return numText(Number(s)); // very rare after rounding
  s = s.replace(/^(-?)0\./, '$1.');
  return s;
}

/** PRINT form: leading space for non-negatives, always a trailing space. */
export function printNum(n: number): string {
  const t = numText(n);
  return (t.startsWith('-') ? '' : ' ') + t + ' ';
}

/** STR$ form: leading space for non-negatives, no trailing space. */
export function strNum(n: number): string {
  const t = numText(n);
  return t.startsWith('-') ? t : ' ' + t;
}

/** VAL: parse a leading number, ignoring leading spaces; stops at the first bad char. */
export function valOf(s: string): number {
  const t = s.replace(/^[\s]+/, '');
  if (/^&H/i.test(t)) {
    const m = /^&H([0-9A-F]+)/i.exec(t);
    return m ? parseInt(m[1], 16) : 0;
  }
  const m = /^[+-]?(\d+\.?\d*|\.\d+)([ED][+-]?\d+)?/i.exec(t.replace(/\s+/g, ''));
  if (!m) return 0;
  return Number(m[0].replace(/[dD]/, 'e')) || 0;
}

export function truthy(v: Value): boolean {
  if (typeof v === 'string') throw err.typeMismatch();
  return v !== 0;
}

export function bool(b: boolean): number {
  return b ? -1 : 0;
}
