import type { Gfx, Rect } from '../core/gfx';
import { rectContains, rectIntersects } from '../core/gfx';
import { C, DARKER } from '../core/palette';
import { SANS, wrapText } from '../core/fonts';
import { icon, T as TRANSPARENT } from '../core/icons';
import type { KeyEv, PointerEv } from '../core/input';
import type { MenuItem } from '../ui/menu';
import { getApp, iconForPath, launch, openPath, readShortcut } from '../apps/registry';
import { alert, confirm, prompt } from '../ui/dialog';
import { basename, extname, joinPath, TRASH } from '../fs/vfs';
import type { Window } from './window';
import { TOPBAR_H } from './topbar';
import { TASKBAR_H } from './taskbar';
import { invalidate, os } from '../os';
import { importFiles } from '../fs/importexport';

export const DESKTOP_DIR = '/Desktop';
const CELL_W = 64;
const CELL_H = 54;

interface DeskIcon {
  key: string;
  label: string;
  icon: string;
  /** filesystem path ('/' for the disk) */
  path: string;
  kind: 'file' | 'dir' | 'lnk' | 'trash' | 'disk';
  x: number;
  y: number;
}

export class Desktop {
  icons: DeskIcon[] = [];
  selected = new Set<string>();
  private lnkCache = new Map<string, { icon: string; label: string }>();
  private drag: { start: [number, number]; moved: boolean; offsets: Map<string, [number, number]>; target: DeskIcon | null } | null = null;
  private band: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private typeBuf = '';
  private typeTime = 0;

  /** Rebuild the icon list from /Desktop and place icons. */
  async refresh() {
    const fs = os.fs;
    if (!fs.exists(DESKTOP_DIR)) await fs.mkdir(DESKTOP_DIR);
    if (!fs.exists(TRASH)) await fs.mkdir(TRASH);
    for (const n of fs.list(DESKTOP_DIR)) {
      const p = joinPath(DESKTOP_DIR, n.name);
      if (n.type === 'file' && extname(n.name) === 'LNK' && !this.lnkCache.has(p + n.mtime)) {
        const s = await readShortcut(p);
        const app = s?.app ? getApp(s.app) : undefined;
        const ic = app ? app.icon : s?.path ? iconForPath(s.path, os.fs.isDir(s.path)) : 'file';
        this.lnkCache.set(p + n.mtime, { icon: ic, label: n.name.replace(/\.lnk$/i, '') });
      }
    }
    this.layout();
  }

  layout() {
    const fs = os.fs;
    if (!fs.exists(DESKTOP_DIR)) return;
    const icons: DeskIcon[] = [];
    icons.push({ key: 'disk', label: 'Orbit HD', icon: 'disk', path: '/', kind: 'disk', x: -1, y: -1 });
    for (const n of fs.list(DESKTOP_DIR)) {
      const p = joinPath(DESKTOP_DIR, n.name);
      if (n.type === 'file' && extname(n.name) === 'LNK') {
        const c = this.lnkCache.get(p + n.mtime);
        icons.push({ key: n.name, label: c?.label ?? n.name.replace(/\.lnk$/i, ''), icon: c?.icon ?? 'file', path: p, kind: 'lnk', x: -1, y: -1 });
      } else {
        icons.push({ key: n.name, label: n.name, icon: iconForPath(p, n.type === 'dir'), path: p, kind: n.type, x: -1, y: -1 });
      }
    }
    const trashFull = fs.exists(TRASH) && fs.list(TRASH).length > 0;
    icons.push({ key: 'trash', label: 'Trash', icon: trashFull ? 'trash-full' : 'trash-empty', path: TRASH, kind: 'trash', x: -1, y: -1 });

    const W = os.display.layout.w, H = os.display.layout.h - TASKBAR_H;
    const pos = os.settings.get('iconPositions');
    const rows = Math.max(1, Math.floor((H - TOPBAR_H - 8 - CELL_H) / CELL_H));
    const taken = new Set<string>();
    const cellKey = (x: number, y: number) => `${Math.round((x - 4) / CELL_W)},${Math.round((y - TOPBAR_H - 6) / CELL_H)}`;
    for (const ic of icons) {
      const p = pos[ic.key];
      if (p) {
        ic.x = Math.max(0, Math.min(W - CELL_W, p[0]));
        ic.y = Math.max(TOPBAR_H + 2, Math.min(H - CELL_H, p[1]));
        taken.add(cellKey(ic.x, ic.y));
      }
    }
    // Trash defaults to the bottom-right corner
    const trash = icons[icons.length - 1];
    if (trash.x < 0) {
      trash.x = W - CELL_W - 4;
      trash.y = H - CELL_H - 2;
      taken.add(cellKey(trash.x, trash.y));
    }
    let col = 0, row = 0;
    for (const ic of icons) {
      if (ic.x >= 0) continue;
      for (;;) {
        const x = 4 + col * CELL_W, y = TOPBAR_H + 6 + row * CELL_H;
        row++;
        if (row >= rows) { row = 0; col++; }
        if (!taken.has(cellKey(x, y))) { ic.x = x; ic.y = y; taken.add(cellKey(x, y)); break; }
        if (col > 40) { ic.x = x; ic.y = y; break; }
      }
    }
    this.icons = icons;
    invalidate();
  }

