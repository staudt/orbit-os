import { registerApp, getApp } from './registry';
import { Window } from '../wm/window';
import { Widget } from '../ui/widget';
import { Button, Label, ImageView } from '../ui/widgets';
import type { Gfx } from '../core/gfx';
import { C } from '../core/palette';
import { SANS } from '../core/fonts';
import { icon } from '../core/icons';
import { drawPlanet } from '../wm/logo';
import { formatBytes } from '../wm/topbar';
import { VERSION, os } from '../os';

/** The big Orbit wordmark with planet, used by About and the boot splash. */
export class LogoView extends Widget {
  paint(g: Gfx) {
    const cx = Math.floor(this.w / 2);
    const tw = SANS.measure('Orbit', { bold: true, size: 3 });
    const r = 13;
    const total = r * 2 + 10 + tw;
    const x0 = cx - Math.floor(total / 2);
    drawPlanet(g, x0 + r + 2, 16, r, { outline: C.INK, ringColor: C.CRIMSON });
    SANS.draw(g, x0 + r * 2 + 12, 4, 'Orbit', C.PLUM, { bold: true, size: 3 });
    const sub = 'PERSONAL  SYSTEM';
    SANS.draw(g, cx - Math.floor(SANS.measure(sub) / 2), 36, sub, C.MAGENTA);
  }
}

/** A run of text on one line; with a url it's a link that opens in a new browser tab. */
class Span extends Widget {
  constructor(private text: string, private url?: string, private color: number = C.INK) {
    super();
    if (url) this.cursor = 'hand';
  }
  get width() { return SANS.measure(this.text); }
  paint(g: Gfx) {
    const c = this.url ? C.MAGENTA : this.color;
    SANS.draw(g, 0, 1, this.text, c);
    if (this.url) g.hline(0, this.width - 1, 10, c);
  }
  onPointerDown() {
    if (this.url) window.open(this.url, '_blank', 'noopener');
    return true;
  }
}

/** Lay out spans centered on one line. */
function spanLine(parent: Widget, y: number, w: number, spans: Span[]) {
  const total = spans.reduce((t, sp) => t + sp.width, 0);
  let x = Math.floor((w - total) / 2);
  for (const sp of spans) {
    parent.add(sp).setBounds(x, y, sp.width, 12);
    x += sp.width;
  }
}

function openAbout(appId?: string) {
  const app = appId ? getApp(appId) : undefined;
  if (app && app.id !== 'about') {
    const win = new Window({ title: `About ${app.name}`, icon: app.icon, w: 220, h: 96, resizable: false, maximizable: false, minimizable: false, modalFor: os.wm.active, center: true });
    win.body.add(new ImageView(icon(app.icon, 32))).setBounds(10, 10, 32, 32);
    win.body.add(new Label(app.name, { style: { bold: true, size: 2 } })).setBounds(52, 10, 160, 20);
    win.body.add(new Label(app.description ?? `Part of Orbit ${VERSION}.`, { wrap: true, valign: 'top' })).setBounds(52, 32, 160, 36);
    const ok = win.body.add(new Button('OK', () => win.close(), { isDefault: true }));
    ok.setBounds(156, 74, 56, 16);
    win.onKey = (e) => (e.key === 'Escape' ? (win.close(), true) : false);
    os.wm.open(win);
    win.focusWidget(ok);
    return;
  }
  const win = new Window({ title: 'About Orbit', icon: 'about', app: 'about', w: 250, h: 200, resizable: false, maximizable: false });
  win.body.add(new LogoView()).setBounds(0, 8, 250, 48);
  const L = os.display.layout;
  const { files } = os.fs.count();
  const lines = [
    `Version ${VERSION}`,
    `Screen: ${L.w}×${L.h}, 16 colors, ${L.scale}× pixels`,
    `Orbit HD: ${formatBytes(os.fs.usage())} in ${files} files`,
  ];
  const lab = win.body.add(new Label(lines.join('\n'), { align: 'center', valign: 'top' }));
  lab.setBounds(8, 62, 234, 36);
  // credits
  spanLine(win.body, 104, 250, [new Span('Made with care, square pixels and a sunset by', undefined, C.GREY)]);
  spanLine(win.body, 118, 250, [new Span('Ricardo Staudt  '), new Span('x.com/ricardostaudt', 'https://x.com/ricardostaudt')]);
  spanLine(win.body, 131, 250, [new Span('and Claude Opus 5.5')]);
  spanLine(win.body, 150, 250, [new Span('Source: '), new Span('github.com/staudt/orbit-os', 'https://github.com/staudt/orbit-os')]);
  const ok = win.body.add(new Button('OK', () => win.close(), { isDefault: true }));
  ok.setBounds(97, 174, 56, 16);
  os.wm.open(win);
  win.focusWidget(ok);
}

registerApp({
  id: 'about',
  name: 'About Orbit',
  icon: 'about',
  hidden: true,
  launch: ({ args }) => openAbout(args?.app as string | undefined),
});
