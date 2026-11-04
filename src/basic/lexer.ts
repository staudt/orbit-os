import { SyntaxError_ } from './values';

export type TokType = 'num' | 'str' | 'id' | 'op' | 'nl' | 'eof' | 'data' | 'linenum' | 'label';

export interface Token {
  t: TokType;
  /** upper-cased word for ids, operator text, string value, or raw DATA text */
  s: string;
  /** numeric value for 'num' / 'linenum' */
  n: number;
  line: number;
  col: number;
}

const OPS2 = ['<>', '<=', '>=', '=<', '=>', '><'];
const OPS1 = '+-*/\\^=<>(),;:#';

/** Tokenize a whole program. Comments are dropped; each source line ends with an 'nl' token. */
export function lex(src: string): Token[] {
  const out: Token[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  for (let li = 0; li < lines.length; li++) {
    const text = lines[li];
    const line = li + 1;
    let i = 0;
    let lineStart = true;
    const push = (t: TokType, s: string, n = 0, col = i) => out.push({ t, s, n, line, col: col + 1 });
    while (i < text.length) {
      const c = text[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === "'") break; // comment
      const start = i;
      // line numbers at the start of a line
      if (lineStart && /[0-9]/.test(c)) {
        let j = i;
        while (j < text.length && /[0-9]/.test(text[j])) j++;
        push('linenum', text.slice(i, j), parseInt(text.slice(i, j), 10), start);
        i = j;
        lineStart = false;
        continue;
      }
      // numbers
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
        let j = i;
        while (j < text.length && /[0-9]/.test(text[j])) j++;
        if (text[j] === '.') { j++; while (j < text.length && /[0-9]/.test(text[j])) j++; }
        if (/[eEdD]/.test(text[j] ?? '') && /[-+0-9]/.test(text[j + 1] ?? '')) {
          let k = j + 1;
          if (text[k] === '+' || text[k] === '-') k++;
          if (/[0-9]/.test(text[k] ?? '')) {
            while (k < text.length && /[0-9]/.test(text[k])) k++;
            j = k;
          }
        }
        const raw = text.slice(i, j).replace(/[dD]/, 'e');
        if (/[!#%&]/.test(text[j] ?? '')) j++; // type suffix on literal
        push('num', raw, Number(raw), start);
        i = j;
        lineStart = false;
        continue;
      }
      if (c === '&' && /[hHoO]/.test(text[i + 1] ?? '')) {
        const hex = /[hH]/.test(text[i + 1]);
        let j = i + 2;
        const re = hex ? /[0-9a-fA-F]/ : /[0-7]/;
        while (j < text.length && re.test(text[j])) j++;
        const digits = text.slice(i + 2, j);
        if (!digits) throw new SyntaxError_('bad number', line);
        if (text[j] === '&') j++;
        push('num', text.slice(i, j), parseInt(digits, hex ? 16 : 8), start);
        i = j;
        lineStart = false;
        continue;
      }
      // strings
      if (c === '"') {
        let j = i + 1;
        while (j < text.length && text[j] !== '"') j++;
        push('str', text.slice(i + 1, j), 0, start);
        i = j + 1;
        lineStart = false;
        continue;
      }
      // words
      if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
        if (/[$%&!#]/.test(text[j] ?? '')) {
          // '#' after a statement word is a file number (PRINT #1), otherwise a type suffix
          if (!(text[j] === '#' && STATEMENTS.has(text.slice(i, j).toUpperCase()))) j++;
        }
        const word = text.slice(i, j).toUpperCase();
        if (word === 'REM') break;
        if (word === 'DATA') {
          push('data', text.slice(j).trim(), 0, start);
          i = text.length;
          break;
        }
        // label "name:" at the start of a line
        let k = j;
        while (text[k] === ' ') k++;
        if (lineStart && text[k] === ':' && !/[$%&!#]$/.test(word) && !STATEMENTS.has(word)) {
          push('label', word, 0, start);
          i = k + 1;
          lineStart = false;
          continue;
        }
        push('id', word, 0, start);
        i = j;
        lineStart = false;
        continue;
      }
      if (c === '?') { push('id', 'PRINT', 0, start); i++; lineStart = false; continue; }
      const two = text.slice(i, i + 2);
      if (OPS2.includes(two)) {
        const norm = two === '=<' ? '<=' : two === '=>' ? '>=' : two === '><' ? '<>' : two;
        push('op', norm, 0, start);
        i += 2;
        lineStart = false;
        continue;
      }
      if (OPS1.includes(c)) {
        push('op', c, 0, start);
        i++;
        // after ':' we are effectively at a new statement but not a new line (no labels/linenums)
        lineStart = false;
        continue;
      }
      throw new SyntaxError_(`unexpected character "${c}"`, line);
    }
    out.push({ t: 'nl', s: '\n', n: 0, line, col: text.length + 1 });
  }
  out.push({ t: 'eof', s: '', n: 0, line: lines.length, col: 1 });
  return out;
}

/** Words that start statements (cannot be used as labels). */
export const STATEMENTS = new Set([
  'PRINT', 'LPRINT', 'INPUT', 'LINE', 'LET', 'DIM', 'REDIM', 'CONST', 'IF', 'THEN', 'ELSE', 'ELSEIF', 'END', 'FOR', 'TO', 'STEP',
  'NEXT', 'WHILE', 'WEND', 'DO', 'LOOP', 'UNTIL', 'SELECT', 'CASE', 'IS', 'GOTO', 'GOSUB', 'RETURN', 'EXIT', 'SUB', 'FUNCTION',
  'CALL', 'DATA', 'READ', 'RESTORE', 'CLS', 'LOCATE', 'COLOR', 'SCREEN', 'PSET', 'PRESET', 'CIRCLE', 'PAINT', 'BEEP', 'SOUND',
  'PLAY', 'OPEN', 'CLOSE', 'KILL', 'NAME', 'MKDIR', 'FILES', 'RANDOMIZE', 'SLEEP', 'STOP', 'SYSTEM', 'SWAP', 'WIDTH', 'DECLARE',
  'DEFINT', 'DEFSNG', 'DEFDBL', 'DEFLNG', 'DEFSTR', 'OPTION', 'SHARED', 'AS', 'MOD', 'AND', 'OR', 'NOT', 'XOR', 'REM',
  'WINDOW', 'BUTTON', 'LABEL', 'TEXTBOX', 'SETTEXT', 'CHDIR', 'VIEW', 'FADE', 'GPRINT',
]);

/** Words that can never be variable names. */
export const RESERVED = new Set([
  'THEN', 'ELSE', 'ELSEIF', 'END', 'TO', 'STEP', 'NEXT', 'WEND', 'LOOP', 'UNTIL', 'CASE', 'IS', 'AS', 'MOD', 'AND', 'OR', 'NOT',
  'XOR', 'SUB', 'FUNCTION', 'SHARED', 'DIM', 'IF', 'FOR', 'WHILE', 'DO', 'SELECT', 'GOTO', 'GOSUB', 'RETURN', 'PRINT', 'LET',
]);
