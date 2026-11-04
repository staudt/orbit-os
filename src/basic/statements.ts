import type { Compiler } from './compiler';
import { BasicError, numText, type Ref, type Value } from './values';
import type { VM, FileHandle } from './vm';
import { parseMML, MmlError } from '../core/mml';
import { joinPath, normPath } from '../fs/vfs';

/** Resolve a program-relative path against the host's working folder. */
export function resolvePath(vm: VM, p: string): string {
  p = p.trim();
  if (!p) throw new BasicError('Bad file name');
  return p.startsWith('/') ? normPath(p) : joinPath(vm.host.cwd, p);
}

function needFs(vm: VM) {
  if (!vm.host.fs) throw new BasicError('Disk not available');
  return vm.host.fs;
}

/** Split an INPUT line into fields: commas separate, quotes protect. */
export function splitFields(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    while (line[i] === ' ') i++;
    let f = '';
    if (line[i] === '"') {
      const j = line.indexOf('"', i + 1);
      f = line.slice(i + 1, j < 0 ? line.length : j);
      i = j < 0 ? line.length : j + 1;
      while (i < line.length && line[i] !== ',') i++;
    } else {
      const j = line.indexOf(',', i);
      f = (j < 0 ? line.slice(i) : line.slice(i, j)).trim();
      i = j < 0 ? line.length : j;
    }
    out.push(f);
    if (line[i] === ',') i++;
    else break;
  }
  return out;
}

function parseNumberField(s: string): number | null {
  const t = s.trim();
  if (t === '') return 0;
  if (/^&H[0-9A-F]+$/i.test(t)) return parseInt(t.slice(2), 16);
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([ED][+-]?\d+)?$/i.test(t)) return null;
  return Number(t.replace(/[dD]/, 'e'));
}

/** Assign parsed fields to refs; returns false when the input doesn't fit. */
function assignFields(refs: Ref[], fields: string[]): boolean {
  if (fields.length !== refs.length) return false;
  const vals: Value[] = [];
  for (let i = 0; i < refs.length; i++) {
    if (refs[i].kind === 'str') vals.push(fields[i]);
    else {
      const n = parseNumberField(fields[i]);
      if (n === null) return false;
      vals.push(n);
    }
  }
  refs.forEach((r, i) => r.set(vals[i]));
  return true;
}

