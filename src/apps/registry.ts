import { extname } from '../fs/vfs';
import { os } from '../os';
import { alert } from '../ui/dialog';

export interface LaunchOpts {
  path?: string;
  args?: Record<string, unknown>;
}

export interface AppDef {
  id: string;
  name: string;
  /** icon name (16 and 32 sizes share names) */
  icon: string;
  /** file extensions (upper-case, no dot) this app opens by default */
  exts?: string[];
  /** extensions it can open but is not the default for */
  alsoOpens?: string[];
  hidden?: boolean;
  description?: string;
  launch(opts: LaunchOpts): void | Promise<void>;
}

const apps = new Map<string, AppDef>();

export function registerApp(def: AppDef) {
  apps.set(def.id, def);
}
export function getApp(id: string) {
  return apps.get(id);
}
export function allApps(): AppDef[] {
  return [...apps.values()];
}

export async function launch(id: string, opts: LaunchOpts = {}) {
  const app = apps.get(id);
  if (!app) {
    await alert(`The application "${id}" is not installed.`, { title: 'Orbit', icon: 'warning' });
    return;
  }
  try {
    await app.launch(opts);
  } catch (e) {
    console.error(e);
    os.sound.sfx('error');
    await alert(`${app.name} could not start:\n${(e as Error).message}`, { title: app.name, icon: 'error' });
  }
}

/** App that opens a given extension by default. */
export function appForExt(ext: string): AppDef | undefined {
  ext = ext.toUpperCase();
  for (const a of apps.values()) if (a.exts?.includes(ext)) return a;
  return undefined;
}

export function appsThatOpen(ext: string): AppDef[] {
  ext = ext.toUpperCase();
  return [...apps.values()].filter((a) => a.exts?.includes(ext) || a.alsoOpens?.includes(ext));
}

const EXT_ICON: Record<string, string> = {
  TXT: 'file-text', LOG: 'file-text', MD: 'file-text', INI: 'file-text', JSON: 'file-text',
  WRT: 'file-write', HTML: 'file-write', HTM: 'file-write',
  CSV: 'file-csv',
  PIC: 'file-pic', PNG: 'file-pic', JPG: 'file-pic', JPEG: 'file-pic', GIF: 'file-pic', BMP: 'file-pic',
  BAS: 'file-bas',
  MUS: 'file-mus',
};

/** Icon name for a filesystem path. */
export function iconForPath(path: string, isDir: boolean): string {
  if (isDir) {
    if (path.toLowerCase() === '/trash') return os.fs.list('/Trash').length ? 'trash-full' : 'trash-empty';
    return 'folder';
  }
  const ext = extname(path);
  return EXT_ICON[ext] ?? 'file';
}

/** Shortcut files (.LNK) hold JSON: {"app": "write", "path": "/Documents"} */
export interface Shortcut {
  app?: string;
  path?: string;
}

export async function readShortcut(path: string): Promise<Shortcut | null> {
  try {
    return JSON.parse(await os.fs.readText(path)) as Shortcut;
  } catch {
    return null;
  }
}

/** Open any path: folders in Files, shortcuts by target, documents in their default app. */
export async function openPath(path: string, withApp?: string) {
  const n = os.fs.resolve(path);
  if (!n) {
    await alert(`"${path}" could not be found.`, { icon: 'warning' });
    return;
  }
  if (withApp) return launch(withApp, { path });
  if (n.type === 'dir') return launch('files', { path });
  const ext = extname(path);
  if (ext === 'LNK') {
    const s = await readShortcut(path);
    if (s?.app) return launch(s.app, { path: s.path });
    if (s?.path) return openPath(s.path);
    await alert('This shortcut is broken.', { icon: 'warning' });
    return;
  }
  const app = appForExt(ext);
  if (!app) {
    // fall back to the text editor for unknown files when available
    const write = apps.get('write');
    if (write && ['', 'TXT', 'LOG', 'MD', 'INI', 'JSON', 'CFG'].includes(ext)) return launch('write', { path });
    await alert(`There is no application to open "${n.name}".`, { icon: 'info' });
    return;
  }
  return launch(app.id, { path });
}
