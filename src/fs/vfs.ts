import { openDB, req, txDone } from './db';

export type NodeType = 'file' | 'dir';
export interface FsNode {
  id: string;
  parentId: string | null;
  name: string;
  type: NodeType;
  size: number;
  ctime: number;
  mtime: number;
}
export type Content = string | Uint8Array;

export interface FsChange {
  kind: 'create' | 'write' | 'delete' | 'rename' | 'move';
  path: string;
  /** directory whose listing changed */
  dir: string;
  oldPath?: string;
}

export class FsError extends Error {
  code: string;
  constructor(code: string, msg: string) {
    super(msg);
    this.code = code;
  }
}

const ROOT = 'root';
export const TRASH = '/Trash';
const INVALID = /[\\/:*?"<>|\x00-\x1f]/;

export function splitPath(p: string): string[] {
  return p.split('/').filter((s) => s && s !== '.');
}
export function normPath(p: string): string {
  const out: string[] = [];
  for (const s of splitPath(p)) {
    if (s === '..') out.pop();
    else out.push(s);
  }
  return '/' + out.join('/');
}
export function joinPath(...parts: string[]): string {
  return normPath(parts.join('/'));
}
export function dirname(p: string): string {
  const s = splitPath(normPath(p));
  s.pop();
  return '/' + s.join('/');
}
export function basename(p: string): string {
  const s = splitPath(p);
  return s[s.length - 1] ?? '';
}
export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toUpperCase() : '';
}

