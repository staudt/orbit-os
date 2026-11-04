import { zipSync, strToU8, type Zippable } from 'fflate';
import { makeDiskImage, readDiskImage } from '../fs/diskimage';
import { downloadBlob, pickFiles, exportFile } from '../fs/importexport';
import { alert, confirm } from '../ui/dialog';
import type { Window } from '../wm/window';
import { os } from '../os';

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Download the whole disk as a .zip. */
export async function backupDisk() {
  const data = await makeDiskImage(os.fs);
  downloadBlob(`orbit-disk-${stamp()}.zip`, new Blob([data as BlobPart], { type: 'application/zip' }));
}

/** Replace the disk with a .zip picked from the real computer. */
export async function restoreDisk(parent: Window | null) {
  const [f] = await pickFiles('.zip,application/zip', false);
  if (!f) return;
  let entries;
  try {
    entries = readDiskImage(new Uint8Array(await f.arrayBuffer()));
  } catch {
    await alert('That file is not a valid disk image.', { icon: 'error', parent });
    return;
  }
  if (!(await confirm(`Replace everything on Orbit HD with the ${entries.length} items in "${f.name}"?`, { icon: 'warning', ok: 'Replace', parent }))) return;
  await os.fs.restoreAll(entries);
  await os.wm.desktop.refresh();
  await alert('The disk was restored.', { parent });
}

/** Export files to the real computer; folders become .zip files. */
export async function exportPaths(paths: string[]) {
  for (const p of paths) {
    const n = os.fs.resolve(p);
    if (!n) continue;
    if (n.type === 'file') { await exportFile(p); continue; }
    const z: Zippable = {};
    const walk = async (dir: string, rel: string) => {
      for (const c of os.fs.list(dir)) {
        const cp = `${dir}/${c.name}`, cr = rel ? `${rel}/${c.name}` : c.name;
        if (c.type === 'dir') { z[cr + '/'] = new Uint8Array(0); await walk(cp, cr); }
        else {
          const content = await os.fs.read(cp);
          z[cr] = typeof content === 'string' ? strToU8(content) : content;
        }
      }
    };
    await walk(p, '');
    downloadBlob(`${n.name}.zip`, new Blob([zipSync(z) as BlobPart], { type: 'application/zip' }));
  }
}
