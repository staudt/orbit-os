import { registerApp } from '../registry';
import { Window } from '../../wm/window';
import { Widget, type WEvent } from '../../ui/widget';
import { Button, Label, TextField } from '../../ui/widgets';
import { TextArea } from '../../ui/textarea';
import { ListView } from '../../ui/listview';
import type { MenuDef } from '../../ui/menu';
import type { KeyEv } from '../../core/input';
import type { Gfx } from '../../core/gfx';
import { C } from '../../core/palette';
import { SANS } from '../../core/fonts';
import { icon } from '../../core/icons';
import { caret } from '../../ui/theme';
import { basename, dirname } from '../../fs/vfs';
import { compile } from '../../basic/compiler';
import { BasicError } from '../../basic/values';
import { VM, type Program, type GuiHost } from '../../basic/vm';
import { BasicScreen } from '../../basic/screen';
import { BASIC_HELP } from '../../basic/help';
import { DocController } from '../doccontroller';
import { colorizeBasic, upcaseKeywords, wordAt } from './syntax';
import { invalidate, os } from '../../os';

// ------------------------------------------------------------------ program screen widget

/** Shows a BasicScreen at the largest integer scale that fits, and feeds it keys and mouse. */
export class ScreenView extends Widget {
  screen: BasicScreen;
  onStopKey: (() => void) | null = null;
  /** true while a program is running (keys go to the program) */
  live: () => boolean = () => true;
  /** window-app mode: draw at 1x so real controls line up with screen pixels */
  gui = false;
  controls = new Map<number, { w: Widget; x: number; y: number; cw: number; ch: number }>();
  constructor(screen: BasicScreen) {
    super();
    this.screen = screen;
    this.focusable = true;
    this.acceptsText = true;
  }
  layout() {
    const { x, y } = this.geom();
    for (const c of this.controls.values()) c.w.setBounds(x + c.x, y + c.y, c.cw, c.ch);
  }
  geom() {
    const s = this.screen.surf;
    const k = this.gui ? 1 : Math.max(1, Math.min(Math.floor(this.w / s.w), Math.floor(this.h / s.h)));
    return { k, x: Math.floor((this.w - s.w * k) / 2), y: Math.floor((this.h - s.h * k) / 2) };
  }
  paint(g: Gfx) {
    g.fillRect(0, 0, this.w, this.h, C.INK);
    const { k, x, y } = this.geom();
    g.blit(this.screen.surf, x, y, -1, k);
    if (this.screen.inputActive && caret.on()) {
      const [cx, cy] = this.screen.cursorRect();
      g.fillRect(x + cx * k, y + (cy + 8) * k, 5 * k, k, this.screen.fgc);
    }
    this.paintChildren(g);
  }
  onText(s: string) { this.screen.keyText(s); }
  onKey(e: KeyEv) {
    if ((e.ctrl && (e.key === 'Pause' || e.key === 'Cancel' || e.key.toLowerCase() === 'break')) || e.key === 'Pause') {
      this.onStopKey?.();
      return true;
    }
    if (e.ctrl && e.key === 'F4') return false;
    if (e.ctrl || e.alt || !this.live()) return false;
    this.screen.keySpecial(e.key);
    return true;
  }
  onPaste(s: string) { this.screen.keyText(s.replace(/\n/g, ' ')); }
  private toScreen(e: WEvent): [number, number] {
    const { k, x, y } = this.geom();
    return [Math.floor((e.lx - x) / k), Math.floor((e.ly - y) / k)];
  }
  onPointerDown(e: WEvent) {
    this.focus();
    const [x, y] = this.toScreen(e);
    this.screen.mouse = [x, y, e.button === 2 ? 2 : 1];
    return true;
  }
  onPointerMove(e: WEvent) {
    const [x, y] = this.toScreen(e);
    this.screen.mouse = [x, y, this.screen.mouse[2]];
  }
  onHover(e: WEvent) { this.onPointerMove(e); }
  onPointerUp(e: WEvent) {
    const [x, y] = this.toScreen(e);
    this.screen.mouse = [x, y, 0];
  }
}

