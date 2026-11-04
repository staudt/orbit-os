import { registerApp, iconForPath, openPath, appsThatOpen, launch } from './registry';
import { Window } from '../wm/window';
import { ListView, type ListItem } from '../ui/listview';
import { Button, Label, TextField } from '../ui/widgets';
import type { MenuDef, MenuItem } from '../ui/menu';
import { alert, confirm } from '../ui/dialog';
import { icon } from '../core/icons';
import { C } from '../core/palette';
import { basename, dirname, extname, joinPath, normPath, TRASH } from '../fs/vfs';
import { importFiles, pickFiles } from '../fs/importexport';
import { backupDisk, restoreDisk, exportPaths } from './diskui';
import { fmtDate } from '../ui/filedialog';
import { formatBytes } from '../wm/topbar';
import { BODY_X, BODY_Y } from '../wm/window';
import { invalidate, os } from '../os';

/** Shared file clipboard (cut/copy between Files windows). */
const fileClip: { paths: string[]; cut: boolean } = { paths: [], cut: false };

const PLACES: [string, string][] = [
  ['Orbit HD', '/'], ['Desktop', '/Desktop'], ['Documents', '/Documents'], ['Pictures', '/Pictures'],
  ['Programs', '/Programs'], ['Music', '/Music'], ['Data', '/Data'], ['Trash', TRASH],
];

class FilesWindow {
  win: Window;
  path = '/';
  history: string[] = [];
  list: ListView;
  pathField: TextField;
  status: Label;
  private backBtn: Button;
  private upBtn: Button;
  private unwatch: () => void;

  constructor(path: string) {
    this.win = new Window({ title: 'Files', icon: 'files', app: 'files', w: 320, h: 220, minW: 200, minH: 110 });
    const b = this.win.body;
    this.backBtn = b.add(new Button('', () => this.back(), { icon: icon('back'), kind: 'tool', tooltip: 'Back' }));
    this.upBtn = b.add(new Button('', () => this.navigate(dirname(this.path)), { icon: icon('up'), kind: 'tool', tooltip: 'Up' }));
    const newBtn = b.add(new Button('', () => this.newFolder(), { icon: icon('new-folder'), kind: 'tool', tooltip: 'New folder' }));
    const viewBtn = b.add(new Button('', () => this.toggleView(), { icon: icon('find'), kind: 'tool', tooltip: 'Icons / list' }));
    viewBtn.icon = icon('file');
    this.pathField = b.add(new TextField('/', { onSubmit: (t) => this.goTo(t) }));
    this.list = b.add(new ListView([{ title: 'Name', w: 100, flex: true }, { title: 'Size', w: 44, align: 'right' }, { title: 'Modified', w: 56 }]));
    this.status = b.add(new Label('', { color: C.GREY }));
    b.layoutFn = (p) => {
      this.backBtn.setBounds(4, 3, 20, 18);
      this.upBtn.setBounds(25, 3, 20, 18);
      newBtn.setBounds(46, 3, 20, 18);
      viewBtn.setBounds(67, 3, 20, 18);
      this.pathField.setBounds(92, 4, p.w - 96, 15);
      this.list.setBounds(0, 24, p.w, p.h - 24 - 13);
      this.status.setBounds(5, p.h - 12, p.w - 10, 11);
    };
    this.win.menus = this.menus();
    this.setupList();
    this.win.onKey = (e) => this.key(e);
    this.win.onDropFiles = (files, lx, ly) => this.importHere(files, lx, ly);
    (this.win as Window & { onDropPaths?: unknown }).onDropPaths = (paths: string[], lx: number, ly: number, copy: boolean) => this.dropPaths(paths, lx, ly, copy);
    this.unwatch = os.fs.watch((c) => {
      const here = this.path.toLowerCase();
      if (c.dir.toLowerCase() === here || c.path.toLowerCase() === here || (c.oldPath && c.oldPath.toLowerCase() === here) || c.dir === '/') this.refresh();
    });
    this.win.onClosed = () => this.unwatch();
    this.navigate(path, false);
    os.wm.open(this.win);
    this.win.focusWidget(this.list);
  }

  // ---------------------------------------------------------------- navigation
  navigate(p: string, record = true) {
    p = normPath(p);
    if (!os.fs.isDir(p)) { os.sound.sfx('error'); return; }
    if (record && p !== this.path) this.history.push(this.path);
    this.path = p;
    this.pathField.setText(p);
    this.win.setTitle(p === '/' ? 'Orbit HD' : basename(p));
    this.win.icon = p.toLowerCase() === TRASH.toLowerCase() ? 'trash-empty' : p === '/' ? 'disk' : 'folder';
    this.list.scroll = 0;
    this.refresh(false);
  }
  back() {
    const p = this.history.pop();
    if (p) this.navigate(p, false);
  }
  goTo(t: string) {
    const p = t.startsWith('/') ? t : joinPath(this.path, t);
    if (os.fs.isDir(p)) { this.navigate(p); this.win.focusWidget(this.list); }
    else if (os.fs.exists(p)) openPath(p);
    else { os.sound.sfx('error'); this.pathField.setText(this.path); }
  }
  get inTrash() {
    return os.fs.isInside(this.path, TRASH);
  }

