import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Vfs } from '../src/fs/vfs';
import { makeDiskImage, readDiskImage } from '../src/fs/diskimage';

describe('disk image', () => {
  it('round-trips text, binary and empty folders', async () => {
    const a = await Vfs.open(new IDBFactory(), 'a');
    await a.write('/Documents/Note.TXT', 'héllo\nworld');
    await a.write('/Pictures/x.png', new Uint8Array([137, 80, 78, 71, 0, 255]));
    await a.mkdir('/Empty');
    const img = await makeDiskImage(a);
    const b = await Vfs.open(new IDBFactory(), 'b');
    await b.restoreAll(readDiskImage(img));
    expect(await b.readText('/Documents/Note.TXT')).toBe('héllo\nworld');
    expect(Array.from(await b.readBinary('/Pictures/x.png'))).toEqual([137, 80, 78, 71, 0, 255]);
    expect(b.isDir('/Empty')).toBe(true);
  });
});
