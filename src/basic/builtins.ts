import { BasicError, err, numText, strNum, valOf, type Value } from './values';
import type { VM } from './vm';

/**
 * Built-in functions. `sig` lists argument types: n = number, s = string, a = any.
 * Arguments beyond `min` are optional.
 */
export interface Builtin {
  sig: string;
  min: number;
  /** may be called without parentheses */
  bare?: boolean;
  fn: (vm: VM, a: Value[]) => Value;
}

const n = (v: Value) => v as number;
const s = (v: Value) => v as string;

function cint(x: number): number {
  // round half to even
  const r = Math.round(x);
  if (Math.abs(x % 1) === 0.5 && r % 2 !== 0) return r - Math.sign(x);
  return r;
}

function checkPos(x: number, what: string) {
  if (!(x >= 0)) throw err.illegal(what);
}

const pad2 = (x: number) => String(x).padStart(2, '0');

export const BUILTINS: Record<string, Builtin> = {
  LEN: { sig: 's', min: 1, fn: (_, a) => s(a[0]).length },
  'LEFT$': { sig: 'sn', min: 2, fn: (_, a) => { checkPos(n(a[1]), 'LEFT$ length'); return s(a[0]).slice(0, Math.round(n(a[1]))); } },
  'RIGHT$': {
    sig: 'sn', min: 2,
    fn: (_, a) => { checkPos(n(a[1]), 'RIGHT$ length'); const k = Math.round(n(a[1])); return k === 0 ? '' : s(a[0]).slice(-k); },
  },
  'MID$': {
    sig: 'snn', min: 2,
    fn: (_, a) => {
      const st = Math.round(n(a[1]));
      if (st < 1) throw err.illegal('MID$ start');
      const len = a.length > 2 ? Math.round(n(a[2])) : Infinity;
      if (len < 0) throw err.illegal('MID$ length');
      return s(a[0]).substr(st - 1, len);
    },
  },
  INSTR: {
    sig: 'aas', min: 2,
    fn: (_, a) => {
      let start = 1, hay: string, needle: string;
      if (typeof a[0] === 'number') {
        start = Math.round(a[0]);
        if (a.length < 3 || typeof a[1] !== 'string' || typeof a[2] !== 'string') throw err.typeMismatch();
        hay = a[1];
        needle = a[2];
      } else {
        if (a.length !== 2 || typeof a[1] !== 'string') throw err.typeMismatch();
        hay = a[0] as string;
        needle = a[1];
      }
      if (start < 1) throw err.illegal('INSTR start');
      if (start > hay.length) return needle === '' && start === hay.length + 1 ? 0 : 0;
      return hay.indexOf(needle, start - 1) + 1;
    },
  },
  'UCASE$': { sig: 's', min: 1, fn: (_, a) => s(a[0]).toUpperCase() },
  'LCASE$': { sig: 's', min: 1, fn: (_, a) => s(a[0]).toLowerCase() },
  'LTRIM$': { sig: 's', min: 1, fn: (_, a) => s(a[0]).replace(/^ +/, '') },
  'RTRIM$': { sig: 's', min: 1, fn: (_, a) => s(a[0]).replace(/ +$/, '') },
  'TRIM$': { sig: 's', min: 1, fn: (_, a) => s(a[0]).trim() },
  'SPACE$': { sig: 'n', min: 1, fn: (_, a) => { checkPos(n(a[0]), 'SPACE$'); return ' '.repeat(Math.round(n(a[0]))); } },
  'STRING$': {
    sig: 'na', min: 2,
    fn: (_, a) => {
      checkPos(n(a[0]), 'STRING$');
      const ch = typeof a[1] === 'number' ? String.fromCharCode(Math.round(a[1])) : a[1].slice(0, 1);
      if (!ch) throw err.illegal('STRING$');
      return ch.repeat(Math.round(n(a[0])));
    },
  },
  'CHR$': { sig: 'n', min: 1, fn: (_, a) => { const c = Math.round(n(a[0])); if (c < 0 || c > 65535) throw err.illegal('CHR$'); return String.fromCharCode(c); } },
  ASC: { sig: 's', min: 1, fn: (_, a) => { if (!s(a[0])) throw err.illegal('ASC of empty string'); return s(a[0]).charCodeAt(0); } },
  VAL: { sig: 's', min: 1, fn: (_, a) => valOf(s(a[0])) },
  'STR$': { sig: 'n', min: 1, fn: (_, a) => strNum(n(a[0])) },
  'HEX$': { sig: 'n', min: 1, fn: (_, a) => (Math.round(n(a[0])) >>> 0).toString(16).toUpperCase().replace(/^F{4}(?=[0-9A-F]{4}$)/, '') },
  'OCT$': { sig: 'n', min: 1, fn: (_, a) => (Math.round(n(a[0])) >>> 0).toString(8) },
  ABS: { sig: 'n', min: 1, fn: (_, a) => Math.abs(n(a[0])) },
  SGN: { sig: 'n', min: 1, fn: (_, a) => Math.sign(n(a[0])) },
  INT: { sig: 'n', min: 1, fn: (_, a) => Math.floor(n(a[0])) },
  FIX: { sig: 'n', min: 1, fn: (_, a) => Math.trunc(n(a[0])) || 0 },
  CINT: { sig: 'n', min: 1, fn: (_, a) => cint(n(a[0])) },
  CLNG: { sig: 'n', min: 1, fn: (_, a) => cint(n(a[0])) },
  CSNG: { sig: 'n', min: 1, fn: (_, a) => Number(n(a[0]).toPrecision(7)) },
  CDBL: { sig: 'n', min: 1, fn: (_, a) => n(a[0]) },
  SQR: { sig: 'n', min: 1, fn: (_, a) => { if (n(a[0]) < 0) throw err.illegal('SQR of a negative number'); return Math.sqrt(n(a[0])); } },
  SIN: { sig: 'n', min: 1, fn: (_, a) => Math.sin(n(a[0])) },
  COS: { sig: 'n', min: 1, fn: (_, a) => Math.cos(n(a[0])) },
  TAN: { sig: 'n', min: 1, fn: (_, a) => Math.tan(n(a[0])) },
  ATN: { sig: 'n', min: 1, fn: (_, a) => Math.atan(n(a[0])) },
  LOG: { sig: 'n', min: 1, fn: (_, a) => { if (n(a[0]) <= 0) throw err.illegal('LOG of a number <= 0'); return Math.log(n(a[0])); } },
  EXP: { sig: 'n', min: 1, fn: (_, a) => { const r = Math.exp(n(a[0])); if (!Number.isFinite(r)) throw err.overflow(); return r; } },
  MIN: { sig: 'nn', min: 2, fn: (_, a) => Math.min(n(a[0]), n(a[1])) },
  MAX: { sig: 'nn', min: 2, fn: (_, a) => Math.max(n(a[0]), n(a[1])) },
  RND: {
    sig: 'n', min: 0, bare: true,
    fn: (vm, a) => (a.length && n(a[0]) === 0 ? vm.lastRnd : a.length && n(a[0]) < 0 ? (vm.randomize(n(a[0])), vm.rnd()) : vm.rnd()),
  },
  TIMER: {
    sig: '', min: 0, bare: true,
    fn: () => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000; },
  },
  'DATE$': { sig: '', min: 0, bare: true, fn: () => { const d = new Date(); return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${d.getFullYear()}`; } },
  'TIME$': { sig: '', min: 0, bare: true, fn: () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; } },
  'INKEY$': { sig: '', min: 0, bare: true, fn: (vm) => vm.host.inkey() },
  CSRLIN: { sig: '', min: 0, bare: true, fn: (vm) => vm.host.csrlin() },
  POS: { sig: 'n', min: 0, fn: (vm) => vm.host.pos() + 1 },
  EOF: {
    sig: 'n', min: 1,
    fn: (vm, a) => {
      const f = vm.file(n(a[0]));
      if (f.mode !== 'input') return -1;
      return /^\s*$/.test(f.text.slice(f.pos)) ? -1 : 0;
    },
  },
  FREEFILE: { sig: '', min: 0, bare: true, fn: (vm) => { let k = 1; while (vm.files.has(k)) k++; return k; } },
  POINT: { sig: 'nn', min: 2, fn: (vm, a) => vm.host.point(Math.round(n(a[0])), Math.round(n(a[1]))) },
  SCREENW: { sig: '', min: 0, bare: true, fn: (vm) => vm.host.screenSize?.()[0] ?? 320 },
  SCREENH: { sig: '', min: 0, bare: true, fn: (vm) => vm.host.screenSize?.()[1] ?? 200 },
  MOUSEX: { sig: '', min: 0, bare: true, fn: (vm) => vm.host.gui?.mouse()[0] ?? 0 },
  MOUSEY: { sig: '', min: 0, bare: true, fn: (vm) => vm.host.gui?.mouse()[1] ?? 0 },
  MOUSEB: { sig: '', min: 0, bare: true, fn: (vm) => vm.host.gui?.mouse()[2] ?? 0 },
  'GETTEXT$': { sig: 'n', min: 1, fn: (vm, a) => vm.host.gui?.getText(n(a[0])) ?? '' },
};

/** Validate argument types against a builtin signature. */
export function checkArgs(b: Builtin, a: Value[]) {
  for (let i = 0; i < a.length; i++) {
    const t = b.sig[i];
    if (t === 'n' && typeof a[i] !== 'number') throw err.typeMismatch();
    if (t === 's' && typeof a[i] !== 'string') throw err.typeMismatch();
  }
}

export function isStringName(name: string) {
  return name.endsWith('$');
}

export { numText, BasicError };
