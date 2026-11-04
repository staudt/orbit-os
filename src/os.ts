import type { Display } from './core/display';
import type { Scheduler } from './core/scheduler';
import type { Input } from './core/input';
import type { SettingsStore } from './core/settings';
import type { Sound } from './core/sound';
import type { Vfs } from './fs/vfs';
import type { WindowManager } from './wm/wm';

/** Global system services, populated during boot. */
export interface OrbitOS {
  display: Display;
  scheduler: Scheduler;
  input: Input;
  settings: SettingsStore;
  sound: Sound;
  fs: Vfs;
  wm: WindowManager;
  version: string;
}

export const os = {} as OrbitOS;
export const VERSION = '1.0';

export function invalidate() {
  os.scheduler?.invalidate();
}
