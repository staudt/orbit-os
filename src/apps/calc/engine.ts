// Calc spreadsheet engine: pure logic, no UI, no project imports.

export type CellValue = number | string | { error: string };
export const COLS = 26;
export const ROWS = 99;

const E_DIV0 = '#DIV/0!';
const E_REF = '#REF!';
const E_CYCLE = '#CYCLE!';
const E_PARSE = '#ERROR!';
const E_NAME = '#NAME?';
const E_VALUE = '#VALUE!';

export function cellId(col: number, row: number): string {
  return String.fromCharCode(65 + col) + (row + 1);
}

export function parseId(id: string): { col: number; row: number } | null {
  const m = /^([A-Za-z])([1-9]\d?)$/.exec(id);
  if (!m) return null;
  const row = parseInt(m[2], 10) - 1;
  if (row < 0 || row >= ROWS) return null;
  return { col: m[1].toUpperCase().charCodeAt(0) - 65, row };
}

function normId(id: string): string | null {
  const p = parseId(id);
  return p ? cellId(p.col, p.row) : null;
}

// ---------- raw interpretation ----------

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (!NUM_RE.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---------- formula parsing ----------

type Node =
  | { t: 'num'; v: number }
  | { t: 'ref'; id: string | null } // null => out of range
  | { t: 'err'; code: string }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node };

class FormulaError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

type Tok = { k: 'num'; v: number } | { k: 'ref'; id: string | null } | { k: 'err' } | { k: 'op'; v: string };

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if (rest.startsWith('#REF!')) { toks.push({ k: 'err' }); i += 5; continue; }
    if ((m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest))) {
      toks.push({ k: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if ((m = /^(\$?)([A-Za-z]+)(\$?)(\d+)?/.exec(rest))) {
      const after = rest.slice(m[0].length).trimStart()[0];
      if (after === '(' || (m[4] === undefined && !m[1] && !m[3])) throw new FormulaError(E_NAME);
      if (m[4] === undefined) throw new FormulaError(E_PARSE);
      const id = m[2].length === 1 ? normId(m[2] + m[4]) : null;
      toks.push({ k: 'ref', id });
      i += m[0].length;
      continue;
    }
    if ('+-*/^()'.includes(c)) { toks.push({ k: 'op', v: c }); i++; continue; }
    throw new FormulaError(E_PARSE);
  }
  return toks;
}

function parseFormula(src: string): Node {
  const toks = lex(src);
  let p = 0;
  const isOp = (v: string) => { const t = toks[p]; return !!t && t.k === 'op' && t.v === v; };
  const expr = (): Node => {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: string }).v;
      a = { t: 'bin', op, a, b: term() };
    }
    return a;
  };
  const term = (): Node => {
    let a = unary();
    while (isOp('*') || isOp('/')) {
      const op = (toks[p++] as { v: string }).v;
      a = { t: 'bin', op, a, b: unary() };
    }
    return a;
  };
  const unary = (): Node => {
    if (isOp('-') || isOp('+')) {
      const op = (toks[p++] as { v: string }).v;
      return { t: 'un', op, a: unary() };
    }
    return power();
  };
  const power = (): Node => {
    const a = atom();
    if (isOp('^')) {
      p++;
      return { t: 'bin', op: '^', a, b: unary() };
    }
    return a;
  };
  const atom = (): Node => {
    const t = toks[p++];
    if (!t) throw new FormulaError(E_PARSE);
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'ref') return { t: 'ref', id: t.id };
    if (t.k === 'err') return { t: 'err', code: E_REF };
    if (t.v === '(') {
      const e = expr();
      if (!isOp(')')) throw new FormulaError(E_PARSE);
      p++;
      return e;
    }
    throw new FormulaError(E_PARSE);
  };
  const n = expr();
  if (p !== toks.length) throw new FormulaError(E_PARSE);
  return n;
}

function collectRefs(n: Node, out: Set<string>): void {
  if (n.t === 'ref') { if (n.id) out.add(n.id); }
  else if (n.t === 'un') collectRefs(n.a, out);
  else if (n.t === 'bin') { collectRefs(n.a, out); collectRefs(n.b, out); }
}

// ---------- formatting ----------

