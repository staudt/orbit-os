import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Vfs, joinPath } from '../src/fs/vfs';
import { COMMANDS, expandGlobs, type ShellCtx } from '../src/apps/terminal/commands';

let fs: Vfs;
let cwd: string;
let outBuf: string;
let errBuf: string;
let opened: [string, string][];
let ctx: ShellCtx;

beforeEach(async () => {
  fs = await Vfs.open(new IDBFactory(), 'term');
  await fs.write('/Documents/a.txt', 'one\ntwo\nthree\n');
  await fs.write('/Documents/b.txt', 'Banana\napple\nbanana\napple\n');
  await fs.write('/Documents/.hidden', 'x');
  await fs.write('/Documents/sub/c.bas', '10 PRINT 1');
  await fs.write('/Documents/sub/deep/d.txt', 'deep');
  await fs.mkdir('/Other');
  cwd = '/Documents';
  outBuf = '';
  errBuf = '';
  opened = [];
  ctx = {
    fs,
    get cwd() { return cwd; },
    setCwd: (p: string) => { cwd = p; },
    out: (s: string) => { outBuf += s; },
    err: (s: string) => { errBuf += s; },
    resolve: (p: string) => {
      if (p === '~') return '/Documents';
      if (p.startsWith('~/')) return joinPath('/Documents', p.slice(2));
      return p.startsWith('/') ? joinPath(p) : joinPath(cwd, p);
    },
    history: ['ls', 'pwd'],
    env: { USER: 'ricardo', HOME: '/Documents' },
    open: async (t: string, k: 'path' | 'app') => { opened.push([t, k]); return true; },
    apps: () => [{ id: 'write', name: 'Write' }, { id: 'calc', name: 'Calculator' }],
    info: () => ({ screen: '1024x768', startedAt: Date.now() - 83 * 60000, quota: 1024 * 1024 }),
    clear: () => {},
    exit: () => {},
    aborted: () => false,
  } as ShellCtx;
});

const run = (name: string, args: string[] = [], stdin: string | null = null) => COMMANDS[name].run(ctx, args, stdin);

