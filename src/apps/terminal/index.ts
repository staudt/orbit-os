import { registerApp, launch, openPath, getApp, allApps } from '../registry';
import { Window } from '../../wm/window';
import { BasicScreen } from '../../basic/screen';
import { compile } from '../../basic/compiler';
import { BasicError } from '../../basic/values';
import { VM, type Program } from '../../basic/vm';
import { ScreenView, runFile } from '../basic';
import { basename, dirname, extname, joinPath, normPath } from '../../fs/vfs';
import { C } from '../../core/palette';
import { COMMANDS, expandGlobs, type ShellCtx } from './commands';
import { invalidate, os } from '../../os';

const COLS = 80, ROWS = 24;
const W = COLS * 6, H = ROWS * 10;
const PROMPT_USER = 'you';

/** Split a command line into words, honoring quotes and backslash escapes. */
export function tokenize(line: string): { words: string[]; quoted: boolean[] } {
  const words: string[] = [];
  const quoted: boolean[] = [];
  let cur = '';
  let inWord = false, q: string | null = null, wasQuoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; inWord = true; wasQuoted = true; continue; }
    if (ch === '\\' && i + 1 < line.length) { cur += line[++i]; inWord = true; continue; }
    if (ch === ' ' || ch === '\t') {
      if (inWord) { words.push(cur); quoted.push(wasQuoted); cur = ''; inWord = false; wasQuoted = false; }
      continue;
    }
    cur += ch;
    inWord = true;
  }
  if (inWord) { words.push(cur); quoted.push(wasQuoted); }
  return { words, quoted };
}

/** Split on an unquoted character (| for pipes). */
export function splitUnquoted(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === sep) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Find an unquoted `>` / `>>` redirect: returns where it starts and the target file. */
export function findRedirect(stage: string): { index: number; append: boolean; path: string } | null {
  let q: string | null = null;
  for (let i = 0; i < stage.length; i++) {
    const ch = stage[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === '>') {
      const append = stage[i + 1] === '>';
      const rest = stage.slice(i + (append ? 2 : 1)).trim();
      const path = tokenize(rest).words[0];
      if (!path) return null;
      return { index: i, append, path };
    }
  }
  return null;
}

class Console {
  win: Window;
  screen: BasicScreen;
  view: ScreenView;
  cwd = '/Documents';
  history: string[] = [];
  private histIdx = 0;
  private env: Record<string, string> = { USER: PROMPT_USER, HOME: '/Documents', SHELL: 'osh', PWD: '/Documents' };
  private abortFlag = false;
  private vm: VM | null = null;
  private closed = false;

  private initialCmd: string;

  constructor(startDir?: string, initialCmd = '') {
    this.initialCmd = initialCmd;
    if (startDir && os.fs.isDir(startDir)) this.cwd = normPath(startDir);
    this.screen = new BasicScreen(os.fs, this.cwd, W, H);
    this.win = new Window({ title: 'Console', icon: 'basic', app: 'console', w: W + 4, h: H + 4, minW: 200, minH: 100 });
    this.view = this.win.body.add(new ScreenView(this.screen));
    this.win.body.layoutFn = (p) => this.view.setBounds(0, 0, p.w, p.h);
    this.win.body.bg = C.INK;
    this.screen.onChange = () => invalidate();
    this.view.live = () => true;
    this.view.onStopKey = () => this.abort();
    // Ctrl+C arrives as a "copy" (the browser's clipboard shortcut): use it to interrupt
    this.view.onCopy = () => { this.abort(); return null; };
    this.screen.inputHook = (key, buf) => this.editKey(key, buf);
    this.win.onClosed = () => { this.closed = true; this.abort(); this.screen.stopAll(); };
    os.wm.open(this.win);
    this.win.focusWidget(this.view);
    this.loop();
  }

  private abort() {
    this.abortFlag = true;
    if (this.vm && (this.vm.status === 'running' || this.vm.status === 'waiting')) this.vm.stop();
  }

  private color(fg: number) { this.screen.color(fg, C.INK); }
  private say(s: string, fg: number = C.CREAM) {
    this.color(fg);
    this.screen.print(s);
    this.color(C.CREAM);
  }

