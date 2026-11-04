import { describe, it, expect } from 'vitest';
import { Sheet, cellId, parseId } from '../src/apps/calc/engine';

const mk = (cells: Record<string, string>) => {
  const s = new Sheet();
  for (const [k, v] of Object.entries(cells)) s.set(k, v);
  return s;
};
const err = (code: string) => ({ error: code });

describe('ids', () => {
  it('cellId/parseId', () => {
    expect(cellId(0, 0)).toBe('A1');
    expect(cellId(25, 98)).toBe('Z99');
    expect(parseId('b7')).toEqual({ col: 1, row: 6 });
    expect(parseId('A100')).toBeNull();
    expect(parseId('A0')).toBeNull();
    expect(parseId('AA1')).toBeNull();
  });
  it('case-insensitive set', () => {
    const s = mk({ a1: '5' });
    expect(s.value('A1')).toBe(5);
    expect(s.raw('a1')).toBe('5');
  });
});

describe('interpretation', () => {
  it('numbers', () => {
    const s = mk({ A1: ' 42 ', A2: '-3.5', A3: '1e3', A4: '+.5', A5: '1,000', A6: '12abc' });
    expect(s.value('A1')).toBe(42);
    expect(s.value('A2')).toBe(-3.5);
    expect(s.value('A3')).toBe(1000);
    expect(s.value('A4')).toBe(0.5);
    expect(s.value('A5')).toBe('1,000');
    expect(s.value('A6')).toBe('12abc');
  });
  it('text and apostrophe', () => {
    const s = mk({ A1: 'hello', A2: "'123", A3: "'=1+1" });
    expect(s.value('A1')).toBe('hello');
    expect(s.value('A2')).toBe('123');
    expect(s.display('A2')).toBe('123');
    expect(s.value('A3')).toBe('=1+1');
    expect(s.raw('A2')).toBe("'123");
  });
  it('empty cells', () => {
    const s = new Sheet();
    expect(s.value('A1')).toBe('');
    expect(s.raw('A1')).toBe('');
    s.set('A1', 'x');
    s.set('A1', '');
    expect(s.value('A1')).toBe('');
    expect([...s.cells()]).toEqual([]);
  });
});

describe('formulas', () => {
  it('precedence', () => {
    const s = mk({ A1: '=1+2*3', A2: '=(1+2)*3', A3: '=2^3^2', A4: '=-2^2', A5: '=10-4-3', A6: '=8/4/2', A7: '=2^-1', A8: '=+5', A9: '=--3' });
    expect(s.value('A1')).toBe(7);
    expect(s.value('A2')).toBe(9);
    expect(s.value('A3')).toBe(512);
    expect(s.value('A4')).toBe(-4);
    expect(s.value('A5')).toBe(3);
    expect(s.value('A6')).toBe(1);
    expect(s.value('A7')).toBe(0.5);
    expect(s.value('A8')).toBe(5);
    expect(s.value('A9')).toBe(3);
  });
  it('references, absolute and empty', () => {
    const s = mk({ A1: '4', B1: '=A1*2', C1: '=$A$1+B1', D1: '=Z9+1', E1: '= a1 + 1' });
    expect(s.value('B1')).toBe(8);
    expect(s.value('C1')).toBe(12);
    expect(s.value('D1')).toBe(1);
    expect(s.value('E1')).toBe(5);
  });
  it('text references', () => {
    const s = mk({ A1: 'hi', B1: '=A1', C1: '=A1+1', D1: '=B1', E1: '=Q5' });
    expect(s.value('B1')).toBe('hi');
    expect(s.value('C1')).toEqual(err('#VALUE!'));
    expect(s.value('D1')).toBe('hi');
    expect(s.value('E1')).toBe(0);
  });
});

describe('recalc', () => {
  it('chain and changed ids', () => {
    const s = mk({ A1: '1', B1: '=A1+1', C1: '=B1*10' });
    expect(s.value('C1')).toBe(20);
    const changed = s.set('A1', '5');
    expect(s.value('C1')).toBe(60);
    expect(changed.sort()).toEqual(['A1', 'B1', 'C1']);
  });
  it('unchanged dependents not reported but self is', () => {
    const s = mk({ A1: '1', B1: '=A1*0' });
    expect(s.set('A1', '2')).toEqual(['A1']);
  });
  it('diamond is topologically ordered', () => {
    const s = mk({ A1: '1', B1: '=A1+1', C1: '=A1+2', D1: '=B1+C1' });
    s.set('A1', '10');
    expect(s.value('D1')).toBe(23);
  });
  it('full recalc keeps values', () => {
    const s = mk({ A1: '2', B1: '=A1^2' });
    s.recalc();
    expect(s.value('B1')).toBe(4);
  });
  it('forward references resolve once defined', () => {
    const s = mk({ A1: '=B1+1' });
    expect(s.value('A1')).toBe(1);
    s.set('B1', '9');
    expect(s.value('A1')).toBe(10);
  });
});

describe('cycles', () => {
  it('direct', () => {
    const s = mk({ A1: '=A1+1' });
    expect(s.value('A1')).toEqual(err('#CYCLE!'));
    expect(s.display('A1')).toBe('#CYCLE!');
  });
  it('indirect, recovery', () => {
    const s = mk({ A1: '=B1', B1: '=C1', C1: '=A1', D1: '=A1+1' });
    for (const id of ['A1', 'B1', 'C1', 'D1']) expect(s.value(id)).toEqual(err('#CYCLE!'));
    s.set('C1', '7');
    expect(s.value('A1')).toBe(7);
    expect(s.value('B1')).toBe(7);
    expect(s.value('D1')).toBe(8);
  });
});

