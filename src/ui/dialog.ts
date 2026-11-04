import { SANS, wrapText } from '../core/fonts';
import { icon } from '../core/icons';
import { Window } from '../wm/window';
import { Button, ImageView, Label, TextField } from './widgets';
import { os } from '../os';

export interface MsgOpts {
  title?: string;
  icon?: 'info' | 'warning' | 'error' | 'question' | string;
  buttons?: string[];
  /** index of the default (Enter) button */
  defaultButton?: number;
  /** index returned by Escape / close box */
  cancelButton?: number;
  parent?: Window | null;
  input?: { value: string; placeholder?: string; selectAll?: boolean };
  width?: number;
}

export interface MsgResult {
  button: number;
  value: string;
}

/** Generic modal message box. Resolves with the pressed button index (and input text). */
export function messageBox(message: string, o: MsgOpts = {}): Promise<MsgResult> {
  return new Promise((resolve) => {
    const buttons = o.buttons ?? ['OK'];
    const parent = o.parent ?? os.wm.active ?? null;
    const textW = o.width ?? Math.min(240, Math.max(140, SANS.measure(message) + 4));
    const lines = wrapText(SANS, message, textW);
    const textH = Math.max(32, lines.length * 10);
    const hasInput = !!o.input;
    const btnW = Math.max(56, ...buttons.map((b) => SANS.measure(b) + 18));
    const bodyW = Math.max(52 + textW + 10, buttons.length * (btnW + 6) + 14);
    const bodyH = 10 + textH + (hasInput ? 20 : 0) + 30;
    const win = new Window({
      title: o.title ?? 'Orbit',
      w: bodyW,
      h: bodyH,
      resizable: false,
      minimizable: false,
      maximizable: false,
      modalFor: parent,
      center: true,
      icon: o.icon ?? 'info',
    });
    const ic = o.icon ?? 'info';
    const img = win.body.add(new ImageView(icon(ic, 32)));
    img.setBounds(10, 10, 32, 32);
    const label = win.body.add(new Label(message, { wrap: true, valign: 'top' }));
    label.setBounds(52, 12, textW, textH);
    let field: TextField | null = null;
    if (o.input) {
      field = win.body.add(new TextField(o.input.value, { placeholder: o.input.placeholder }));
      field.setBounds(52, 12 + textH + 2, bodyW - 62, 14);
      if (o.input.selectAll !== false) field.selectAll();
    }
    let done = false;
    const finish = (i: number) => {
      if (done) return;
      done = true;
      resolve({ button: i, value: field?.text ?? '' });
      os.wm.close(win, true);
    };
    const cancel = o.cancelButton ?? buttons.length - 1;
    const def = o.defaultButton ?? 0;
    let bx = bodyW - 10;
    const btns: Button[] = [];
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = win.body.add(new Button(buttons[i], () => finish(i), { isDefault: i === def }));
      bx -= btnW;
      b.setBounds(bx, bodyH - 24, btnW, 16);
      bx -= 8;
      btns[i] = b;
    }
    win.onKey = (e) => {
      if (e.key === 'Enter') { finish(def); return true; }
      if (e.key === 'Escape') { finish(cancel); return true; }
      return false;
    };
    if (field) field.onSubmit = () => finish(def);
    win.onCloseRequest = () => { finish(cancel); return true; };
    os.wm.open(win);
    win.focusWidget(field ?? btns[def] ?? null);
    if (ic === 'error' || ic === 'warning') os.sound.sfx('alert');
  });
}

export async function alert(message: string, o: Omit<MsgOpts, 'buttons'> = {}): Promise<void> {
  await messageBox(message, { ...o, buttons: ['OK'] });
}

export async function confirm(message: string, o: MsgOpts & { ok?: string; cancel?: string } = {}): Promise<boolean> {
  const r = await messageBox(message, { icon: 'question', ...o, buttons: [o.ok ?? 'OK', o.cancel ?? 'Cancel'], defaultButton: 0, cancelButton: 1 });
  return r.button === 0;
}

export async function prompt(message: string, value = '', o: MsgOpts & { ok?: string } = {}): Promise<string | null> {
  const r = await messageBox(message, {
    icon: 'question',
    width: 200,
    ...o,
    buttons: [o.ok ?? 'OK', 'Cancel'],
    defaultButton: 0,
    cancelButton: 1,
    input: { value, selectAll: true },
  });
  return r.button === 0 ? r.value : null;
}
