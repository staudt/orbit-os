import { lex, type Token, RESERVED } from './lexer';
import {
  BasicArray, BasicError, Cell, ElemRef, SyntaxError_, bool, coerce, err, kindOfName, truthy,
  type Ref, type Value, type VarKind,
} from './values';
import { BUILTINS, checkArgs } from './builtins';
import type { DataItem, Instr, Program, SubInfo, VM } from './vm';
import { compileStatementExt } from './statements';

/** A jump whose destination is patched later. */
export interface Target { to: number }

/** Resolved variable location. */
export interface VarAcc {
  global: boolean;
  slot: number;
  kind: VarKind;
  name: string;
}

interface LvInfo {
  kind: 'var' | 'elem';
  acc: VarAcc;
  nidx: number;
  lastPc: number;
}

export interface ExprInfo {
  lv?: LvInfo;
}

type Ctl =
  | { type: 'IF'; line: number; jz: Target | null; ends: Target[]; sawElse: boolean }
  | { type: 'FOR'; line: number; acc: VarAcc; end: VarAcc; step: VarAcc; check: number; breaks: Target[] }
  | { type: 'WHILE'; line: number; top: number; breaks: Target[] }
  | { type: 'DO'; line: number; top: number; breaks: Target[] }
  | { type: 'SELECT'; line: number; tmp: VarAcc; next: Target | null; ends: Target[]; any: boolean };

class Scope {
  sub: SubInfo | null;
  slots = new Map<string, number>();
  kinds: VarKind[] = [];
  asKinds = new Map<string, VarKind>();
  labels = new Map<string, number>();
  pending: { label: string; t: Target; line: number }[] = [];
  exits: Target[] = [];
  temp = 0;
  constructor(sub: SubInfo | null) {
    this.sub = sub;
  }
}

const getCell = (vm: VM, a: VarAcc): Cell => (a.global ? vm.globals[a.slot] : vm.frame.cells[a.slot]);

export class Compiler {
  toks: Token[];
  p = 0;
  code: Instr[] = [];
  lines: number[] = [];
  line = 1;
  main = new Scope(null);
  scope: Scope = this.main;
  ctl: Ctl[] = [];
  subs = new Map<string, SubInfo>();
  shared = new Set<string>();
  consts = new Set<string>();
  data: DataItem[] = [];
  dataLabels = new Map<string, number>();
  pendingRestores: { label: string; box: { idx: number }; line: number }[] = [];
  /** depth of single-line IF bodies (ELSE ends a statement list) */
  single = 0;

  constructor(src: string) {
    this.toks = lex(src);
    this.prescan();
  }

  // ---------------------------------------------------------------- tokens
  get tok(): Token { return this.toks[this.p]; }
  peekAt(k: number): Token { return this.toks[Math.min(this.toks.length - 1, this.p + k)]; }
  next(): Token { return this.toks[this.p++]; }
  isOp(s: string, t = this.tok) { return t.t === 'op' && t.s === s; }
  isWord(s: string, t = this.tok) { return t.t === 'id' && t.s === s; }
  accept(s: string): boolean {
    if (this.isOp(s) || this.isWord(s)) { this.p++; return true; }
    return false;
  }
  expect(s: string) {
    if (!this.accept(s)) this.fail(`expected ${s}`);
  }
  fail(detail: string): never {
    throw new SyntaxError_(detail, this.tok.line);
  }
  /** at a newline or end of file (not narrowed by TS, the cursor moves) */
  eol(): boolean {
    const t = this.toks[this.p].t;
    return t === 'nl' || t === 'eof';
  }
  atEnd(): boolean {
    const t = this.tok;
    return t.t === 'nl' || t.t === 'eof' || this.isOp(':') || (this.single > 0 && this.isWord('ELSE'));
  }
  ident(): string {
    const t = this.tok;
    if (t.t !== 'id' || RESERVED.has(t.s)) this.fail(`expected a name`);
    this.p++;
    return t.s;
  }

  // ---------------------------------------------------------------- emit
  emit(fn: Instr): number {
    this.code.push(fn);
    this.lines.push(this.line);
    return this.code.length - 1;
  }
  get pc() { return this.code.length; }
  jmp(t?: Target): Target {
    const tt = t ?? { to: -1 };
    this.emit((vm) => { vm.pc = tt.to; });
    return tt;
  }
  jz(t?: Target): Target {
    const tt = t ?? { to: -1 };
    this.emit((vm) => { if (!truthy(vm.pop())) vm.pc = tt.to; });
    return tt;
  }
  jnz(t?: Target): Target {
    const tt = t ?? { to: -1 };
    this.emit((vm) => { if (truthy(vm.pop())) vm.pc = tt.to; });
    return tt;
  }
  here(t: Target) { t.to = this.pc; }
  pushConst(v: Value) { this.emit((vm) => { vm.stack.push(v); }); }

