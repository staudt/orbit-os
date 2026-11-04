import { registerApp } from '../registry';
import { Window } from '../../wm/window';
import { Widget } from '../../ui/widget';
import { Button, Label } from '../../ui/widgets';
import { ListView } from '../../ui/listview';
import { TextArea } from '../../ui/textarea';
import type { MenuDef } from '../../ui/menu';
import type { Gfx } from '../../core/gfx';
import { C } from '../../core/palette';
import { SANS } from '../../core/fonts';
import { icon } from '../../core/icons';
import { parseMML, MmlError } from '../../core/mml';
import type { NoteEvent, PlayHandle } from '../../core/sound';
import { basename, extname, joinPath } from '../../fs/vfs';
import { mmlFromMus } from '../../seed/tunes';
import { DocController } from '../doccontroller';
import { invalidate, os } from '../../os';

const VOICE_COLORS = [C.ORANGE, C.LAVENDER, C.GREEN];

const NEW_SONG = `' My Song -- Orbit Music
' Voice 1 (melody)
T120 O4 L8 V10 WT
C D E F G4 G4 A A A A G2
;
' Voice 2 (bass)
T120 O2 L4 V8 WS
C C F F C2 C2
`;

/** Scrolling piano roll: notes as bars, playhead in the middle. */
class Visualizer extends Widget {
  events: NoteEvent[] = [];
  t = 0;
  playing = false;
  paint(g: Gfx) {
    const { w, h } = this;
    g.fillRect(0, 0, w, h, C.INK);
    g.rect(0, 0, w, h, C.PLUM);
    // horizontal guide lines (octaves)
    for (let i = 1; i < 6; i++) g.hline(1, w - 2, Math.round((h * i) / 6), C.PLUM_DARK);
    const px = w * 0.3; // playhead x
    const pxPerSec = 50;
    const pitchY = (f: number) => {
      const midi = 69 + 12 * Math.log2(Math.max(20, f) / 440);
      const k = (midi - 24) / (96 - 24);
      return Math.round(h - 4 - Math.max(0, Math.min(1, k)) * (h - 8));
    };
    const meters = [0, 0, 0];
    g.clip(1, 1, w - 28, h - 2);
    for (const e of this.events) {
      if (e.freq <= 0 && e.wave !== 'noise') continue;
      const x0 = px + (e.start - this.t) * pxPerSec;
      const x1 = px + (e.start + e.dur - this.t) * pxPerSec;
      if (x1 < 1 || x0 > w - 2) continue;
      const v = e.voice ?? 0;
      const y = e.wave === 'noise' ? h - 6 : pitchY(e.freq);
      const active = this.playing && e.start <= this.t && this.t < e.start + e.dur;
      if (active) meters[v] = Math.max(meters[v], e.vol ?? 0.5);
      g.fillRect(Math.max(1, Math.round(x0)), y - 1, Math.max(1, Math.round(Math.min(w - 2, x1) - Math.max(1, x0))), 3, active ? C.CREAM : VOICE_COLORS[v % 3]);
    }
    g.vline(Math.round(px), 1, h - 2, C.CRIMSON);
    g.pop();
    // voice meters
    for (let v = 0; v < 3; v++) {
      const mh = Math.round(meters[v] * (h - 8));
      g.fillRect(w - 24 + v * 7, h - 4 - mh, 5, mh, VOICE_COLORS[v]);
      g.rect(w - 25 + v * 7, 3, 7, h - 6, C.PLUM_DARK);
    }
    if (!this.events.length) SANS.draw(g, 8, Math.floor(h / 2) - 4, 'Press Play to hear the song', C.MAUVE);
  }
}

class MusicWindow {
  win: Window;
  list: ListView;
  editor: TextArea;
  viz: Visualizer;
  status: Label;
  doc: DocController;
  private handle: PlayHandle | null = null;
  private unwatch: () => void;

