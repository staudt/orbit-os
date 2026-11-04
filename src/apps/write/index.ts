import { registerApp } from '../registry';
import { Window } from '../../wm/window';
import { Button, Checkbox, Label, TextField } from '../../ui/widgets';
import type { MenuDef } from '../../ui/menu';
import { icon } from '../../core/icons';
import { C } from '../../core/palette';
import { extname } from '../../fs/vfs';
import { downloadContent } from '../../fs/importexport';
import { DocController } from '../doccontroller';
import { RichText } from './view';
import { Doc, B, I, U, BIG, type Align } from './doc';
import { os } from '../../os';

class WriteWindow {
  win: Window;
  editor: RichText;
  doc: DocController;
  private status: Label;
  private btns: { b: Button; i: Button; u: Button; big: Button; left: Button; center: Button; right: Button };
  private findWin: Window | null = null;
  lastFind = '';

  constructor(path?: string) {
    this.win = new Window({ title: 'Write', icon: 'write', app: 'write', w: 340, h: 240, minW: 200, minH: 100 });
    const body = this.win.body;
    const tool = (ic: string, tip: string, fn: () => void) => body.add(new Button('', fn, { icon: icon(ic), kind: 'tool', tooltip: tip }));
    this.editor = body.add(new RichText());
    this.btns = {
      b: tool('bold', 'Bold', () => this.style(B)),
      i: tool('italic', 'Italic', () => this.style(I)),
      u: tool('underline', 'Underline', () => this.style(U)),
      big: body.add(new Button('Aa', () => this.style(BIG), { kind: 'tool', tooltip: 'Large text' })),
      left: tool('align-left', 'Align left', () => this.align('left')),
      center: tool('align-center', 'Center', () => this.align('center')),
      right: tool('align-right', 'Align right', () => this.align('right')),
    };
    this.status = body.add(new Label('', { color: C.GREY }));
    body.layoutFn = (p) => {
      const order = [this.btns.b, this.btns.i, this.btns.u, this.btns.big, null, this.btns.left, this.btns.center, this.btns.right];
      let x = 4;
      for (const b of order) {
        if (!b) { x += 8; continue; }
        const w = b === this.btns.big ? 22 : 20;
        b.setBounds(x, 3, w, 18);
        x += w + 1;
      }
      this.editor.setBounds(0, 24, p.w, p.h - 24 - 12);
      this.status.setBounds(5, p.h - 11, p.w - 10, 10);
    };

    this.doc = new DocController({
      win: this.win,
      appName: 'Write',
      exts: ['WRT', 'TXT', 'MD', 'LOG', 'INI', 'JSON', 'CSV', 'BAS', 'MUS', 'LNK', ''],
      saveExts: ['WRT', 'TXT', 'MD', 'LOG', 'BAS', 'MUS'],
      defaultExt: 'WRT',
      typeLabel: 'Write documents and text',
      defaultDir: '/Documents',
      untitled: 'Untitled',
      serialize: (p) => (extname(p) === 'WRT' ? this.editor.doc.toWrt() : this.editor.doc.plainText),
      deserialize: (p, c) => {
        const text = typeof c === 'string' ? c : new TextDecoder().decode(c);
        this.editor.setDoc(extname(p) === 'WRT' ? Doc.fromWrt(text) : Doc.fromText(text));
      },
      isDirty: () => this.editor.modified,
      markClean: () => { this.editor.modified = false; this.update(); },
    });
    this.editor.onChange = () => this.doc.updateTitle();
    this.editor.onCaretMove = () => this.update();
    this.win.menus = this.menus();
    this.win.onKey = (e) => {
      if (e.key === 'F3') { this.findNext(); return true; }
      return false;
    };
    os.wm.open(this.win);
    this.win.focusWidget(this.editor);
    this.update();
    if (path) this.doc.load(path);
  }

  private style(bit: number) {
    this.editor.toggleStyle(bit);
    this.editor.focus();
    this.update();
  }
  private align(a: Align) {
    this.editor.setAlign(a);
    this.editor.focus();
    this.update();
  }

  update() {
    const e = this.editor;
    this.btns.b.selected = e.styleActive(B);
    this.btns.i.selected = e.styleActive(I);
    this.btns.u.selected = e.styleActive(U);
    this.btns.big.selected = e.styleActive(BIG);
    const a = e.align;
    this.btns.left.selected = a === 'left';
    this.btns.center.selected = a === 'center';
    this.btns.right.selected = a === 'right';
    const words = e.doc.wordCount();
    const isTxt = this.doc && this.doc.path && extname(this.doc.path) !== 'WRT';
    this.status.setText(`${words} word${words === 1 ? '' : 's'}  ·  paragraph ${e.caretPos.p + 1} of ${e.doc.paras.length}${isTxt ? '  ·  plain text (styles are not saved)' : ''}`);
    this.doc?.updateTitle();
  }

