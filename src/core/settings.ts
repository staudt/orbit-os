/** User settings. Synchronous reads from memory; writes persist asynchronously to IndexedDB. */
export interface Settings {
  scale: number; // 0 = auto
  wallpaper: 'sunset' | 'plain' | 'pattern';
  animations: boolean;
  outlineDrag: boolean;
  sound: boolean;
  volume: number; // 0..1
  uiSounds: boolean;
  clock24: boolean;
  proxyUrl: string;
  proxyKey: string;
  iconPositions: Record<string, [number, number]>;
  browserHome: string;
  bookmarks: string[];
  screensaverMinutes: number; // 0 = off
  /** 'cycle', a built-in saver name, or a path to a .BAS program in /Screensavers */
  screensaverMode: string;
  /** bumped when defaults change in a way existing users should get */
  settingsVersion: number;
}

export const DEFAULT_SETTINGS: Settings = {
  scale: 0,
  wallpaper: 'sunset',
  animations: true,
  outlineDrag: true,
  sound: true,
  volume: 0.5,
  uiSounds: true,
  clock24: false,
  proxyUrl: 'https://r.jina.ai/',
  proxyKey: '',
  iconPositions: {},
  browserHome: 'orbit:home',
  bookmarks: [],
  screensaverMinutes: 5,
  screensaverMode: 'cycle',
  settingsVersion: 2,
};

type Listener = (key: keyof Settings) => void;

export class SettingsStore {
  data: Settings = structuredClone(DEFAULT_SETTINGS);
  private listeners = new Set<Listener>();
  private saveFn: ((s: Settings) => Promise<void>) | null = null;
  private pending = 0;

  load(saved: Partial<Settings> | undefined, save: (s: Settings) => Promise<void>) {
    if (saved) this.data = { ...structuredClone(DEFAULT_SETTINGS), ...saved };
    this.saveFn = save;
    // v2: classic outline dragging became the default (saved settings from before had no version)
    if (saved && (saved.settingsVersion ?? 1) < 2) {
      this.data.outlineDrag = true;
      this.data.settingsVersion = 2;
      this.persist();
    }
  }

  get<K extends keyof Settings>(k: K): Settings[K] {
    return this.data[k];
  }

  set<K extends keyof Settings>(k: K, v: Settings[K]) {
    this.data[k] = v;
    for (const l of this.listeners) l(k);
    this.persist();
  }

  onChange(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  reset() {
    this.data = structuredClone(DEFAULT_SETTINGS);
    for (const k of Object.keys(this.data) as (keyof Settings)[]) for (const l of this.listeners) l(k);
    this.persist();
  }

  private persist() {
    if (!this.saveFn) return;
    clearTimeout(this.pending);
    this.pending = window.setTimeout(() => this.saveFn?.(this.data).catch(console.error), 150);
  }
}
