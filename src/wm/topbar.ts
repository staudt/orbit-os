import type { Gfx, Rect } from '../core/gfx';
import { C } from '../core/palette';
import { SANS } from '../core/fonts';
import type { KeyEv, PointerEv } from '../core/input';
import type { MenuDef } from '../ui/menu';
import { resolveItems } from '../ui/menu';
import { TH } from '../ui/theme';
import { getApp, launch } from '../apps/registry';
import { drawPlanet } from './logo';
import { invalidate, os } from '../os';

export const TOPBAR_H = 15;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatTime(d: Date, h24: boolean): string {
  const m = String(d.getMinutes()).padStart(2, '0');
  if (h24) return `${String(d.getHours()).padStart(2, '0')}:${m}`;
  const h = d.getHours() % 12 || 12;
  return `${h}:${m} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}K`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}M`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)}G`;
}

interface BarItem {
  x: number;
  w: number;
  menu: MenuDef;
  bold?: boolean;
  logo?: boolean;
}

export class TopBar {
  private items: BarItem[] = [];
  private right: BarItem[] = [];
  private openIndex = -1;
  private lastMinute = -1;
  quota = 0;

  constructor() {
    setInterval(() => {
      const m = new Date().getMinutes();
      if (m !== this.lastMinute) { this.lastMinute = m; invalidate(); }
    }, 1000);
    this.refreshQuota();
    setInterval(() => this.refreshQuota(), 60_000);
  }

  private async refreshQuota() {
    try {
      const est = await navigator.storage?.estimate?.();
      this.quota = est?.quota ?? 0;
    } catch { /* storage API unavailable */ }
  }

  /** Menus available everywhere (the Orbit menu). */
  globalMenus(): MenuDef[] {
    return [this.orbitMenu()];
  }

  private orbitMenu(): MenuDef {
    return {
      label: 'Orbit',
      items: [
        { label: 'About Orbit…', action: () => launch('about') },
        { separator: true },
        { label: 'Launcher…', shortcut: 'F9', action: () => launch('launcher') },
        { label: 'Config…', action: () => launch('config') },
        { label: 'Start Screensaver', action: () => setTimeout(() => os.wm.screensaver.start(), 300) },
        { separator: true },
        { label: 'Moony Tour…', action: () => os.wm.moony.startTour() },
        { label: 'Show Moony', checked: () => os.wm.moony.visible, action: () => (os.wm.moony.visible ? os.wm.moony.hide() : os.wm.moony.show()) },
        { separator: true },
        { label: 'Restart', action: () => location.reload() },
      ],
    };
  }

  private appMenu(): MenuDef {
    const win = os.wm.active;
    if (!win) {
      return {
        label: 'Desktop',
        items: () => os.wm.desktop.menuItems(),
      };
    }
    const app = getApp(win.app);
    const name = app?.name ?? win.title;
    return {
      label: name,
      items: [
        ...(app ? [{ label: `About ${name}…`, action: () => launch('about', { args: { app: app.id } }) }, { separator: true }] : []),
        { label: 'Minimize', disabled: !win.minimizable, action: () => os.wm.minimize(win) },
        { label: win.state === 'maximized' ? 'Restore Size' : 'Maximize', disabled: !win.maximizable, action: () => os.wm.toggleMaximize(win) },
        { separator: true },
        { label: 'Close Window', shortcut: 'Ctrl+F4', action: () => os.wm.close(win) },
      ],
    };
  }

  private clockMenu(): MenuDef {
    return {
      label: 'clock',
      items: () => {
        const d = new Date();
        return [
          { label: `${LONG_DAYS[d.getDay()]}, ${LONG_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`, disabled: true },
          { separator: true },
          { label: '24-hour clock', checked: os.settings.get('clock24'), action: () => os.settings.set('clock24', !os.settings.get('clock24')) },
          { label: 'Open Clock', action: () => launch('clock') },
        ];
      },
    };
  }

  private diskMenu(): MenuDef {
    return {
      label: 'disk',
      items: () => {
        const { files, dirs } = os.fs.count();
        return [
          { label: `Orbit HD: ${formatBytes(os.fs.usage())} used`, disabled: true },
          { label: `${files} files, ${dirs} folders`, disabled: true },
          ...(this.quota ? [{ label: `Browser storage quota: ${formatBytes(this.quota)}`, disabled: true }] : []),
          { separator: true },
          { label: 'Open Orbit HD', icon: 'disk', action: () => launch('files', { path: '/' }) },
        ];
      },
    };
  }