  private prompt() {
    if (this.screen.col > 0) this.screen.print('\n');
    const home = this.env.HOME;
    const where = this.cwd === home ? '~' : this.cwd.startsWith(home + '/') ? '~' + this.cwd.slice(home.length) : this.cwd;
    this.say(`${PROMPT_USER}@orbit`, C.GREEN);
    this.say(':');
    this.say(where, C.LAVENDER);
    this.say('$ ', C.CREAM);
    this.win.setTitle(`Console - ${this.cwd}`);
  }

  private async loop() {
    this.screen.color(C.CREAM, C.INK);
    this.screen.cls();
    this.say('Orbit Shell 1.0', C.ORANGE);
    this.say('  --  type ');
    this.say('help', C.YELLOW);
    this.say(' for commands, ');
    this.say('run NAME.BAS', C.YELLOW);
    this.say(' for programs,\nor any BASIC statement, like ');
    this.say('PRINT 6 * 7', C.YELLOW);
    this.say('.\n\n');
    if (this.initialCmd) {
      this.prompt();
      this.screen.print(this.initialCmd + '\n');
      this.history.push(this.initialCmd);
      try { await this.execute(this.initialCmd); } catch (e) { this.say(`osh: ${(e as Error).message}\n`, C.CRIMSON); }
    }
    while (!this.closed) {
      this.prompt();
      this.histIdx = this.history.length;
      const line = await this.screen.readLine();
      if (this.closed) break;
      if (line.trim()) {
        if (this.history[this.history.length - 1] !== line) this.history.push(line);
        if (this.history.length > 200) this.history.shift();
      }
      this.abortFlag = false;
      try {
        await this.execute(line);
      } catch (e) {
        this.say(`osh: ${(e as Error).message}\n`, C.CRIMSON);
      }
    }
  }

  // ---------------------------------------------------------------- line editing
  private editKey(key: string, buf: string): string | null {
    if (key === 'ArrowUp') {
      if (this.histIdx > 0) this.histIdx--;
      return this.history[this.histIdx] ?? buf;
    }
    if (key === 'ArrowDown') {
      if (this.histIdx < this.history.length) this.histIdx++;
      return this.history[this.histIdx] ?? '';
    }
    if (key === 'Escape') return '';
    if (key === 'Tab') return this.complete(buf);
    return null;
  }

  private complete(buf: string): string {
    const m = /(\S*)$/.exec(buf)!;
    const word = m[1];
    const before = buf.slice(0, buf.length - word.length);
    const first = !before.trim();
    let candidates: string[];
    if (first && !word.includes('/')) {
      candidates = [...Object.keys(COMMANDS), 'run', 'basic'];
      // programs in the current folder can be run by name
      for (const n of os.fs.list(this.cwd)) if (extname(n.name) === 'BAS') candidates.push(n.name);
    } else {
      const dirPart = word.includes('/') ? word.slice(0, word.lastIndexOf('/') + 1) : '';
      const dir = this.resolve(dirPart || '.');
      if (!os.fs.isDir(dir)) return buf;
      candidates = os.fs.list(dir).map((n) => dirPart + n.name + (n.type === 'dir' ? '/' : ''));
    }
    const matches = candidates.filter((c) => c.toLowerCase().startsWith(word.toLowerCase()));
    if (!matches.length) { os.sound.sfx('beep'); return buf; }
    if (matches.length === 1) return before + matches[0] + (matches[0].endsWith('/') ? '' : ' ');
    // longest common prefix (case-insensitive), else list the options
    let pre = matches[0];
    for (const c of matches) while (!c.toLowerCase().startsWith(pre.toLowerCase())) pre = pre.slice(0, -1);
    if (pre.length > word.length) return before + pre;
    this.screen.replaceInput('');
    this.screen.print(buf + '\n');
    this.say(matches.map((c) => c.split('/').filter(Boolean).pop() + (c.endsWith('/') ? '/' : '')).join('  ') + '\n', C.LAVENDER);
    this.prompt();
    return buf;
  }

