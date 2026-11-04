import { joinPath, extname, type Content } from './vfs';
import { os } from '../os';

/** Extensions stored as text inside Orbit. Everything else is stored as raw bytes. */
export const TEXT_EXTS = new Set(['TXT', 'BAS', 'CSV', 'MUS', 'MD', 'HTML', 'HTM', 'JSON', 'WRT', 'LNK', 'LOG', 'INI', 'CFG', 'XML', 'SVG', 'JS', 'CSS', '']);

export function isTextName(name: string) {
  return TEXT_EXTS.has(extname(name));
}

/** Sanitise a real-world file name for the Orbit filesystem. */
export function cleanName(name: string): string {
  const n = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 64);
  return n || 'Untitled';
}

/** Import real files into an Orbit folder. Returns the names created. */
export async function importFiles(files: File[], dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) {
    const name = os.fs.uniqueName(dir, cleanName(f.name));
    const buf = new Uint8Array(await f.arrayBuffer());
    const content: Content = isTextName(name) ? new TextDecoder().decode(buf) : buf;
    await os.fs.write(joinPath(dir, name), content);
    out.push(name);
  }
  return out;
}

/** Hand a file to the real computer as a download. */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadContent(name: string, content: Content, type = 'application/octet-stream') {
  const part: BlobPart = typeof content === 'string' ? content : new Uint8Array(content);
  downloadBlob(name, new Blob([part], { type: typeof content === 'string' ? 'text/plain;charset=utf-8' : type }));
}

/** Export an Orbit file to the real computer. */
export async function exportFile(path: string) {
  const c = await os.fs.read(path);
  downloadContent(path.split('/').pop() || 'file', c);
}

/** Ask the user to pick real files. */
export function pickFiles(accept = '', multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = multiple;
    if (accept) inp.accept = accept;
    inp.onchange = () => resolve(Array.from(inp.files ?? []));
    inp.oncancel = () => resolve([]);
    inp.click();
  });
}
