import { compile } from './compiler';
import { BasicError } from './values';
import { VM, type BasicHost } from './vm';
import type { Vfs } from '../fs/vfs';

export interface RunResult {
  output: string;
  error?: string;
}

/** Host with no screen: collects printed text, feeds INPUT from a list. Used by tests and tools. */
export class HeadlessHost implements BasicHost {
  output = '';
  inputs: string[];
  fs: Vfs | null;
  cwd: string;
  private fgc = 9;
  constructor(inputs: string[] = [], fs: Vfs | null = null, cwd = '/Documents') {
    this.inputs = inputs.slice();
    this.fs = fs;
    this.cwd = cwd;
  }
  print(s: string) { this.output += s; }
  pos() { const i = this.output.lastIndexOf('\n'); return this.output.length - i - 1; }
  csrlin() { return this.output.split('\n').length; }
  readLine() {
    const v = this.inputs.shift() ?? '';
    this.output += v + '\n';
    return Promise.resolve(v);
  }
  inkey() { return ''; }
  sleep() { return Promise.resolve(); }
  cls() {}
  locate() {}
  color(fg: number | null) { if (fg !== null) this.fgc = fg; }
  fg() { return this.fgc; }
  screen() {}
  pset() {}
  line() {}
  circle() {}
  paint() {}
  point() { return 0; }
  play() { return Promise.resolve(); }
  beep() {}
}

export async function runBasic(source: string, opts: { input?: string[]; fs?: Vfs; cwd?: string; timeoutMs?: number } = {}): Promise<RunResult> {
  const host = new HeadlessHost(opts.input, opts.fs ?? null, opts.cwd);
  let prog;
  try {
    prog = compile(source);
  } catch (e) {
    if (e instanceof BasicError) return { output: '', error: e.format() };
    throw e;
  }
  const vm = new VM(prog, host);
  const timeout = opts.timeoutMs ?? 5000;
  const timer = setTimeout(() => vm.stop(), timeout);
  await vm.start();
  clearTimeout(timer);
  const r: RunResult = { output: host.output };
  if (vm.error) r.error = vm.error.format();
  else if (vm.status === 'stopped') r.error = 'Timed out';
  return r;
}