  // ---------------------------------------------------------------- execution
  resolve(p: string): string {
    if (p === '~' || p.startsWith('~/')) p = this.env.HOME + p.slice(1);
    return p.startsWith('/') ? normPath(p) : joinPath(this.cwd, p);
  }

  private ctx(out: (s: string) => void): ShellCtx {
    return {
      fs: os.fs,
      cwd: this.cwd,
      setCwd: (p) => { this.env.OLDPWD = this.cwd; this.cwd = p; this.env.PWD = p; this.screen.cwd = p; },
      out,
      err: (s) => this.say(s, C.CRIMSON),
      resolve: (p) => this.resolve(p),
      history: this.history,
      env: this.env,
      open: async (target, kind) => {
        if (kind === 'path') {
          if (!os.fs.exists(target)) return false;
          await openPath(target);
          return true;
        }
        if (target.startsWith('basic:')) { await launch('basic', { path: target.slice(6) }); return true; }
        const id = target.toLowerCase();
        const app = getApp(id) ?? allApps().find((a) => a.name.toLowerCase() === id || a.name.toLowerCase().replace(/\s+/g, '') === id);
        if (!app) return false;
        await launch(app.id);
        return true;
      },
      apps: () => allApps().filter((a) => !a.hidden).map((a) => ({ id: a.id, name: a.name, description: a.description })),
      info: () => {
        const L = os.display.layout;
        return { screen: `${L.w}x${L.h}, ${L.scale}x pixels, 16 colors`, startedAt: performance.timeOrigin, quota: os.wm.topbar.quota };
      },
      clear: () => { this.screen.color(C.CREAM, C.INK); this.screen.cls(); },
      exit: () => { this.closed = true; setTimeout(() => this.win.close(), 0); },
      aborted: () => this.abortFlag,
    };
  }

  private expandVars(s: string): string {
    return s.replace(/\$(\w+)|\$\{(\w+)\}/g, (_m, a, b) => this.env[a ?? b] ?? '');
  }

