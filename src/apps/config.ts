import { registerApp, launch } from './registry';
import { saverPrograms, SAVER_DIR } from '../wm/screensaver';
import { basename } from '../fs/vfs';
import { Window } from '../wm/window';
import { Tabs } from '../ui/tabs';
import { Button, Checkbox, GroupBox, Label, Slider, TextField, radioGroup } from '../ui/widgets';
import { alert, confirm } from '../ui/dialog';
import { makeDiskImage, readDiskImage } from '../fs/diskimage';
import { downloadBlob, pickFiles } from '../fs/importexport';
import { formatBytes } from '../wm/topbar';
import { DEFAULT_SETTINGS } from '../core/settings';
import { os } from '../os';

let instance: Window | null = null;

function open(tab = 0) {
  if (instance && !instance.closed) {
    os.wm.activate(instance);
    return;
  }
  const win = new Window({ title: 'Config', icon: 'config', app: 'config', w: 300, h: 188, resizable: false, maximizable: false });
  instance = win;
  const S = os.settings;
  const tabs = win.body.add(new Tabs());
  win.body.layoutFn = (p) => tabs.setBounds(6, 6, p.w - 12, p.h - 12);

  // ---- Display
  tabs.addPage('Display', (p) => {
    if (p.children.length || p.w <= 0) return;
    const g1 = p.add(new GroupBox('Pixel size'));
    g1.setBounds(6, 6, p.w - 12, 50);
    const scales = [0, 1, 2, 3, 4, 5].map((s) => ({ text: s === 0 ? 'Auto' : `${s}×`, value: String(s) }));
    const rg = radioGroup(scales, String(S.get('scale')), (v) => S.set('scale', Number(v)));
    rg.forEach((cb, i) => { g1.add(cb).setBounds(8 + i * 44, 14, 42, 11); });
    const info = g1.add(new Label('', { color: 11 }));
    info.setBounds(8, 30, p.w - 30, 12);
    const upd = () => {
      const L = os.display.layout;
      info.setText(`Now ${L.w}×${L.h} logical pixels, each ${L.scale} device pixel${L.scale > 1 ? 's' : ''} wide`);
    };
    upd();
    os.display.onResizeHooks.add(upd);
    win.onClosed = () => { os.display.onResizeHooks.delete(upd); instance = null; };

    const g2 = p.add(new GroupBox('Wallpaper'));
    g2.setBounds(6, 62, p.w - 12, 28);
    const wg = radioGroup(
      [{ text: 'Sunset', value: 'sunset' }, { text: 'Plain', value: 'plain' }, { text: 'Pattern', value: 'pattern' }],
      S.get('wallpaper'),
      (v) => S.set('wallpaper', v as 'sunset'),
    );
    wg.forEach((cb, i) => g2.add(cb).setBounds(8 + i * 70, 13, 66, 11));

    p.add(new Checkbox('Animate windows', S.get('animations'), (v) => S.set('animations', v))).setBounds(8, 98, 120, 11);
    p.add(new Checkbox('Drag outlines (classic)', S.get('outlineDrag'), (v) => S.set('outlineDrag', v))).setBounds(8, 113, 140, 11);
  });

  // ---- Screen saver
  tabs.addPage('Saver', (p) => {
    if (p.children.length || p.w <= 0) return;
    const g1 = p.add(new GroupBox('Start after'));
    g1.setBounds(6, 6, p.w - 12, 28);
    const mins = [0, 1, 5, 10, 30].map((m) => ({ text: m === 0 ? 'Never' : `${m} min`, value: String(m) }));
    radioGroup(mins, String(S.get('screensaverMinutes')), (v) => S.set('screensaverMinutes', Number(v)))
      .forEach((cb, i) => g1.add(cb).setBounds(8 + i * 54, 13, 52, 11));
    const g2 = p.add(new GroupBox('Show'));
    g2.setBounds(6, 40, p.w - 12, 58);
    const progs = saverPrograms();
    const options = progs.length
      ? [{ text: 'Take turns', value: 'cycle' }, ...progs.map((f) => ({ text: basename(f).replace(/\.BAS$/i, '').toLowerCase().replace(/^./, (c) => c.toUpperCase()), value: f }))]
      : [{ text: 'Take turns', value: 'cycle' }, { text: 'Bouncing logo', value: 'bounce' }, { text: 'Space flight', value: 'flight' }, { text: 'Orbits', value: 'orbits' }, { text: 'Ribbons', value: 'mystify' }];
    let current = S.get('screensaverMode');
    if (!options.some((o) => o.value === current)) current = 'cycle';
    radioGroup(options, current, (v) => { S.set('screensaverMode', v); current = v; })
      .forEach((cb, i) => g2.add(cb).setBounds(8 + (i % 3) * 90, 13 + Math.floor(i / 3) * 14, 88, 11));
    p.add(new Button('Edit…', () => {
      const f = current.startsWith('/') ? current : progs[0];
      if (f) launch('basic', { path: f });
    })).setBounds(78, 104, 52, 16);
    p.add(new Button('Open Folder', () => launch('files', { path: SAVER_DIR }))).setBounds(134, 104, 72, 16);
    p.add(new Button('Preview', () => setTimeout(() => os.wm.screensaver.start(), 300))).setBounds(8, 104, 64, 16);
    p.add(new Label('Screensavers are BASIC programs in /Screensavers: edit them or add your own.', { color: 11, wrap: true, valign: 'top' })).setBounds(8, 124, p.w - 16, 22);
  });

  // ---- Sound
  tabs.addPage('Sound', (p) => {
    if (p.children.length || p.w <= 0) return;
    p.add(new Checkbox('Sound on', S.get('sound'), (v) => S.set('sound', v))).setBounds(8, 10, 100, 11);
    p.add(new Checkbox('Interface sounds (clicks, windows)', S.get('uiSounds'), (v) => S.set('uiSounds', v))).setBounds(8, 26, 200, 11);
    p.add(new Label('Volume')).setBounds(8, 46, 40, 12);
    p.add(new Slider(S.get('volume'), (v) => S.set('volume', v))).setBounds(52, 46, 140, 12);
    p.add(new Button('Test', () => os.sound.sfx('chime'))).setBounds(200, 44, 50, 16);
  });

  // ---- Clock
  tabs.addPage('Clock', (p) => {
    if (p.children.length || p.w <= 0) return;
    p.add(new Checkbox('Use 24-hour clock', S.get('clock24'), (v) => S.set('clock24', v))).setBounds(8, 10, 140, 11);
    p.add(new Label('The clock and date come from your computer.', { color: 11, wrap: true, valign: 'top' })).setBounds(8, 30, p.w - 16, 24);
  });

  // ---- Network
  tabs.addPage('Network', (p) => {
    if (p.children.length || p.w <= 0) return;
    p.add(new Label('Internet Navigator reads web pages through a reader proxy that returns plain text. It must allow cross-origin requests.', { wrap: true, valign: 'top' })).setBounds(8, 6, p.w - 16, 32);
    p.add(new Label('Proxy URL')).setBounds(8, 44, 60, 14);
    const url = p.add(new TextField(S.get('proxyUrl'), { onChange: (t) => S.set('proxyUrl', t) }));
    url.setBounds(70, 44, p.w - 78, 14);
    p.add(new Label('API key')).setBounds(8, 64, 60, 14);
    const key = p.add(new TextField(S.get('proxyKey'), { placeholder: '(optional)', onChange: (t) => S.set('proxyKey', t) }));
    key.setBounds(70, 64, p.w - 78, 14);
    p.add(new Label('The key is stored only in this browser.', { color: 11 })).setBounds(70, 80, p.w - 78, 12);
    p.add(new Button('Default', () => { url.setText(DEFAULT_SETTINGS.proxyUrl); S.set('proxyUrl', DEFAULT_SETTINGS.proxyUrl); })).setBounds(p.w - 64, 100, 56, 16);
  });

  // ---- Disk
  tabs.addPage('Disk', (p) => {
    if (p.children.length || p.w <= 0) return;
    const usage = p.add(new Label(''));
    usage.setBounds(8, 6, p.w - 16, 12);
    const refresh = () => {
      const { files, dirs } = os.fs.count();
      usage.setText(`Orbit HD: ${formatBytes(os.fs.usage())} in ${files} files and ${dirs} folders`);
    };
    refresh();
    const unwatch = os.fs.watch(refresh);
    const prevClosed = win.onClosed;
    win.onClosed = () => { unwatch(); prevClosed?.(); };

    p.add(new Label('Back up the whole disk to a .zip file on your computer, or restore one.', { wrap: true, valign: 'top', color: 11 })).setBounds(8, 22, p.w - 16, 22);
    p.add(new Button('Back Up…', async () => {
      const data = await makeDiskImage(os.fs);
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      downloadBlob(`orbit-disk-${stamp}.zip`, new Blob([data as BlobPart], { type: 'application/zip' }));
    })).setBounds(8, 48, 72, 16);
    p.add(new Button('Restore…', async () => {
      const [f] = await pickFiles('.zip,application/zip', false);
      if (!f) return;
      let entries;
      try {
        entries = readDiskImage(new Uint8Array(await f.arrayBuffer()));
      } catch {
        await alert('That file is not a valid disk image.', { icon: 'error', parent: win });
        return;
      }
      if (!(await confirm(`Replace everything on Orbit HD with the ${entries.length} items in "${f.name}"?`, { icon: 'warning', ok: 'Replace', parent: win }))) return;
      await os.fs.restoreAll(entries);
      await os.wm.desktop.refresh();
      await alert('The disk was restored.', { parent: win });
    })).setBounds(86, 48, 72, 16);

    p.add(new GroupBox('Factory reset')).setBounds(6, 74, p.w - 12, 56);
    p.add(new Label('Erase all files and settings and start fresh.', { color: 11 })).setBounds(14, 88, p.w - 28, 12);
    p.add(new Button('Erase Disk…', async () => {
      if (!(await confirm('Erase ALL files and settings? This cannot be undone.', { icon: 'warning', ok: 'Erase', parent: win }))) return;
      await os.fs.wipe();
      await os.fs.setKV('seeded', false);
      os.settings.reset();
      await os.fs.setKV('settings', os.settings.data);
      location.reload();
    })).setBounds(14, 106, 80, 16);
  });

  tabs.select(tab);
  os.wm.open(win);
  win.focusWidget(tabs);
}

registerApp({
  id: 'config',
  name: 'Config',
  icon: 'config',
  description: 'Settings for display, sound, clock, network and disk.',
  launch: ({ args }) => open(Number(args?.tab ?? 0)),
});
