import { expect, it } from 'vitest';
import { Sheet } from '../../src/apps/calc/engine';

it('Calc evaluates a formula chain', () => {
  const s = new Sheet();
  s.set('A1', '2');
  s.set('A2', '=A1*3+1');
  s.set('A3', '=A2/0');
  expect(s.value('A2')).toBe(7);
  expect(s.display('A3')).toBe('#DIV/0!');
});
