import { describe, it, expect } from 'vitest';
import { planTrigger, initialSlideState, resolveFrequency, noteNameToMidi } from '../src/strudel/trigger';
import { TB303Voice } from '../src/dsp/tb303';

const STEP = 0.25;

describe('slide planning (bridge level)', () => {
  it('slide=1 ties into the immediately following note (spec rule 3)', () => {
    const st = initialSlideState();
    const a = planTrigger({ note: 36, slide: 1 }, 10, STEP, st)!;
    const b = planTrigger({ note: 48 }, 10 + STEP, STEP, st)!;
    expect(a.slide).toBe(false);
    expect(a.gateDuration).toBeGreaterThanOrEqual(STEP * 1.05 - 1e-9);
    expect(b.slide).toBe(true);
  });

  it('slide does not carry across a rest', () => {
    const st = initialSlideState();
    planTrigger({ note: 36, slide: 1 }, 10, STEP, st);
    const c = planTrigger({ note: 48 }, 10 + 2 * STEP, STEP, st)!; // one step rest in between
    expect(c.slide).toBe(false);
  });

  it('slide is consumed by one note only', () => {
    const st = initialSlideState();
    planTrigger({ note: 36, slide: 1 }, 10, STEP, st);
    planTrigger({ note: 38 }, 10 + STEP, STEP, st);
    const c = planTrigger({ note: 40 }, 10 + 2 * STEP, STEP, st)!;
    expect(c.slide).toBe(false);
  });

  it('plain notes use legato (default 0.85) or clip', () => {
    const st = initialSlideState();
    expect(planTrigger({ note: 36 }, 0, STEP, st)!.gateDuration).toBeCloseTo(STEP * 0.85);
    expect(planTrigger({ note: 36, clip: 1 }, 1, STEP, st)!.gateDuration).toBeCloseTo(STEP);
  });

  it('parameters never stick between notes', () => {
    const st = initialSlideState();
    const a = planTrigger({ note: 36, tbcut: 2500, tbdist: 0.9 }, 0, STEP, st)!;
    const b = planTrigger({ note: 36 }, 1, STEP, st)!;
    expect(a.params.cutoff).toBe(2500);
    expect(b.params.cutoff).toBe(400);
    expect(b.params.distDrive).toBe(0);
  });

  it('end-to-end: a note after a rest following slide=1 is audible', () => {
    const sr = 44100;
    const voice = new TB303Voice();
    const st = initialSlideState();
    const a = planTrigger({ note: 36, slide: 1 }, 0, STEP, st)!;
    voice.triggerNote(a.freq, a.accent, a.slide, a.gateDuration, sr);
    for (let i = 0; i < Math.floor(2 * STEP * sr); i++) voice.process(sr);
    const c = planTrigger({ note: 48 }, 2 * STEP, STEP, st)!;
    voice.triggerNote(c.freq, c.accent, c.slide, c.gateDuration, sr);
    let peak = 0;
    for (let i = 0; i < Math.floor(0.1 * sr); i++) peak = Math.max(peak, Math.abs(voice.process(sr)));
    expect(peak).toBeGreaterThan(0.05);
  });
});

describe('Strudel-compatible pitch resolution', () => {
  it('note names follow Strudel octave convention (c3 = 48)', () => {
    expect(noteNameToMidi('c3')).toBe(48);
    expect(noteNameToMidi('eb2')).toBe(39);
    expect(noteNameToMidi('f#1')).toBe(30);
  });
  it('note number, name, freq and octave shift', () => {
    expect(resolveFrequency({ note: 69 }).freq).toBeCloseTo(440);
    expect(resolveFrequency({ note: 'a4' }).freq).toBeCloseTo(440);
    expect(resolveFrequency({ freq: 220 }).freq).toBe(220);
    expect(resolveFrequency({ note: 69, octave: 1 }).freq).toBeCloseTo(880);
  });
  it('bare n is flagged as legacy semitones above C2', () => {
    const r = resolveFrequency({ n: 12 });
    expect(r.legacyN).toBe(true);
    expect(r.freq).toBeCloseTo(440 * Math.pow(2, (48 - 69) / 12));
  });
  it('default pitch is C2 like superdough', () => {
    expect(resolveFrequency({}).freq).toBeCloseTo(65.406, 2);
  });
});

describe('distortion bypass', () => {
  it('distEnabled=false returns the dry signal', () => {
    const sr = 44100;
    const run = (enabled: boolean) => {
      const v = new TB303Voice();
      v.params = { ...v.params, distDrive: 0.9, distEnabled: enabled };
      v.triggerNote(110, false, false, 0.2, sr);
      let sum = 0;
      for (let i = 0; i < 2000; i++) sum += v.process(sr);
      return sum;
    };
    expect(run(false)).not.toBeCloseTo(run(true), 3);
  });
});