  refresh(keep = true) {
    if (!os.fs.isDir(this.path)) { this.navigate('/', false); return; }
    const nodes = os.fs.list(this.path);
    const items: ListItem[] = nodes.map((n) => {
      const p = joinPath(this.path, n.name);
      const isLnk = extname(n.name) === 'LNK';
      return {
        id: n.name,
        icon: iconForPath(p, n.type === 'dir'),
        cells: [n.name, n.type === 'dir' ? '—' : formatBytes(n.size), fmtDate(n.mtime)],
        sortKeys: [n.name.toLowerCase(), n.type === 'dir' ? -1 : n.size, n.mtime],
        group: n.type === 'dir' ? 0 : 1,
        dim: isLnk ? false : fileClip.cut && fileClip.paths.includes(p),
      };
    });
    this.list.setItems(items, keep);
    this.list.emptyText = this.inTrash ? 'The Trash is empty' : 'This folder is empty';
    this.backBtn.enabled = this.history.length > 0;
    this.upBtn.enabled = this.path !== '/';
    this.updateStatus();
  }
  private updateStatus() {
    const sel = this.list.selectedItems;
    const nodes = os.fs.list(this.path);
    if (sel.length) {
      const size = sel.reduce((s, it) => s + (os.fs.resolve(this.p(it))?.size ?? 0), 0);
      this.status.setText(`${sel.length} of ${nodes.length} selected, ${formatBytes(size)}`);
    } else {
      const size = nodes.reduce((s, n) => s + n.size, 0);
      this.status.setText(`${nodes.length} item${nodes.length === 1 ? '' : 's'}, ${formatBytes(size)}`);
    }
  }
  private p(it: ListItem) {
    return joinPath(this.path, it.id);
  }
  private selPaths() {
    return this.list.selectedItems.map((it) => this.p(it));
  }

  // ---------------------------------------------------------------- list wiring
  private setupList() {
    const L = this.list;
    L.onSelect = () => this.updateStatus();
    L.onActivate = (items) => {
      for (const it of items) {
        const p = this.p(it);
        if (os.fs.isDir(p)) { this.navigate(p); return; }
      }
      for (const it of items) openPath(this.p(it));
    };
    L.onRename = async (it, name) => {
      try { await os.fs.rename(this.p(it), name); this.refresh(); L.select([name]); }
      catch (e) { await alert((e as Error).message, { icon: 'error', parent: this.win }); }
    };
    L.onContext = (items, lx, ly) => {
      const [rx, ry] = L.rootPos();
      os.wm.menus.open(items.length ? this.itemMenu() : this.backgroundMenu(), this.win.x + BODY_X + rx + lx, this.win.y + BODY_Y + ry + ly);
    };
    L.onDragStart = (items) => {
      const first = items[0];
      os.wm.beginFileDrag(items.map((it) => this.p(it)), first.icon ?? 'file');
    };
    L.onDragEnd = (lx, ly) => {
      const [rx, ry] = L.rootPos();
      os.wm.endFileDrag(this.win.x + BODY_X + rx + lx, this.win.y + BODY_Y + ry + ly);
    };
    L.onCopy = (cut) => {
      const paths = this.selPaths();
      if (!paths.length) return null;
      this.clip(paths, cut);
      return paths.join('\n');
    };
    L.onPaste = () => { this.paste(); };
  }

  private clip(paths: string[], cut: boolean) {
    fileClip.paths = paths;
    fileClip.cut = cut;
    this.refresh();
  }

  async paste() {
    if (!fileClip.paths.length) return;
    try {
      for (const p of fileClip.paths) {
        if (!os.fs.exists(p)) continue;
        if (fileClip.cut) await os.fs.move(p, this.path);
        else await os.fs.copy(p, this.path);
      }
      if (fileClip.cut) fileClip.paths = [];
    } catch (e) {
      await alert((e as Error).message, { icon: 'error', parent: this.win });
    }
    this.refresh();
  }

