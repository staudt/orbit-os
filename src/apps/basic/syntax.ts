import { C } from '../../core/palette';
import { STATEMENTS } from '../../basic/lexer';
import { BUILTINS } from '../../basic/builtins';

const EXTRA = [
  'THEN', 'ELSE', 'ELSEIF', 'TO', 'STEP', 'AS', 'INTEGER', 'STRING', 'SINGLE', 'DOUBLE', 'LONG', 'OUTPUT', 'APPEND', 'IS',
  'SHARED', 'UNTIL', 'WEND', 'LOOP', 'NEXT', 'RETURN', 'STATIC', 'TAB', 'SPC', 'LBOUND', 'UBOUND', 'BF', 'USING', 'FOR',
  'WAITEVENT',
];
export const KEYWORDS = new Set<string>([...STATEMENTS, ...EXTRA]);
export const FUNCTIONS = new Set<string>(Object.keys(BUILTINS));

/** Walk a BASIC source line, reporting word/string/comment/number spans. */
function scan(line: string, fn: (kind: 'kw' | 'fn' | 'str' | 'num' | 'rem' | 'word' | 'label', a: number, b: number) => void) {
  let i = 0;
  const n = line.length;
  // leading line number or label
  const m = /^\s*(\d+|[A-Za-z_][A-Za-z0-9_]*:)/.exec(line);
  if (m && (/^\s*\d/.test(line) || !KEYWORDS.has(m[1].slice(0, -1).toUpperCase()))) {
    const start = m[0].length - m[1].length;
    fn('label', start, m[0].length);
    i = m[0].length;
  }
  while (i < n) {
    const ch = line[i];
    if (ch === '"') {
      const j = line.indexOf('"', i + 1);
      const e = j < 0 ? n : j + 1;
      fn('str', i, e);
      i = e;
      continue;
    }
    if (ch === "'") { fn('rem', i, n); return; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(line[i + 1] ?? ''))) {
      let j = i;
      while (j < n && /[0-9.eEdD#!%&]/.test(line[j])) j++;
      fn('num', i, j);
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(line[j])) j++;
      if (/[$%&!#]/.test(line[j] ?? '')) j++;
      const w = line.slice(i, j).toUpperCase();
      if (w === 'REM') { fn('rem', i, n); return; }
      fn(KEYWORDS.has(w) ? 'kw' : FUNCTIONS.has(w) ? 'fn' : 'word', i, j);
      i = j;
      continue;
    }
    i++;
  }
}

/** Upper-case keywords and built-in function names outside strings/comments (length-preserving). */
export function upcaseKeywords(line: string): string {
  let out = line;
  scan(line, (kind, a, b) => {
    if (kind === 'kw' || kind === 'fn') out = out.slice(0, a) + out.slice(a, b).toUpperCase() + out.slice(b);
  });
  return out;
}

const COLORS = { kw: C.MAGENTA, fn: C.PURPLE, str: C.GREEN, num: C.CRIMSON, rem: C.GREY, word: C.INK, label: C.ORANGE };

export function colorizeBasic(line: string): Uint8Array {
  const out = new Uint8Array(line.length).fill(C.INK);
  scan(line, (kind, a, b) => out.fill(COLORS[kind], a, b));
  return out;
}

/** Word under (or just before) a column, for context help. */
export function wordAt(line: string, col: number): string {
  let a = col, b = col;
  while (a > 0 && /[A-Za-z0-9_$]/.test(line[a - 1])) a--;
  while (b < line.length && /[A-Za-z0-9_$]/.test(line[b])) b++;
  return line.slice(a, b).toUpperCase();
}