  // ---------------------------------------------------------------- find / replace
  openFind(replace: boolean) {
    if (this.findWin && !this.findWin.closed) { os.wm.activate(this.findWin); return; }
    const sel = this.editor.hasSelection ? this.editor.doc.textOf(this.editor.caretPos, this.editor.anchor) : '';
    const fw = new Window({ title: replace ? 'Replace' : 'Find', icon: 'find', w: 230, h: replace ? 78 : 58, resizable: false, maximizable: false, minimizable: false });
    this.findWin = fw;
    const b = fw.body;
    b.add(new Label('Find:')).setBounds(6, 6, 44, 14);
    const q = b.add(new TextField(sel.includes('\n') ? '' : sel || this.lastFind));
    q.setBounds(52, 6, 172, 14);
    let rep: TextField | null = null;
    if (replace) {
      b.add(new Label('Replace:')).setBounds(6, 24, 44, 14);
      rep = b.add(new TextField(''));
      rep.setBounds(52, 24, 172, 14);
    }
    const y = replace ? 44 : 26;
    const mc = b.add(new Checkbox('Match case', false));
    mc.setBounds(6, y + 3, 80, 11);
    const next = b.add(new Button('Find Next', () => {
      this.lastFind = q.text;
      if (!this.editor.find(q.text, mc.checked)) os.sound.sfx('beep');
    }, { isDefault: true }));
    next.setBounds(replace ? 66 : 150, y, 74, 16);
    if (replace && rep) {
      const r = rep;
      b.add(new Button('Replace', () => {
        this.editor.replaceSelection(q.text, r.text, mc.checked);
        if (!this.editor.find(q.text, mc.checked)) os.sound.sfx('beep');
      })).setBounds(144, y, 42, 16);
      b.add(new Button('All', () => {
        const n = this.editor.replaceAll(q.text, r.text, mc.checked);
        this.status.setText(`${n} replacement${n === 1 ? '' : 's'}`);
      })).setBounds(190, y, 34, 16);
    }
    fw.onKey = (e) => {
      if (e.key === 'Escape') { fw.close(); return true; }
      return false;
    };
    os.wm.open(fw);
    fw.focusWidget(q);
    q.selectAll();
  }
  findNext() {
    if (!this.lastFind) { this.openFind(false); return; }
    if (!this.editor.find(this.lastFind)) os.sound.sfx('beep');
  }

  private exportAs(kind: 'txt' | 'html') {
    const base = this.doc.name.replace(/\.[^.]+$/, '');
    if (kind === 'txt') downloadContent(`${base}.txt`, this.editor.doc.plainText);
    else downloadContent(`${base}.html`, this.editor.doc.toHtml(base), 'text/html');
  }

  private menus(): MenuDef[] {
    const e = this.editor;
    return [
      {
        label: 'File',
        items: () => [
          { label: 'New', action: () => this.doc.newDoc(() => e.setDoc(new Doc())) },
          { label: 'New Window', action: () => new WriteWindow() },
          { label: 'Open…', shortcut: 'Ctrl+O', action: () => this.doc.open() },
          { separator: true },
          { label: 'Save', shortcut: 'Ctrl+S', action: () => this.doc.save() },
          { label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: () => this.doc.saveAs() },
          { separator: true },
          { label: 'Export as Text…', action: () => this.exportAs('txt') },
          { label: 'Export as HTML…', action: () => this.exportAs('html') },
          { separator: true },
          { label: 'Close', shortcut: 'Ctrl+F4', action: () => this.win.close() },
        ],
      },
      {
        label: 'Edit',
        items: () => [
          { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !e.canUndo, action: () => e.undo() },
          { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !e.canRedo, action: () => e.redo() },
          { separator: true },
          { label: 'Cut', shortcut: 'Ctrl+X', disabled: !e.hasSelection, action: () => document.execCommand('cut') },
          { label: 'Copy', shortcut: 'Ctrl+C', disabled: !e.hasSelection, action: () => document.execCommand('copy') },
          { label: 'Delete', disabled: !e.hasSelection, action: () => e.deleteSelection() },
          { label: 'Select All', shortcut: 'Ctrl+A', action: () => e.selectAll() },
          { separator: true },
          { label: 'Find…', shortcut: 'Ctrl+F', action: () => this.openFind(false) },
          { label: 'Find Next', shortcut: 'F3', action: () => this.findNext() },
          { label: 'Replace…', shortcut: 'Ctrl+H', action: () => this.openFind(true) },
        ],
      },
      {
        label: 'Format',
        items: () => [
          { label: 'Bold', shortcut: 'Ctrl+B', checked: e.styleActive(B), action: () => this.style(B) },
          { label: 'Italic', shortcut: 'Ctrl+I', checked: e.styleActive(I), action: () => this.style(I) },
          { label: 'Underline', shortcut: 'Ctrl+U', checked: e.styleActive(U), action: () => this.style(U) },
          { label: 'Large Text', checked: e.styleActive(BIG), action: () => this.style(BIG) },
          { separator: true },
          { label: 'Align Left', checked: e.align === 'left', action: () => this.align('left') },
          { label: 'Center', checked: e.align === 'center', action: () => this.align('center') },
          { label: 'Align Right', checked: e.align === 'right', action: () => this.align('right') },
        ],
      },
    ];
  }
}

registerApp({
  id: 'write',
  name: 'Write',
  icon: 'write',
  exts: ['WRT', 'TXT', 'MD', 'LOG', 'INI'],
  alsoOpens: ['BAS', 'MUS', 'CSV', 'JSON', 'LNK', 'HTML', 'HTM'],
  description: 'A word processor with bold, italic, underline, two sizes and alignment.',
  launch: ({ path }) => { new WriteWindow(path); },
});