// ------------------------------------------------------------------ run window

export class RunWindow {
  win: Window;
  screen: BasicScreen;
  view: ScreenView;
  status: Label;
  vm: VM | null = null;
  onEnd: ((vm: VM) => void) | null = null;
  name: string;

  constructor(name: string, cwd: string, near?: Window) {
    this.name = name;
    this.screen = new BasicScreen(os.fs, cwd);
    const s = this.screen.surf;
    const pos = near ? { x: near.x + 60, y: near.y + 40 } : {};
    this.win = new Window({ title: name, icon: 'basic', app: 'basic-run', w: s.w + 4, h: s.h + 16, minW: 120, minH: 60, ...pos });
    this.view = this.win.body.add(new ScreenView(this.screen));
    this.view.live = () => !!this.vm && (this.vm.status === 'running' || this.vm.status === 'waiting');
    this.status = this.win.body.add(new Label('', { color: C.GREY }));
    this.win.body.layoutFn = (p) => {
      this.view.setBounds(0, 0, p.w, p.h - 12);
      this.status.setBounds(4, p.h - 11, p.w - 8, 10);
    };
    this.screen.onChange = () => invalidate();
    this.screen.onResize = () => {
      const S = this.screen.surf;
      if (this.win.state === 'normal') this.win.setBodySize(Math.max(this.win.bodyW, S.w + 4), Math.max(this.win.bodyH, S.h + 16));
    };
    this.view.onStopKey = () => this.stop();
    this.screen.gui = this.guiHost();
    this.win.onKey = (e) => {
      if (e.key === 'Escape' && this.vm && this.vm.status !== 'running' && this.vm.status !== 'waiting') { this.win.close(); return true; }
      return false;
    };
    this.win.onClosed = () => this.stop();
    this.win.onCloseRequest = () => {
      const running = this.vm && (this.vm.status === 'running' || this.vm.status === 'waiting');
      if (!running || !this.view.gui || this.closing) return true;
      // let the program see WAITEVENT = -1 and finish; force-close if it doesn't within a second
      this.closing = true;
      this.pushEvent(-1);
      setTimeout(() => { if (!this.win.closed) os.wm.close(this.win, true); }, 1000);
      this.vm!.done.then(() => { if (!this.win.closed) os.wm.close(this.win, true); });
      return false;
    };
    os.wm.open(this.win);
    this.win.focusWidget(this.view);
  }

  private events: number[] = [];
  private waiter: { resolve: (n: number) => void; timer: number } | null = null;
  private closing = false;

