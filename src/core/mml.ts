import type { NoteEvent, Wave } from './sound';

export interface MmlState {
  tempo: number;
  length: number;
  octave: number;
  volume: number;
  wave: Wave;
  articulation: 'normal' | 'legato' | 'staccato';
}

export class MmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MmlError';
  }
}

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ARTIC: Record<MmlState['articulation'], number> = { normal: 7 / 8, legato: 1, staccato: 3 / 4 };
const MAX_VOICES = 3;

/** Equal temperament, A4 = 440 Hz. semitone 0=C..11=B (may be -1 or 12 for C-/B#). */
export function noteFreq(octave: number, semitone: number): number {
  const idx = Math.max(0, octave * 12 + semitone); // clamp below C0
  return 440 * Math.pow(2, (idx - 57) / 12);
}

function defaultState(init?: Partial<MmlState>): MmlState {
  return {
    tempo: 120, length: 4, octave: 4, volume: 10, wave: 'square', articulation: 'normal',
    ...init,
  };
}

function parseVoice(src: string, init: MmlState, voice: number) {
  const st: MmlState = { ...init };
  const events: NoteEvent[] = [];
  let t = 0;
  let i = 0;

  const readNum = (): number | null => {
    const s = i;
    while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
    return i > s ? parseInt(src.slice(s, i), 10) : null;
  };
  const readDots = (): number => {
    let d = 0;
    while (src[i] === '.') { d++; i++; }
    return 2 - Math.pow(2, -d);
  };
  const range = (n: number | null, lo: number, hi: number, what: string): number => {
    if (n === null) throw new MmlError(`Illegal function call: missing ${what}`);
    if (n < lo || n > hi) throw new MmlError(`Illegal function call: bad ${what} ${n}`);
    return n;
  };
  const secs = (len: number, dots: number) => (4 / len) * (60 / st.tempo) * dots;
  const emit = (freq: number, len: number, dots: number) => {
    const full = secs(len, dots);
    events.push({
      freq, start: t, dur: full * ARTIC[st.articulation],
      vol: st.volume / 15, wave: st.wave, voice,
    });
    t += full;
  };

  while (i < src.length) {
    const c = src[i++];
    if (c in SEMITONES) {
      let semi = SEMITONES[c];
      if (src[i] === '#' || src[i] === '+') { semi++; i++; }
      else if (src[i] === '-') { semi--; i++; }
      const n = readNum();
      const len = n === null ? st.length : range(n, 1, 64, 'length');
      emit(noteFreq(st.octave, semi), len, readDots());
      continue;
    }
    switch (c) {
      case 'N': {
        const n = range(readNum(), 0, 84, 'note');
        const dots = readDots();
        if (n === 0) t += secs(st.length, dots);
        else emit(noteFreq(Math.floor((n - 1) / 12), (n - 1) % 12), st.length, dots);
        break;
      }
      case 'P':
      case 'R': {
        const n = readNum();
        const len = n === null ? st.length : range(n, 1, 64, 'length');
        t += secs(len, readDots());
        break;
      }
      case 'O': st.octave = range(readNum(), 0, 6, 'octave'); break;
      case '>': st.octave = Math.min(6, st.octave + 1); break;
      case '<': st.octave = Math.max(0, st.octave - 1); break;
      case 'L': st.length = range(readNum(), 1, 64, 'length'); break;
      case 'T': st.tempo = range(readNum(), 32, 255, 'tempo'); break;
      case 'V': st.volume = range(readNum(), 0, 15, 'volume'); break;
      case 'M': {
        const m = src[i++];
        if (m === 'N') st.articulation = 'normal';
        else if (m === 'L') st.articulation = 'legato';
        else if (m === 'S') st.articulation = 'staccato';
        else if (m === 'F' || m === 'B') { /* ignored */ }
        else throw new MmlError(`Illegal function call: bad mode M${m ?? ''}`);
        break;
      }
      case 'W': {
        const w = src[i++];
        if (w === 'S') st.wave = 'square';
        else if (w === 'T') st.wave = 'triangle';
        else if (w === 'N') st.wave = 'noise';
        else throw new MmlError(`Illegal function call: bad wave W${w ?? ''}`);
        break;
      }
      default:
        throw new MmlError(`Illegal function call: unexpected '${c}'`);
    }
  }
  return { events, end: t, state: st };
}

/** Parse MML into note events. Voices separated by ';' play simultaneously (max 3). */
export function parseMML(src: string, state?: Partial<MmlState>): { events: NoteEvent[]; duration: number; state: MmlState } {
  const init = defaultState(state);
  const voices = src.replace(/\s+/g, '').toUpperCase().split(';');
  if (voices.length > MAX_VOICES) throw new MmlError(`Illegal function call: too many voices ${voices.length}`);
  const events: NoteEvent[] = [];
  let duration = 0;
  let finalState = init;
  voices.forEach((v, idx) => {
    const r = parseVoice(v, init, idx);
    events.push(...r.events);
    duration = Math.max(duration, r.end);
    if (idx === 0) finalState = r.state;
  });
  return { events, duration, state: finalState };
}
