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

describe('sample programs', () => {
  it('every seeded .BAS program compiles', async () => {
    const { m3Seeds } = await import('../../src/seed/m3');
    const { M2_SEEDS } = await import('../../src/seed/m2');
    const { compile } = await import('../../src/basic/compiler');
    const progs = [...M2_SEEDS, ...m3Seeds()].filter((f) => f.path.endsWith('.BAS'));
    expect(progs.length).toBeGreaterThan(10);
    for (const f of progs) {
      try { compile(f.content as string); } catch (e) { throw new Error(`${f.path}: ${(e as { format?: () => string }).format?.() ?? (e as Error).message}`); }
    }
  });
});