  /** Screen areas taken by desktop icons (for window placement). */
  iconRects(): Rect[] {
    return this.icons.map((ic) => this.hitRect(ic));
  }

  private iconRect(ic: DeskIcon): Rect {
    return { x: ic.x + (CELL_W - 32) / 2, y: ic.y, w: 32, h: 32 };
  }
  private labelLines(label: string): string[] {
    const lines = wrapText(SANS, label, CELL_W - 4);
    if (lines.length > 2) return [lines[0], SANS.fit(lines.slice(1).join(' '), CELL_W - 4)];
    return lines;
  }
  private hitRect(ic: DeskIcon): Rect {
    const lines = this.labelLines(ic.label);
    const lw = Math.max(...lines.map((l) => SANS.measure(l))) + 4;
    const x = ic.x + Math.min((CELL_W - 32) / 2, (CELL_W - lw) / 2);
    return { x, y: ic.y, w: Math.max(32, lw), h: 34 + lines.length * 10 };
  }

  iconAt(x: number, y: number): DeskIcon | null {
    for (let i = this.icons.length - 1; i >= 0; i--) {
      const ic = this.icons[i];
      const r = this.iconRect(ic);
      if (rectContains(r, x, y)) return ic;
      const hr = this.hitRect(ic);
      if (rectContains({ x: hr.x, y: ic.y + 33, w: hr.w, h: hr.h - 33 }, x, y)) return ic;
    }
    return null;
  }