  // ---------------------------------------------------------------- prescan
  private prescan() {
    const T = this.toks;
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      const prev = T[i - 1];
      const stmtStart = !prev || prev.t === 'nl' || prev.t === 'linenum' || prev.t === 'label' || (prev.t === 'op' && prev.s === ':');
      if (t.t === 'id' && (t.s === 'SUB' || t.s === 'FUNCTION') && stmtStart) {
        const nm = T[i + 1];
        if (nm?.t !== 'id') continue;
        if (this.subs.has(nm.s)) throw new BasicError('Duplicate definition', nm.line);
        this.subs.set(nm.s, {
          name: nm.s, isFunc: t.s === 'FUNCTION', entry: -1, params: [], slotKinds: [], retSlot: 0, line: nm.line, defined: false,
        });
      }
      if (t.t === 'id' && t.s === 'DIM' && T[i + 1]?.t === 'id' && T[i + 1].s === 'SHARED') {
        let j = i + 2;
        while (j < T.length && T[j].t === 'id') {
          const name = T[j].s;
          j++;
          let isArr = false;
          if (T[j]?.t === 'op' && T[j].s === '(') {
            isArr = true;
            let depth = 0;
            for (; j < T.length; j++) {
              if (T[j].t === 'op' && T[j].s === '(') depth++;
              if (T[j].t === 'op' && T[j].s === ')' && --depth === 0) { j++; break; }
            }
          }
          if (T[j]?.t === 'id' && T[j].s === 'AS') j += 2;
          this.shared.add(isArr ? name + '()' : name);
          if (T[j]?.t === 'op' && T[j].s === ',') j++;
          else break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- variables
  private kindFor(name: string, scope: Scope): VarKind {
    return scope.asKinds.get(name) ?? this.main.asKinds.get(name) ?? kindOfName(name);
  }
  private alloc(scope: Scope, key: string, kind: VarKind): number {
    let s = scope.slots.get(key);
    if (s === undefined) {
      s = scope.kinds.length;
      scope.kinds.push(kind);
      scope.slots.set(key, s);
    }
    return s;
  }
  /** Resolve a scalar (`isArray=false`) or array variable in the current scope. */
  varAcc(name: string, isArray = false): VarAcc {
    const key = isArray ? name + '()' : name;
    const sc = this.scope;
    if (sc !== this.main && !sc.slots.has(key) && (this.shared.has(key) || this.consts.has(key))) {
      const kind = this.kindFor(name, this.main);
      return { global: true, slot: this.alloc(this.main, key, kind), kind, name };
    }
    const kind = this.kindFor(name, sc);
    return { global: false, slot: this.alloc(sc, key, kind), kind, name };
  }
  tempAcc(kind: VarKind = 'num'): VarAcc {
    const name = `#t${this.scope.temp++}`;
    return { global: false, slot: this.alloc(this.scope, name, kind), kind, name };
  }

  emitLoad(a: VarAcc) {
    if (a.global) this.emit((vm) => { vm.stack.push(vm.globals[a.slot].get()); });
    else this.emit((vm) => { vm.stack.push(vm.frame.cells[a.slot].get()); });
  }
  emitStore(a: VarAcc) {
    if (a.global) this.emit((vm) => { vm.globals[a.slot].set(vm.stack.pop() as Value); });
    else this.emit((vm) => { vm.frame.cells[a.slot].set(vm.stack.pop() as Value); });
  }
  private constLock = false;

  /** Array cell, auto-dimensioned (0..10 per dimension) when first used without DIM. */
  static arr(vm: VM, a: VarAcc, dims: number): BasicArray {
    const cell = getCell(vm, a);
    if (!cell.arr) {
      const k = a.kind === 'any' ? 'num' : a.kind;
      cell.arr = new BasicArray(Array.from({ length: dims }, () => [0, 10] as [number, number]), k);
    }
    return cell.arr;
  }
  static popIdx(vm: VM, k: number): number[] {
    const idx = new Array(k);
    for (let i = k - 1; i >= 0; i--) {
      const v = vm.stack.pop();
      if (typeof v !== 'number') throw err.typeMismatch();
      idx[i] = v;
    }
    return idx;
  }

  /** Parse a variable reference used as an assignment target; emits code that pushes a Ref. */
  parseRefTarget(): VarAcc {
    const name = this.ident();
    if (this.isOp('(')) {
      this.p++;
      const k = this.parseIndexList();
      const acc = this.varAcc(name, true);
      this.emit((vm) => {
        const idx = Compiler.popIdx(vm, k);
        const arr = Compiler.arr(vm, acc, k);
        vm.stack.push(new ElemRef(arr, arr.index(idx)));
      });
      return acc;
    }
    const acc = this.varAcc(name);
    if (acc.global) this.emit((vm) => { vm.stack.push(vm.globals[acc.slot]); });
    else this.emit((vm) => { vm.stack.push(vm.frame.cells[acc.slot]); });
    return acc;
  }
  parseIndexList(): number {
    let k = 0;
    do { this.parseExpr(); k++; } while (this.accept(','));
    this.expect(')');
    return k;
  }

  // ---------------------------------------------------------------- expressions
  parseExpr(): ExprInfo {
    return this.parseOr();
  }
  private bin(sub: () => ExprInfo, ops: Record<string, (a: Value, b: Value) => Value>): ExprInfo {
    let info = sub.call(this);
    for (;;) {
      const t = this.tok;
      const key = t.t === 'op' || t.t === 'id' ? t.s : '';
      const f = ops[key];
      if (!f) return info;
      this.p++;
      sub.call(this);
      this.emit((vm) => { const b = vm.stack.pop() as Value; const a = vm.stack.pop() as Value; vm.stack.push(f(a, b)); });
      info = {};
    }
  }
  private parseOr(): ExprInfo {
    return this.bin(this.parseAnd, { OR: (a, b) => intOp(a, b, (x, y) => x | y), XOR: (a, b) => intOp(a, b, (x, y) => x ^ y) });
  }
  private parseAnd(): ExprInfo {
    return this.bin(this.parseNot, { AND: (a, b) => intOp(a, b, (x, y) => x & y) });
  }
  private parseNot(): ExprInfo {
    if (this.accept('NOT')) {
      this.parseNot();
      this.emit((vm) => { const a = vm.stack.pop(); if (typeof a !== 'number') throw err.typeMismatch(); vm.stack.push(~Math.round(a)); });
      return {};
    }
    return this.parseRel();
  }
  private parseRel(): ExprInfo {
    return this.bin(this.parseAdd, {
      '=': (a, b) => bool(cmp(a, b) === 0),
      '<>': (a, b) => bool(cmp(a, b) !== 0),
      '<': (a, b) => bool(cmp(a, b) < 0),
      '>': (a, b) => bool(cmp(a, b) > 0),
      '<=': (a, b) => bool(cmp(a, b) <= 0),
      '>=': (a, b) => bool(cmp(a, b) >= 0),
    });
  }
  private parseAdd(): ExprInfo {
    return this.bin(this.parseMod, {
      '+': (a, b) => {
        if (typeof a === 'string' && typeof b === 'string') return a + b;
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        throw err.typeMismatch();
      },
      '-': (a, b) => num(a) - num(b),
    });
  }
  private parseMod(): ExprInfo {
    return this.bin(this.parseIDiv, {
      MOD: (a, b) => {
        const x = Math.round(num(a)), y = Math.round(num(b));
        if (y === 0) throw err.divZero();
        return (x % y) || 0;
      },
    });
  }
  private parseIDiv(): ExprInfo {
    return this.bin(this.parseMul, {
      '\\': (a, b) => {
        const x = Math.round(num(a)), y = Math.round(num(b));
        if (y === 0) throw err.divZero();
        return Math.trunc(x / y) || 0;
      },
    });
  }
  private parseMul(): ExprInfo {
    return this.bin(this.parseUnary, {
      '*': (a, b) => num(a) * num(b),
      '/': (a, b) => { if (num(b) === 0) throw err.divZero(); return num(a) / num(b); },
    });
  }
  private parseUnary(): ExprInfo {
    if (this.accept('-')) {
      this.parseUnary();
      this.emit((vm) => { vm.stack.push(-num(vm.stack.pop() as Value) || 0); });
      return {};
    }
    if (this.accept('+')) { this.parseUnary(); return {}; }
    return this.parsePow();
  }
  private parsePow(): ExprInfo {
    let info = this.parsePrimary();
    while (this.accept('^')) {
      // the exponent may carry its own sign: 2 ^ -1
      if (this.accept('-')) {
        this.parsePrimary();
        this.emit((vm) => { vm.stack.push(-num(vm.stack.pop() as Value)); });
      } else this.parsePrimary();
      this.emit((vm) => {
        const b = num(vm.stack.pop() as Value), a = num(vm.stack.pop() as Value);
        const r = Math.pow(a, b);
        if (Number.isNaN(r)) throw err.illegal('power');
        vm.stack.push(r);
      });
      info = {};
    }
    return info;
  }

  private parsePrimary(): ExprInfo {
    const t = this.tok;
    if (t.t === 'num') { this.p++; this.pushConst(t.n); return {}; }
    if (t.t === 'str') { this.p++; this.pushConst(t.s); return {}; }
    if (this.accept('(')) {
      this.parseExpr();
      this.expect(')');
      return {};
    }
    if (t.t !== 'id') this.fail(t.t === 'nl' || t.t === 'eof' ? 'expression expected' : `unexpected "${t.s}"`);
    const name = t.s;
    // LBOUND/UBOUND take an array name
    if (name === 'LBOUND' || name === 'UBOUND') {
      this.p++;
      this.expect('(');
      const arrName = this.ident();
      const acc = this.varAcc(arrName, true);
      let dimExpr = false;
      if (this.accept(',')) { this.parseExpr(); dimExpr = true; }
      this.expect(')');
      const upper = name === 'UBOUND';
      this.emit((vm) => {
        const d = dimExpr ? Math.round(num(vm.stack.pop() as Value)) : 1;
        const arr = getCell(vm, acc).arr;
        if (!arr || d < 1 || d > arr.lo.length) throw err.subscript();
        vm.stack.push(upper ? arr.hi[d - 1] : arr.lo[d - 1]);
      });
      return {};
    }
    // WAITEVENT(ms): suspends the program until a GUI event (or timeout)
    if (name === 'WAITEVENT') {
      this.p++;
      let hasArg = false;
      if (this.accept('(')) {
        if (!this.isOp(')')) { this.parseExpr(); hasArg = true; }
        this.expect(')');
      }
      this.emit((vm) => {
        const ms = hasArg ? vm.popNum() : 0;
        const gui = vm.host.gui;
        if (!gui) { vm.stack.push(-1); return; }
        vm.wait(gui.waitEvent(ms), (v) => { vm.stack.push(v); });
      });
      return {};
    }
    const bi = BUILTINS[name];
    if (bi && !this.subs.has(name)) {
      this.p++;
      let argc = 0;
      if (this.accept('(')) {
        if (!this.isOp(')')) {
          do { this.parseExpr(); argc++; } while (this.accept(','));
        }
        this.expect(')');
      } else if (!bi.bare) this.fail(`expected ( after ${name}`);
      if (argc < bi.min || argc > Math.max(bi.sig.length, bi.min)) throw new SyntaxError_(`wrong number of arguments for ${name}`, t.line);
      this.emit((vm) => {
        const a = vm.stack.splice(vm.stack.length - argc, argc) as Value[];
        checkArgs(bi, a);
        vm.stack.push(bi.fn(vm, a));
      });
      return {};
    }
    const sub = this.subs.get(name);
    if (sub && sub.isFunc && !(this.scope.sub === sub && !this.isOp('(', this.peekAt(1)))) {
      this.p++;
      let argc = 0;
      if (this.accept('(')) {
        if (!this.isOp(')')) argc = this.parseCallArgs(')');
        this.expect(')');
      }
      this.emit((vm) => {
        const args = vm.stack.splice(vm.stack.length - argc, argc);
        vm.call(sub, args);
      });
      return {};
    }
    if (sub && !sub.isFunc) this.fail(`${name} is a SUB and has no value`);
    this.p++;
    if (RESERVED.has(name)) this.fail(`unexpected ${name}`);
    if (this.accept('(')) {
      const k = this.parseIndexList();
      const acc = this.varAcc(name, true);
      const lastPc = this.emit((vm) => {
        const idx = Compiler.popIdx(vm, k);
        const arr = Compiler.arr(vm, acc, k);
        vm.stack.push(arr.data[arr.index(idx)]);
      });
      return { lv: { kind: 'elem', acc, nidx: k, lastPc } };
    }
    // inside FUNCTION X, a bare "X" reads the return value
    const acc = this.scope.sub && this.scope.sub.isFunc && this.scope.sub.name === name
      ? { global: false, slot: this.scope.sub.retSlot, kind: this.scope.slots.has(name) ? this.scope.kinds[this.scope.sub.retSlot] : kindOfName(name), name }
      : this.varAcc(name);
    this.emitLoad(acc);
    return { lv: { kind: 'var', acc, nidx: 0, lastPc: this.pc - 1 } };
  }

  /** Arguments for SUB/FUNCTION calls: plain variables and elements are passed by reference. */
  parseCallArgs(close: string | null): number {
    let argc = 0;
    for (;;) {
      // whole-array argument: name()
      if (this.tok.t === 'id' && this.isOp('(', this.peekAt(1)) && this.isOp(')', this.peekAt(2))) {
        const name = this.next().s;
        this.p += 2;
        const acc = this.varAcc(name, true);
        this.emit((vm) => { vm.stack.push(getCell(vm, acc)); });
      } else {
        const start = this.pc;
        const info = this.parseExpr();
        if (info.lv && info.lv.lastPc === this.pc - 1) {
          const lv = info.lv;
          this.code.pop();
          this.lines.pop();
          if (lv.kind === 'var') {
            const a = lv.acc;
            this.emit((vm) => { vm.stack.push(getCell(vm, a)); });
          } else {
            const a = lv.acc, k = lv.nidx;
            this.emit((vm) => {
              const idx = Compiler.popIdx(vm, k);
              const arr = Compiler.arr(vm, a, k);
              vm.stack.push(new ElemRef(arr, arr.index(idx)));
            });
          }
        }
        void start;
      }
      argc++;
      if (!this.accept(',')) break;
      if (close && this.isOp(close)) this.fail('expression expected');
    }
    return argc;
  }

  // ---------------------------------------------------------------- program
  compile(): Program {
    while (this.tok.t !== 'eof') this.parseLine();
    if (this.ctl.length) {
      const c = this.ctl[this.ctl.length - 1];
      const names: Record<string, string> = { IF: 'IF without END IF', FOR: 'FOR without NEXT', WHILE: 'WHILE without WEND', DO: 'DO without LOOP', SELECT: 'SELECT without END SELECT' };
      throw new BasicError(names[c.type], c.line);
    }
    if (this.scope !== this.main) throw new BasicError(`${this.scope.sub!.isFunc ? 'FUNCTION' : 'SUB'} without END ${this.scope.sub!.isFunc ? 'FUNCTION' : 'SUB'}`, this.scope.sub!.line);
    this.emit((vm) => vm.end());
    this.resolveLabels(this.main);
    for (const r of this.pendingRestores) {
      const idx = this.dataLabels.get(r.label);
      if (idx === undefined) throw new BasicError('Label not defined', r.line);
      r.box.idx = idx;
    }
    for (const s of this.subs.values()) {
      if (!s.defined) throw new BasicError(`${s.isFunc ? 'FUNCTION' : 'SUB'} not defined`, s.line);
    }
    return { code: this.code, lines: this.lines, mainSlots: this.main.kinds, data: this.data, subs: this.subs };
  }

  private resolveLabels(sc: Scope) {
    for (const p of sc.pending) {
      const to = sc.labels.get(p.label);
      if (to === undefined) throw new BasicError('Label not defined', p.line);
      p.t.to = to;
    }
    sc.pending = [];
  }

  defineLabel(name: string) {
    if (this.scope.labels.has(name)) throw new BasicError('Duplicate label', this.tok.line);
    this.scope.labels.set(name, this.pc);
    this.dataLabels.set(name, this.data.length);
  }

  /** Jump to a label or line number (resolved at the end of the scope). */
  jumpTo(label: string, gosub = false) {
    const t: Target = { to: -1 };
    if (gosub) {
      this.emit((vm) => {
        if (vm.frame.gosub.length > 10000) throw new BasicError('Out of stack space');
        vm.frame.gosub.push(vm.pc);
        vm.pc = t.to;
      });
    } else this.jmp(t);
    this.scope.pending.push({ label, t, line: this.line });
  }
  parseLabelRef(): string {
    const t = this.next();
    if (t.t === 'num' || t.t === 'linenum') return String(t.n);
    if (t.t === 'id') return t.s;
    throw new SyntaxError_('expected a label or line number', t.line);
  }

  private parseLine() {
    const t = this.tok;
    this.line = t.line;
    if (t.t === 'linenum') { this.p++; this.defineLabel(String(t.n)); }
    if (this.tok.t === 'label') { this.defineLabel(this.next().s); }
    this.parseStatements();
    if (this.tok.t === 'nl') this.p++;
    else if (this.tok.t !== 'eof') this.fail('expected end of line');
  }

  /** Statements separated by ':' up to the end of the line (or ELSE inside a single-line IF). */
  parseStatements() {
    for (;;) {
      if (this.isOp(':')) { this.p++; continue; }
      if (this.tok.t === 'nl' || this.tok.t === 'eof') return;
      if (this.single > 0 && this.isWord('ELSE')) return;
      if (this.tok.t === 'data') { this.parseData(this.next().s); continue; }
      this.line = this.tok.line;
      this.parseStatement();
      if (this.isOp(':')) { this.p++; continue; }
      if (this.eol()) return;
      if (this.single > 0 && this.isWord('ELSE')) return;
      this.fail(`unexpected "${this.tok.s}"`);
    }
  }

  private parseData(raw: string) {
    let i = 0;
    while (i <= raw.length) {
      while (raw[i] === ' ') i++;
      if (raw[i] === '"') {
        const j = raw.indexOf('"', i + 1);
        const end = j < 0 ? raw.length : j;
        this.data.push({ s: raw.slice(i + 1, end), quoted: true });
        i = end + 1;
        while (i < raw.length && raw[i] !== ',') i++;
      } else {
        let j = raw.indexOf(',', i);
        if (j < 0) j = raw.length;
        this.data.push({ s: raw.slice(i, j).trim(), quoted: false });
        i = j;
      }
      if (raw[i] === ',') i++;
      else break;
    }
  }

  // ---------------------------------------------------------------- statements
  private parseStatement() {
    const t = this.tok;
    if (t.t !== 'id') this.fail(`unexpected "${t.s}"`);
    const w = t.s;
    switch (w) {
      case 'LET': this.p++; return this.parseAssign();
      case 'PRINT': case 'LPRINT': this.p++; return this.parsePrint();
      case 'IF': this.p++; return this.parseIf();
      case 'ELSEIF': this.p++; return this.parseElseIf();
      case 'ELSE': this.p++; return this.parseElse();
      case 'END': this.p++; return this.parseEnd();
      case 'FOR': this.p++; return this.parseFor();
      case 'NEXT': this.p++; return this.parseNext();
      case 'WHILE': this.p++; return this.parseWhile();
      case 'WEND': this.p++; return this.parseWend();
      case 'DO': this.p++; return this.parseDo();
      case 'LOOP': this.p++; return this.parseLoop();
      case 'SELECT': this.p++; return this.parseSelect();
      case 'CASE': this.p++; return this.parseCase();
      case 'GOTO': this.p++; return this.jumpTo(this.parseLabelRef());
      case 'GOSUB': this.p++; return this.jumpTo(this.parseLabelRef(), true);
      case 'RETURN':
        this.p++;
        if (!this.atEnd()) {
          // RETURN label: pop the GOSUB and jump elsewhere
          const lbl = this.parseLabelRef();
          this.emit((vm) => { if (!vm.frame.gosub.pop() && vm.frame.gosub.length < 0) throw new BasicError('RETURN without GOSUB'); });
          return this.jumpTo(lbl);
        }
        this.emit((vm) => {
          const r = vm.frame.gosub.pop();
          if (r === undefined) throw new BasicError('RETURN without GOSUB');
          vm.pc = r;
        });
        return;
      case 'EXIT': this.p++; return this.parseExit();
      case 'SUB': case 'FUNCTION': this.p++; return this.parseSubDef(w === 'FUNCTION');
      case 'DECLARE': case 'DEFINT': case 'DEFSNG': case 'DEFDBL': case 'DEFLNG': case 'DEFSTR': case 'OPTION':
        while (!(this.tok.t === 'nl' || this.tok.t === 'eof')) this.p++;
        return;
      case 'CALL': {
        this.p++;
        const name = this.ident();
        const sub = this.subs.get(name);
        if (!sub) throw new BasicError('Sub not defined', this.line);
        let argc = 0;
        if (this.accept('(')) {
          if (!this.isOp(')')) argc = this.parseCallArgs(')');
          this.expect(')');
        }
        return this.emitCall(sub, argc);
      }
      case 'DIM': case 'REDIM': this.p++; return this.parseDim();
      case 'CONST': this.p++; return this.parseConst();
      case 'STOP': case 'SYSTEM': this.p++; this.emit((vm) => vm.end()); return;
      case 'READ': this.p++; return this.parseRead();
      case 'RESTORE': {
        this.p++;
        if (this.atEnd()) { this.emit((vm) => { vm.dataPtr = 0; }); return; }
        const box = { idx: 0 };
        this.pendingRestores.push({ label: this.parseLabelRef(), box, line: this.line });
        this.emit((vm) => { vm.dataPtr = box.idx; });
        return;
      }
      case 'SWAP': {
        this.p++;
        this.parseRefTarget();
        this.expect(',');
        this.parseRefTarget();
        this.emit((vm) => {
          const b = vm.stack.pop() as Ref, a = vm.stack.pop() as Ref;
          const av = a.get(), bv = b.get();
          if (typeof av !== typeof bv) throw err.typeMismatch();
          a.set(bv);
          b.set(av);
        });
        return;
      }
    }
    if (compileStatementExt(this, w)) return;
    // SUB call without CALL
    const sub = this.subs.get(w);
    if (sub && !sub.isFunc) {
      this.p++;
      const argc = this.atEnd() ? 0 : this.parseCallArgs(null);
      return this.emitCall(sub, argc);
    }
    if (w === 'MID$' && this.isOp('(', this.peekAt(1))) return this.parseMidStatement();
    return this.parseAssign();
  }

  emitCall(sub: SubInfo, argc: number) {
    this.emit((vm) => {
      const args = vm.stack.splice(vm.stack.length - argc, argc);
      vm.call(sub, args);
    });
    if (sub.isFunc) this.emit((vm) => { vm.stack.pop(); }); // discard result when called as a statement
  }

  parseAssign() {
    const name = this.ident();
    const sub = this.scope.sub;
    if (this.isOp('(')) {
      this.p++;
      const k = this.parseIndexList();
      const acc = this.varAcc(name, true);
      this.expect('=');
      this.parseExpr();
      this.emit((vm) => {
        const v = vm.stack.pop() as Value;
        const idx = Compiler.popIdx(vm, k);
        const arr = Compiler.arr(vm, acc, k);
        arr.data[arr.index(idx)] = coerce(v, arr.kind);
      });
      return;
    }
    if (!this.isOp('=')) this.fail(this.subs.has(name) ? `${name} is a FUNCTION` : `expected = after ${name}`);
    this.p++;
    if (this.consts.has(name) && this.scope === this.main && !this.constLock) throw new BasicError('Duplicate definition', this.line);
    this.parseExpr();
    if (sub && sub.isFunc && sub.name === name) {
      const slot = sub.retSlot;
      this.emit((vm) => { vm.frame.cells[slot].set(vm.stack.pop() as Value); });
      return;
    }
    this.emitStore(this.varAcc(name));
  }

  private parseMidStatement() {
    this.p += 2; // MID$ (
    this.parseRefTarget();
    this.expect(',');
    this.parseExpr();
    let hasLen = false;
    if (this.accept(',')) { this.parseExpr(); hasLen = true; }
    this.expect(')');
    this.expect('=');
    this.parseExpr();
    this.emit((vm) => {
      const rep = vm.popStr();
      const len = hasLen ? Math.round(vm.popNum()) : Infinity;
      const start = Math.round(vm.popNum());
      const ref = vm.stack.pop() as Ref;
      const cur = ref.get();
      if (typeof cur !== 'string') throw err.typeMismatch();
      if (start < 1 || start > cur.length) throw err.illegal('MID$ start');
      const n = Math.min(rep.length, len, cur.length - start + 1);
      ref.set(cur.slice(0, start - 1) + rep.slice(0, n) + cur.slice(start - 1 + n));
    });
  }

  private parsePrint() {
    let toFile = false;
    if (this.accept('#')) {
      this.parseExpr();
      this.expect(',');
      toFile = true;
      this.emit((vm) => { const f = vm.file(vm.popNum()); if (f.mode === 'input') throw new BasicError('Bad file mode'); vm.out = f; });
    } else this.emit((vm) => { vm.out = null; });
    if (this.isWord('USING')) this.fail('PRINT USING is not supported');
    let lastSep: string | null = null;
    while (!this.atEnd()) {
      if (this.accept(';')) { lastSep = ';'; continue; }
      if (this.accept(',')) { this.emit((vm) => vm.printZone()); lastSep = ','; continue; }
      if ((this.isWord('TAB') || this.isWord('SPC')) && this.isOp('(', this.peekAt(1))) {
        const tab = this.next().s === 'TAB';
        this.p++;
        this.parseExpr();
        this.expect(')');
        if (tab) this.emit((vm) => vm.printTab(vm.popNum()));
        else this.emit((vm) => { const k = vm.popNum(); vm.write(' '.repeat(Math.max(0, Math.round(k)))); });
        lastSep = ';';
        continue;
      }
      this.parseExpr();
      this.emit((vm) => vm.printValue(vm.stack.pop() as Value));
      lastSep = null;
    }
    if (lastSep === null) this.emit((vm) => vm.write('\n'));
    if (toFile) this.emit((vm) => { vm.out = null; });
  }

  // ---- IF
  private parseIf() {
    this.parseExpr();
    if (this.accept('GOTO')) {
      // IF cond GOTO label
      const t: Target = { to: -1 };
      this.jnz(t);
      this.scope.pending.push({ label: this.parseLabelRef(), t, line: this.line });
      return;
    }
    this.expect('THEN');
    if (this.tok.t === 'nl' || this.tok.t === 'eof') {
      const jz = this.jz();
      this.ctl.push({ type: 'IF', line: this.line, jz, ends: [], sawElse: false });
      return;
    }
    // single-line IF
    const jz = this.jz();
    this.single++;
    if (this.tok.t === 'num') this.jumpTo(this.parseLabelRef());
    else this.parseStatements();
    if (this.isWord('ELSE')) {
      this.p++;
      const j = this.jmp();
      this.here(jz);
      if (this.tok.t === 'num') this.jumpTo(this.parseLabelRef());
      else this.parseStatements();
      this.here(j);
    } else this.here(jz);
    this.single--;
  }
  private topCtl<T extends Ctl['type']>(type: T, what: string): Extract<Ctl, { type: T }> {
    const c = this.ctl[this.ctl.length - 1];
    if (!c || c.type !== type) throw new BasicError(`${what} without ${type}`, this.line);
    return c as Extract<Ctl, { type: T }>;
  }
  private parseElseIf() {
    const c = this.topCtl('IF', 'ELSEIF');
    if (c.sawElse) this.fail('ELSEIF after ELSE');
    c.ends.push(this.jmp());
    if (c.jz) this.here(c.jz);
    this.parseExpr();
    this.expect('THEN');
    c.jz = this.jz();
  }
  private parseElse() {
    const c = this.topCtl('IF', 'ELSE');
    if (c.sawElse) this.fail('duplicate ELSE');
    c.sawElse = true;
    c.ends.push(this.jmp());
    if (c.jz) this.here(c.jz);
    c.jz = null;
  }
  private parseEnd() {
    if (this.accept('IF')) {
      const c = this.topCtl('IF', 'END IF');
      this.ctl.pop();
      if (c.jz) this.here(c.jz);
      for (const e of c.ends) this.here(e);
      return;
    }
    if (this.accept('SELECT')) {
      const c = this.topCtl('SELECT', 'END SELECT');
      this.ctl.pop();
      if (c.next) this.here(c.next);
      for (const e of c.ends) this.here(e);
      return;
    }
    if (this.isWord('SUB') || this.isWord('FUNCTION')) {
      const isFunc = this.next().s === 'FUNCTION';
      return this.endSub(isFunc);
    }
    this.emit((vm) => vm.end());
  }

  // ---- loops
  private parseFor() {
    const name = this.ident();
    const acc = this.varAcc(name);
    if (acc.kind === 'str') throw new BasicError('Type mismatch', this.line);
    this.expect('=');
    this.parseExpr();
    this.emitStore(acc);
    this.expect('TO');
    const end = this.tempAcc();
    this.parseExpr();
    this.emitStore(end);
    const step = this.tempAcc();
    if (this.accept('STEP')) this.parseExpr();
    else this.pushConst(1);
    this.emitStore(step);
    const check = this.pc;
    const exit: Target = { to: -1 };
    this.emit((vm) => {
      const v = getCell(vm, acc).get() as number;
      const e = getCell(vm, end).get() as number;
      const s = getCell(vm, step).get() as number;
      if (s >= 0 ? v > e : v < e) vm.pc = exit.to;
    });
    this.ctl.push({ type: 'FOR', line: this.line, acc, end, step, check, breaks: [exit] });
  }
  private parseNext() {
    const closeOne = (name: string | null) => {
      const c = this.ctl[this.ctl.length - 1];
      if (!c || c.type !== 'FOR') throw new BasicError('NEXT without FOR', this.line);
      if (name && name !== c.acc.name) throw new BasicError('NEXT without FOR', this.line);
      this.ctl.pop();
      const { acc, step, check } = c;
      this.emit((vm) => {
        const cell = getCell(vm, acc);
        cell.set((cell.get() as number) + (getCell(vm, step).get() as number));
        vm.pc = check;
      });
      for (const b of c.breaks) this.here(b);
    };
    if (this.atEnd()) return closeOne(null);
    do closeOne(this.ident()); while (this.accept(','));
  }
  private parseWhile() {
    const top = this.pc;
    this.parseExpr();
    const exit = this.jz();
    this.ctl.push({ type: 'WHILE', line: this.line, top, breaks: [exit] });
  }
  private parseWend() {
    const c = this.topCtl('WHILE', 'WEND');
    this.ctl.pop();
    this.emit((vm) => { vm.pc = c.top; });
    for (const b of c.breaks) this.here(b);
  }
  private parseDo() {
    const top = this.pc;
    const breaks: Target[] = [];
    if (this.accept('WHILE')) { this.parseExpr(); breaks.push(this.jz()); }
    else if (this.accept('UNTIL')) { this.parseExpr(); breaks.push(this.jnz()); }
    this.ctl.push({ type: 'DO', line: this.line, top, breaks });
  }
  private parseLoop() {
    const c = this.topCtl('DO', 'LOOP');
    this.ctl.pop();
    const top: Target = { to: c.top };
    if (this.accept('WHILE')) { this.parseExpr(); this.jnz(top); }
    else if (this.accept('UNTIL')) { this.parseExpr(); this.jz(top); }
    else this.jmp(top);
    for (const b of c.breaks) this.here(b);
  }
  private parseExit() {
    const w = this.next();
    if (w.t !== 'id') this.fail('expected FOR, DO, WHILE, SUB or FUNCTION');
    if (w.s === 'SUB' || w.s === 'FUNCTION') {
      const sub = this.scope.sub;
      if (!sub || sub.isFunc !== (w.s === 'FUNCTION')) throw new BasicError(`EXIT ${w.s} not within ${w.s}`, this.line);
      this.scope.exits.push(this.jmp());
      return;
    }
    const type = w.s === 'FOR' ? 'FOR' : w.s === 'DO' ? 'DO' : w.s === 'WHILE' ? 'WHILE' : null;
    if (!type) this.fail('expected FOR, DO, WHILE, SUB or FUNCTION');
    for (let i = this.ctl.length - 1; i >= 0; i--) {
      const c = this.ctl[i];
      if (c.type === type) {
        (c as { breaks: Target[] }).breaks.push(this.jmp());
        return;
      }
    }
    throw new BasicError(`EXIT ${type} not within ${type}`, this.line);
  }

  // ---- SELECT CASE
  private parseSelect() {
    this.expect('CASE');
    const tmp = this.tempAcc('any');
    this.parseExpr();
    this.emitStore(tmp);
    this.ctl.push({ type: 'SELECT', line: this.line, tmp, next: null, ends: [], any: false });
  }
  private parseCase() {
    const c = this.topCtl('SELECT', 'CASE');
    if (c.any) c.ends.push(this.jmp());
    if (c.next) this.here(c.next);
    c.any = true;
    if (this.accept('ELSE')) { c.next = null; return; }
    const body: Target[] = [];
    do {
      if (this.accept('IS')) {
        const op = this.next();
        if (op.t !== 'op' || !['=', '<>', '<', '>', '<=', '>='].includes(op.s)) this.fail('expected a comparison after IS');
        this.emitLoad(c.tmp);
        this.parseExpr();
        const o = op.s;
        this.emit((vm) => {
          const b = vm.stack.pop() as Value, a = vm.stack.pop() as Value;
          const r = cmp(a, b);
          vm.stack.push(bool(o === '=' ? r === 0 : o === '<>' ? r !== 0 : o === '<' ? r < 0 : o === '>' ? r > 0 : o === '<=' ? r <= 0 : r >= 0));
        });
      } else {
        this.emitLoad(c.tmp);
        this.parseExpr();
        if (this.accept('TO')) {
          this.parseExpr();
          this.emit((vm) => {
            const hi = vm.stack.pop() as Value, lo = vm.stack.pop() as Value, v = vm.stack.pop() as Value;
            vm.stack.push(bool(cmp(v, lo) >= 0 && cmp(v, hi) <= 0));
          });
        } else {
          this.emit((vm) => { const b = vm.stack.pop() as Value, a = vm.stack.pop() as Value; vm.stack.push(bool(cmp(a, b) === 0)); });
        }
      }
      body.push(this.jnz());
    } while (this.accept(','));
    c.next = this.jmp();
    for (const b of body) this.here(b);
  }

  // ---- SUB / FUNCTION
  private parseSubDef(isFunc: boolean) {
    if (this.scope !== this.main) throw new BasicError('SUB or FUNCTION inside another', this.line);
    if (this.ctl.length) throw new BasicError('SUB or FUNCTION inside a block', this.line);
    const name = this.ident();
    const sub = this.subs.get(name)!;
    const skip = this.jmp();
    const sc = new Scope(sub);
    this.scope = sc;
    sub.entry = this.pc;
    sub.defined = true;
    if (isFunc) sub.retSlot = this.alloc(sc, name, kindOfName(name));
    if (this.accept('(')) {
      if (!this.isOp(')')) {
        do {
          const pn = this.ident();
          let isArray = false;
          if (this.accept('(')) { this.expect(')'); isArray = true; }
          if (this.accept('AS')) {
            const ty = this.ident();
            if (ty === 'STRING') sc.asKinds.set(pn, 'str');
            else if (ty === 'INTEGER' || ty === 'LONG') sc.asKinds.set(pn, 'int');
          }
          const kind = this.kindFor(pn, sc);
          const slot = this.alloc(sc, isArray ? pn + '()' : pn, kind);
          sub.params.push({ slot, kind, isArray });
        } while (this.accept(','));
      }
      this.expect(')');
    }
    this.accept('STATIC');
    (sub as SubInfo & { skip?: Target }).skip = skip;
  }
  private endSub(isFunc: boolean) {
    const sc = this.scope;
    const sub = sc.sub;
    if (!sub || sub.isFunc !== isFunc) throw new BasicError(`END ${isFunc ? 'FUNCTION' : 'SUB'} without ${isFunc ? 'FUNCTION' : 'SUB'}`, this.line);
    if (this.ctl.length) {
      const c = this.ctl[this.ctl.length - 1];
      throw new BasicError(`${c.type} without end`, c.line);
    }
    for (const e of sc.exits) this.here(e);
    this.emit((vm) => vm.ret());
    this.resolveLabels(sc);
    sub.slotKinds = sc.kinds;
    this.scope = this.main;
    this.here((sub as SubInfo & { skip?: Target }).skip!);
  }

  // ---- declarations
  private parseDim() {
    const sharedDecl = this.accept('SHARED');
    void sharedDecl;
    do {
      const name = this.ident();
      let bounds = 0;
      const boundsCode: (() => void)[] = [];
      const hasArr = this.accept('(');
      const ranges: boolean[] = [];
      if (hasArr) {
        do {
          this.parseExpr();
          if (this.accept('TO')) { this.parseExpr(); ranges.push(true); }
          else ranges.push(false);
          bounds++;
        } while (this.accept(','));
        this.expect(')');
      }
      void boundsCode;
      if (this.accept('AS')) {
        const ty = this.ident();
        const kind: VarKind = ty === 'STRING' ? 'str' : ty === 'INTEGER' || ty === 'LONG' ? 'int' : 'num';
        if (ty !== 'STRING' && name.endsWith('$')) throw new BasicError('Type mismatch', this.line);
        this.scope.asKinds.set(name, kind);
        if (this.scope === this.main) this.main.asKinds.set(name, kind);
      }
      if (hasArr) {
        const acc = this.varAcc(name, true);
        const k = bounds;
        const rr = ranges.slice();
        this.emit((vm) => {
          const vals: number[] = [];
          for (let i = 0; i < rr.filter(Boolean).length + k; i++) vals.unshift(vm.popNum());
          const b: [number, number][] = [];
          let j = 0;
          for (let i = 0; i < k; i++) {
            if (rr[i]) { b.push([Math.round(vals[j]), Math.round(vals[j + 1])]); j += 2; }
            else { b.push([0, Math.round(vals[j])]); j += 1; }
          }
          const cell = getCell(vm, acc);
          const kind = acc.kind === 'any' ? 'num' : acc.kind;
          cell.arr = new BasicArray(b, kind);
        });
      } else {
        // scalar DIM: make sure the slot exists with the declared kind
        this.varAcc(name);
      }
    } while (this.accept(','));
  }
  private parseConst() {
    do {
      const name = this.ident();
      this.expect('=');
      this.consts.add(name);
      // a CONST takes the type of its value (CONST K = "H" is a string)
      if (!/[$%&!#]$/.test(name)) {
        this.scope.asKinds.set(name, 'any');
        if (this.scope === this.main) this.main.asKinds.set(name, 'any');
      }
      this.parseExpr();
      const acc = this.scope === this.main ? this.varAcc(name) : this.varAcc(name);
      this.constLock = true;
      this.emitStore(acc);
      this.constLock = false;
    } while (this.accept(','));
  }
  private parseRead() {
    do {
      this.parseRefTarget();
      this.emit((vm) => {
        const ref = vm.stack.pop() as Ref;
        ref.set(vm.readData(ref.kind === 'str' ? 'str' : 'num'));
      });
    } while (this.accept(','));
  }
}

function num(v: Value): number {
  if (typeof v !== 'number') throw err.typeMismatch();
  return v;
}
function intOp(a: Value, b: Value, f: (x: number, y: number) => number): number {
  return f(Math.round(num(a)), Math.round(num(b)));
}
export function cmp(a: Value, b: Value): number {
  if (typeof a !== typeof b) throw err.typeMismatch();
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compile source to a runnable program. Throws BasicError / SyntaxError_ with line numbers. */
export function compile(src: string): Program {
  return new Compiler(src).compile();
}

export { getCell };
