import { Display } from './core/display';
import { Input } from './core/input';
import { Scheduler } from './core/scheduler';
import { SettingsStore, type Settings } from './core/settings';
import { Sound } from './core/sound';
import { BAYER4, Surface } from './core/gfx';
import { cursorImage } from './core/icons';
import { Vfs } from './fs/vfs';
import { seedDisk } from './fs/seed';
import { WindowManager } from './wm/wm';
import { drawSplash } from './wm/splash';
import { appSeedFiles } from './apps';
import { alert } from './ui/dialog';
import { VERSION, invalidate, os } from './os';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function boot() {
  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  const kbd = document.getElementById('kbd') as HTMLTextAreaElement;
  const display = new Display(canvas);
  os.display = display;
  os.version = VERSION;
  if (import.meta.env.DEV) {
    (window as unknown as { orbit: typeof os }).orbit = os;
    import('./apps/registry').then((r) => Object.assign(os, { launch: r.launch }));
  }

  // The splash is shown only while real work happens; no artificial delays.
  let splashStatus = 'Starting…';
  let splashProgress = 0;
  const splash = (p: number, status: string, error = false) => {
    splashProgress = p;
    splashStatus = status;
    drawSplash(display.fb, p, status, error);
    display.present();
  };
  display.onResize = () => drawSplash(display.fb, splashProgress, splashStatus);
  splash(0.05, 'Starting…');

  const settings = new SettingsStore();
  os.settings = settings;
  os.sound = new Sound(settings);

  // 1. disk
  await nextFrame();
  splash(0.25, 'Opening Orbit HD…');
  let fs: Vfs;
  let volatile = false;
  try {
    fs = await Vfs.open();
  } catch (e) {
    console.warn('IndexedDB unavailable, using a temporary in-memory disk', e);
    const { IDBFactory } = await import('fake-indexeddb');
    fs = await Vfs.open(new IDBFactory());
    volatile = true;
  }
  os.fs = fs;

  // 2. settings
  splash(0.5, 'Loading settings…');
  const saved = await fs.getKV<Partial<Settings>>('settings');
  settings.load(saved, (s) => fs.setKV('settings', s));
  if (settings.get('scale')) display.setScaleOverride(settings.get('scale'));

  // 3. first-boot files
  splash(0.7, 'Preparing files…');
  await seedDisk(fs, appSeedFiles());

  // 4. desktop
  splash(0.9, 'Starting desktop…');
  const splashCopy = display.fb.clone();
  const wm = new WindowManager();
  os.wm = wm;
  const scheduler = new Scheduler(() => wm.render(), () => display.presentCursor());
  os.scheduler = scheduler;
  display.onResize = () => {
    wm.onScreenResize();
    invalidate();
  };
  wm.onScreenResize();
  await wm.desktop.refresh();
  fs.watch((c) => {
    if (c.dir.toLowerCase().startsWith('/desktop') || c.dir.toLowerCase().startsWith('/trash') || c.dir === '/') {
      wm.desktop.refresh();
    }
    invalidate();
  });

  settings.onChange((k) => {
    if (k === 'scale') display.setScaleOverride(settings.get('scale'));
    if (k === 'wallpaper') wm.regenWallpaper();
    invalidate();
  });

  const input = new Input(display, kbd);
  os.input = input;
  input.sink = wm;
  display.cursor = cursorImage('arrow');

  // dissolve from the splash into the desktop (non-blocking: input works immediately)
  if (settings.get('animations')) dissolve(splashCopy);
  invalidate();
  os.sound.sfx('chime');

  if (volatile) {
    alert('This browser does not allow Orbit to save files, so Orbit HD is a temporary disk this time. Anything you make will be lost when you close the page.', { icon: 'warning', title: 'Temporary Disk' });
  }
}

function dissolve(from: Surface) {
  const start = performance.now();
  const dur = 260;
  const overlay = (g: { s: Surface }) => {
    const t = (performance.now() - start) / dur;
    const fb = g.s;
    if (from.w !== fb.w || from.h !== fb.h || t >= 1) return;
    const thr = Math.floor(t * 16);
    for (let y = 0; y < fb.h; y++) {
      const row = y * fb.w;
      for (let x = 0; x < fb.w; x++) {
        // 8x8-ish blocky dissolve using the Bayer matrix on 2x2 cells
        if (BAYER4[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] >= thr) fb.px[row + x] = from.px[row + x];
      }
    }
  };
  os.wm.overlays.add(overlay);
  os.scheduler.animate((now) => {
    if (now - start < dur) return true;
    os.wm.overlays.delete(overlay);
    return false;
  });
}

boot().catch((e) => {
  console.error(e);
  try {
    drawSplash(os.display.fb, 0, `Orbit could not start: ${(e as Error).message}`, true);
    os.display.present();
  } catch {
    document.body.textContent = `Orbit could not start: ${(e as Error).message}`;
  }
});
