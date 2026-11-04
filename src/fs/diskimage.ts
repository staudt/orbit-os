import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from 'fflate';
import type { Vfs, NodeType, Content } from './vfs';
import { isTextName } from './importexport';

const MANIFEST = 'ORBIT-DISK.JSON';

/** Pack the whole disk into a zip archive. */
export async function makeDiskImage(fs: Vfs): Promise<Uint8Array> {
  const entries = await fs.exportAll();
  const z: Zippable = {};
  for (const e of entries) {
    const p = e.path.slice(1);
    if (e.type === 'dir') z[p + '/'] = new Uint8Array(0);
    else z[p] = [typeof e.content === 'string' ? strToU8(e.content) : (e.content as Uint8Array) ?? new Uint8Array(0), { mtime: new Date(e.mtime) }];
  }
  z[MANIFEST] = strToU8(JSON.stringify({ format: 'orbit-disk', version: 1, created: new Date().toISOString(), entries: entries.length }));
  return zipSync(z, { level: 6 });
}

/** Parse a disk image (or any zip) into restore entries. */
export function readDiskImage(data: Uint8Array): { path: string; type: NodeType; content?: Content }[] {
  const files = unzipSync(data);
  const out: { path: string; type: NodeType; content?: Content }[] = [];
  const dirs = new Set<string>();
  for (const [name, bytes] of Object.entries(files)) {
    if (name === MANIFEST || name.startsWith('__MACOSX')) continue;
    const clean = name.replace(/\\/g, '/');
    if (clean.endsWith('/')) {
      dirs.add('/' + clean.replace(/\/+$/, ''));
      continue;
    }
    const path = '/' + clean;
    // ensure parent folders exist
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) dirs.add('/' + parts.slice(0, i).join('/'));
    out.push({ path, type: 'file', content: isTextName(path) ? strFromU8(bytes) : bytes });
  }
  return [...[...dirs].sort().map((p) => ({ path: p, type: 'dir' as NodeType })), ...out];
}

export function isDiskImage(data: Uint8Array): boolean {
  try {
    return MANIFEST in unzipSync(data, { filter: (f) => f.name === MANIFEST });
  } catch {
    return false;
  }
}
