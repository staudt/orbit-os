import { describe, it, expect } from 'vitest';
import { parseMML, noteFreq, MmlError } from '../src/core/mml';

describe('noteFreq', () => {
  it('A4 = 440', () => expect(noteFreq(4, 9)).toBeCloseTo(440, 5));
  it('C4 ~ 261.63', () => expect(noteFreq(4, 0)).toBeCloseTo(261.63, 2));
  it('octave extremes', () => {
    expect(noteFreq(0, 0)).toBeCloseTo(16.35, 2);
    expect(noteFreq(6, 0)).toBeCloseTo(1046.5, 1);
  });
  it('clamps below C0', () => expect(noteFreq(0, -1)).toBeCloseTo(noteFreq(0, 0), 5));
});

describe('parseMML', () => {
  it('parses a simple note', () => {
    const r = parseMML('A');
    expect(r.events).toHaveLength(1);
    expect(r.events[0].freq).toBeCloseTo(440, 5);
    expect(r.events[0].start).toBe(0);
    expect(r.duration).toBeCloseTo(0.5, 5);
  });
  it('case-insensitive and ignores whitespace', () => {
    expect(parseMML(' c d\n e ').events).toHaveLength(3);
  });
  it('lengths', () => {
    expect(parseMML('C8').duration).toBeCloseTo(0.25, 5);
    expect(parseMML('C1').duration).toBeCloseTo(2, 5);
    expect(parseMML('L8 C').duration).toBeCloseTo(0.25, 5);
  });
  it('dots', () => {
    expect(parseMML('C4.').duration).toBeCloseTo(0.75, 5);
    expect(parseMML('C4..').duration).toBeCloseTo(0.875, 5);
  });
  it('tempo math', () => {
    expect(parseMML('T60 C4').duration).toBeCloseTo(1, 5);
    expect(parseMML('T240 C4').duration).toBeCloseTo(0.25, 5);
  });
  it('rests advance time without events', () => {
    const r = parseMML('P4 R8 C4');
    expect(r.events).toHaveLength(1);
    expect(r.events[0].start).toBeCloseTo(0.75, 5);
    expect(parseMML('P').duration).toBeCloseTo(0.5, 5);
    expect(parseMML('P4.').duration).toBeCloseTo(0.75, 5);
  });
  it('articulations', () => {
    expect(parseMML('C4').events[0].dur).toBeCloseTo(0.5 * 7 / 8, 5);
    expect(parseMML('ML C4').events[0].dur).toBeCloseTo(0.5, 5);
    expect(parseMML('MS C4').events[0].dur).toBeCloseTo(0.375, 5);
    expect(parseMML('MS C4').duration).toBeCloseTo(0.5, 5);
    expect(parseMML('MS MN MF MB C4').events[0].dur).toBeCloseTo(0.4375, 5);
  });
  it('octave commands', () => {
    expect(parseMML('O5 A').events[0].freq).toBeCloseTo(880, 5);
    expect(parseMML('>A').events[0].freq).toBeCloseTo(880, 5);
    expect(parseMML('<A').events[0].freq).toBeCloseTo(220, 5);
  });
  it('octave clamping', () => {
    expect(parseMML('O6 >> C').events[0].freq).toBeCloseTo(noteFreq(6, 0), 5);
    expect(parseMML('O0 << C').events[0].freq).toBeCloseTo(noteFreq(0, 0), 5);
  });
  it('N notes', () => {
    expect(parseMML('N46').events[0].freq).toBeCloseTo(440 * 0 + noteFreq(3, 9), 5);
    expect(parseMML('N1').events[0].freq).toBeCloseTo(noteFreq(0, 0), 5);
    expect(parseMML('N49').events[0].freq).toBeCloseTo(noteFreq(4, 0), 5);
    const r = parseMML('N0 N49');
    expect(r.events).toHaveLength(1);
    expect(r.events[0].start).toBeCloseTo(0.5, 5);
    expect(parseMML('L8 N49.').duration).toBeCloseTo(0.375, 5);
  });
  it('sharps and flats', () => {
    expect(parseMML('C#').events[0].freq).toBeCloseTo(noteFreq(4, 1), 5);
    expect(parseMML('D-').events[0].freq).toBeCloseTo(noteFreq(4, 1), 5);
    expect(parseMML('F+').events[0].freq).toBeCloseTo(noteFreq(4, 6), 5);
    expect(parseMML('B#').events[0].freq).toBeCloseTo(noteFreq(5, 0), 5);
    expect(parseMML('O0 C-').events[0].freq).toBeCloseTo(noteFreq(0, 0), 5);
    expect(parseMML('C#8').duration).toBeCloseTo(0.25, 5);
  });
  it('multi-voice timing', () => {
    const r = parseMML('C4 C4 ; E1');
    expect(r.events).toHaveLength(3);
    expect(r.events.filter(e => e.voice === 1)).toHaveLength(1);
    expect(r.events[2].start).toBe(0);
    expect(r.duration).toBeCloseTo(2, 5);
  });
  it('voices start from initial state', () => {
    const r = parseMML('T60 O5 C ; C');
    expect(r.events[1].freq).toBeCloseTo(noteFreq(4, 0), 5);
    expect(r.events[1].dur).toBeCloseTo(0.4375, 5);
  });
  it('rejects more than 3 voices', () => {
    expect(() => parseMML('C;C;C;C')).toThrow(MmlError);
  });
  it('state carry-over', () => {
    const a = parseMML('T90 O3 L8 MS');
    expect(a.state).toMatchObject({ tempo: 90, octave: 3, length: 8, articulation: 'staccato' });
    const b = parseMML('C', a.state);
    expect(b.events[0].freq).toBeCloseTo(noteFreq(3, 0), 5);
    expect(b.duration).toBeCloseTo((4 / 8) * (60 / 90), 5);
  });
  it('returns first voice state', () => {
    expect(parseMML('O2 ; O5').state.octave).toBe(2);
  });
  it('volume and wave', () => {
    const e = parseMML('V15 C V0 D').events;
    expect(e[0].vol).toBeCloseTo(1, 5);
    expect(e[1].vol).toBe(0);
    expect(parseMML('C').events[0].vol).toBeCloseTo(10 / 15, 5);
    expect(parseMML('C').events[0].wave).toBe('square');
    expect(parseMML('WT C WN D WS E').events.map(x => x.wave)).toEqual(['triangle', 'noise', 'square']);
  });
  it('errors', () => {
    expect(() => parseMML('O9')).toThrow(/bad octave 9/);
    expect(() => parseMML('T10')).toThrow(MmlError);
    expect(() => parseMML('L0')).toThrow(MmlError);
    expect(() => parseMML('C65')).toThrow(MmlError);
    expect(() => parseMML('N85')).toThrow(MmlError);
    expect(() => parseMML('V16')).toThrow(MmlError);
    expect(() => parseMML('X')).toThrow(MmlError);
    expect(() => parseMML('MQ')).toThrow(MmlError);
    expect(() => parseMML('WX')).toThrow(MmlError);
    expect(() => parseMML('O')).toThrow(MmlError);
  });
  it('empty input', () => {
    const r = parseMML('');
    expect(r.events).toEqual([]);
    expect(r.duration).toBe(0);
  });
});