  private build() {
    const W = os.display.layout.w;
    const menus: { m: MenuDef; bold?: boolean; logo?: boolean }[] = [
      { m: this.orbitMenu(), logo: true },
      { m: this.appMenu(), bold: true },
      ...(os.wm.active ? os.wm.active.menus : []).map((m) => ({ m })),
    ];
    let x = 2;
    this.items = [];
    for (const { m, bold, logo } of menus) {
      const w = logo ? 18 : SANS.measure(m.label, { bold }) + 10;
      this.items.push({ x, w, menu: m, bold, logo });
      x += w;
    }
    // right side: clock and disk
    const d = new Date();
    const clock = `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}  ${formatTime(d, os.settings.get('clock24'))}`;
    const short = formatTime(d, os.settings.get('clock24'));
    const disk = `HD ${formatBytes(os.fs.usage())}`;
    const cw = SANS.measure(clock) + 10;
    const dw = SANS.measure(disk) + 10;
    const spaceLeft = W - x;
    const useShort = spaceLeft < cw + dw + 10;
    const cWidth = useShort ? SANS.measure(short) + 10 : cw;
    this.right = [];
    const showDisk = spaceLeft > cWidth + dw + 6;
    let rx = W - 2 - cWidth;
    this.right.push({ x: rx, w: cWidth, menu: { ...this.clockMenu(), label: useShort ? short : clock } });
    if (showDisk) {
      rx -= dw;
      this.right.push({ x: rx, w: dw, menu: { ...this.diskMenu(), label: disk } });
    }
    // drop menus that don't fit (they remain reachable via keyboard shortcuts)
    const limit = rx - 4;
    this.items = this.items.filter((it) => it.x + it.w <= limit);
  }

  /** Screen rect of a left-side menu title (0 = the Orbit logo). */
  itemRect(i: number): Rect | null {
    const it = this.items[i];
    return it ? { x: it.x, y: 0, w: it.w, h: TOPBAR_H - 1 } : null;
  }

  private all(): BarItem[] {
    return [...this.items, ...this.right];
  }

  paint(g: Gfx) {
    this.build();
    const W = os.display.layout.w;
    g.fillRect(0, 0, W, TOPBAR_H - 1, TH.menuBg);
    g.hline(0, W - 1, TOPBAR_H - 1, TH.border);
    if (!os.wm.menus.isOpen) this.openIndex = -1;
    const all = this.all();
    all.forEach((it, i) => {
      const open = i === this.openIndex;
      if (open) g.fillRect(it.x, 0, it.w, TOPBAR_H - 1, TH.sel);
      if (it.logo) {
        drawPlanet(g, it.x + 9, 7, 4, { gaps: false, ringColor: C.PLUM });
      } else {
        SANS.draw(g, it.x + 5, 3, it.menu.label, TH.text, { bold: it.bold });
      }
    });
    // separators before the right-side status items
    for (const it of this.right) g.vline(it.x, 2, TOPBAR_H - 4, C.TAN);
  }

  openMenu(i: number) {
    const all = this.all();
    const it = all[i];
    if (!it) return;
    this.openIndex = i;
    const items = resolveItems(it.menu.items);
    const x = i >= this.items.length ? it.x + it.w : it.x;
    os.wm.menus.open(items, x, TOPBAR_H - 1, () => { this.openIndex = -1; invalidate(); }, i);
    // right-aligned status menus: shift so they stay on screen (handled by popup clamping)
    invalidate();
  }

  pointer(e: PointerEv) {
    const all = this.all();
    const i = all.findIndex((it) => e.x >= it.x && e.x < it.x + it.w);
    if (e.type === 'down') {
      if (i < 0) { os.wm.menus.close(); return; }
      if (os.wm.menus.isOpen && this.openIndex === i) { os.wm.menus.close(); return; }
      this.openMenu(i);
    } else if (e.type === 'move' && os.wm.menus.isOpen && i >= 0 && i !== this.openIndex && this.openIndex >= 0) {
      this.openMenu(i);
    }
  }

  /** Left/right arrows move between open bar menus. */
  keyNav(e: KeyEv): boolean {
    if (this.openIndex < 0) return false;
    const n = this.all().length;
    if (e.key === 'ArrowRight') { this.openMenu((this.openIndex + 1) % n); return true; }
    if (e.key === 'ArrowLeft') { this.openMenu((this.openIndex - 1 + n) % n); return true; }
    return false;
  }
}
