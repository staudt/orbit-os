import { registerApp } from '../registry';
import { Window } from '../../wm/window';
import { Button, Label, TextField } from '../../ui/widgets';
import type { MenuDef, MenuItem } from '../../ui/menu';
import { alert } from '../../ui/dialog';
import { icon } from '../../core/icons';
import { C } from '../../core/palette';
import { joinPath } from '../../fs/vfs';
import { cleanName } from '../../fs/importexport';
import { HELP_PAGES } from '../../seed/help';
import { PageView } from './pageview';
import { parseMarkdown, parseReaderResponse, pageToText, type Page } from './markdown';
import { invalidate, os } from '../../os';

interface HistEntry { url: string; scroll: number }

const cache = new Map<string, Page>();

/** Turn what the user typed into a URL: orbit pages, web addresses or a web search. */
export function normalizeInput(s: string): string {
  s = s.trim();
  if (!s) return 'orbit:home';
  if (/^orbit:/i.test(s)) return s.toLowerCase();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(s) && !/\s/.test(s)) return 'https://' + s;
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(s)}`;
}

class BrowserWindow {
  win: Window;
  view: PageView;
  address: TextField;
  status: Label;
  back: HistEntry[] = [];
  fwd: HistEntry[] = [];
  url = '';
  page: Page | null = null;
  private loading = 0;
  private backBtn: Button;
  private fwdBtn: Button;

  constructor(url?: string) {
    this.win = new Window({ title: 'Internet Navigator', icon: 'navigator', app: 'browser', w: 380, h: 260, minW: 220, minH: 120, fit: { w: 0.86, h: 0.92, maxW: 900, maxH: 680 } });
    const b = this.win.body;
    this.backBtn = b.add(new Button('', () => this.goBack(), { icon: icon('back'), kind: 'tool', tooltip: 'Back' }));
    this.fwdBtn = b.add(new Button('', () => this.goForward(), { icon: icon('forward'), kind: 'tool', tooltip: 'Forward' }));
    const reload = b.add(new Button('', () => this.navigate(this.url, false, true), { icon: icon('reload'), kind: 'tool', tooltip: 'Reload' }));
    const home = b.add(new Button('', () => this.navigate(os.settings.get('browserHome')), { icon: icon('home'), kind: 'tool', tooltip: 'Home' }));
    this.address = b.add(new TextField('', { placeholder: 'Address, link number, or words to search' }));
    this.view = b.add(new PageView());
    this.status = b.add(new Label('', { color: C.GREY }));
    b.layoutFn = (p) => {
      this.backBtn.setBounds(3, 3, 20, 18);
      this.fwdBtn.setBounds(24, 3, 20, 18);
      reload.setBounds(45, 3, 20, 18);
      home.setBounds(66, 3, 20, 18);
      this.address.setBounds(90, 5, p.w - 94, 14);
      this.view.setBounds(0, 24, p.w, p.h - 24 - 12);
      this.status.setBounds(4, p.h - 11, p.w - 8, 10);
    };
    this.address.onSubmit = (t) => {
      const n = /^\s*\[?(\d+)\]?\s*$/.exec(t);
      if (n && this.page && +n[1] >= 1 && +n[1] <= this.page.links.length) this.follow(+n[1]);
      else this.navigate(normalizeInput(t));
      this.win.focusWidget(this.view);
    };
    this.address.onCancel = () => { this.address.setText(this.url); this.win.focusWidget(this.view); };
    this.view.onLink = (n) => this.follow(n);
    this.view.onHoverLink = (n) => this.setStatus(n && this.page ? this.page.links[n - 1] : '');
    this.win.menus = this.menus();
    this.win.onKey = (e) => {
      if (e.alt && e.key === 'ArrowLeft') { this.goBack(); return true; }
      if (e.alt && e.key === 'ArrowRight') { this.goForward(); return true; }
      if (e.key === 'F5') { this.navigate(this.url, false, true); return true; }
      if (e.key === 'F6' || (e.ctrl && e.key.toLowerCase() === 'l')) { this.win.focusWidget(this.address); this.address.selectAll(); return true; }
      if (e.key === 'Backspace' && os.wm.active?.focused === this.view) { this.goBack(); return true; }
      return false;
    };
    os.wm.open(this.win);
    this.win.focusWidget(this.view);
    this.navigate(url ? normalizeInput(url) : os.settings.get('browserHome'));
  }

  private setStatus(t: string) {
    this.status.setText(t);
    invalidate();
  }

  private updateButtons() {
    this.backBtn.enabled = this.back.length > 0;
    this.fwdBtn.enabled = this.fwd.length > 0;
  }

  follow(n: number) {
    const target = this.page?.links[n - 1];
    if (target) this.navigate(target);
  }

  goBack() {
    const h = this.back.pop();
    if (!h) return;
    this.fwd.push({ url: this.url, scroll: this.view.scroll });
    this.navigate(h.url, false, false, h.scroll);
  }
  goForward() {
    const h = this.fwd.pop();
    if (!h) return;
    this.back.push({ url: this.url, scroll: this.view.scroll });
    this.navigate(h.url, false, false, h.scroll);
  }

  async navigate(url: string, record = true, reload = false, scroll = 0) {
    if (record && this.url && url !== this.url) {
      this.back.push({ url: this.url, scroll: this.view.scroll });
      this.fwd = [];
    }
    this.url = url;
    this.address.setText(url);
    this.updateButtons();
    const ticket = ++this.loading;
    if (/^orbit:/i.test(url)) {
      const key = url.slice(6).replace(/^\/+/, '') || 'home';
      const md = HELP_PAGES[key];
      if (!md) { this.show(null, 'Page not found', `There is no built-in page called "${url}".\n\nTry orbit:help for a list of help pages.`); return; }
      this.show(parseMarkdown(md, url), '', '', scroll);
      return;
    }
    const cached = !reload && cache.get(url);
    if (cached) { this.show(cached, '', '', scroll); return; }
    this.win.setTitle('Loading… - Navigator');
    this.setStatus(`Fetching ${url} through the reader proxy…`);
    this.view.setMessage('Loading…', `Fetching ${url}\n\nOrbit reads web pages through a reader proxy that turns them into plain text.`);
    try {
      const proxy = os.settings.get('proxyUrl') || 'https://r.jina.ai/';
      const headers: Record<string, string> = { Accept: 'text/plain' };
      const key = os.settings.get('proxyKey');
      if (key) headers.Authorization = `Bearer ${key}`;
      const res = await fetch(proxy + url, { headers });
      if (ticket !== this.loading) return;
      if (res.status === 429) {
        this.show(null, 'The proxy is busy', 'The free reader proxy allows a limited number of pages per minute. Wait a minute and press Reload (F5).\n\nYou can add an API key in Config > Network for higher limits.');
        return;
      }
      const text = await res.text();
      if (ticket !== this.loading) return;
      if (!res.ok) {
        this.show(null, `Could not load the page (${res.status})`, `The reader proxy answered: ${text.slice(0, 300) || res.statusText}`);
        return;
      }
      const r = parseReaderResponse(text);
      const page = parseMarkdown(r.body, r.source || url, r.title);
      if (r.title) page.title = r.title;
      cache.set(url, page);
      if (cache.size > 30) cache.delete(cache.keys().next().value!);
      this.show(page, '', '', scroll);
    } catch (e) {
      if (ticket !== this.loading) return;
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      this.show(null, offline ? 'You are offline' : 'Could not reach the page',
        offline ? 'This computer is not connected to the internet. Built-in pages like orbit:help still work.'
          : `The reader proxy could not be reached (${(e as Error).message}).\n\nCheck the proxy address in Config > Network, or try again in a moment.`);
    }
  }

  private show(page: Page | null, title: string, msg: string, scroll = 0) {
    this.page = page;
    if (page) {
      this.view.setPage(page, scroll);
      this.win.setTitle(`${page.title.slice(0, 60)} - Navigator`);
      this.setStatus(`${page.links.length} link${page.links.length === 1 ? '' : 's'}  ·  type a link number in the address bar to follow it`);
    } else {
      this.view.setMessage(title, msg);
      this.win.setTitle(`${title} - Navigator`);
      this.setStatus(this.url);
      os.sound.sfx('error');
    }
  }

  private async savePage() {
    if (!this.page) return;
    const name = os.fs.uniqueName('/Documents', cleanName(this.page.title.slice(0, 40)).replace(/\.$/, '') + '.TXT');
    await os.fs.write(joinPath('/Documents', name), pageToText(this.page) + `\nSource: ${this.url}\n`);
    await alert(`Saved as /Documents/${name}`, { icon: 'info', parent: this.win });
  }

  private bookmarkItems(): MenuItem[] {
    const bm = os.settings.get('bookmarks');
    const has = bm.includes(this.url);
    return [
      { label: has ? 'Remove Bookmark' : 'Add Bookmark', action: () => os.settings.set('bookmarks', has ? bm.filter((u) => u !== this.url) : [...bm, this.url]) },
      { separator: true },
      ...(bm.length ? bm.map((u) => ({ label: u.length > 48 ? u.slice(0, 46) + '…' : u, action: () => this.navigate(u) })) : [{ label: '(no bookmarks yet)', disabled: true }]),
    ];
  }

  private menus(): MenuDef[] {
    return [
      {
        label: 'File',
        items: () => [
          { label: 'New Window', action: () => new BrowserWindow() },
          { label: 'Open Address…', shortcut: 'F6', action: () => { this.win.focusWidget(this.address); this.address.selectAll(); } },
          { separator: true },
          { label: 'Save Page as Text', disabled: !this.page, action: () => this.savePage() },
          { separator: true },
          { label: 'Close', shortcut: 'Ctrl+F4', action: () => this.win.close() },
        ],
      },
      {
        label: 'Go',
        items: () => [
          { label: 'Back', shortcut: 'Alt+ArrowLeft', disabled: !this.back.length, action: () => this.goBack() },
          { label: 'Forward', shortcut: 'Alt+ArrowRight', disabled: !this.fwd.length, action: () => this.goForward() },
          { label: 'Reload', shortcut: 'F5', action: () => this.navigate(this.url, false, true) },
          { separator: true },
          { label: 'Home', action: () => this.navigate(os.settings.get('browserHome')) },
          { label: 'Orbit Help', action: () => this.navigate('orbit:help') },
          { label: 'Set as Home Page', action: () => os.settings.set('browserHome', this.url) },
        ],
      },
      { label: 'Bookmarks', items: () => this.bookmarkItems() },
    ];
  }
}

registerApp({
  id: 'browser',
  name: 'Internet Navigator',
  icon: 'navigator',
  description: 'Explore the World Wide Web, plus Orbit\'s built-in help pages.',
  launch: ({ args }) => { new BrowserWindow(args?.url as string | undefined); },
});
// alias so shortcuts and commands can say "navigator"
registerApp({
  id: 'navigator',
  name: 'Internet Navigator',
  icon: 'navigator',
  hidden: true,
  launch: ({ args }) => { new BrowserWindow(args?.url as string | undefined); },
});

/** Open a help page (used by F1 in every app). */
export function openHelp(topic: string) {
  const url = HELP_PAGES[`help/${topic}`] ? `orbit:help/${topic}` : 'orbit:help';
  new BrowserWindow(url);
}
