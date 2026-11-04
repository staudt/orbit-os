import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Vfs } from '../../src/fs/vfs';

const fresh = () => Vfs.open(new IDBFactory(), 'test');

describe('virtual filesystem', () => {
  it('writes, reads, lists, moves and trashes', async () => {
    const fs = await fresh();
    await fs.write('/Docs/a.txt', 'hello');
    await fs.write('/Docs/pic.bin', new Uint8Array([1, 2, 3]));
    expect(await fs.readText('/docs/A.TXT')).toBe('hello'); // case-insensitive
    expect(Array.from(await fs.readBinary('/Docs/pic.bin'))).toEqual([1, 2, 3]);
    expect(fs.list('/Docs').map((n) => n.name)).toEqual(['a.txt', 'pic.bin']);
    await fs.mkdir('/Other');
    const moved = await fs.move('/Docs/a.txt', '/Other');
    expect(moved).toBe('/Other/a.txt');
    await fs.remove('/Other/a.txt');
    expect(fs.exists('/Trash/a.txt')).toBe(true);
    await fs.emptyTrash();
    expect(fs.list('/Trash')).toHaveLength(0);
    expect(fs.usage()).toBe(3);
  });

  it('persists across reopen and refuses bad moves', async () => {
    const factory = new IDBFactory();
    const a = await Vfs.open(factory, 'p');
    await a.write('/X/y/z.txt', 'deep');
    await expect(a.move('/X', '/X/y')).rejects.toThrow();
    a.close();
    const b = await Vfs.open(factory, 'p');
    expect(await b.readText('/X/y/z.txt')).toBe('deep');
  });
});