describe('terminal commands', () => {
  it('ls plain shows folders with slash, hides dotfiles', async () => {
    expect(await run('ls')).toBe(0);
    expect(outBuf).toContain('sub/');
    expect(outBuf).toContain('a.txt');
    expect(outBuf).not.toContain('.hidden');
  });

  it('ls -a shows hidden, -l has long format', async () => {
    await run('ls', ['-a']);
    expect(outBuf).toContain('.hidden');
    outBuf = '';
    await run('ls', ['-l']);
    const l = outBuf.split('\n').find((x) => x.endsWith('a.txt'))!;
    expect(l).toMatch(/^- +14 +[A-Z][a-z]{2} \d{2} \d{2}:\d{2} +a\.txt$/);
    expect(outBuf).toMatch(/^d /m);
  });

  it('ls multiple paths prints headers; missing path errors', async () => {
    expect(await run('ls', ['/Other', 'sub'])).toBe(0);
    expect(outBuf).toContain('/Other:');
    expect(outBuf).toContain('sub:');
    expect(await run('ls', ['nope'])).toBe(1);
    expect(errBuf).toContain('ls: nope');
  });

  it('cd, pwd, cd - and errors', async () => {
    await run('cd', ['sub']);
    expect(cwd).toBe('/Documents/sub');
    await run('pwd');
    expect(outBuf).toBe('/Documents/sub\n');
    outBuf = '';
    await run('cd', ['-']);
    expect(cwd).toBe('/Documents');
    expect(outBuf).toBe('/Documents\n');
    expect(await run('cd', ['missing'])).toBe(1);
    expect(await run('cd', ['a.txt'])).toBe(1);
    expect(errBuf).toContain('Not a directory');
    await run('cd', ['/Other']);
    await run('cd');
    expect(cwd).toBe('/Documents');
  });

  it('cat files and stdin', async () => {
    await run('cat', ['a.txt']);
    expect(outBuf).toBe('one\ntwo\nthree\n');
    outBuf = '';
    await run('cat', [], 'piped\n');
    expect(outBuf).toBe('piped\n');
    expect(await run('cat', ['nope.txt'])).toBe(1);
  });

  it('head and tail', async () => {
    await run('head', ['-n', '2', 'a.txt']);
    expect(outBuf).toBe('one\ntwo\n');
    outBuf = '';
    await run('tail', ['-n', '1', 'a.txt']);
    expect(outBuf).toBe('three\n');
    outBuf = '';
    await run('head', ['-n', '1'], 'x\ny\n');
    expect(outBuf).toBe('x\n');
  });

  it('wc with files and stdin', async () => {
    await run('wc', ['-l', 'a.txt']);
    expect(outBuf.trim()).toBe('3 a.txt');
    outBuf = '';
    await run('wc', [], 'a b\nc\n');
    expect(outBuf.trim().split(/\s+/)).toEqual(['2', '3', '6']);
    outBuf = '';
    await run('wc', ['-c'], 'abcd');
    expect(outBuf.trim()).toBe('4');
  });

  it('grep -i -n -v with stdin', async () => {
    await run('grep', ['-i', 'banana'], 'Banana\nbanana\nkiwi\n');
    expect(outBuf).toBe('Banana\nbanana\n');
    outBuf = '';
    await run('grep', ['-n', 'kiwi'], 'Banana\nbanana\nkiwi\n');
    expect(outBuf).toBe('3:kiwi\n');
    outBuf = '';
    await run('grep', ['-v', 'a'], 'abc\nxyz\n');
    expect(outBuf).toBe('xyz\n');
    expect(await run('grep', ['zzz'], 'abc\n')).toBe(1);
    outBuf = '';
    await run('grep', ['^t'], 'two\nthree\none\n');
    expect(outBuf).toBe('two\nthree\n');
  });

  it('grep over files prefixes names', async () => {
    await run('grep', ['apple', 'a.txt', 'b.txt']);
    expect(outBuf).toBe('b.txt:apple\nb.txt:apple\n');
  });

  it('sort and uniq', async () => {
    await run('sort', [], 'b\na\nc\n');
    expect(outBuf).toBe('a\nb\nc\n');
    outBuf = '';
    await run('sort', ['-r'], 'b\na\nc\n');
    expect(outBuf).toBe('c\nb\na\n');
    outBuf = '';
    await run('sort', ['-n'], '10\n9\n100\n');
    expect(outBuf).toBe('9\n10\n100\n');
    outBuf = '';
    await run('uniq', [], 'a\na\nb\na\n');
    expect(outBuf).toBe('a\nb\na\n');
  });

  it('echo -n', async () => {
    await run('echo', ['-n', 'hi', 'there']);
    expect(outBuf).toBe('hi there');
    outBuf = '';
    await run('echo', ['x']);
    expect(outBuf).toBe('x\n');
  });

  it('mkdir -p and without parent', async () => {
    expect(await run('mkdir', ['-p', 'x/y/z'])).toBe(0);
    expect(fs.isDir('/Documents/x/y/z')).toBe(true);
    expect(await run('mkdir', ['q/r'])).toBe(1);
    expect(errBuf).toContain('mkdir:');
  });

  it('touch creates, rmdir only empty', async () => {
    await run('touch', ['new.txt']);
    expect(fs.exists('/Documents/new.txt')).toBe(true);
    expect(await run('rmdir', ['sub'])).toBe(1);
    await run('mkdir', ['empty']);
    expect(await run('rmdir', ['empty'])).toBe(0);
    expect(fs.exists('/Documents/empty')).toBe(false);
  });

  it('rm moves to Trash; folders need -r', async () => {
    expect(await run('rm', ['a.txt'])).toBe(0);
    expect(outBuf).toBe('');
    expect(fs.exists('/Documents/a.txt')).toBe(false);
    expect(fs.exists('/Trash/a.txt')).toBe(true);
    expect(await run('rm', ['sub'])).toBe(1);
    expect(errBuf).toContain('directory');
    expect(fs.exists('/Documents/sub')).toBe(true);
    expect(await run('rm', ['-r', 'sub'])).toBe(0);
    expect(fs.exists('/Trash/sub')).toBe(true);
    expect(await run('rm', ['-f', 'ghost'])).toBe(0);
    expect(await run('rm', ['ghost'])).toBe(1);
  });

  it('cp copies file, into dir, and needs -r for folders', async () => {
    await run('cp', ['a.txt', 'copy.txt']);
    expect(await fs.readText('/Documents/copy.txt')).toBe('one\ntwo\nthree\n');
    await run('cp', ['a.txt', '/Other']);
    expect(fs.exists('/Other/a.txt')).toBe(true);
    expect(await run('cp', ['sub', '/Other'])).toBe(1);
    expect(await run('cp', ['-r', 'sub', '/Other'])).toBe(0);
    expect(fs.exists('/Other/sub/deep/d.txt')).toBe(true);
  });

  it('mv renames or moves into dir', async () => {
    await run('mv', ['a.txt', 'z.txt']);
    expect(fs.exists('/Documents/a.txt')).toBe(false);
    expect(fs.exists('/Documents/z.txt')).toBe(true);
    await run('mv', ['z.txt', 'b.txt', '/Other']);
    expect(fs.exists('/Other/z.txt')).toBe(true);
    expect(fs.exists('/Other/b.txt')).toBe(true);
    expect(await run('mv', ['nope', '/Other'])).toBe(1);
  });

  it('find -name', async () => {
    await run('find', ['.', '-name', '*.txt']);
    const l = outBuf.trim().split('\n').sort();
    expect(l).toEqual(['./a.txt', './b.txt', './sub/deep/d.txt']);
  });

  it('tree draws branches', async () => {
    await run('tree', ['sub']);
    expect(outBuf).toContain('sub\n');
    expect(outBuf).toContain('├── deep/');
    expect(outBuf).toContain('│   └── d.txt');
    expect(outBuf).toContain('└── c.bas');
    expect(outBuf).toContain('1 directory, 2 files');
  });

  it('du and df', async () => {
    await run('du', ['sub']);
    expect(outBuf).toContain('deep/');
    outBuf = '';
    await run('df');
    expect(outBuf).toContain('Orbit HD');
    expect(outBuf).toContain('1M');
  });

  it('cal 2 2024 has 29 days and starts on Thursday', async () => {
    await run('cal', ['2', '2024']);
    const l = outBuf.split('\n');
    expect(l[0]).toContain('February 2024');
    expect(l[1]).toBe('Su Mo Tu We Th Fr Sa');
    expect(l[2].indexOf('1')).toBe(13); // 5th column (Thursday)
    expect(outBuf).toContain('29');
    expect(outBuf).not.toContain('30');
  });

  it('expandGlobs', () => {
    expect(expandGlobs(ctx, ['*.txt']).sort()).toEqual(['a.txt', 'b.txt']);
    expect(expandGlobs(ctx, ['sub/*.bas'])).toEqual(['sub/c.bas']);
    expect(expandGlobs(ctx, ['?.txt', 'plain']).sort()).toEqual(['a.txt', 'b.txt', 'plain']);
    expect(expandGlobs(ctx, ['*.zip'])).toEqual(['*.zip']);
  });

  it('help lists commands and shows usage', async () => {
    await run('help');
    expect(outBuf).toContain('ls');
    expect(outBuf).toContain('grep');
    outBuf = '';
    await run('help', ['grep']);
    expect(outBuf).toContain('usage: grep');
    expect(await run('help', ['nonesuch'])).toBe(1);
  });

  it('open and edit dispatch correctly', async () => {
    await run('open', ['a.txt']);
    await run('open', ['Calculator']);
    await run('edit', ['sub/c.bas']);
    await run('edit', ['fresh.txt']);
    expect(opened).toEqual([
      ['/Documents/a.txt', 'path'],
      ['calc', 'app'],
      ['basic:/Documents/sub/c.bas', 'app'],
      ['/Documents/fresh.txt', 'path'],
    ]);
    expect(fs.exists('/Documents/fresh.txt')).toBe(true);
    expect(await run('open', ['zzz'])).toBe(1);
  });

  it('orbit, uname, uptime, whoami, basename, dirname', async () => {
    await run('orbit');
    expect(outBuf).toContain('OS: Orbit 1.0');
    expect(outBuf).toContain('1024x768');
    outBuf = '';
    await run('uname', ['-a']);
    expect(outBuf).toBe('Orbit orbit 1.0 browser 1024x768\n');
    outBuf = '';
    await run('uptime');
    expect(outBuf).toContain('up 1:23');
    outBuf = '';
    await run('whoami');
    await run('basename', ['/a/b/c.txt']);
    await run('dirname', ['/a/b/c.txt']);
    expect(outBuf).toBe('ricardo\nc.txt\n/a/b\n');
  });

  it('sleep is abortable, true/false statuses', async () => {
    let n = 0;
    ctx.aborted = () => ++n > 1;
    const t = Date.now();
    expect(await run('sleep', ['5'])).toBe(130);
    expect(Date.now() - t).toBeLessThan(1000);
    expect(await run('true')).toBe(0);
    expect(await run('false')).toBe(1);
  });
});
