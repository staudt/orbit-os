import type { Vfs } from '../../fs/vfs';
import { basename as pbasename, dirname as pdirname, extname, joinPath } from '../../fs/vfs';

export interface ShellCtx {
  fs: Vfs;
  cwd: string;
  setCwd(p: string): void;
  out(s: string): void;
  err(s: string): void;
  resolve(p: string): string;
  history: string[];
  env: Record<string, string>;
  open(target: string, kind: 'path' | 'app'): Promise<boolean>;
  apps(): { id: string; name: string; description?: string }[];
  info(): { screen: string; startedAt: number; quota: number };
  clear(): void;
  exit(): void;
  aborted(): boolean;
}
export type Command = (ctx: ShellCtx, args: string[], stdin: string | null) => Promise<number>;
export interface CommandInfo { run: Command; usage: string; desc: string }

// ---- helpers ---------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function human(n: number): string {
  if (n < 1024) return String(n);
  let v = n / 1024;
  const units = ['K', 'M', 'G', 'T'];
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const s = v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
  return s + units[i];
}

function shortDate(t: number): string {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function lines(text: string): string[] {
  if (text === '') return [];
  const l = text.split('\n');
  if (l[l.length - 1] === '') l.pop();
  return l;
}

function globToRegex(pat: string): RegExp {
  const src = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + src + '$', 'i');
}

function parseFlags(args: string[], known: string): { f: Set<string>; rest: string[]; bad: string | null } {
  const f = new Set<string>();
  const rest: string[] = [];
  let bad: string | null = null;
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { i++; break; }
    if (a.length > 1 && a[0] === '-') {
      for (const ch of a.slice(1)) {
        if (known.includes(ch)) f.add(ch);
        else bad ??= ch;
      }
    } else rest.push(a);
  }
  for (; i < args.length; i++) rest.push(args[i]);
  return { f, rest, bad };
}

function fail(ctx: ShellCtx, cmd: string, msg: string): number {
  ctx.err(`${cmd}: ${msg}\n`);
  return 1;
}

/** Read named files, or stdin when none given. */
async function inputs(ctx: ShellCtx, cmd: string, files: string[], stdin: string | null): Promise<{ items: { name: string; text: string }[]; ok: boolean }> {
  if (files.length === 0) return { items: [{ name: '-', text: stdin ?? '' }], ok: true };
  const items: { name: string; text: string }[] = [];
  let ok = true;
  for (const f of files) {
    const p = ctx.resolve(f);
    const n = ctx.fs.resolve(p);
    if (!n) { fail(ctx, cmd, `${f}: No such file or directory`); ok = false; continue; }
    if (n.type === 'dir') { fail(ctx, cmd, `${f}: Is a directory`); ok = false; continue; }
    items.push({ name: f, text: await ctx.fs.readText(p) });
  }
  return { items, ok };
}

const WILD = /[*?]/;

export function expandGlobs(ctx: ShellCtx, args: string[]): string[] {
  const res: string[] = [];
  for (const a of args) {
    if (!WILD.test(a)) { res.push(a); continue; }
    const slash = a.lastIndexOf('/');
    const dirPart = slash >= 0 ? a.slice(0, slash + 1) : '';
    const pat = a.slice(slash + 1);
    if (WILD.test(dirPart)) { res.push(a); continue; }
    const dirAbs = ctx.resolve(dirPart === '' ? '.' : dirPart);
    let names: string[] = [];
    try {
      const re = globToRegex(pat);
      names = ctx.fs.list(dirAbs).map((n) => n.name).filter((n) => re.test(n) && (pat.startsWith('.') || !n.startsWith('.')));
    } catch { names = []; }
    if (names.length === 0) res.push(a);
    else for (const n of names.sort((x, y) => x.localeCompare(y))) res.push(dirPart + n);
  }
  return res;
}