  private pushEvent(id: number) {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      clearTimeout(w.timer);
      w.resolve(id);
    } else if (this.events.length < 64) this.events.push(id);
  }

  /** The GUI extension: WINDOW / BUTTON / LABEL / TEXTBOX / SETTEXT / GETTEXT$ / WAITEVENT. */
  private guiHost(): GuiHost {
    const view = this.view;
    return {
      window: (title, w, h) => {
        view.gui = true;
        for (const c of view.controls.values()) view.remove(c.w);
        view.controls.clear();
        this.screen.color(0, 9);
        this.screen.screen(w, h);
        this.win.setTitle(title);
        if (this.win.state === 'normal') this.win.setBodySize(w + 4, h + 16);
        view.layout();
      },
      control: (kind, id, text, x, y, w, h) => {
        const old = view.controls.get(id);
        if (old) view.remove(old.w);
        let wd: Widget;
        if (kind === 'button') wd = new Button(text, () => this.pushEvent(id));
        else if (kind === 'label') wd = new Label(text, { wrap: h > 14, valign: h > 14 ? 'top' : 'middle' });
        else {
          const tf = new TextField(text);
          tf.onSubmit = () => this.pushEvent(id);
          wd = tf;
        }
        view.add(wd);
        view.controls.set(id, { w: wd, x, y, cw: w, ch: h });
        view.layout();
        invalidate();
      },
      setText: (id, text) => {
        const c = view.controls.get(id);
        if (!c) return;
        if (c.w instanceof Button) { c.w.text = text; invalidate(); }
        else if (c.w instanceof Label) c.w.setText(text);
        else if (c.w instanceof TextField) c.w.setText(text);
      },
      getText: (id) => {
        const c = view.controls.get(id);
        if (!c) return '';
        if (c.w instanceof Button) return c.w.text;
        if (c.w instanceof Label) return c.w.text;
        if (c.w instanceof TextField) return c.w.text;
        return '';
      },
      waitEvent: (ms) => new Promise((resolve) => {
        if (this.closing) { resolve(-1); return; }
        const ev = this.events.shift();
        if (ev !== undefined) { resolve(ev); return; }
        const timer = ms > 0 ? window.setTimeout(() => { this.waiter = null; resolve(0); }, ms) : 0;
        this.waiter = { resolve, timer };
      }),
      mouse: () => this.screen.mouse,
    };
  }

  run(prog: Program) {
    this.stop();
    this.events = [];
    this.closing = false;
    if (this.view.gui) {
      this.view.gui = false;
      for (const c of this.view.controls.values()) this.view.remove(c.w);
      this.view.controls.clear();
    }
    this.screen.color(9, 0);
    if (this.screen.surf.w !== 320 || this.screen.surf.h !== 200) this.screen.screen(320, 200);
    this.screen.cls();
    const vm = new VM(prog, this.screen);
    this.vm = vm;
    this.setStatus('Running…  (Ctrl+Pause or close to stop)', C.GREY);
    vm.onStatus = (st) => {
      if (st === 'running') return;
      this.screen.stopAll();
      if (st === 'error' && vm.error) {
        this.setStatus(vm.error.format(), C.CRIMSON);
        os.sound.sfx('error');
      } else if (st === 'stopped') this.setStatus('Stopped.  Press Esc to close.', C.GREY);
      else this.setStatus('Finished.  Press Esc to close.', C.GREY);
      this.onEnd?.(vm);
      os.fs && os.wm.desktop.refresh();
    };
    vm.start();
  }

  stop() {
    if (this.vm && (this.vm.status === 'running' || this.vm.status === 'waiting')) this.vm.stop();
    this.screen.stopAll();
  }

  private setStatus(t: string, c: number) {
    this.status.setText(t);
    this.status.color = c;
    invalidate();
  }
}

/** Compile and run a .BAS file in its own window. */
export async function runFile(path: string) {
  let src: string;
  try { src = await os.fs.readText(path); } catch { return; }
  const rw = new RunWindow(basename(path), dirname(path));
  try {
    rw.run(compile(src));
  } catch (e) {
    const msg = e instanceof BasicError ? e.format() : String(e);
    rw.screen.color(4, null);
    rw.screen.print(msg + '\n');
    rw.status.setText('Could not start the program. Open it in BASIC to fix it.');
    rw.status.color = C.CRIMSON;
  }
}

// ------------------------------------------------------------------ IDE

class HelpBar extends Widget {
  text = '';
  paint(g: Gfx) {
    g.fillRect(0, 0, this.w, this.h, C.TAN);
    g.hline(0, this.w - 1, 0, C.GREY);
    SANS.draw(g, 4, 2, SANS.fit(this.text, this.w - 8), C.PLUM_DARK);
  }
}

const NEW_PROGRAM = `' New program
PRINT "Hello from Orbit BASIC!"
`;

class BasicIDE {
  win: Window;
  editor: TextArea;
  doc: DocController;
  helpBar: HelpBar;
  status: Label;
  run: RunWindow | null = null;
  private runBtn: Button;
  private stopBtn: Button;
  private kwWin: Window | null = null;