function doInput(vm: VM, refs: Ref[], prompt: string) {
  vm.write(prompt);
  vm.wait(vm.host.readLine(), (line) => {
    const fields = refs.length === 1 && refs[0].kind === 'str' ? [line.replace(/^ +/, '')] : splitFields(line);
    if (refs.length === 1 && refs[0].kind === 'str' && /^\s*"/.test(line)) fields[0] = splitFields(line)[0];
    if (!assignFields(refs, fields)) {
      vm.write('?Redo from start\n');
      doInput(vm, refs, prompt);
    }
  });
}

/** Read the next comma/newline separated field from an input file. */
function readFileField(f: FileHandle): string {
  const t = f.text;
  let i = f.pos;
  while (i < t.length && (t[i] === ' ' || t[i] === '\n' || t[i] === '\r')) i++;
  if (i >= t.length) throw new BasicError('Input past end of file');
  let val: string;
  if (t[i] === '"') {
    const j = t.indexOf('"', i + 1);
    val = t.slice(i + 1, j < 0 ? t.length : j);
    i = j < 0 ? t.length : j + 1;
    while (i < t.length && t[i] !== ',' && t[i] !== '\n') i++;
  } else {
    let j = i;
    while (j < t.length && t[j] !== ',' && t[j] !== '\n') j++;
    val = t.slice(i, j).trim();
    i = j;
  }
  if (t[i] === ',' || t[i] === '\n') i++;
  f.pos = i;
  return val;
}

function readFileLine(f: FileHandle): string {
  const t = f.text;
  if (f.pos >= t.length) throw new BasicError('Input past end of file');
  let j = t.indexOf('\n', f.pos);
  if (j < 0) j = t.length;
  const line = t.slice(f.pos, j).replace(/\r$/, '');
  f.pos = j + 1;
  return line;
}

/** Parse "(x, y)" (optionally prefixed by STEP); emits code pushing x then y. Returns true if STEP. */
function parsePoint(c: Compiler): boolean {
  const step = c.accept('STEP');
  c.expect('(');
  c.parseExpr();
  c.expect(',');
  c.parseExpr();
  c.expect(')');
  return step;
}

/** Optional expression: emits it or pushes `def` (null → -1 marker). */
function optExpr(c: Compiler, def: number) {
  if (c.isOp(',') || c.atEnd() || c.isOp(')')) c.pushConst(def);
  else c.parseExpr();
}

/** Compile statements beyond the core language. Returns false if `w` is not one of them. */
export function compileStatementExt(c: Compiler, w: string): boolean {
  switch (w) {
    case 'CLS': c.p++; if (!c.atEnd()) { c.parseExpr(); c.emit((vm) => { vm.stack.pop(); }); } c.emit((vm) => vm.host.cls()); return true;
    case 'BEEP': c.p++; c.emit((vm) => vm.host.beep()); return true;
    case 'FADE': c.p++; c.emit((vm) => vm.host.fade?.()); return true;
    case 'GPRINT': {
      // GPRINT x, y, text$ [, color [, size]]
      c.p++;
      c.parseExpr(); c.expect(','); c.parseExpr(); c.expect(','); c.parseExpr();
      if (c.accept(',')) optExpr(c, -1); else c.pushConst(-1);
      if (c.accept(',')) c.parseExpr(); else c.pushConst(1);
      c.emit((vm) => {
        const size = vm.popNum(), col = vm.popNum();
        const t = vm.pop();
        const y = vm.popNum(), x = vm.popNum();
        vm.host.gprint?.(Math.round(x), Math.round(y), typeof t === 'number' ? numText(t) : t, col >= 0 ? Math.round(col) & 15 : vm.host.fg(), Math.round(size));
      });
      return true;
    }
    case 'WIDTH': c.p++; while (!c.atEnd()) c.p++; return true;
    case 'LOCATE': {
      c.p++;
      optExpr(c, -1);
      if (c.accept(',')) optExpr(c, -1); else c.pushConst(-1);
      while (c.accept(',')) { c.parseExpr(); c.emit((vm) => { vm.stack.pop(); }); }
      c.emit((vm) => {
        const col = vm.popNum(), row = vm.popNum();
        vm.host.locate(row < 0 ? null : Math.round(row), col < 0 ? null : Math.round(col));
      });
      return true;
    }
    case 'COLOR': {
      c.p++;
      optExpr(c, -1);
      if (c.accept(',')) optExpr(c, -1); else c.pushConst(-1);
      while (c.accept(',')) { c.parseExpr(); c.emit((vm) => { vm.stack.pop(); }); }
      c.emit((vm) => {
        const bg = vm.popNum(), fg = vm.popNum();
        vm.host.color(fg < 0 ? null : Math.round(fg) & 15, bg < 0 ? null : Math.round(bg) & 15);
      });
      return true;
    }
    case 'SCREEN': {
      c.p++;
      c.parseExpr();
      let two = false;
      if (c.accept(',')) { c.parseExpr(); two = true; }
      while (c.accept(',')) { c.parseExpr(); c.emit((vm) => { vm.stack.pop(); }); }
      c.emit((vm) => {
        let w: number, h: number;
        if (two) { h = vm.popNum(); w = vm.popNum(); }
        else {
          const mode = Math.round(vm.popNum());
          [w, h] = mode >= 9 && mode !== 13 ? [640, 400] : [320, 200];
        }
        vm.host.screen(Math.max(40, Math.min(640, Math.round(w))), Math.max(30, Math.min(400, Math.round(h))));
      });
      return true;
    }
    case 'PSET': case 'PRESET': {
      c.p++;
      const step = parsePoint(c);
      const preset = w === 'PRESET';
      if (c.accept(',')) c.parseExpr(); else c.pushConst(-1);
      c.emit((vm) => {
        const col = vm.popNum(), y = vm.popNum(), x = vm.popNum();
        const X = Math.round(step ? vm.lastX + x : x), Y = Math.round(step ? vm.lastY + y : y);
        vm.lastX = X; vm.lastY = Y;
        vm.host.pset(X, Y, col >= 0 ? Math.round(col) & 15 : preset ? 0 : vm.host.fg());
      });
      return true;
    }
    case 'LINE': {
      if (c.isWord('INPUT', c.peekAt(1))) { c.p += 2; return lineInput(c); }
      c.p++;
      let hasFirst = false, step1 = false;
      if (c.isOp('(') || c.isWord('STEP')) { step1 = parsePoint(c); hasFirst = true; }
      c.expect('-');
      const step2 = parsePoint(c);
      let box: 0 | 1 | 2 = 0;
      if (c.accept(',')) {
        optExpr(c, -1);
        if (c.accept(',')) {
          if (c.accept('BF')) box = 2;
          else if (c.accept('B')) box = 1;
          else c.fail('expected B or BF');
        }
      } else c.pushConst(-1);
      c.emit((vm) => {
        const col = vm.popNum();
        let y2 = vm.popNum(), x2 = vm.popNum();
        let x1 = vm.lastX, y1 = vm.lastY;
        if (hasFirst) {
          const yy = vm.popNum(), xx = vm.popNum();
          x1 = step1 ? vm.lastX + xx : xx;
          y1 = step1 ? vm.lastY + yy : yy;
        }
        if (step2) { x2 += x1; y2 += y1; }
        vm.host.line(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), col >= 0 ? Math.round(col) & 15 : vm.host.fg(), box);
        vm.lastX = Math.round(x2); vm.lastY = Math.round(y2);
      });
      return true;
    }
    case 'CIRCLE': {
      c.p++;
      const step = parsePoint(c);
      c.expect(',');
      c.parseExpr();
      if (c.accept(',')) optExpr(c, -1); else c.pushConst(-1);
      let extra = 0;
      while (c.accept(',')) { optExpr(c, 0); extra++; }
      c.emit((vm) => {
        for (let i = 0; i < extra; i++) vm.stack.pop();
        const col = vm.popNum(), r = vm.popNum(), y = vm.popNum(), x = vm.popNum();
        const X = Math.round(step ? vm.lastX + x : x), Y = Math.round(step ? vm.lastY + y : y);
        vm.host.circle(X, Y, Math.abs(Math.round(r)), col >= 0 ? Math.round(col) & 15 : vm.host.fg());
        vm.lastX = X; vm.lastY = Y;
      });
      return true;
    }
    case 'PAINT': {
      c.p++;
      const step = parsePoint(c);
      if (c.accept(',')) optExpr(c, -1); else c.pushConst(-1);
      if (c.accept(',')) optExpr(c, -1); else c.pushConst(-1);
      c.emit((vm) => {
        const border = vm.popNum(), col = vm.popNum(), y = vm.popNum(), x = vm.popNum();
        const fill = col >= 0 ? Math.round(col) & 15 : vm.host.fg();
        vm.host.paint(Math.round(step ? vm.lastX + x : x), Math.round(step ? vm.lastY + y : y), fill, border >= 0 ? Math.round(border) & 15 : fill);
      });
      return true;
    }
    case 'SOUND': {
      c.p++;
      c.parseExpr();
      c.expect(',');
      c.parseExpr();
      c.emit((vm) => {
        const ticks = vm.popNum(), freq = vm.popNum();
        if (freq < 0 || ticks < 0) throw new BasicError('Illegal function call');
        const dur = ticks / 18.2;
        vm.wait(vm.host.play(freq >= 37 ? [{ freq, start: 0, dur, vol: 0.5, wave: 'square' }] : [], dur, true));
      });
      return true;
    }
    case 'PLAY': {
      c.p++;
      c.parseExpr();
      c.emit((vm) => {
        const src = vm.popStr();
        let r;
        try {
          r = parseMML(src.replace(/M[BF]/gi, ''), vm.mml as never);
        } catch (e) {
          throw new BasicError(e instanceof MmlError ? e.message : 'Illegal function call');
        }
        vm.mml = r.state as unknown as Record<string, unknown>;
        const background = /MB/i.test(src);
        vm.wait(vm.host.play(r.events, r.duration, !background));
      });
      return true;
    }
    case 'SLEEP': {
      c.p++;
      if (c.atEnd()) c.pushConst(-1); else c.parseExpr();
      c.emit((vm) => {
        const s = vm.popNum();
        vm.wait(vm.host.sleep(s <= 0 ? -1 : s * 1000));
      });
      return true;
    }
    case 'RANDOMIZE': {
      c.p++;
      if (c.atEnd()) c.pushConst(Date.now() % 100000); else c.parseExpr();
      c.emit((vm) => vm.randomize(vm.popNum()));
      return true;
    }
    case 'INPUT': c.p++; return input(c);
    case 'WINDOW': {
      // WINDOW "Title", w, h
      c.p++;
      c.parseExpr(); c.expect(','); c.parseExpr(); c.expect(','); c.parseExpr();
      c.emit((vm) => {
        const h = vm.popNum(), w = vm.popNum(), title = vm.popStr();
        vm.host.gui?.window(title, Math.max(60, Math.min(620, Math.round(w))), Math.max(40, Math.min(380, Math.round(h))));
      });
      return true;
    }
    case 'BUTTON': case 'LABEL': case 'TEXTBOX': {
      // BUTTON id, "Text", x, y, w, h
      c.p++;
      const kind = w === 'BUTTON' ? 'button' : w === 'LABEL' ? 'label' : 'textbox';
      c.parseExpr();
      for (let i = 0; i < 5; i++) { c.expect(','); c.parseExpr(); }
      c.emit((vm) => {
        const h = vm.popNum(), ww = vm.popNum(), y = vm.popNum(), x = vm.popNum();
        const text = vm.pop();
        const id = vm.popNum();
        vm.host.gui?.control(kind, Math.round(id), typeof text === 'number' ? numText(text) : text, Math.round(x), Math.round(y), Math.round(ww), Math.round(h));
      });
      return true;
    }
    case 'SETTEXT': {
      c.p++;
      c.parseExpr(); c.expect(','); c.parseExpr();
      c.emit((vm) => {
        const t = vm.pop();
        const id = vm.popNum();
        vm.host.gui?.setText(Math.round(id), typeof t === 'number' ? numText(t) : t);
      });
      return true;
    }
    case 'OPEN': c.p++; return open(c);
    case 'CLOSE': {
      c.p++;
      let n = 0;
      while (!c.atEnd()) {
        c.accept('#');
        c.parseExpr();
        n++;
        if (!c.accept(',')) break;
      }
      c.emit((vm) => {
        const nums = n ? vm.stack.splice(vm.stack.length - n, n).map((x) => Math.round(x as number)) : [...vm.files.keys()];
        const handles = nums.map((k) => vm.files.get(k)).filter((f): f is FileHandle => !!f);
        for (const k of nums) vm.files.delete(k);
        const fs = vm.host.fs;
        const writes = handles.filter((f) => f.mode !== 'input');
        if (fs && writes.length) vm.wait(Promise.all(writes.map((f) => fs.write(f.path, f.out))));
      });
      return true;
    }
    case 'KILL': {
      c.p++;
      c.parseExpr();
      c.emit((vm) => {
        const fs = needFs(vm);
        const p = resolvePath(vm, vm.popStr());
        if (!fs.exists(p)) throw new BasicError('File not found');
        vm.wait(fs.deleteForever(p));
      });
      return true;
    }
    case 'NAME': {
      c.p++;
      c.parseExpr();
      c.expect('AS');
      c.parseExpr();
      c.emit((vm) => {
        const fs = needFs(vm);
        const to = vm.popStr(), from = resolvePath(vm, vm.popStr());
        if (!fs.exists(from)) throw new BasicError('File not found');
        const dest = resolvePath(vm, to);
        vm.wait((async () => {
          const destDir = dest.slice(0, dest.lastIndexOf('/')) || '/';
          const fromDir = from.slice(0, from.lastIndexOf('/')) || '/';
          let p = from;
          if (destDir.toLowerCase() !== fromDir.toLowerCase()) p = await fs.move(from, destDir);
          await fs.rename(p, dest.slice(dest.lastIndexOf('/') + 1));
        })());
      });
      return true;
    }
    case 'MKDIR': {
      c.p++;
      c.parseExpr();
      c.emit((vm) => { const fs = needFs(vm); vm.wait(fs.mkdir(resolvePath(vm, vm.popStr()))); });
      return true;
    }
    case 'CHDIR': {
      c.p++;
      c.parseExpr();
      c.emit((vm) => {
        const fs = needFs(vm);
        const p = resolvePath(vm, vm.popStr());
        if (!fs.isDir(p)) throw new BasicError('Path not found');
        vm.host.cwd = p;
      });
      return true;
    }
    case 'FILES': {
      c.p++;
      if (c.atEnd()) c.pushConst(''); else c.parseExpr();
      c.emit((vm) => {
        const fs = needFs(vm);
        const arg = vm.popStr();
        const dir = arg ? resolvePath(vm, arg) : vm.host.cwd;
        if (!fs.isDir(dir)) throw new BasicError('Path not found');
        vm.out = null;
        vm.write(dir + '\n');
        for (const n of fs.list(dir)) vm.write((n.type === 'dir' ? `${n.name}/` : n.name).padEnd(18) + (n.type === 'dir' ? '<DIR>' : String(n.size)) + '\n');
      });
      return true;
    }
  }
  return false;
}