function columns(names: string[], width = 80): string {
  if (names.length === 0) return '';
  const w = Math.max(...names.map((n) => n.length)) + 2;
  const cols = Math.max(1, Math.floor(width / w));
  const rows = Math.ceil(names.length / cols);
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const n = names[c * rows + r];
      if (n === undefined) continue;
      line += n.padEnd(w);
    }
    out.push(line.trimEnd());
  }
  return out.join('\n') + '\n';
}

function sleepMs(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

function treeSize(fs: Vfs, path: string): number {
  const n = fs.stat(path);
  if (n.type === 'file') return n.size;
  let t = 0;
  for (const c of fs.list(path)) t += treeSize(fs, fs.pathOf(c));
  return t;
}

// ---- commands --------------------------------------------------------------

const cmds: Record<string, CommandInfo> = {};
function def(name: string, usage: string, desc: string, run: Command) {
  cmds[name] = {
    usage, desc,
    run: async (ctx, args, stdin) => {
      try { return await run(ctx, args, stdin); }
      catch (e) { return fail(ctx, name, e instanceof Error ? e.message : String(e)); }
    },
  };
}

def('help', 'help [command]', 'list commands or show usage', async (ctx, args) => {
  if (args[0]) {
    const c = COMMANDS[args[0]];
    if (!c) return fail(ctx, 'help', `${args[0]}: no such command`);
    ctx.out(`usage: ${c.usage}\n${c.desc}\n`);
    return 0;
  }
  const names = Object.keys(COMMANDS).sort();
  const w = Math.max(...names.map((n) => n.length)) + 2;
  ctx.out('Orbit shell (osh) commands:\n');
  for (const n of names) ctx.out(`  ${n.padEnd(w)}${COMMANDS[n].desc}\n`);
  return 0;
});

def('ls', 'ls [-l] [-a] [paths...]', 'list directory contents', async (ctx, args) => {
  const { f, rest, bad } = parseFlags(args, 'la');
  if (bad) return fail(ctx, 'ls', `invalid option -- '${bad}'`);
  const paths = rest.length ? rest : ['.'];
  let status = 0;
  const long = f.has('l'), all = f.has('a');
  const fmt = (name: string, isDir: boolean, size: number, mtime: number) =>
    long ? `${isDir ? 'd' : '-'} ${(isDir ? '-' : human(size)).padStart(6)}  ${shortDate(mtime)}  ${name}${isDir ? '/' : ''}\n` : name + (isDir ? '/' : '');
  const files: string[] = [];
  const dirs: string[] = [];
  for (const p of paths) {
    const n = ctx.fs.resolve(ctx.resolve(p));
    if (!n) { status = fail(ctx, 'ls', `${p}: No such file or directory`); continue; }
    if (n.type === 'dir') dirs.push(p); else files.push(p);
  }
  const printEntries = (entries: { name: string; isDir: boolean; size: number; mtime: number }[]) => {
    if (long) for (const e of entries) ctx.out(fmt(e.name, e.isDir, e.size, e.mtime));
    else ctx.out(columns(entries.map((e) => fmt(e.name, e.isDir, e.size, e.mtime))));
  };
  let first = true;
  if (files.length) {
    printEntries(files.map((p) => {
      const n = ctx.fs.stat(ctx.resolve(p));
      return { name: p, isDir: false, size: n.size, mtime: n.mtime };
    }));
    first = false;
  }
  const header = paths.length > 1;
  for (const d of dirs) {
    if (!first) ctx.out('\n');
    first = false;
    if (header) ctx.out(`${d}:\n`);
    const kids = ctx.fs.list(ctx.resolve(d)).filter((n) => all || !n.name.startsWith('.'));
    printEntries(kids.map((n) => ({ name: n.name, isDir: n.type === 'dir', size: n.size, mtime: n.mtime })));
  }
  return status;
});

def('cd', 'cd [dir]', 'change directory (no argument: /Documents, -: previous)', async (ctx, args) => {
  let target: string;
  if (args.length === 0) target = '/Documents';
  else if (args[0] === '-') {
    if (!ctx.env.OLDPWD) return fail(ctx, 'cd', 'OLDPWD not set');
    target = ctx.env.OLDPWD;
  } else target = ctx.resolve(args[0]);
  const n = ctx.fs.resolve(target);
  if (!n) return fail(ctx, 'cd', `${args[0] ?? target}: No such file or directory`);
  if (n.type !== 'dir') return fail(ctx, 'cd', `${args[0] ?? target}: Not a directory`);
  const real = ctx.fs.pathOf(n);
  ctx.env.OLDPWD = ctx.cwd;
  ctx.env.PWD = real;
  ctx.setCwd(real);
  if (args[0] === '-') ctx.out(real + '\n');
  return 0;
});

def('pwd', 'pwd', 'print working directory', async (ctx) => { ctx.out(ctx.cwd + '\n'); return 0; });

def('cat', 'cat [files...]', 'print files (or standard input)', async (ctx, args, stdin) => {
  const { items, ok } = await inputs(ctx, 'cat', args, stdin);
  for (const i of items) ctx.out(i.text);
  return ok ? 0 : 1;
});

function headTail(name: 'head' | 'tail'): Command {
  return async (ctx, args, stdin) => {
    let n = 10;
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-n') {
        n = parseInt(args[++i] ?? '', 10);
        if (isNaN(n)) return fail(ctx, name, 'invalid number of lines');
      } else if (/^-n\d+$/.test(a)) n = parseInt(a.slice(2), 10);
      else if (/^-\d+$/.test(a)) n = parseInt(a.slice(1), 10);
      else files.push(a);
    }
    const { items, ok } = await inputs(ctx, name, files, stdin);
    for (const it of items) {
      if (items.length > 1) ctx.out(`==> ${it.name} <==\n`);
      const l = lines(it.text);
      const sel = name === 'head' ? l.slice(0, n) : n === 0 ? [] : l.slice(-n);
      for (const x of sel) ctx.out(x + '\n');
    }
    return ok ? 0 : 1;
  };
}
def('head', 'head [-n N] [file]', 'print the first N lines (default 10)', headTail('head'));
def('tail', 'tail [-n N] [file]', 'print the last N lines (default 10)', headTail('tail'));

