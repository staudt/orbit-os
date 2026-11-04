import { describe, expect, it } from 'vitest';
import { runBasic } from '../../src/basic/headless';

describe('BASIC smoke', () => {
  it('runs hello world', async () => {
    expect(await runBasic('PRINT "HELLO, ORBIT"')).toEqual({ output: 'HELLO, ORBIT\n' });
  });
  it('runs a FOR loop with a SUB', async () => {
    const r = await runBasic('FOR i = 1 TO 3\n  Show i\nNEXT\nSUB Show (n)\n  PRINT n * n;\nEND SUB');
    expect(r).toEqual({ output: ' 1  4  9 ' });
  });
});