  private async dropPaths(paths: string[], lx: number, ly: number, copy: boolean) {
    // drop onto a folder row, or into the current folder
    const [rx, ry] = this.list.rootPos();
    const hit = this.list.indexAt(lx - rx, ly - ry);
    let dest = this.path;
    if (hit >= 0) {
      const p = this.p(this.list.items[hit]);
      if (os.fs.isDir(p)) dest = p;
    }
    try {
      for (const p of paths) {
        if (dirname(p).toLowerCase() === dest.toLowerCase() && !copy) continue;
        if (os.fs.isInside(dest, p)) continue;
        if (copy) await os.fs.copy(p, dest);
        else if (dest.toLowerCase() === TRASH.toLowerCase()) await os.fs.remove(p);
        else await os.fs.move(p, dest);
      }
      if (dest.toLowerCase() === TRASH.toLowerCase()) os.sound.sfx('trash');
    } catch (e) {
      await alert((e as Error).message, { icon: 'error', parent: this.win });
    }
    this.refresh();
  }

  private async importHere(files: File[], lx: number, ly: number) {
    void lx; void ly;
    await importFiles(files, this.path);
    this.refresh();
  }

  // ---------------------------------------------------------------- commands
  async newFolder() {
    if (this.inTrash) return;
    const name = os.fs.uniqueName(this.path, 'New Folder');
    try {
      await os.fs.mkdir(joinPath(this.path, name));
      this.refresh();
      this.list.select([name]);
      this.list.startRename(name);
    } catch (e) {
      await alert((e as Error).message, { icon: 'error', parent: this.win });
    }
  }
  async newTextFile() {
    const name = os.fs.uniqueName(this.path, 'Untitled.TXT');
    await os.fs.write(joinPath(this.path, name), '');
    this.refresh();
    this.list.select([name]);
    this.list.startRename(name);
  }
  rename() {
    const it = this.list.selectedItems[0];
    if (it) this.list.startRename(it.id);
  }
  async trash() {
    const paths = this.selPaths();
    if (!paths.length) return;
    if (this.inTrash) {
      if (!(await confirm(`Permanently delete ${paths.length} item${paths.length === 1 ? '' : 's'}?`, { icon: 'warning', ok: 'Delete', parent: this.win }))) return;
    }
    try {
      for (const p of paths) await os.fs.remove(p);
      os.sound.sfx('trash');
    } catch (e) {
      await alert((e as Error).message, { icon: 'error', parent: this.win });
    }
    this.refresh();
  }
  async duplicate() {
    for (const p of this.selPaths()) await os.fs.copy(p, this.path);
    this.refresh();
  }
  async restoreFromTrash() {
    for (const p of this.selPaths()) await os.fs.move(p, '/Documents');
    this.refresh();
  }
  async importPick() {
    const files = await pickFiles();
    if (files.length) { await importFiles(files, this.path); this.refresh(); }
  }
  toggleView(mode?: 'list' | 'icons') {
    this.list.mode = mode ?? (this.list.mode === 'list' ? 'icons' : 'list');
    this.list.scroll = 0;
    this.list.layout();
    invalidate();
  }
  sortBy(col: number) {
    this.list.sortCol = col;
    this.list.sortDir = 1;
    this.list.sort();
    invalidate();
  }

  private key(e: { key: string; ctrl: boolean; alt: boolean; shift: boolean }): boolean {
    if (e.key === 'F2') { this.rename(); return true; }
    if (e.key === 'Delete') { this.trash(); return true; }
    if (e.key === 'Backspace' && os.wm.active?.focused === this.list) { this.navigate(dirname(this.path)); return true; }
    if (e.alt && e.key === 'ArrowLeft') { this.back(); return true; }
    if (e.alt && e.key === 'ArrowUp') { this.navigate(dirname(this.path)); return true; }
    if (e.key === 'F5') { this.refresh(); return true; }
    return false;
  }

  private openWithItems(): MenuItem[] {
    const it = this.list.selectedItems[0];
    if (!it) return [];
    const apps = appsThatOpen(extname(it.id));
    const all = apps.length ? apps : [];
    return all.map((a) => ({ label: a.name, action: () => launch(a.id, { path: this.p(it) }) }));
  }