  constructor(path?: string) {
    this.win = new Window({ title: 'BASIC Editor', icon: 'basic', app: 'basic', w: 360, h: 250, minW: 220, minH: 120, fit: { w: 0.7, h: 0.85, maxW: 760, maxH: 560 } });
    const b = this.win.body;
    this.runBtn = b.add(new Button('Run', () => this.start(), { icon: icon('play'), kind: 'tool', tooltip: 'Run (F5)' }));
    this.stopBtn = b.add(new Button('Stop', () => this.run?.stop(), { icon: icon('stop'), kind: 'tool', tooltip: 'Stop' }));
    const helpBtn = b.add(new Button('Help', () => this.keywordHelp(), { icon: icon('help'), kind: 'tool', tooltip: 'Keyword help (F1)' }));
    this.status = b.add(new Label('', { color: C.GREY, align: 'right' }));
    this.editor = b.add(new TextArea(NEW_PROGRAM));
    this.editor.gutter = true;
    this.editor.colorize = (line) => colorizeBasic(line);
    this.editor.transformLine = upcaseKeywords;
    this.helpBar = b.add(new HelpBar());
    b.layoutFn = (p) => {
      this.runBtn.setBounds(4, 3, 44, 18);
      this.stopBtn.setBounds(50, 3, 46, 18);
      helpBtn.setBounds(98, 3, 46, 18);
      this.status.setBounds(150, 6, p.w - 156, 12);
      this.editor.setBounds(0, 24, p.w, p.h - 24 - 13);
      this.helpBar.setBounds(0, p.h - 13, p.w, 13);
    };
    this.doc = new DocController({
      win: this.win, appName: 'BASIC Editor', exts: ['BAS', 'TXT'], defaultExt: 'BAS', typeLabel: 'BASIC programs (.BAS)',
      defaultDir: '/Programs', untitled: 'Untitled',
      serialize: () => this.editor.getText(),
      deserialize: (_p, c) => {
        this.editor.setText(typeof c === 'string' ? c : new TextDecoder().decode(c));
        this.editor.markLine = -1;
      },
      isDirty: () => this.editor.modified,
      markClean: () => { this.editor.modified = false; },
    });
    this.editor.onChange = () => { this.editor.markLine = -1; this.doc.updateTitle(); };
    this.editor.onCaret = () => this.updateCaret();
    this.editor.modified = false;
    this.win.menus = this.menus();
    this.win.onKey = (e) => {
      if (e.key === 'F5') { this.start(); return true; }
      if (e.key === 'F1') { this.keywordHelp(); return true; }
      return false;
    };
    this.win.onClosed = () => { this.run?.stop(); this.kwWin?.close(); };
    os.wm.open(this.win);
    this.win.focusWidget(this.editor);
    this.updateCaret();
    this.updateButtons();
    if (path) this.doc.load(path);
  }

  private updateCaret() {
    const { line, col } = this.editor.caretPos;
    this.status.setText(`Ln ${line + 1}, Col ${col + 1}`);
    const w = wordAt(this.editor.lines[line] ?? '', col);
    const h = w && (BASIC_HELP.find((k) => k.kw === w) ?? BASIC_HELP.find((k) => k.kw.split(' ')[0] === w));
    this.helpBar.text = h ? `${h.syntax}  —  ${h.desc}` : 'F5 runs the program  ·  F1 lists every keyword';
    invalidate();
  }
  private updateButtons() {
    const running = !!this.run?.vm && (this.run.vm.status === 'running' || this.run.vm.status === 'waiting');
    this.runBtn.enabled = true;
    this.stopBtn.enabled = running;
    invalidate();
  }

  start() {
    const src = this.editor.getText();
    let prog: Program;
    try {
      prog = compile(src);
    } catch (e) {
      if (e instanceof BasicError) this.showError(e);
      else throw e;
      return;
    }
    this.editor.markLine = -1;
    if (!this.run || this.run.win.closed) {
      const dir = this.doc.path ? dirname(this.doc.path) : '/Documents';
      this.run = new RunWindow(this.doc.name, dir, this.win);
      this.run.onEnd = (vm) => {
        if (vm.error) this.showError(vm.error, false);
        this.updateButtons();
      };
    } else {
      this.run.win.setTitle(this.doc.name);
      os.wm.activate(this.run.win);
      this.run.win.focusWidget(this.run.view);
    }
    this.run.run(prog);
    this.updateButtons();
  }

  private showError(e: BasicError, focusEditor = true) {
    if (e.line) {
      this.editor.markLine = e.line - 1;
      this.editor.gotoLine(e.line - 1);
    }
    this.helpBar.text = e.format();
    this.status.setText('Error');
    os.sound.sfx('error');
    if (focusEditor) { os.wm.activate(this.win); this.win.focusWidget(this.editor); }
    invalidate();
  }