  async execute(line: string) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    // a whole line of BASIC? (only when the first word isn't a shell command)
    const firstWord = tokenize(trimmed).words[0] ?? '';
    const isCmd = (w: string) => !!COMMANDS[w.toLowerCase()] || ['run', 'basic'].includes(w.toLowerCase());
    if (!isCmd(firstWord) && !this.findProgram(firstWord)) {
      if (await this.tryBasic(trimmed)) return;
      this.say(`osh: command not found: ${firstWord}\n`, C.CRIMSON);
      return;
    }
    // pipeline with optional redirect on the last stage
    const stages = splitUnquoted(this.expandVars(trimmed), '|');
    let stdin: string | null = null;
    for (let i = 0; i < stages.length; i++) {
      let stage = stages[i];
      let redirect: { path: string; append: boolean } | null = null;
      if (i === stages.length - 1) {
        const r = findRedirect(stage);
        if (r) {
          redirect = { path: this.resolve(r.path), append: r.append };
          stage = stage.slice(0, r.index);
        }
      }
      const capture = i < stages.length - 1 || !!redirect;
      let buf = '';
      const out = capture ? (s: string) => { buf += s; } : (s: string) => this.say(s);
      const status = await this.runStage(stage.trim(), stdin, out);
      if (this.abortFlag) { if (status !== 130) this.say('^C\n', C.GREY); return; }
      if (redirect) {
        try {
          const prev = redirect.append && os.fs.exists(redirect.path) ? await os.fs.readText(redirect.path) : '';
          await os.fs.write(redirect.path, prev + buf);
        } catch (e) {
          this.say(`osh: ${(e as Error).message}\n`, C.CRIMSON);
        }
      }
      stdin = buf;
      if (status !== 0 && i < stages.length - 1) break;
    }
  }

  private async runStage(stage: string, stdin: string | null, out: (s: string) => void): Promise<number> {
    const { words } = tokenize(stage);
    if (!words.length) return 0;
    const [cmd, ...rawArgs] = words;
    const name = cmd.toLowerCase();
    if (name === 'run' || this.findProgram(cmd)) {
      const target = name === 'run' ? rawArgs[0] : cmd;
      if (!target) { this.say('usage: run PROGRAM.BAS\n', C.CRIMSON); return 1; }
      const p = this.findProgram(target);
      if (!p) { this.say(`run: ${target}: no such program\n`, C.CRIMSON); return 1; }
      return this.runProgram(p);
    }
    if (name === 'basic') {
      const p = rawArgs[0] ? this.resolve(rawArgs[0]) : undefined;
      await launch('basic', { path: p && os.fs.exists(p) ? p : undefined });
      return 0;
    }
    const info = COMMANDS[name];
    if (!info) { this.say(`osh: command not found: ${cmd}\n`, C.CRIMSON); return 127; }
    const ctx = this.ctx(out);
    const args = expandGlobs(ctx, rawArgs);
    return info.run(ctx, args, stdin);
  }

  /** Resolve NAME, NAME.BAS or ./NAME to an existing .BAS file. */
  private findProgram(word: string): string | null {
    if (!word || COMMANDS[word.toLowerCase()]) return null;
    const w = word.replace(/^\.\//, '');
    for (const cand of [w, w + '.BAS']) {
      const p = this.resolve(cand);
      if (extname(p) === 'BAS' && os.fs.exists(p) && !os.fs.isDir(p)) return p;
    }
    // programs in /Programs can be run from anywhere
    const pp = joinPath('/Programs', /\.bas$/i.test(w) ? w : w + '.BAS');
    if (!w.includes('/') && os.fs.exists(pp)) return pp;
    return null;
  }

  /** Run a BASIC program inside the console (window apps get their own window). */
  private async runProgram(path: string): Promise<number> {
    const src = await os.fs.readText(path);
    if (/^\s*WINDOW\b/im.test(src)) {
      this.say(`Opening ${basename(path)} in its own window...\n`, C.GREY);
      runFile(path);
      return 0;
    }
    let prog;
    try {
      prog = compile(src);
    } catch (e) {
      this.say(`${basename(path)}: ${e instanceof BasicError ? e.format() : String(e)}\n`, C.CRIMSON);
      return 1;
    }
    this.screen.cwd = dirname(path);
    const status = await this.runVM(prog);
    this.screen.cwd = this.cwd;
    return status;
  }

  /** Immediate mode: run a line of BASIC. Returns false if the line isn't valid BASIC. */
  private async tryBasic(line: string): Promise<boolean> {
    let prog;
    try {
      prog = compile(line);
    } catch (e) {
      // only treat it as BASIC when it clearly starts like a statement
      if (e instanceof BasicError && /^(PRINT|\?|FOR|IF|LET|DIM|CLS|COLOR|LOCATE|PLAY|BEEP|SOUND|PSET|LINE|CIRCLE|INPUT|DO|WHILE)\b/i.test(line)) {
        this.say(`${e.format().replace(/ in line 1/, '')}\n`, C.CRIMSON);
        return true;
      }
      return false;
    }
    this.screen.cwd = this.cwd;
    await this.runVM(prog);
    return true;
  }

  private async runVM(prog: Program): Promise<number> {
    this.screen.color(C.CREAM, C.INK);
    const vm = new VM(prog, this.screen);
    this.vm = vm;
    await vm.start();
    this.vm = null;
    this.screen.stopAll();
    this.screen.inputHook = (key, buf) => this.editKey(key, buf);
    // programs may have resized the screen or changed colors
    if (this.screen.surf.w !== W || this.screen.surf.h !== H) {
      this.screen.color(C.CREAM, C.INK);
      this.screen.screen(W, H);
    }
    this.screen.color(C.CREAM, C.INK);
    if (this.screen.col > 0) this.screen.print('\n');
    if (vm.error) { this.say(vm.error.format() + '\n', C.CRIMSON); return 1; }
    if (vm.status === 'stopped') { this.say('^C\n', C.GREY); return 130; }
    os.wm.desktop.refresh();
    return 0;
  }
}

registerApp({
  id: 'console',
  name: 'Console',
  icon: 'basic',
  description: 'A command line: Unix-style commands, pipes, and BASIC programs.',
  launch: ({ path, args }) => { new Console(path, (args?.cmd as string) ?? ''); },
});