  paint(g: Gfx) {
    const dragging = this.drag?.moved;
    for (const ic of this.icons) {
      let x = ic.x, y = ic.y;
      if (dragging && this.drag!.offsets.has(ic.key)) {
        const [ox, oy] = this.drag!.offsets.get(ic.key)!;
        x = os.input.mouseX - ox;
        y = os.input.mouseY - oy;
      }
      this.paintIcon(g, ic, x, y, this.selected.has(ic.key), this.drag?.target === ic);
    }
    if (this.band) {
      const b = this.band;
      const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1);
      g.dashedRect(x, y, Math.abs(b.x1 - b.x0) + 1, Math.abs(b.y1 - b.y0) + 1, C.CREAM, C.INK, Math.floor(performance.now() / 80), 2);
      os.scheduler.animate(() => false);
    }
  }

  private paintIcon(g: Gfx, ic: DeskIcon, x: number, y: number, sel: boolean, target: boolean) {
    const ix = x + (CELL_W - 32) / 2;
    const img = icon(ic.icon, 32);
    if (sel || target) {
      // selected icons are drawn darkened through a 50% dither (only on icon pixels)
      for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
        const v = img.px[j * 32 + i];
        if (v === TRANSPARENT) continue;
        g.pset(ix + i, y + j, (i + j) & 1 ? DARKER[v] : v);
      }
    } else g.blit(img, ix, y, TRANSPARENT);
    if (ic.kind === 'lnk') {
      // little shortcut arrow
      g.fillRect(ix, y + 25, 7, 7, C.CREAM);
      g.rect(ix, y + 25, 7, 7, C.INK);
      g.line(ix + 2, y + 29, ix + 4, y + 27, C.INK);
      g.pset(ix + 3, y + 27, C.INK); g.pset(ix + 4, y + 28, C.INK);
    }
    this.paintLabel(g, ic.label, x, y + 34, sel);
  }

  private paintLabel(g: Gfx, label: string, x: number, y: number, sel: boolean) {
    const lines = this.labelLines(label);
    lines.forEach((l, i) => {
      const lw = SANS.measure(l);
      const lx = x + Math.floor((CELL_W - lw) / 2);
      const ly = y + i * 10;
      g.fillRect(lx - 2, ly - 1, lw + 3, 10, sel ? C.ORANGE : C.INK);
      SANS.draw(g, lx, ly, l, sel ? C.INK : C.CREAM);
    });
  }

  // ---------------------------------------------------------------- input

  pointer(e: PointerEv) {
    if (e.type === 'down') {
      os.wm.menus.close(false);
      const ic = this.iconAt(e.x, e.y);
      if (e.button === 2) {
        if (ic && !this.selected.has(ic.key)) { this.selected = new Set([ic.key]); }
        if (!ic) this.selected.clear();
        os.wm.menus.open(ic ? this.iconMenu(ic) : this.menuItems(), e.x, e.y);
        invalidate();
        return;
      }
      if (!ic) {
        if (!e.shift && !e.ctrl) this.selected.clear();
        this.band = { x0: e.x, y0: e.y, x1: e.x, y1: e.y };
        invalidate();
        return;
      }
      if (e.ctrl || e.shift) {
        if (this.selected.has(ic.key)) this.selected.delete(ic.key);
        else this.selected.add(ic.key);
      } else if (!this.selected.has(ic.key)) this.selected = new Set([ic.key]);
      if (e.clicks === 2) {
        this.open(ic);
        return;
      }
      const offsets = new Map<string, [number, number]>();
      for (const s of this.icons) if (this.selected.has(s.key)) offsets.set(s.key, [e.x - s.x, e.y - s.y]);
      this.drag = { start: [e.x, e.y], moved: false, offsets, target: null };
      invalidate();
    } else if (e.type === 'move') {
      if (this.band) {
        this.band.x1 = e.x;
        this.band.y1 = e.y;
        const b = { x: Math.min(this.band.x0, e.x), y: Math.min(this.band.y0, e.y), w: Math.abs(e.x - this.band.x0) + 1, h: Math.abs(e.y - this.band.y0) + 1 };
        this.selected = new Set(this.icons.filter((ic) => rectIntersects(this.iconRect(ic), b)).map((ic) => ic.key));
        invalidate();
      } else if (this.drag) {
        const [sx, sy] = this.drag.start;
        if (!this.drag.moved && Math.abs(e.x - sx) + Math.abs(e.y - sy) > 3) this.drag.moved = true;
        if (this.drag.moved) {
          const t = this.iconAt(e.x, e.y);
          this.drag.target = t && !this.selected.has(t.key) && (t.kind === 'dir' || t.kind === 'trash' || t.kind === 'disk') ? t : null;
          invalidate();
        }
      }
    } else if (e.type === 'up') {
      if (this.band) { this.band = null; invalidate(); return; }
      const d = this.drag;
      this.drag = null;
      if (!d || !d.moved) { invalidate(); return; }
      const dropWin = os.wm.windowAt(e.x, e.y);
      if (d.target) this.dropOnto(d.target);
      else if (dropWin) this.dropOnWindow(dropWin.win, e.x, e.y);
      else {
        const pos = { ...os.settings.get('iconPositions') };
        for (const ic of this.icons) {
          const off = d.offsets.get(ic.key);
          if (!off) continue;
          const x = Math.round((e.x - off[0]) / 4) * 4, y = Math.round((e.y - off[1]) / 4) * 4;
          pos[ic.key] = [x, y];
        }
        os.settings.set('iconPositions', pos);
        this.layout();
      }
      invalidate();
    }
  }

  private selectedIcons(): DeskIcon[] {
    return this.icons.filter((ic) => this.selected.has(ic.key));
  }

  private async dropOnto(target: DeskIcon) {
    const items = this.selectedIcons().filter((ic) => ic.kind !== 'disk' && ic.kind !== 'trash');
    if (!items.length) return;
    try {
      if (target.kind === 'trash') {
        for (const ic of items) await os.fs.remove(ic.path);
        os.sound.sfx('trash');
      } else {
        const dest = target.path;
        for (const ic of items) await os.fs.move(ic.path, dest);
      }
    } catch (err) {
      await alert((err as Error).message, { icon: 'error' });
    }
    this.selected.clear();
    await this.refresh();
  }

  private dropOnWindow(win: Window, x: number, y: number) {
    const handler = (win as Window & { onDropPaths?: (paths: string[], x: number, y: number, copy: boolean) => void }).onDropPaths;
    const paths = this.selectedIcons().filter((ic) => ic.kind !== 'disk' && ic.kind !== 'trash').map((ic) => ic.path);
    if (handler && paths.length) handler(paths, x - win.x - 1, y - win.y - 16, !!os.wm.lastPointer?.ctrl);
  }

  /** Files dropped on the desktop from a Files window. */
  async dropPathsAt(paths: string[], x: number, y: number, copy: boolean) {
    const target = this.iconAt(x, y);
    try {
      if (target && target.kind === 'trash') {
        for (const p of paths) await os.fs.remove(p);
        os.sound.sfx('trash');
      } else {
        const dest = target && (target.kind === 'dir' || target.kind === 'disk') ? target.path : DESKTOP_DIR;
        const pos = { ...os.settings.get('iconPositions') };
        let k = 0;
        for (const p of paths) {
          if (!copy && os.fs.isInside(dest, p)) continue;
          const np = copy ? await os.fs.copy(p, dest) : await os.fs.move(p, dest);
          if (dest === DESKTOP_DIR) pos[basename(np)] = [Math.max(0, x - 32 + k * 8), Math.max(TOPBAR_H + 2, y - 16 + k * 8)];
          k++;
        }
        if (dest === DESKTOP_DIR) os.settings.set('iconPositions', pos);
      }
    } catch (err) {
      await alert((err as Error).message, { icon: 'error' });
    }
    await this.refresh();
  }

  async open(ic: DeskIcon) {
    const r = this.iconRect(ic);
    os.wm.setOrigin(r);
    if (ic.kind === 'disk') return launch('files', { path: '/' });
    if (ic.kind === 'trash') return launch('files', { path: TRASH });
    return openPath(ic.path);
  }

  key(e: KeyEv) {
    const sel = this.selectedIcons();
    if (e.key === 'Enter' && sel.length) { for (const ic of sel) this.open(ic); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) { this.trashSelected(); return; }
    if (e.key.startsWith('Arrow')) {
      const cur = sel[0] ?? this.icons[0];
      if (!cur) return;
      const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      let best: DeskIcon | null = null, bestD = Infinity;
      for (const ic of this.icons) {
        if (ic === cur) continue;
        const vx = ic.x - cur.x, vy = ic.y - cur.y;
        if (dx && Math.sign(vx) !== dx) continue;
        if (dy && Math.sign(vy) !== dy) continue;
        const d = dx ? Math.abs(vx) + Math.abs(vy) * 3 : Math.abs(vy) + Math.abs(vx) * 3;
        if (d < bestD) { bestD = d; best = ic; }
      }
      if (best) this.selected = new Set([best.key]);
      else if (!sel.length) this.selected = new Set([cur.key]);
      invalidate();
    }
  }

  typeSelect(s: string) {
    const now = performance.now();
    this.typeBuf = now - this.typeTime > 800 ? s : this.typeBuf + s;
    this.typeTime = now;
    const ic = this.icons.find((i) => i.label.toLowerCase().startsWith(this.typeBuf.toLowerCase()));
    if (ic) { this.selected = new Set([ic.key]); invalidate(); }
  }

  private async trashSelected() {
    const items = this.selectedIcons().filter((ic) => ic.kind !== 'disk' && ic.kind !== 'trash');
    if (!items.length) return;
    for (const ic of items) await os.fs.remove(ic.path);
    os.sound.sfx('trash');
    this.selected.clear();
    await this.refresh();
  }

  private async rename(ic: DeskIcon) {
    const isLnk = ic.kind === 'lnk';
    const cur = isLnk ? ic.label : basename(ic.path);
    const name = await prompt('New name:', cur, { title: 'Rename' });
    if (!name || name === cur) return;
    try {
      const newName = isLnk ? `${name}.LNK` : name;
      await os.fs.rename(ic.path, newName);
      const pos = { ...os.settings.get('iconPositions') };
      if (pos[ic.key]) { pos[newName] = pos[ic.key]; delete pos[ic.key]; os.settings.set('iconPositions', pos); }
      await this.refresh();
    } catch (err) {
      await alert((err as Error).message, { icon: 'error' });
    }
  }

  async emptyTrash() {
    const n = os.fs.exists(TRASH) ? os.fs.list(TRASH).length : 0;
    if (!n) return;
    if (!(await confirm(`Permanently delete ${n} item${n === 1 ? '' : 's'} in the Trash?`, { title: 'Empty Trash', icon: 'warning', ok: 'Empty' }))) return;
    await os.fs.emptyTrash();
    os.sound.sfx('trash');
    await this.refresh();
  }

  private iconMenu(ic: DeskIcon): MenuItem[] {
    if (ic.kind === 'trash') {
      return [
        { label: 'Open', action: () => this.open(ic) },
        { separator: true },
        { label: 'Empty Trash…', action: () => this.emptyTrash() },
      ];
    }
    if (ic.kind === 'disk') return [{ label: 'Open', action: () => this.open(ic) }];
    return [
      { label: 'Open', action: () => { for (const s of this.selectedIcons()) this.open(s); } },
      { separator: true },
      { label: 'Rename…', disabled: this.selected.size !== 1, action: () => this.rename(ic) },
      { label: 'Move to Trash', icon: 'trash-small', action: () => this.trashSelected() },
    ];
  }

  /** Menu shown for the desktop background and as the "Desktop" app menu. */
  menuItems(): MenuItem[] {
    return [
      { label: 'New Folder', icon: 'new-folder', action: () => this.newFolder() },
      { label: 'Import Files…', action: () => this.pickImport() },
      { separator: true },
      { label: 'Clean Up Icons', action: () => { os.settings.set('iconPositions', {}); this.layout(); } },
      {
        label: 'Wallpaper',
        items: () => (['sunset', 'plain', 'pattern'] as const).map((k) => ({
          label: k[0].toUpperCase() + k.slice(1),
          checked: os.settings.get('wallpaper') === k,
          action: () => os.settings.set('wallpaper', k),
        })),
      },
      { separator: true },
      { label: 'Empty Trash…', disabled: !os.fs.exists(TRASH) || os.fs.list(TRASH).length === 0, action: () => this.emptyTrash() },
      { label: 'Config…', icon: 'config', action: () => launch('config') },
    ];
  }

  private async newFolder() {
    const name = await prompt('Folder name:', os.fs.uniqueName(DESKTOP_DIR, 'New Folder'), { title: 'New Folder' });
    if (!name) return;
    try {
      await os.fs.mkdir(joinPath(DESKTOP_DIR, name));
      await this.refresh();
    } catch (err) {
      await alert((err as Error).message, { icon: 'error' });
    }
  }

  private pickImport() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.onchange = () => {
      const files = Array.from(inp.files ?? []);
      if (files.length) this.importFiles(files, -1, -1);
    };
    inp.click();
  }

  async importFiles(files: File[], x: number, y: number) {
    const target = x >= 0 ? this.iconAt(x, y) : null;
    const dir = target && (target.kind === 'dir' || target.kind === 'disk') ? target.path : DESKTOP_DIR;
    const names = await importFiles(files, dir);
    if (x >= 0 && dir === DESKTOP_DIR && names.length) {
      const pos = { ...os.settings.get('iconPositions') };
      names.forEach((n, i) => { pos[n] = [Math.max(0, x - 32 + i * 8), Math.max(TOPBAR_H + 2, y - 16 + i * 8)]; });
      os.settings.set('iconPositions', pos);
    }
    await this.refresh();
  }
}