let idCounter = 0;
function newId() {
  return Date.now().toString(36) + '-' + (idCounter++).toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function sizeOf(c: Content): number {
  return typeof c === 'string' ? new TextEncoder().encode(c).length : c.byteLength;
}

export class Vfs {
  private db: IDBDatabase;
  private nodes = new Map<string, FsNode>();
  private kids = new Map<string, Set<string>>();
  private watchers = new Set<(c: FsChange) => void>();

  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  static async open(factory?: IDBFactory, name?: string): Promise<Vfs> {
    const db = await openDB(factory, name);
    const fs = new Vfs(db);
    await fs.loadIndex();
    return fs;
  }

  private async loadIndex() {
    const tx = this.db.transaction('nodes', 'readonly');
    const all = (await req(tx.objectStore('nodes').getAll())) as FsNode[];
    this.nodes.clear();
    this.kids.clear();
    for (const n of all) this.index(n);
    if (!this.nodes.has(ROOT)) {
      const now = Date.now();
      const root: FsNode = { id: ROOT, parentId: null, name: '', type: 'dir', size: 0, ctime: now, mtime: now };
      await this.putNodes([root]);
    }
  }

  private index(n: FsNode) {
    this.nodes.set(n.id, n);
    if (n.parentId) {
      let s = this.kids.get(n.parentId);
      if (!s) this.kids.set(n.parentId, (s = new Set()));
      s.add(n.id);
    }
  }
  private unindex(n: FsNode) {
    this.nodes.delete(n.id);
    if (n.parentId) this.kids.get(n.parentId)?.delete(n.id);
    this.kids.delete(n.id);
  }

  private async putNodes(nodes: FsNode[], data?: { id: string; content: Content }[], del?: string[]) {
    const stores = data || del ? ['nodes', 'data'] : ['nodes'];
    const tx = this.db.transaction(stores, 'readwrite');
    const ns = tx.objectStore('nodes');
    for (const n of nodes) ns.put(n);
    if (data) for (const d of data) tx.objectStore('data').put(d);
    if (del) for (const id of del) { ns.delete(id); tx.objectStore('data').delete(id); }
    await txDone(tx);
    for (const n of nodes) {
      const old = this.nodes.get(n.id);
      if (old) this.unindexKeepKids(old);
      this.index(n);
    }
  }
  private unindexKeepKids(n: FsNode) {
    this.nodes.delete(n.id);
    if (n.parentId) this.kids.get(n.parentId)?.delete(n.id);
  }

  // ---- queries -------------------------------------------------------------

  root(): FsNode {
    return this.nodes.get(ROOT)!;
  }
  node(id: string): FsNode | undefined {
    return this.nodes.get(id);
  }

  resolve(path: string): FsNode | null {
    let cur = this.nodes.get(ROOT)!;
    for (const part of splitPath(normPath(path))) {
      if (cur.type !== 'dir') return null;
      const lower = part.toLowerCase();
      let next: FsNode | undefined;
      for (const id of this.kids.get(cur.id) ?? []) {
        const n = this.nodes.get(id)!;
        if (n.name.toLowerCase() === lower) { next = n; break; }
      }
      if (!next) return null;
      cur = next;
    }
    return cur;
  }

  exists(path: string) {
    return this.resolve(path) !== null;
  }
  stat(path: string): FsNode {
    const n = this.resolve(path);
    if (!n) throw new FsError('ENOENT', `File not found: ${path}`);
    return n;
  }
  isDir(path: string) {
    return this.resolve(path)?.type === 'dir';
  }

  pathOf(n: FsNode): string {
    const parts: string[] = [];
    let cur: FsNode | undefined = n;
    while (cur && cur.id !== ROOT) {
      parts.unshift(cur.name);
      cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined;
    }
    return '/' + parts.join('/');
  }

  /** Children of a directory: folders first, then files, alphabetical. */
  list(path: string): FsNode[] {
    const d = this.stat(path);
    if (d.type !== 'dir') throw new FsError('ENOTDIR', `Not a folder: ${path}`);
    return [...(this.kids.get(d.id) ?? [])]
      .map((id) => this.nodes.get(id)!)
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.type === 'dir' ? -1 : 1));
  }

  /** Total bytes of all file contents. */
  usage(): number {
    let t = 0;
    for (const n of this.nodes.values()) t += n.size;
    return t;
  }
  count(): { files: number; dirs: number } {
    let files = 0, dirs = 0;
    for (const n of this.nodes.values()) n.type === 'file' ? files++ : dirs++;
    return { files, dirs: dirs - 1 };
  }

  /** "NAME.TXT" -> "NAME 2.TXT" if taken. */
  uniqueName(dir: string, name: string): string {
    if (!this.exists(joinPath(dir, name))) return name;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 2; ; i++) {
      const cand = `${stem} ${i}${ext}`;
      if (!this.exists(joinPath(dir, cand))) return cand;
    }
  }

  isInside(path: string, ancestor: string): boolean {
    const p = normPath(path).toLowerCase(), a = normPath(ancestor).toLowerCase();
    return p === a || p.startsWith(a === '/' ? '/' : a + '/');
  }

  // ---- reading -------------------------------------------------------------

  async read(path: string): Promise<Content> {
    const n = this.stat(path);
    if (n.type !== 'file') throw new FsError('EISDIR', `Is a folder: ${path}`);
    const tx = this.db.transaction('data', 'readonly');
    const rec = (await req(tx.objectStore('data').get(n.id))) as { content: Content } | undefined;
    return rec?.content ?? '';
  }
  async readText(path: string): Promise<string> {
    const c = await this.read(path);
    return typeof c === 'string' ? c : new TextDecoder().decode(c);
  }
  async readBinary(path: string): Promise<Uint8Array> {
    const c = await this.read(path);
    return typeof c === 'string' ? new TextEncoder().encode(c) : c;
  }

  // ---- writing -------------------------------------------------------------

  private checkName(name: string) {
    if (!name || name === '.' || name === '..' || INVALID.test(name) || name.length > 64) {
      throw new FsError('EINVAL', `Invalid name: "${name}"`);
    }
  }

  async mkdir(path: string, recursive = true): Promise<FsNode> {
    path = normPath(path);
    const existing = this.resolve(path);
    if (existing) {
      if (existing.type === 'dir') return existing;
      throw new FsError('EEXIST', `A file named ${basename(path)} exists`);
    }
    const parentPath = dirname(path);
    let parent = this.resolve(parentPath);
    if (!parent) {
      if (!recursive) throw new FsError('ENOENT', `Folder not found: ${parentPath}`);
      parent = await this.mkdir(parentPath, true);
    }
    const name = basename(path);
    this.checkName(name);
    const now = Date.now();
    const n: FsNode = { id: newId(), parentId: parent.id, name, type: 'dir', size: 0, ctime: now, mtime: now };
    await this.putNodes([n]);
    this.emit({ kind: 'create', path, dir: parentPath });
    return n;
  }

  async write(path: string, content: Content): Promise<FsNode> {
    path = normPath(path);
    const now = Date.now();
    const existing = this.resolve(path);
    if (existing) {
      if (existing.type === 'dir') throw new FsError('EISDIR', `Is a folder: ${path}`);
      const n = { ...existing, size: sizeOf(content), mtime: now };
      await this.putNodes([n], [{ id: n.id, content }]);
      this.emit({ kind: 'write', path, dir: dirname(path) });
      return n;
    }
    const parentPath = dirname(path);
    const parent = this.resolve(parentPath) ?? (await this.mkdir(parentPath, true));
    if (parent.type !== 'dir') throw new FsError('ENOTDIR', `Not a folder: ${parentPath}`);
    const name = basename(path);
    this.checkName(name);
    const n: FsNode = { id: newId(), parentId: parent.id, name, type: 'file', size: sizeOf(content), ctime: now, mtime: now };
    await this.putNodes([n], [{ id: n.id, content }]);
    this.emit({ kind: 'create', path, dir: parentPath });
    return n;
  }

  async rename(path: string, newName: string): Promise<string> {
    const n = this.stat(path);
    if (n.id === ROOT) throw new FsError('EPERM', 'Cannot rename the disk');
    this.checkName(newName);
    const dir = dirname(path);
    const target = this.resolve(joinPath(dir, newName));
    if (target && target.id !== n.id) throw new FsError('EEXIST', `"${newName}" already exists`);
    const old = this.pathOf(n);
    await this.putNodes([{ ...n, name: newName, mtime: Date.now() }]);
    const np = joinPath(dir, newName);
    this.emit({ kind: 'rename', path: np, oldPath: old, dir });
    return np;
  }

  /** Move into destDir. Name collisions get a unique name. Returns the new path. */
  async move(path: string, destDir: string): Promise<string> {
    const n = this.stat(path);
    const d = this.stat(destDir);
    if (d.type !== 'dir') throw new FsError('ENOTDIR', `Not a folder: ${destDir}`);
    if (n.id === ROOT) throw new FsError('EPERM', 'Cannot move the disk');
    if (n.parentId === d.id) return this.pathOf(n);
    if (n.type === 'dir' && this.isInside(this.pathOf(d), this.pathOf(n))) {
      throw new FsError('EINVAL', 'Cannot move a folder into itself');
    }
    const old = this.pathOf(n);
    const name = this.uniqueName(destDir, n.name);
    await this.putNodes([{ ...n, parentId: d.id, name }]);
    const np = joinPath(destDir, name);
    this.emit({ kind: 'move', path: np, oldPath: old, dir: dirname(old) });
    this.emit({ kind: 'move', path: np, oldPath: old, dir: normPath(destDir) });
    return np;
  }

  /** Recursive copy into destDir. Returns the new path. */
  async copy(path: string, destDir: string, newName?: string): Promise<string> {
    const n = this.stat(path);
    const name = this.uniqueName(destDir, newName ?? n.name);
    const dest = joinPath(destDir, name);
    if (n.type === 'dir') {
      if (this.isInside(destDir, path)) throw new FsError('EINVAL', 'Cannot copy a folder into itself');
      await this.mkdir(dest);
      for (const c of this.list(path)) await this.copy(this.pathOf(c), dest);
    } else {
      await this.write(dest, await this.read(path));
    }
    return dest;
  }

  /** Delete: moves to the Trash, or deletes for good when already in the Trash. */
  async remove(path: string): Promise<void> {
    path = normPath(path);
    if (this.isInside(path, TRASH) && normPath(path).toLowerCase() !== TRASH.toLowerCase()) {
      return this.deleteForever(path);
    }
    if (path.toLowerCase() === TRASH.toLowerCase() || path === '/') throw new FsError('EPERM', 'Cannot delete this item');
    await this.mkdir(TRASH);
    await this.move(path, TRASH);
  }

  async deleteForever(path: string): Promise<void> {
    const n = this.stat(path);
    if (n.id === ROOT) throw new FsError('EPERM', 'Cannot delete the disk');
    const ids: string[] = [];
    const walk = (id: string) => {
      ids.push(id);
      for (const k of this.kids.get(id) ?? []) walk(k);
    };
    walk(n.id);
    const p = this.pathOf(n);
    const tx = this.db.transaction(['nodes', 'data'], 'readwrite');
    for (const id of ids) {
      tx.objectStore('nodes').delete(id);
      tx.objectStore('data').delete(id);
    }
    await txDone(tx);
    for (const id of ids.reverse()) {
      const x = this.nodes.get(id);
      if (x) this.unindex(x);
    }
    this.emit({ kind: 'delete', path: p, dir: dirname(p) });
  }

  async emptyTrash(): Promise<void> {
    if (!this.exists(TRASH)) return;
    for (const c of this.list(TRASH)) await this.deleteForever(this.pathOf(c));
  }

  // ---- whole-disk operations --------------------------------------------

  /** Every file and folder with content, for disk images. Paths are absolute. */
  async exportAll(): Promise<{ path: string; type: NodeType; mtime: number; content?: Content }[]> {
    const out: { path: string; type: NodeType; mtime: number; content?: Content }[] = [];
    const tx = this.db.transaction('data', 'readonly');
    const all = (await req(tx.objectStore('data').getAll())) as { id: string; content: Content }[];
    const data = new Map(all.map((d) => [d.id, d.content]));
    for (const n of this.nodes.values()) {
      if (n.id === ROOT) continue;
      out.push({ path: this.pathOf(n), type: n.type, mtime: n.mtime, content: n.type === 'file' ? data.get(n.id) ?? '' : undefined });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Wipe the disk (keeps the kv store). */
  async wipe(): Promise<void> {
    const tx = this.db.transaction(['nodes', 'data'], 'readwrite');
    tx.objectStore('nodes').clear();
    tx.objectStore('data').clear();
    await txDone(tx);
    await this.loadIndex();
    this.emit({ kind: 'delete', path: '/', dir: '/' });
  }

  async restoreAll(entries: { path: string; type: NodeType; content?: Content }[]): Promise<void> {
    await this.wipe();
    for (const e of entries.filter((e) => e.type === 'dir')) await this.mkdir(e.path);
    for (const e of entries.filter((e) => e.type === 'file')) await this.write(e.path, e.content ?? '');
  }

  // ---- key/value (settings etc) --------------------------------------------

  async getKV<T>(key: string): Promise<T | undefined> {
    const tx = this.db.transaction('kv', 'readonly');
    return (await req(tx.objectStore('kv').get(key))) as T | undefined;
  }
  async setKV(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    await txDone(tx);
  }

  // ---- change notification --------------------------------------------------

  watch(fn: (c: FsChange) => void): () => void {
    this.watchers.add(fn);
    return () => this.watchers.delete(fn);
  }
  private emit(c: FsChange) {
    for (const w of this.watchers) {
      try { w(c); } catch (e) { console.error(e); }
    }
  }

  close() {
    this.db.close();
  }
}