def('wc', 'wc [-l|-w|-c] [files]', 'count lines, words and bytes', async (ctx, args, stdin) => {
  const { f, rest, bad } = parseFlags(args, 'lwc');
  if (bad) return fail(ctx, 'wc', `invalid option -- '${bad}'`);
  const { items, ok } = await inputs(ctx, 'wc', rest, stdin);
  const none = f.size === 0;
  const tot = [0, 0, 0];
  const row = (c: number[], name: string) => {
    const parts: string[] = [];
    if (none || f.has('l')) parts.push(String(c[0]).padStart(6));
    if (none || f.has('w')) parts.push(String(c[1]).padStart(6));
    if (none || f.has('c')) parts.push(String(c[2]).padStart(6));
    ctx.out(parts.join(' ') + (name && name !== '-' ? ' ' + name : '') + '\n');
  };
  for (const it of items) {
    const c = [(it.text.match(/\n/g) ?? []).length, it.text.split(/\s+/).filter(Boolean).length, new TextEncoder().encode(it.text).length];
    c.forEach((v, i) => (tot[i] += v));
    row(c, it.name);
  }
  if (items.length > 1) row(tot, 'total');
  return ok ? 0 : 1;
});

def('grep', 'grep [-i] [-n] [-v] pattern [files]', 'print lines matching a pattern', async (ctx, args, stdin) => {
  const { f, rest, bad } = parseFlags(args, 'inv');
  if (bad) return fail(ctx, 'grep', `invalid option -- '${bad}'`);
  if (rest.length === 0) return fail(ctx, 'grep', 'missing pattern');
  const pat = rest[0];
  const flags = f.has('i') ? 'i' : '';
  let re: RegExp;
  try { re = new RegExp(pat, flags); }
  catch { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags); }
  const files = rest.slice(1);
  const { items, ok } = await inputs(ctx, 'grep', files, stdin);
  let matched = false;
  for (const it of items) {
    lines(it.text).forEach((line, i) => {
      if (re.test(line) !== f.has('v')) {
        matched = true;
        ctx.out((items.length > 1 || (files.length > 1) ? it.name + ':' : '') + (f.has('n') ? `${i + 1}:` : '') + line + '\n');
      }
    });
  }
  return !ok ? 2 : matched ? 0 : 1;
});

