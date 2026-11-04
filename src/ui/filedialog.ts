import { Window } from '../wm/window';
import { ListView, type ListItem } from './listview';
import { Button, Label, TextField } from './widgets';
import { confirm, alert } from './dialog';
import { icon } from '../core/icons';
import { basename, dirname, extname, joinPath } from '../fs/vfs';
import { iconForPath } from '../apps/registry';
import { formatBytes } from '../wm/topbar';
import { os } from '../os';

export interface FileDialogOpts {
  mode: 'open' | 'save';
  title?: string;
  /** starting folder */
  dir?: string;
  /** suggested file name (save) */
  name?: string;
  /** allowed extensions (upper-case, no dot); empty = any */
  exts?: string[];
  /** label for the type filter, e.g. "Text documents" */
  typeLabel?: string;
  parent?: Window | null;
  /** add this extension when the user types a name without one (save) */
  defaultExt?: string;
}

const lastDirs = new Map<string, string>();

export function fmtDate(t: number): string {
  const d = new Date(t);
  const now = new Date();
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
  if (d.getFullYear() === now.getFullYear()) return `${mon} ${String(d.getDate()).padStart(2, ' ')}`;
  return `${mon} ${d.getFullYear()}`;
}

/** Modal Open/Save dialog built on the Files list. Resolves with a path or null. */
export function fileDialog(o: FileDialogOpts): Promise<string | null> {
  return new Promise((resolve) => {
    const key = (o.exts ?? []).join(',') || '*';
    let dir = o.dir && os.fs.isDir(o.dir) ? o.dir : lastDirs.get(key) ?? '/Documents';
    if (!os.fs.isDir(dir)) dir = '/';
    const parent = o.parent ?? os.wm.active;
    const win = new Window({
      title: o.title ?? (o.mode === 'open' ? 'Open' : 'Save As'),
      icon: 'folder-open', w: 300, h: 220, minW: 240, minH: 160, modalFor: parent, center: true, maximizable: false,
    });
    const body = win.body;
    const up = body.add(new Button('', () => navigate(dirname(dir)), { icon: icon('up'), kind: 'tool', tooltip: 'Up' }));
    const where = body.add(new Label('', { style: { bold: true } }));
    const list = body.add(new ListView([{ title: 'Name', w: 120, flex: true }, { title: 'Size', w: 40, align: 'right' }, { title: 'Date', w: 46 }]));
    list.multi = false;
    list.emptyText = 'This folder is empty';
    const nameLabel = body.add(new Label('Name:'));
    const nameField = body.add(new TextField(o.name ?? ''));
    const typeLabel = body.add(new Label(o.typeLabel ?? (o.exts?.length ? o.exts.map((e) => '.' + e).join(' ') : 'All files'), { color: 11 }));
    const ok = body.add(new Button(o.mode === 'open' ? 'Open' : 'Save', () => accept(), { isDefault: true }));
    const cancel = body.add(new Button('Cancel', () => finish(null)));
    nameLabel.visible = nameField.visible = o.mode === 'save';

    body.layoutFn = (p) => {
      up.setBounds(6, 5, 20, 16);
      where.setBounds(30, 5, p.w - 36, 16);
      const bottom = o.mode === 'save' ? 48 : 28;
      list.setBounds(6, 24, p.w - 12, p.h - 24 - bottom);
      if (o.mode === 'save') {
        nameLabel.setBounds(6, p.h - 44, 34, 14);
        nameField.setBounds(42, p.h - 44, p.w - 48, 14);
      }
      typeLabel.setBounds(6, p.h - 22, p.w - 140, 14);
      ok.setBounds(p.w - 126, p.h - 22, 58, 16);
      cancel.setBounds(p.w - 64, p.h - 22, 58, 16);
    };

    const allowed = (name: string) => !o.exts?.length || o.exts.includes(extname(name));
    function navigate(d: string) {
      if (!os.fs.isDir(d)) return;
      dir = d;
      where.setText(d === '/' ? 'Orbit HD' : d);
      up.enabled = d !== '/';
      const items: ListItem[] = os.fs.list(d)
        .filter((n) => n.type === 'dir' || allowed(n.name))
        .map((n) => ({
          id: n.name,
          icon: iconForPath(joinPath(d, n.name), n.type === 'dir'),
          cells: [n.name, n.type === 'dir' ? '' : formatBytes(n.size), fmtDate(n.mtime)],
          sortKeys: [n.name.toLowerCase(), n.size, n.mtime],
          group: n.type === 'dir' ? 0 : 1,
        }));
      list.setItems(items, false);
      list.scroll = 0;
      list.invalidate();
    }
    list.onSelect = (sel) => {
      const it = sel[0];
      if (it && o.mode === 'save' && !os.fs.isDir(joinPath(dir, it.id))) nameField.setText(it.id);
    };
    list.onActivate = (sel) => {
      const it = sel[0];
      if (!it) return;
      const p = joinPath(dir, it.id);
      if (os.fs.isDir(p)) navigate(p);
      else if (o.mode === 'open') finish(p);
      else { nameField.setText(it.id); accept(); }
    };
    let done = false;
    function finish(p: string | null) {
      if (done) return;
      done = true;
      if (p) lastDirs.set(key, dirname(p));
      os.wm.close(win, true);
      resolve(p);
    }
    async function accept() {
      if (o.mode === 'open') {
        const it = list.selectedItems[0];
        if (!it) return;
        const p = joinPath(dir, it.id);
        if (os.fs.isDir(p)) navigate(p);
        else finish(p);
        return;
      }
      let name = nameField.text.trim();
      if (!name) { nameField.focus(); return; }
      if (name.includes('/')) {
        const target = name.startsWith('/') ? name : joinPath(dir, name);
        if (os.fs.isDir(target)) { navigate(target); nameField.setText(''); return; }
        dir = dirname(target);
        name = basename(target);
        if (!os.fs.isDir(dir)) { await alert(`The folder "${dir}" does not exist.`, { icon: 'warning', parent: win }); return; }
      }
      if (o.defaultExt && !extname(name)) name += '.' + o.defaultExt;
      const p = joinPath(dir, name);
      if (os.fs.isDir(p)) { navigate(p); return; }
      if (os.fs.exists(p) && !(await confirm(`"${name}" already exists. Replace it?`, { icon: 'warning', ok: 'Replace', parent: win }))) return;
      finish(p);
    }
    win.onKey = (e) => {
      if (e.key === 'Escape') { finish(null); return true; }
      if (e.key === 'Backspace' && os.wm.active?.focused === list) { navigate(dirname(dir)); return true; }
      return false;
    };
    win.onCloseRequest = () => { finish(null); return true; };
    navigate(dir);
    os.wm.open(win);
    win.focusWidget(o.mode === 'save' ? nameField : list);
    if (o.mode === 'save') nameField.selectAll();
    if (o.name && o.mode === 'open') list.select([o.name]);
  });
}