  keywordHelp() {
    if (this.kwWin && !this.kwWin.closed) { os.wm.activate(this.kwWin); return; }
    const w = new Window({ title: 'BASIC Keywords', icon: 'help', w: 300, h: 220, minW: 200, minH: 120 });
    this.kwWin = w;
    const list = w.body.add(new ListView([{ title: 'Keyword', w: 70 }, { title: 'Syntax', w: 100, flex: true }, { title: 'Group', w: 50 }]));
    const desc = w.body.add(new Label('', { wrap: true, valign: 'top' }));
    list.multi = false;
    list.setItems(BASIC_HELP.map((k, i) => ({ id: String(i), cells: [k.kw, k.syntax, k.cat] })));
    list.onSelect = (sel) => {
      const k = sel[0] ? BASIC_HELP[Number(sel[0].id)] : null;
      desc.setText(k ? `${k.desc}${k.example ? `\nExample: ${k.example}` : ''}` : 'Select a keyword to see what it does.');
    };
    list.onActivate = (sel) => {
      const k = sel[0] ? BASIC_HELP[Number(sel[0].id)] : null;
      if (k) { this.editor.insert(k.syntax.split('(')[0].trim() + (k.syntax.includes('(') ? '(' : ' ')); os.wm.activate(this.win); this.win.focusWidget(this.editor); }
    };
    desc.setText('Select a keyword to see what it does. Double-click inserts it.');
    w.body.layoutFn = (p) => {
      list.setBounds(0, 0, p.w, p.h - 34);
      desc.setBounds(4, p.h - 32, p.w - 8, 30);
    };
    os.wm.open(w);
    w.focusWidget(list);
  }

  private menus(): MenuDef[] {
    const e = this.editor;
    return [
      {
        label: 'File',
        items: () => [
          { label: 'New', action: () => this.doc.newDoc(() => e.setText(NEW_PROGRAM)) },
          { label: 'Open…', shortcut: 'Ctrl+O', action: () => this.doc.open() },
          { label: 'Save', shortcut: 'Ctrl+S', action: () => this.doc.save() },
          { label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: () => this.doc.saveAs() },
          { separator: true },
          { label: 'Close', shortcut: 'Ctrl+F4', action: () => this.win.close() },
        ],
      },
      {
        label: 'Edit',
        items: () => [
          { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !e.canUndo, action: () => e.undo() },
          { label: 'Redo', shortcut: 'Ctrl+Y', action: () => e.redo() },
          { separator: true },
          { label: 'Cut', shortcut: 'Ctrl+X', disabled: !e.hasSelection, action: () => document.execCommand('cut') },
          { label: 'Copy', shortcut: 'Ctrl+C', disabled: !e.hasSelection, action: () => document.execCommand('copy') },
          { label: 'Select All', shortcut: 'Ctrl+A', action: () => e.selectAll() },
        ],
      },
      {
        label: 'Run',
        items: () => [
          { label: 'Start', shortcut: 'F5', action: () => this.start() },
          { label: 'Stop', disabled: !this.stopBtn.enabled, action: () => this.run?.stop() },
        ],
      },
      {
        label: 'Help',
        items: () => [
          { label: 'Keyword List', shortcut: 'F1', action: () => this.keywordHelp() },
          { label: 'Example Programs…', action: () => this.doc.open() },
        ],
      },
    ];
  }
}

registerApp({
  id: 'basic',
  name: 'BASIC Editor',
  icon: 'basic',
  alsoOpens: ['BAS'],
  description: 'Write and run programs in Orbit BASIC, a friendly QBasic-style language.',
  launch: ({ path }) => { new BasicIDE(path); },
});

registerApp({
  id: 'basic-run',
  name: 'Run Program',
  icon: 'basic',
  exts: ['BAS'],
  hidden: true,
  description: 'Runs a BASIC program in its own window.',
  launch: ({ path }) => { if (path) runFile(path); else new BasicIDE(); },
});
