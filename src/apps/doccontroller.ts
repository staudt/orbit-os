import type { Content } from '../fs/vfs';
import { basename, dirname, extname } from '../fs/vfs';
import { fileDialog } from '../ui/filedialog';
import { alert, messageBox } from '../ui/dialog';
import type { Window } from '../wm/window';
import { os } from '../os';

export interface DocOpts {
  win: Window;
  appName: string;
  /** extensions this app can open (upper-case) */
  exts: string[];
  defaultExt: string;
  typeLabel: string;
  defaultDir: string;
  untitled: string;
  /** produce file content for `path` (the extension may pick a format) */
  serialize: (path: string) => Content | Promise<Content>;
  /** load content read from `path` */
  deserialize: (path: string, content: Content) => void;
  isDirty: () => boolean;
  markClean: () => void;
  /** formats the app can save to besides its own (e.g. TXT); defaults to exts */
  saveExts?: string[];
}

/** Shared open / save / save-as / unsaved-changes logic for document apps. */
export class DocController {
  path: string | null = null;
  o: DocOpts;

  constructor(o: DocOpts) {
    this.o = o;
    o.win.onCloseRequest = () => this.confirmClose();
    this.updateTitle();
  }

  get name() {
    return this.path ? basename(this.path) : this.o.untitled;
  }

  updateTitle() {
    const t = `${this.name}${this.o.isDirty() ? '*' : ''} - ${this.o.appName}`;
    if (this.o.win.title !== t) this.o.win.setTitle(t);
  }

  async load(path: string): Promise<boolean> {
    try {
      const c = await os.fs.read(path);
      this.o.deserialize(path, c);
      this.path = path;
      this.o.markClean();
      this.updateTitle();
      return true;
    } catch (e) {
      await alert(`Could not open "${basename(path)}":\n${(e as Error).message}`, { icon: 'error', parent: this.o.win });
      return false;
    }
  }

  async open() {
    if (!(await this.confirmDiscard())) return;
    const p = await fileDialog({ mode: 'open', exts: this.o.exts, typeLabel: this.o.typeLabel, dir: this.path ? dirname(this.path) : this.o.defaultDir, parent: this.o.win });
    if (p) await this.load(p);
  }

  async save(): Promise<boolean> {
    if (!this.path) return this.saveAs();
    try {
      await os.fs.write(this.path, await this.o.serialize(this.path));
      this.o.markClean();
      this.updateTitle();
      return true;
    } catch (e) {
      await alert(`Could not save:\n${(e as Error).message}`, { icon: 'error', parent: this.o.win });
      return false;
    }
  }

  async saveAs(): Promise<boolean> {
    const exts = this.o.saveExts ?? this.o.exts;
    const suggested = this.path ? basename(this.path) : `${this.o.untitled}.${this.o.defaultExt}`;
    const p = await fileDialog({
      mode: 'save', exts, typeLabel: this.o.typeLabel, name: suggested,
      dir: this.path ? dirname(this.path) : this.o.defaultDir, parent: this.o.win, defaultExt: this.o.defaultExt,
    });
    if (!p) return false;
    if (!exts.includes(extname(p))) {
      await alert(`${this.o.appName} can save as ${exts.map((e) => '.' + e).join(', ')}.`, { icon: 'warning', parent: this.o.win });
      return false;
    }
    this.path = p;
    return this.save();
  }

  /** Ask to save unsaved changes. Resolves true when it's OK to continue. */
  async confirmDiscard(): Promise<boolean> {
    if (!this.o.isDirty()) return true;
    const r = await messageBox(`Save changes to "${this.name}"?`, {
      title: this.o.appName, icon: 'question', buttons: ['Save', "Don't Save", 'Cancel'], defaultButton: 0, cancelButton: 2, parent: this.o.win,
    });
    if (r.button === 2) return false;
    if (r.button === 0) return this.save();
    return true;
  }

  async confirmClose(): Promise<boolean> {
    return this.confirmDiscard();
  }

  async newDoc(reset: () => void) {
    if (!(await this.confirmDiscard())) return;
    reset();
    this.path = null;
    this.o.markClean();
    this.updateTitle();
  }
}