function formatNumber(n: number, decimals?: number): string {
  if (Object.is(n, -0)) n = 0;
  if (decimals !== undefined) {
    const s = n.toFixed(Math.max(0, Math.min(100, decimals)));
    return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
  }
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12) {
    return n.toExponential(9).replace(/\.?0+e/, 'e');
  }
  const p = Number(n.toPrecision(10));
  let s = String(p);
  if (s.includes('e')) {
    s = p.toFixed(20).replace(/\.?0+$/, '');
  }
  return s;
}

function sameValue(a: CellValue | undefined, b: CellValue | undefined): boolean {
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object') return a.error === b.error;
  return false;
}

// ---------- Sheet ----------

interface Entry {
  kind: 'formula' | 'const';
  ast?: Node;
  value: CellValue; // for const
}

export class Sheet {
  private raws = new Map<string, string>();
  private vals = new Map<string, CellValue>();
  private entries = new Map<string, Entry>();
  private precedents = new Map<string, Set<string>>();
  private dependents = new Map<string, Set<string>>();

  set(id: string, raw: string): string[] {
    const nid = normId(id);
    if (!nid) return [];
    const old = this.vals.get(nid);
    this.store(nid, raw);
    const affected = this.closure(nid);
    const changed = new Set<string>([nid]);
    const oldVals = new Map<string, CellValue | undefined>();
    for (const a of affected) oldVals.set(a, a === nid ? old : this.vals.get(a));
    this.evaluate(affected);
    for (const a of affected) {
      if (a !== nid && !sameValue(oldVals.get(a), this.vals.get(a))) changed.add(a);
    }
    return [...changed];
  }

  raw(id: string): string {
    const nid = normId(id);
    return (nid && this.raws.get(nid)) || '';
  }

  value(id: string): CellValue {
    const nid = normId(id);
    if (!nid) return { error: E_REF };
    return this.vals.get(nid) ?? '';
  }

  display(id: string, opts?: { decimals?: number }): string {
    const v = this.value(id);
    if (typeof v === 'number') return formatNumber(v, opts?.decimals);
    if (typeof v === 'string') return v;
    return v.error;
  }

  clear(): void {
    this.raws.clear();
    this.vals.clear();
    this.entries.clear();
    this.precedents.clear();
    this.dependents.clear();
  }

  /** Full recalculation of every cell. */
  recalc(): void {
    this.evaluate(new Set(this.raws.keys()));
  }

  usedRange(): { cols: number; rows: number } {
    let cols = 0, rows = 0;
    for (const id of this.raws.keys()) {
      const p = parseId(id)!;
      cols = Math.max(cols, p.col + 1);
      rows = Math.max(rows, p.row + 1);
    }
    return { cols, rows };
  }

  *cells(): IterableIterator<[string, string]> {
    for (const e of this.raws) yield e;
  }