describe('errors', () => {
  it('codes', () => {
    const s = mk({ A1: '=1/0', A2: '=A100', A3: '=1+', A4: '=SUM(1)', A5: '=A9+B', A6: '=(1', A7: '=1 2', A8: '=0^-1', A9: '=#REF!+1', B1: '=AA1' });
    expect(s.value('A1')).toEqual(err('#DIV/0!'));
    expect(s.value('A2')).toEqual(err('#REF!'));
    expect(s.value('A3')).toEqual(err('#ERROR!'));
    expect(s.value('A4')).toEqual(err('#NAME?'));
    expect(s.value('A5')).toEqual(err('#NAME?'));
    expect(s.value('A6')).toEqual(err('#ERROR!'));
    expect(s.value('A7')).toEqual(err('#ERROR!'));
    expect(s.value('A8')).toEqual(err('#DIV/0!'));
    expect(s.value('A9')).toEqual(err('#REF!'));
    expect(s.value('B1')).toEqual(err('#REF!'));
  });
  it('propagation', () => {
    const s = mk({ A1: '=1/0', B1: '=A1+1', C1: '=-B1', D1: '=B1' });
    expect(s.value('C1')).toEqual(err('#DIV/0!'));
    expect(s.display('D1')).toBe('#DIV/0!');
    s.set('A1', '2');
    expect(s.value('C1')).toBe(-3);
  });
});

describe('display', () => {
  it('formats numbers', () => {
    const s = mk({ A1: '=0.1+0.2', A2: '=1/3', A3: '-7.50', A4: '=10^15', A5: '123456789012', A6: '=2^0.5', A7: '=1/3*0.0000001' });
    expect(s.display('A1')).toBe('0.3');
    expect(s.display('A2')).toBe('0.3333333333');
    expect(s.display('A3')).toBe('-7.5');
    expect(s.display('A4')).toBe('1e+15');
    expect(s.display('A5')).toBe('123456789000');
    expect(s.display('A6')).toBe('1.414213562');
    expect(s.display('A7')).toBe('0.00000003333333333');
  });
  it('decimals option and text', () => {
    const s = mk({ A1: '2', A2: 'abc' });
    expect(s.display('A1', { decimals: 2 })).toBe('2.00');
    expect(s.display('A2', { decimals: 2 })).toBe('abc');
    expect(s.display('B5')).toBe('');
  });
});

describe('usedRange / cells', () => {
  it('extent', () => {
    const s = new Sheet();
    expect(s.usedRange()).toEqual({ cols: 0, rows: 0 });
    s.set('C4', '1');
    s.set('A1', 'x');
    expect(s.usedRange()).toEqual({ cols: 3, rows: 4 });
    expect([...s.cells()].length).toBe(2);
    s.clear();
    expect(s.usedRange()).toEqual({ cols: 0, rows: 0 });
  });
});

describe('CSV', () => {
  it('round trip with quotes, commas, newlines, formulas', () => {
    const s = mk({ A1: 'a,b', B1: 'say "hi"', A2: 'line1\nline2', B2: '=A3+1', A3: '5', C3: 'z' });
    const csv = s.toCSV();
    expect(csv).toContain('=A3+1');
    expect(csv.split('\n')[0]).toBe('"a,b","say ""hi""",');
    const t = Sheet.fromCSV(csv);
    expect(t.raw('A1')).toBe('a,b');
    expect(t.raw('B1')).toBe('say "hi"');
    expect(t.raw('A2')).toBe('line1\nline2');
    expect(t.raw('B2')).toBe('=A3+1');
    expect(t.value('B2')).toBe(6);
    expect(t.toCSV()).toBe(csv);
  });
  it('parses CRLF and trailing newline', () => {
    const t = Sheet.fromCSV('1,2\r\n3,"4"\r\n');
    expect(t.usedRange()).toEqual({ cols: 2, rows: 2 });
    expect(t.value('B2')).toBe(4);
  });
  it('drops cells beyond 26x99', () => {
    const wide = Array.from({ length: 30 }, (_, i) => String(i)).join(',');
    const rows = Array.from({ length: 105 }, () => wide).join('\n');
    const t = Sheet.fromCSV(rows);
    expect(t.usedRange()).toEqual({ cols: 26, rows: 99 });
  });
  it('empty csv', () => {
    expect(Sheet.fromCSV('').usedRange()).toEqual({ cols: 0, rows: 0 });
    expect(new Sheet().toCSV()).toBe('');
  });
});

describe('shiftFormula', () => {
  it('relative', () => {
    expect(Sheet.shiftFormula('=A1+B2', 1, 1)).toBe('=B2+C3');
  });
  it('absolute', () => {
    expect(Sheet.shiftFormula('=$A1', 1, 1)).toBe('=$A2');
    expect(Sheet.shiftFormula('=A$1+$B$2', 2, 3)).toBe('=C$1+$B$2');
  });
  it('out of range', () => {
    expect(Sheet.shiftFormula('=A1+1', -1, 0)).toBe('=#REF!+1');
    expect(Sheet.shiftFormula('=Z99', 1, 0)).toBe('=#REF!');
    expect(Sheet.shiftFormula('=A99', 0, 1)).toBe('=#REF!');
  });
  it('non-formulas untouched; #REF! evaluates', () => {
    expect(Sheet.shiftFormula('A1', 1, 1)).toBe('A1');
    expect(mk({ A1: Sheet.shiftFormula('=A1+1', -1, 0) }).value('A1')).toEqual(err('#REF!'));
  });
});