function input(c: Compiler): boolean {
  if (c.accept('#')) {
    c.parseExpr();
    c.expect(',');
    let n = 0;
    do { c.parseRefTarget(); n++; } while (c.accept(','));
    c.emit((vm) => {
      const refs = vm.stack.splice(vm.stack.length - n, n) as Ref[];
      const f = vm.file(vm.popNum());
      if (f.mode !== 'input') throw new BasicError('Bad file mode');
      for (const r of refs) {
        const field = readFileField(f);
        if (r.kind === 'str') r.set(field);
        else {
          const v = parseNumberField(field);
          r.set(v ?? 0);
        }
      }
    });
    return true;
  }
  c.accept(';');
  let prompt = '';
  let qmark = true;
  if (c.tok.t === 'str' && (c.isOp(';', c.peekAt(1)) || c.isOp(',', c.peekAt(1)))) {
    prompt = c.next().s;
    qmark = c.next().s === ';';
  }
  const full = prompt + (qmark ? '? ' : '');
  let n = 0;
  do { c.parseRefTarget(); n++; } while (c.accept(','));
  c.emit((vm) => {
    vm.out = null;
    const refs = vm.stack.splice(vm.stack.length - n, n) as Ref[];
    doInput(vm, refs, full);
  });
  return true;
}