  toCSV(): string {
    const { cols, rows } = this.usedRange();
    const lines: string[] = [];
    for (let r = 0; r < rows; r++) {
      const f: string[] = [];
      for (let c = 0; c < cols; c++) {
        const raw = this.raws.get(cellId(c, r)) ?? '';
        f.push(/[",\r\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw);
      }
      lines.push(f.join(','));
    }
    return lines.join('\n');
  }

  static fromCSV(csv: string): Sheet {
    const sheet = new Sheet();
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false, inQ = false, any = false;
    const endField = () => { row.push(field); field = ''; quoted = false; any = true; };
    const endRow = () => { endField(); rows.push(row); row = []; any = false; };
    for (let i = 0; i < csv.length; i++) {
      const c = csv[i];
      if (inQ) {
        if (c === '"') {
          if (csv[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += c;
      } else if (c === '"' && field === '' && !quoted) {
        inQ = true; quoted = true; any = true;
      } else if (c === ',') endField();
      else if (c === '\r') { if (csv[i + 1] === '\n') i++; endRow(); }
      else if (c === '\n') endRow();
      else { field += c; any = true; }
    }
    if (any || field !== '' || row.length) endRow();
    rows.forEach((r, ri) => {
      if (ri >= ROWS) return;
      r.forEach((raw, ci) => {
        if (ci >= COLS || raw === '') return;
        sheet.store(cellId(ci, ri), raw);
      });
    });
    sheet.recalc();
    return sheet;
  }

  static shiftFormula(raw: string, dc: number, dr: number): string {
    if (!raw.startsWith('=')) return raw;
    return raw.replace(
      /(?<![A-Za-z0-9_$#.])(\$?)([A-Za-z])(\$?)(\d+)(?![A-Za-z0-9_(])/g,
      (whole, ac: string, col: string, ar: string, row: string) => {
        const p = parseId(col + row);
        if (!p) return whole;
        const c = ac ? p.col : p.col + dc;
        const r = ar ? p.row : p.row + dr;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return E_REF;
        return ac + String.fromCharCode(65 + c) + ar + (r + 1);
      },
    );
  }

  // ----- internals -----

  /** Store raw text and update the dependency graph (no evaluation). */
  private store(id: string, raw: string): void {
    for (const p of this.precedents.get(id) ?? []) this.dependents.get(p)?.delete(id);
    this.precedents.delete(id);
    if (raw === '') {
      this.raws.delete(id);
      this.entries.delete(id);
      this.vals.delete(id);
      return;
    }
    this.raws.set(id, raw);
    let entry: Entry;
    if (raw.startsWith('=')) {
      let ast: Node;
      try {
        ast = parseFormula(raw.slice(1));
      } catch (e) {
        ast = { t: 'err', code: e instanceof FormulaError ? e.code : E_PARSE };
      }
      const refs = new Set<string>();
      collectRefs(ast, refs);
      this.precedents.set(id, refs);
      for (const r of refs) {
        let s = this.dependents.get(r);
        if (!s) this.dependents.set(r, (s = new Set()));
        s.add(id);
      }
      entry = { kind: 'formula', ast, value: '' };
    } else if (raw.startsWith("'")) {
      entry = { kind: 'const', value: raw.slice(1) };
    } else {
      const n = parseNumber(raw);
      entry = { kind: 'const', value: n !== null ? n : raw };
    }
    this.entries.set(id, entry);
  }

  private closure(id: string): Set<string> {
    const seen = new Set<string>([id]);
    const stack = [id];
    while (stack.length) {
      const x = stack.pop()!;
      for (const d of this.dependents.get(x) ?? []) {
        if (!seen.has(d)) { seen.add(d); stack.push(d); }
      }
    }
    return seen;
  }

  /** Evaluate the given cells in topological order (Kahn); leftovers are in/behind cycles. */
  private evaluate(set: Set<string>): void {
    const indeg = new Map<string, number>();
    for (const id of set) {
      let n = 0;
      for (const p of this.precedents.get(id) ?? []) if (set.has(p)) n++;
      indeg.set(id, n);
    }
    const queue: string[] = [];
    for (const [id, n] of indeg) if (n === 0) queue.push(id);
    let done = 0;
    while (queue.length) {
      const id = queue.shift()!;
      done++;
      this.computeCell(id);
      for (const d of this.dependents.get(id) ?? []) {
        if (!set.has(d)) continue;
        const n = indeg.get(d)! - 1;
        indeg.set(d, n);
        if (n === 0) queue.push(d);
      }
    }
    if (done < set.size) {
      for (const [id, n] of indeg) {
        if (n > 0) this.vals.set(id, { error: E_CYCLE });
      }
    }
  }

  private computeCell(id: string): void {
    const e = this.entries.get(id);
    if (!e) { this.vals.delete(id); return; }
    this.vals.set(id, e.kind === 'const' ? e.value : this.evalNode(e.ast!, true));
  }

  private evalNode(n: Node, top = false): CellValue {
    switch (n.t) {
      case 'num': return n.v;
      case 'err': return { error: n.code };
      case 'ref': {
        if (!n.id) return { error: E_REF };
        if (!this.raws.has(n.id)) return 0;
        const v = this.vals.get(n.id) ?? 0;
        return top ? v : v;
      }
      case 'un': {
        const a = this.evalNode(n.a);
        if (typeof a === 'object') return a;
        if (typeof a === 'string') return { error: E_VALUE };
        return n.op === '-' ? -a : a;
      }
      case 'bin': {
        const a = this.evalNode(n.a);
        if (typeof a === 'object') return a;
        const b = this.evalNode(n.b);
        if (typeof b === 'object') return b;
        if (typeof a === 'string' || typeof b === 'string') return { error: E_VALUE };
        let r: number;
        switch (n.op) {
          case '+': r = a + b; break;
          case '-': r = a - b; break;
          case '*': r = a * b; break;
          case '/':
            if (b === 0) return { error: E_DIV0 };
            r = a / b;
            break;
          default:
            if (a === 0 && b < 0) return { error: E_DIV0 };
            r = Math.pow(a, b);
        }
        return Number.isFinite(r) ? r : { error: E_VALUE };
      }
    }
  }
}