  constructor(path?: string) {
    this.win = new Window({ title: 'Music', icon: 'music', app: 'music', w: 400, h: 260, minW: 260, minH: 160 });
    const b = this.win.body;
    const play = b.add(new Button('Play', () => this.play(), { icon: icon('play'), kind: 'tool', tooltip: 'Play (F5)' }));
    const stop = b.add(new Button('Stop', () => this.stop(), { icon: icon('stop'), kind: 'tool', tooltip: 'Stop (Esc)' }));
    this.status = b.add(new Label('', { color: C.GREY, align: 'right' }));
    this.list = b.add(new ListView([{ title: 'Songs', w: 80, flex: true }]));
    this.list.multi = false;
    this.list.sortable = false;
    this.editor = b.add(new TextArea(NEW_SONG));
    this.editor.colorize = (line) => {
      const out = new Uint8Array(line.length).fill(C.INK);
      if (line.trim().startsWith("'")) out.fill(C.GREY);
      else for (let i = 0; i < line.length; i++) {
        const ch = line[i].toUpperCase();
        if (ch === ';') out[i] = C.CRIMSON;
        else if ('TOLVWMN<>'.includes(ch)) out[i] = C.MAGENTA;
        else if ('ABCDEFG'.includes(ch)) out[i] = C.PLUM_DARK;
        else if ('PR'.includes(ch)) out[i] = C.GREY;
        else if (/[0-9.#+-]/.test(ch)) out[i] = C.CRIMSON;
      }
      return out;
    };
    this.viz = b.add(new Visualizer());
    b.layoutFn = (p) => {
      play.setBounds(4, 3, 46, 18);
      stop.setBounds(52, 3, 46, 18);
      this.status.setBounds(104, 6, p.w - 108, 12);
      const listW = Math.min(110, Math.floor(p.w * 0.3));
      const vizH = Math.min(60, Math.floor(p.h * 0.28));
      this.list.setBounds(0, 24, listW, p.h - 24 - vizH);
      this.editor.setBounds(listW, 24, p.w - listW, p.h - 24 - vizH);
      this.viz.setBounds(0, p.h - vizH, p.w, vizH);
    };
    this.doc = new DocController({
      win: this.win, appName: 'Music', exts: ['MUS', 'TXT'], defaultExt: 'MUS', typeLabel: 'Songs (.MUS)', defaultDir: '/Music', untitled: 'Untitled',
      serialize: () => this.editor.getText(),
      deserialize: (_p, c) => { this.stop(); this.editor.setText(typeof c === 'string' ? c : new TextDecoder().decode(c)); this.viz.events = []; },
      isDirty: () => this.editor.modified,
      markClean: () => { this.editor.modified = false; },
    });
    this.editor.onChange = () => this.doc.updateTitle();
    this.editor.modified = false;
    this.list.onActivate = (sel) => this.openSong(sel[0]?.id, true);
    this.list.onSelect = (sel) => { if (sel[0] && sel[0].id !== this.doc.path) this.openSong(sel[0].id, false); };
    this.unwatch = os.fs.watch((c) => { if (c.dir.toLowerCase() === '/music') this.refreshList(); });
    this.win.onClosed = () => { this.stop(); this.unwatch(); };
    this.win.onKey = (e) => {
      if (e.key === 'F5') { this.play(); return true; }
      if (e.key === 'Escape' && this.handle) { this.stop(); return true; }
      return false;
    };
    this.win.menus = this.menus();
    this.refreshList();
    os.wm.open(this.win);
    this.win.focusWidget(this.list);
    if (path) this.doc.load(path).then(() => this.list.select([path]));
  }

  private refreshList() {
    if (!os.fs.isDir('/Music')) return;
    const items = os.fs.list('/Music').filter((n) => n.type === 'file' && ['MUS', 'TXT'].includes(extname(n.name)))
      .map((n) => ({ id: joinPath('/Music', n.name), icon: 'file-mus', cells: [n.name.replace(/\.MUS$/i, '')] }));
    this.list.setItems(items);
    this.list.emptyText = 'No songs yet';
  }

  private async openSong(path: string | undefined, andPlay: boolean) {
    if (!path || path === this.doc.path) { if (andPlay) this.play(); return; }
    if (!(await this.doc.confirmDiscard())) return;
    if (await this.doc.load(path)) {
      this.status.setText(basename(path));
      if (andPlay) this.play();
    }
  }

  play() {
    this.stop();
    let r;
    try {
      r = parseMML(mmlFromMus(this.editor.getText()));
    } catch (e) {
      this.status.setText(e instanceof MmlError ? e.message : 'Could not read the song');
      os.sound.sfx('error');
      invalidate();
      return;
    }
    if (!os.settings.get('sound')) this.status.setText('Sound is off (Config > Sound)');
    const h = os.sound.play(r.events);
    this.handle = h;
    this.viz.events = r.events;
    this.viz.playing = true;
    const total = r.duration;
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    os.scheduler.animate(() => {
      if (this.handle !== h) return false;
      this.viz.t = h.elapsed();
      if (os.settings.get('sound')) this.status.setText(`${fmt(this.viz.t)} / ${fmt(total)}`);
      return this.viz.t < total + 0.2;
    });
    h.done.then(() => {
      if (this.handle === h) { this.handle = null; this.viz.playing = false; invalidate(); }
    });
  }

  stop() {
    if (this.handle) { this.handle.stop(); this.handle = null; }
    this.viz.playing = false;
    invalidate();
  }

  private menus(): MenuDef[] {
    return [
      {
        label: 'File',
        items: () => [
          { label: 'New Song', action: () => this.doc.newDoc(() => { this.stop(); this.editor.setText(NEW_SONG); this.viz.events = []; }) },
          { label: 'Open…', shortcut: 'Ctrl+O', action: () => this.doc.open() },
          { label: 'Save', shortcut: 'Ctrl+S', action: () => this.doc.save() },
          { label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: () => this.doc.saveAs() },
          { separator: true },
          { label: 'Close', shortcut: 'Ctrl+F4', action: () => this.win.close() },
        ],
      },
      {
        label: 'Song',
        items: () => [
          { label: 'Play', shortcut: 'F5', action: () => this.play() },
          { label: 'Stop', disabled: !this.handle, action: () => this.stop() },
          { separator: true },
          { label: 'Notes: A-G, # or - , length, dots', disabled: true },
          { label: 'O octave, < >, L length, T tempo', disabled: true },
          { label: 'V volume, WS WT WN wave, ; next voice', disabled: true },
        ],
      },
    ];
  }
}

registerApp({
  id: 'music',
  name: 'Music',
  icon: 'music',
  exts: ['MUS'],
  description: 'Play and write chiptune songs in the music macro language.',
  launch: ({ path }) => { new MusicWindow(path); },
});