def('sort', 'sort [-r] [-n] [files]', 'sort lines', async (ctx, args, stdin) => {
  const { f, rest, bad } = parseFlags(args, 'rn');
  if (bad) return fail(ctx, 'sort', `invalid option -- '${bad}'`);
  const { items, ok } = await inputs(ctx, 'sort', rest, stdin);
  const all = items.flatMap((i) => lines(i.text));
  all.sort(f.has('n')
    ? (a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b)
    : (a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (f.has('r')) all.reverse();
  for (const l of all) ctx.out(l + '\n');
  return ok ? 0 : 1;
});

def('uniq', 'uniq [-c] [file]', 'collapse adjacent duplicate lines', async (ctx, args, stdin) => {
  const { f, rest, bad } = parseFlags(args, 'c');
  if (bad) return fail(ctx, 'uniq', `invalid option -- '${bad}'`);
  const { items, ok } = await inputs(ctx, 'uniq', rest.slice(0, 1), stdin);
  const l = items.flatMap((i) => lines(i.text));
  let prev: string | null = null, count = 0;
  const flush = () => { if (prev !== null) ctx.out((f.has('c') ? String(count).padStart(4) + ' ' : '') + prev + '\n'); };
  for (const x of l) {
    if (x === prev) count++;
    else { flush(); prev = x; count = 1; }
  }
  flush();
  return ok ? 0 : 1;
});

def('echo', 'echo [-n] args...', 'print arguments', async (ctx, args) => {
  let nl = true;
  let a = args;
  while (a[0] === '-n') { nl = false; a = a.slice(1); }
  ctx.out(a.join(' ') + (nl ? '\n' : ''));
  return 0;
});

def('touch', 'touch files...', 'create files or update their modified time', async (ctx, args) => {
  if (!args.length) return fail(ctx, 'touch', 'missing file operand');
  let status = 0;
  for (const a of args) {
    const p = ctx.resolve(a);
    const n = ctx.fs.resolve(p);
    if (n?.type === 'dir') continue;
    try { await ctx.fs.write(p, n ? await ctx.fs.read(p) : ''); }
    catch (e) { status = fail(ctx, 'touch', `${a}: ${e instanceof Error ? e.message : e}`); }
  }
  return status;
});

def('mkdir', 'mkdir [-p] dirs...', 'make directories', async (ctx, args) => {
  const { f, rest, bad } = parseFlags(args, 'p');
  if (bad) return fail(ctx, 'mkdir', `invalid option -- '${bad}'`);
  if (!rest.length) return fail(ctx, 'mkdir', 'missing operand');
  let status = 0;
  for (const a of rest) {
    const p = ctx.resolve(a);
    try {
      if (f.has('p')) await ctx.fs.mkdir(p, true);
      else if (ctx.fs.exists(p)) status = fail(ctx, 'mkdir', `${a}: File exists`);
      else if (!ctx.fs.isDir(pdirname(p))) status = fail(ctx, 'mkdir', `${a}: No such file or directory`);
      else await ctx.fs.mkdir(p, false);
    } catch (e) { status = fail(ctx, 'mkdir', `${a}: ${e instanceof Error ? e.message : e}`); }
  }
  return status;
});

def('rmdir', 'rmdir dirs...', 'remove empty directories', async (ctx, args) => {
  if (!args.length) return fail(ctx, 'rmdir', 'missing operand');
  let status = 0;
  for (const a of args) {
    const p = ctx.resolve(a);
    const n = ctx.fs.resolve(p);
    if (!n) status = fail(ctx, 'rmdir', `${a}: No such file or directory`);
    else if (n.type !== 'dir') status = fail(ctx, 'rmdir', `${a}: Not a directory`);
    else if (ctx.fs.list(p).length) status = fail(ctx, 'rmdir', `${a}: Directory not empty`);
    else await ctx.fs.remove(p);
  }
  return status;
});

def('rm', 'rm [-r] [-f] paths...', 'move files to the Trash', async (ctx, args) => {
  const { f, rest, bad } = parseFlags(args, 'rRf');
  if (bad) return fail(ctx, 'rm', `invalid option -- '${bad}'`);
  const rec = f.has('r') || f.has('R');
  if (!rest.length) return f.has('f') ? 0 : fail(ctx, 'rm', 'missing operand');
  let status = 0;
  for (const a of rest) {
    const p = ctx.resolve(a);
    const n = ctx.fs.resolve(p);
    if (!n) { if (!f.has('f')) status = fail(ctx, 'rm', `${a}: No such file or directory`); continue; }
    if (n.type === 'dir' && !rec) { status = fail(ctx, 'rm', `${a}: is a directory`); continue; }
    try { await ctx.fs.remove(p); }
    catch (e) { status = fail(ctx, 'rm', `${a}: ${e instanceof Error ? e.message : e}`); }
  }
  return status;
});

def('cp', 'cp [-r] src... dest', 'copy files and folders', async (ctx, args) => {
  const { f, rest, bad } = parseFlags(args, 'rR');
  if (bad) return fail(ctx, 'cp', `invalid option -- '${bad}'`);
  if (rest.length < 2) return fail(ctx, 'cp', 'missing file operand');
  const destArg = rest[rest.length - 1];
  const srcs = rest.slice(0, -1);
  const dest = ctx.resolve(destArg);
  const destIsDir = ctx.fs.isDir(dest);
  if (srcs.length > 1 && !destIsDir) return fail(ctx, 'cp', `${destArg}: Not a directory`);
  let status = 0;
  for (const s of srcs) {
    const sp = ctx.resolve(s);
    const n = ctx.fs.resolve(sp);
    if (!n) { status = fail(ctx, 'cp', `${s}: No such file or directory`); continue; }
    if (n.type === 'dir' && !(f.has('r') || f.has('R'))) { status = fail(ctx, 'cp', `${s}: -r not specified; omitting directory`); continue; }
    try {
      if (destIsDir) await ctx.fs.copy(sp, dest);
      else if (n.type === 'dir') {
        if (ctx.fs.exists(dest)) { status = fail(ctx, 'cp', `${destArg}: Not a directory`); continue; }
        if (!ctx.fs.isDir(pdirname(dest))) { status = fail(ctx, 'cp', `${destArg}: No such file or directory`); continue; }
        await ctx.fs.copy(sp, pdirname(dest), pbasename(dest));
      } else {
        if (!ctx.fs.isDir(pdirname(dest))) { status = fail(ctx, 'cp', `${destArg}: No such file or directory`); continue; }
        await ctx.fs.write(dest, await ctx.fs.read(sp));
      }
    } catch (e) { status = fail(ctx, 'cp', `${s}: ${e instanceof Error ? e.message : e}`); }
  }
  return status;
});

def('mv', 'mv src... dest', 'move or rename files and folders', async (ctx, args) => {
  if (args.length < 2) return fail(ctx, 'mv', 'missing file operand');
  const destArg = args[args.length - 1];
  const srcs = args.slice(0, -1);
  const dest = ctx.resolve(destArg);
  const destIsDir = ctx.fs.isDir(dest);
  if (srcs.length > 1 && !destIsDir) return fail(ctx, 'mv', `${destArg}: Not a directory`);
  let status = 0;
  for (const s of srcs) {
    const sp = ctx.resolve(s);
    const n = ctx.fs.resolve(sp);
    if (!n) { status = fail(ctx, 'mv', `${s}: No such file or directory`); continue; }
    try {
      if (destIsDir) await ctx.fs.move(sp, dest);
      else {
        const dd = pdirname(dest);
        if (!ctx.fs.isDir(dd)) { status = fail(ctx, 'mv', `${destArg}: No such file or directory`); continue; }
        const existing = ctx.fs.resolve(dest);
        if (existing && existing.id !== n.id) await ctx.fs.deleteForever(dest);
        if (pdirname(sp).toLowerCase() === dd.toLowerCase()) await ctx.fs.rename(sp, pbasename(dest));
        else {
          const moved = await ctx.fs.move(sp, dd);
          if (pbasename(moved) !== pbasename(dest)) await ctx.fs.rename(moved, pbasename(dest));
        }
      }
    } catch (e) { status = fail(ctx, 'mv', `${s}: ${e instanceof Error ? e.message : e}`); }
  }
  return status;
});

def('find', 'find [dir] [-name pattern] [-type f|d]', 'search for files recursively', async (ctx, args) => {
  let start = '.';
  let re: RegExp | null = null;
  let type = '';
  let seenDir = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-name') re = globToRegex(args[++i] ?? '');
    else if (args[i] === '-type') type = args[++i] ?? '';
    else if (!seenDir && !args[i].startsWith('-')) { start = args[i]; seenDir = true; }
    else return fail(ctx, 'find', `unknown option ${args[i]}`);
  }
  const abs = ctx.resolve(start);
  const root = ctx.fs.resolve(abs);
  if (!root) return fail(ctx, 'find', `${start}: No such file or directory`);
  const show = (shown: string, name: string, isDir: boolean) => {
    if (re && !re.test(name)) return;
    if (type === 'f' && isDir) return;
    if (type === 'd' && !isDir) return;
    ctx.out(shown + '\n');
  };
  const walk = (shown: string, path: string) => {
    for (const c of ctx.fs.list(path)) {
      if (ctx.aborted()) return;
      const sp = (shown.endsWith('/') ? shown : shown + '/') + c.name;
      const ap = joinPath(path, c.name);
      show(sp, c.name, c.type === 'dir');
      if (c.type === 'dir') walk(sp, ap);
    }
  };
  show(start, root.name || '/', root.type === 'dir');
  if (root.type === 'dir') walk(start, abs);
  return 0;
});

def('tree', 'tree [dir]', 'show a directory tree', async (ctx, args) => {
  const start = args[0] ?? '.';
  const abs = ctx.resolve(start);
  const root = ctx.fs.resolve(abs);
  if (!root) return fail(ctx, 'tree', `${start}: No such file or directory`);
  let dirs = 0, files = 0;
  ctx.out(start + '\n');
  const walk = (path: string, prefix: string) => {
    const kids = ctx.fs.list(path);
    kids.forEach((c, i) => {
      if (ctx.aborted()) return;
      const last = i === kids.length - 1;
      ctx.out(`${prefix}${last ? '└── ' : '├── '}${c.name}${c.type === 'dir' ? '/' : ''}\n`);
      if (c.type === 'dir') { dirs++; walk(joinPath(path, c.name), prefix + (last ? '    ' : '│   ')); }
      else files++;
    });
  };
  if (root.type === 'dir') walk(abs, '');
  ctx.out(`\n${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}\n`);
  return 0;
});

def('du', 'du [path]', 'disk usage per top-level entry', async (ctx, args) => {
  const start = args[0] ?? '.';
  const abs = ctx.resolve(start);
  const n = ctx.fs.resolve(abs);
  if (!n) return fail(ctx, 'du', `${start}: No such file or directory`);
  if (n.type === 'dir') {
    for (const c of ctx.fs.list(abs)) ctx.out(`${human(treeSize(ctx.fs, joinPath(abs, c.name))).padStart(6)}  ${c.name}${c.type === 'dir' ? '/' : ''}\n`);
  }
  ctx.out(`${human(treeSize(ctx.fs, abs)).padStart(6)}  ${start}\n`);
  return 0;
});

def('df', 'df', 'show disk usage', async (ctx) => {
  const quota = ctx.info().quota;
  const used = ctx.fs.usage();
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  ctx.out('Filesystem      Size   Used  Avail  Use%\n');
  ctx.out(`${'Orbit HD'.padEnd(12)}${human(quota).padStart(8)}${human(used).padStart(7)}${human(Math.max(0, quota - used)).padStart(7)}${(pct + '%').padStart(6)}\n`);
  return 0;
});

def('date', 'date', 'print the current date and time', async (ctx) => {
  const d = new Date();
  ctx.out(`${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${d.getFullYear()}\n`);
  return 0;
});

def('cal', 'cal [month] [year]', 'show a calendar', async (ctx, args) => {
  const now = new Date();
  let month = now.getMonth() + 1, year = now.getFullYear();
  const nums = args.map((a) => parseInt(a, 10));
  if (nums.some((x) => isNaN(x))) return fail(ctx, 'cal', 'invalid argument');
  if (nums.length === 1) { if (nums[0] > 12) year = nums[0]; else month = nums[0]; }
  else if (nums.length >= 2) { month = nums[0]; year = nums[1]; }
  if (month < 1 || month > 12) return fail(ctx, 'cal', `illegal month value: ${month}`);
  if (year < 1 || year > 9999) return fail(ctx, 'cal', `illegal year value: ${year}`);
  const first = new Date(2000, month - 1, 1);
  first.setFullYear(year);
  const startDay = first.getDay();
  const dim = new Date(year, month, 0).getDate();
  const title = `${MONTH_NAMES[month - 1]} ${year}`;
  ctx.out(' '.repeat(Math.max(0, Math.floor((20 - title.length) / 2))) + title + '\n');
  ctx.out('Su Mo Tu We Th Fr Sa\n');
  const isNow = now.getFullYear() === year && now.getMonth() + 1 === month;
  let line = '   '.repeat(startDay);
  for (let d = 1; d <= dim; d++) {
    line += String(d).padStart(2) + (isNow && d === now.getDate() ? '*' : ' ');
    if ((startDay + d) % 7 === 0 || d === dim) { ctx.out(line.trimEnd() + '\n'); line = ''; }
  }
  return 0;
});

def('whoami', 'whoami', 'print the user name', async (ctx) => { ctx.out((ctx.env.USER || 'user') + '\n'); return 0; });
def('hostname', 'hostname', 'print the host name', async (ctx) => { ctx.out('orbit\n'); return 0; });
def('uname', 'uname [-a]', 'print system information', async (ctx, args) => {
  ctx.out(args.includes('-a') ? `Orbit orbit 1.0 browser ${ctx.info().screen}\n` : 'Orbit\n');
  return 0;
});

function uptimeStr(startedAt: number): string {
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad2(m)}` : `${m} min`;
}
def('uptime', 'uptime', 'show how long Orbit has been running', async (ctx) => {
  const d = new Date();
  ctx.out(` ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} up ${uptimeStr(ctx.info().startedAt)}\n`);
  return 0;
});

def('history', 'history', 'show command history', async (ctx) => {
  ctx.history.forEach((h, i) => ctx.out(`${String(i + 1).padStart(5)}  ${h}\n`));
  return 0;
});
def('clear', 'clear', 'clear the screen', async (ctx) => { ctx.clear(); return 0; });
cmds.cls = { ...cmds.clear, desc: 'clear the screen (same as clear)', usage: 'cls' };
def('exit', 'exit', 'close the console', async (ctx) => { ctx.exit(); return 0; });

def('open', 'open target', 'open a file, folder or app', async (ctx, args) => {
  if (!args.length) return fail(ctx, 'open', 'missing operand');
  const t = args.join(' ');
  const p = ctx.resolve(args[0]);
  if (ctx.fs.exists(p)) {
    return (await ctx.open(p, 'path')) ? 0 : fail(ctx, 'open', `${args[0]}: nothing can open this`);
  }
  const q = t.toLowerCase();
  const app = ctx.apps().find((a) => a.id.toLowerCase() === q || a.name.toLowerCase() === q);
  if (app) return (await ctx.open(app.id, 'app')) ? 0 : fail(ctx, 'open', `${app.id}: could not start`);
  return fail(ctx, 'open', `${t}: No such file, folder or app`);
});

def('apps', 'apps', 'list installed apps', async (ctx) => {
  const apps = ctx.apps();
  const w = Math.max(0, ...apps.map((a) => a.id.length)) + 2;
  for (const a of apps) ctx.out(`${a.id.padEnd(w)}${a.name}\n`);
  return 0;
});

def('edit', 'edit file', 'open a file in its editor (creates it if missing)', async (ctx, args) => {
  if (!args.length) return fail(ctx, 'edit', 'missing file operand');
  const p = ctx.resolve(args[0]);
  const n = ctx.fs.resolve(p);
  if (n?.type === 'dir') return fail(ctx, 'edit', `${args[0]}: Is a directory`);
  if (!n) await ctx.fs.write(p, '');
  const ok = extname(p) === 'BAS' ? await ctx.open('basic:' + p, 'app') : await ctx.open(p, 'path');
  return ok ? 0 : fail(ctx, 'edit', `${args[0]}: nothing can open this`);
});

def('orbit', 'orbit', 'show system information', async (ctx) => {
  const logo = [
    '     _.---._     ',
    '   .\'  .    \'.   ',
    ' -(~~~~~~~~~~~~)- ',
    '   \'.    .  .\'    ',
    '     \'-...-\'     ',
    '                  ',
    '                  ',
  ];
  const info = ctx.info();
  const c = ctx.fs.count();
  const text = [
    `${ctx.env.USER || 'user'}@orbit`,
    'OS: Orbit 1.0',
    'Shell: osh',
    `Screen: ${info.screen}`,
    `Disk: ${human(ctx.fs.usage())} / ${human(info.quota)}`,
    `Files: ${c.files} files, ${c.dirs} folders`,
    `Uptime: ${uptimeStr(info.startedAt)}`,
  ];
  for (let i = 0; i < logo.length; i++) ctx.out(`${logo[i]}  ${text[i] ?? ''}`.trimEnd() + '\n');
  return 0;
});

def('basename', 'basename path', 'strip the directory from a path', async (ctx, args) => {
  if (!args.length) return fail(ctx, 'basename', 'missing operand');
  ctx.out((pbasename(args[0]) || '/') + '\n');
  return 0;
});
def('dirname', 'dirname path', 'strip the last component from a path', async (ctx, args) => {
  if (!args.length) return fail(ctx, 'dirname', 'missing operand');
  const a = args[0].replace(/\/+$/, '');
  const i = a.lastIndexOf('/');
  ctx.out((i < 0 ? '.' : i === 0 ? '/' : a.slice(0, i)) + '\n');
  return 0;
});
def('true', 'true', 'do nothing, successfully', async () => 0);
def('false', 'false', 'do nothing, unsuccessfully', async () => 1);

def('sleep', 'sleep seconds', 'wait for a number of seconds', async (ctx, args) => {
  const s = parseFloat(args[0] ?? '');
  if (isNaN(s) || s < 0) return fail(ctx, 'sleep', 'invalid time interval');
  const end = Date.now() + s * 1000;
  while (Date.now() < end) {
    if (ctx.aborted()) return 130;
    await sleepMs(Math.min(100, Math.max(1, end - Date.now())));
  }
  return 0;
});

export const COMMANDS: Record<string, CommandInfo> = cmds;