  private itemMenu(): MenuItem[] {
    const one = this.list.selectedItems.length === 1;
    if (this.inTrash) {
      return [
        { label: 'Put Back in Documents', action: () => this.restoreFromTrash() },
        { label: 'Delete Permanently…', action: () => this.trash() },
      ];
    }
    return [
      { label: 'Open', action: () => this.list.onActivate?.(this.list.selectedItems) },
      { label: 'Open With', disabled: !one || !this.openWithItems().length, items: () => this.openWithItems() },
      { separator: true },
      { label: 'Cut', shortcut: 'Ctrl+X', action: () => this.clip(this.selPaths(), true) },
      { label: 'Copy', shortcut: 'Ctrl+C', action: () => this.clip(this.selPaths(), false) },
      { label: 'Duplicate', action: () => this.duplicate() },
      { label: 'Rename', shortcut: 'F2', disabled: !one, action: () => this.rename() },
      { separator: true },
      { label: 'Export to Computer…', action: () => exportPaths(this.selPaths()) },
      { label: 'Move to Trash', shortcut: 'Del', action: () => this.trash() },
    ];
  }
  private backgroundMenu(): MenuItem[] {
    if (this.inTrash) return [{ label: 'Empty Trash…', action: () => os.wm.desktop.emptyTrash() }];
    return [
      { label: 'New Folder', action: () => this.newFolder() },
      { label: 'New Text File', action: () => this.newTextFile() },
      { label: 'Paste', disabled: !fileClip.paths.length, action: () => this.paste() },
      { separator: true },
      { label: 'Import Files…', action: () => this.importPick() },
      { label: this.list.mode === 'list' ? 'View as Icons' : 'View as List', action: () => this.toggleView() },
    ];
  }

  private menus(): MenuDef[] {
    return [
      {
        label: 'File',
        items: () => [
          { label: 'New Window', action: () => new FilesWindow(this.path) },
          { label: 'New Folder', action: () => this.newFolder() },
          { label: 'New Text File', action: () => this.newTextFile() },
          { separator: true },
          { label: 'Open', disabled: !this.list.selected.size, action: () => this.list.onActivate?.(this.list.selectedItems) },
          { label: 'Rename', shortcut: 'F2', disabled: this.list.selected.size !== 1, action: () => this.rename() },
          { label: this.inTrash ? 'Delete Permanently…' : 'Move to Trash', shortcut: 'Del', disabled: !this.list.selected.size, action: () => this.trash() },
          { label: 'Empty Trash…', action: () => os.wm.desktop.emptyTrash() },
          { separator: true },
          { label: 'Import Files…', action: () => this.importPick() },
          { label: 'Export to Computer…', disabled: !this.list.selected.size, action: () => exportPaths(this.selPaths()) },
          { separator: true },
          { label: 'Back Up Whole Disk…', action: () => backupDisk() },
          { label: 'Restore Disk…', action: () => restoreDisk(this.win) },
          { separator: true },
          { label: 'Close', shortcut: 'Ctrl+F4', action: () => this.win.close() },
        ],
      },
      {
        label: 'Edit',
        items: () => [
          { label: 'Cut', shortcut: 'Ctrl+X', disabled: !this.list.selected.size, action: () => this.clip(this.selPaths(), true) },
          { label: 'Copy', shortcut: 'Ctrl+C', disabled: !this.list.selected.size, action: () => this.clip(this.selPaths(), false) },
          { label: 'Paste', shortcut: 'Ctrl+V', disabled: !fileClip.paths.length, action: () => this.paste() },
          { label: 'Duplicate', disabled: !this.list.selected.size, action: () => this.duplicate() },
          { separator: true },
          { label: 'Select All', shortcut: 'Ctrl+A', action: () => this.list.select(this.list.items.map((i) => i.id)) },
        ],
      },
      {
        label: 'View',
        items: () => [
          { label: 'as List', checked: this.list.mode === 'list', action: () => this.toggleView('list') },
          { label: 'as Icons', checked: this.list.mode === 'icons', action: () => this.toggleView('icons') },
          { separator: true },
          { label: 'by Name', checked: this.list.sortCol === 0, action: () => this.sortBy(0) },
          { label: 'by Size', checked: this.list.sortCol === 1, action: () => this.sortBy(1) },
          { label: 'by Date', checked: this.list.sortCol === 2, action: () => this.sortBy(2) },
          { separator: true },
          { label: 'Refresh', shortcut: 'F5', action: () => this.refresh() },
        ],
      },
      {
        label: 'Go',
        items: () => [
          { label: 'Back', shortcut: 'Alt+ArrowLeft', disabled: !this.history.length, action: () => this.back() },
          { label: 'Up', shortcut: 'Alt+ArrowUp', disabled: this.path === '/', action: () => this.navigate(dirname(this.path)) },
          { separator: true },
          ...PLACES.map(([label, p]) => ({ label, checked: this.path.toLowerCase() === p.toLowerCase(), action: () => this.navigate(p) })),
        ],
      },
    ];
  }
}

registerApp({
  id: 'files',
  name: 'Files',
  icon: 'files',
  description: 'Browse, organise, import and export the files on Orbit HD.',
  launch: ({ path }) => {
    const p = path && os.fs.isDir(path) ? path : path ? dirname(path) : '/';
    new FilesWindow(p);
  },
});