function lineInput(c: Compiler): boolean {
  if (c.accept('#')) {
    c.parseExpr();
    c.expect(',');
    c.parseRefTarget();
    c.emit((vm) => {
      const ref = vm.stack.pop() as Ref;
      const f = vm.file(vm.popNum());
      if (f.mode !== 'input') throw new BasicError('Bad file mode');
      if (ref.kind !== 'str') throw new BasicError('Type mismatch');
      ref.set(readFileLine(f));
    });
    return true;
  }
  c.accept(';');
  let prompt = '';
  if (c.tok.t === 'str' && (c.isOp(';', c.peekAt(1)) || c.isOp(',', c.peekAt(1)))) {
    prompt = c.next().s;
    c.p++;
  }
  c.parseRefTarget();
  c.emit((vm) => {
    vm.out = null;
    const ref = vm.stack.pop() as Ref;
    if (ref.kind !== 'str') throw new BasicError('Type mismatch');
    vm.write(prompt);
    vm.wait(vm.host.readLine(), (line) => ref.set(line));
  });
  return true;
}

function open(c: Compiler): boolean {
  c.parseExpr();
  c.expect('FOR');
  const m = c.next();
  const mode = m.s === 'INPUT' ? 'input' : m.s === 'OUTPUT' ? 'output' : m.s === 'APPEND' ? 'append' : null;
  if (!mode) c.fail('expected INPUT, OUTPUT or APPEND');
  c.expect('AS');
  c.accept('#');
  c.parseExpr();
  c.emit((vm) => {
    const num = Math.round(vm.popNum());
    const path = resolvePath(vm, vm.popStr());
    if (num < 1 || num > 255) throw new BasicError('Bad file number');
    if (vm.files.has(num)) throw new BasicError('File already open');
    const fs = needFs(vm);
    const h: FileHandle = { path, mode: mode!, text: '', pos: 0, out: '', col: 0 };
    if (mode === 'output') { vm.files.set(num, h); return; }
    const exists = fs.exists(path);
    if (mode === 'input' && !exists) throw new BasicError('File not found');
    if (!exists) { vm.files.set(num, h); return; }
    if (fs.isDir(path)) throw new BasicError('Path/File access error');
    vm.wait(fs.readText(path), (text) => {
      if (mode === 'input') h.text = text;
      else {
        h.out = text;
        const nl = text.lastIndexOf('\n');
        h.col = text.length - nl - 1;
      }
      vm.files.set(num, h);
    });
  });
  return true;
}
