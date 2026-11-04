import type { SettingsStore } from './settings';

export type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine' | 'noise';

export interface NoteEvent {
  /** Hz; 0 = rest */
  freq: number;
  /** seconds from playback start */
  start: number;
  /** seconds */
  dur: number;
  /** 0..1 */
  vol?: number;
  wave?: Wave;
  voice?: number;
}

export type SfxName = 'click' | 'open' | 'close' | 'minimize' | 'restore' | 'error' | 'trash' | 'chime' | 'alert' | 'beep';

export interface PlayHandle {
  stop(): void;
  /** resolves when playback finishes or is stopped */
  done: Promise<void>;
  /** seconds since start */
  elapsed(): number;
  duration: number;
}

/** Small chiptune synth on WebAudio: square/triangle/noise voices with a simple envelope. */
export class Sound {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private settings: SettingsStore;
  private lastClick = 0;

  constructor(settings: SettingsStore) {
    this.settings = settings;
    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    settings.onChange((k) => {
      if (k === 'volume' && this.master) this.master.gain.value = this.volume();
    });
  }

  /** True once the browser allows audio (after a user gesture). */
  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private volume() {
    return this.settings.get('sound') ? this.settings.get('volume') * 0.35 : 0;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume();
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Schedule one note at absolute context time `t`. */
  private voice(t: number, freq: number, dur: number, vol: number, wave: Wave, slideTo = 0) {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master || dur <= 0) return null;
    const g = ctx.createGain();
    const a = 0.004, r = Math.min(0.04, dur * 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + Math.max(a, dur - r));
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(master);
    let src: AudioScheduledSourceNode;
    if (wave === 'noise') {
      const b = ctx.createBufferSource();
      b.buffer = this.noiseBuf;
      b.loop = true;
      if (freq > 0) b.playbackRate.value = Math.max(0.05, Math.min(4, freq / 1000));
      src = b;
    } else {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      src = o;
    }
    src.connect(g);
    src.start(t);
    src.stop(t + dur + 0.01);
    return src;
  }

  tone(freq: number, dur: number, vol = 0.5, wave: Wave = 'square', slideTo = 0) {
    if (!this.settings.get('sound')) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.voice(ctx.currentTime + 0.005, freq, dur, vol, wave, slideTo);
  }

  /** Play a list of note events (used by BASIC PLAY and the Music app). */
  play(events: NoteEvent[]): PlayHandle {
    const ctx = this.ensure();
    const duration = events.reduce((m, e) => Math.max(m, e.start + e.dur), 0);
    if (!ctx || !this.settings.get('sound')) {
      // still honour timing so programs that wait for music behave the same when muted
      let stop = () => {};
      const done = new Promise<void>((res) => {
        const id = setTimeout(res, duration * 1000);
        stop = () => { clearTimeout(id); res(); };
      });
      const t0 = performance.now();
      return { stop, done, elapsed: () => (performance.now() - t0) / 1000, duration };
    }
    const t0 = ctx.currentTime + 0.03;
    const srcs: AudioScheduledSourceNode[] = [];
    for (const e of events) {
      if (e.freq <= 0 && e.wave !== 'noise') continue;
      const s = this.voice(t0 + e.start, e.freq, e.dur, (e.vol ?? 0.5) * 0.6, e.wave ?? 'square');
      if (s) srcs.push(s);
    }
    let resolve: () => void = () => {};
    const done = new Promise<void>((res) => { resolve = res; });
    const timer = setTimeout(resolve, (duration + 0.05) * 1000);
    return {
      duration,
      done,
      elapsed: () => Math.max(0, ctx.currentTime - t0),
      stop: () => {
        clearTimeout(timer);
        for (const s of srcs) { try { s.stop(); } catch { /* already stopped */ } }
        resolve();
      },
    };
  }

  /** UI sound effects. Silent unless sounds and UI sounds are enabled and audio is unlocked. */
  sfx(name: SfxName) {
    if (!this.settings.get('sound')) return;
    if (name !== 'chime' && name !== 'beep' && name !== 'alert' && !this.settings.get('uiSounds')) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    const v = (f: number, at: number, d: number, vol: number, w: Wave = 'square', slide = 0) => this.voice(t + at, f, d, vol, w, slide);
    switch (name) {
      case 'click': {
        const now = performance.now();
        if (now - this.lastClick < 40) return;
        this.lastClick = now;
        v(1800, 0, 0.012, 0.12, 'square');
        break;
      }
      case 'open':
        v(523, 0, 0.04, 0.18, 'triangle'); v(659, 0.035, 0.04, 0.18, 'triangle'); v(784, 0.07, 0.06, 0.18, 'triangle');
        break;
      case 'close':
        v(784, 0, 0.035, 0.16, 'triangle'); v(523, 0.035, 0.05, 0.16, 'triangle');
        break;
      case 'minimize':
        v(700, 0, 0.12, 0.14, 'triangle', 260);
        break;
      case 'restore':
        v(300, 0, 0.12, 0.14, 'triangle', 760);
        break;
      case 'error':
        v(196, 0, 0.09, 0.22, 'square'); v(165, 0.11, 0.14, 0.22, 'square');
        break;
      case 'alert':
        v(880, 0, 0.07, 0.18, 'square'); v(660, 0.08, 0.1, 0.18, 'square');
        break;
      case 'beep':
        v(800, 0, 0.25, 0.25, 'square');
        break;
      case 'trash':
        v(1200, 0, 0.09, 0.2, 'noise'); v(120, 0.02, 0.08, 0.15, 'square', 60);
        break;
      case 'chime': {
        const notes = [392, 523, 659, 784, 1047];
        notes.forEach((f, i) => v(f, i * 0.08, 0.5 - i * 0.05, 0.16, 'triangle'));
        v(196, 0, 0.7, 0.12, 'square');
        v(262, 0.32, 0.5, 0.08, 'square');
        break;
      }
    }
  }
}
