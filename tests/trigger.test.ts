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

describe('filter model controls', () => {
  it('tbfilter / tbdrive reach the voice parameters and default to the previous sound', () => {
    const st = initialSlideState();
    const base = planTrigger({ note: 36 }, 0, 0.25, st)!;
    expect(base.params.filterModel).toBe('tpt');
    expect(base.params.filterDrive).toBeUndefined();
    const p = planTrigger({ note: 36, tbfilter: 'diode', tbdrive: 0.4 }, 1, 0.25, st)!;
    expect(p.params.filterModel).toBe('diode');
    expect(p.params.filterDrive).toBeCloseTo(0.4);
    expect(planTrigger({ note: 36, tbasym: 0.9 }, 4, 0.25, st)!.params.filterAsym).toBeCloseTo(0.9);
    expect(planTrigger({ note: 36, tbfilter: 'nonsense', tbdrive: 9 }, 2, 0.25, st)!.params.filterModel).toBe('tpt');
    expect(planTrigger({ note: 36, tbdrive: 9 }, 3, 0.25, st)!.params.filterDrive).toBe(1);
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

describe('chained slides (legato runs across several notes)', () => {
  it('a run of slide=1 notes glides through every note without retriggering the envelopes', () => {
    const SR = 44100;
    const step = 60 / 138 / 4;
    const midi = [33, 45, 40, 52, 45, 57, 52, 45, 38, 33];
    const slide = [1, 1, 1, 1, 1, 1, 1, 0, 0, 0];
    const st = initialSlideState();
    const v: any = new TB303Voice();
    Object.assign(v.params, { cutoff: 500, resonance: 0.8, envMod: 0.7, decay: 0.35, slideTime: 0.06 });
    const into: boolean[] = [];
    for (let i = 0; i < midi.length; i++) {
      const plan = planTrigger({ note: midi[i], slide: slide[i], accent: i === 2 || i === 5 ? 1 : 0 }, i * step, step, st, {})!;
      into.push(plan.slide);
      v.applyNoteParams(plan.params, plan.explicit);
      v.triggerNote(plan.freq, plan.accent, plan.slide, plan.gateDuration, SR);
      const from = v.currentPitch;
      let maxMegRise = 0, minVeg = 9, at60 = 0;
      for (let n = 0; n < step * SR; n++) {
        const m0 = v.megLevel;
        v.process(SR);
        maxMegRise = Math.max(maxMegRise, v.megLevel - m0);
        minVeg = Math.min(minVeg, v.vegLevel);
        if (n === Math.floor(0.06 * SR)) at60 = v.currentPitch;
      }
      if (i >= 1 && i <= 7) {
        // glided into: no MEG retrigger, VCA stays open, pitch ~95% of the way in 60 ms
        expect(maxMegRise).toBeLessThan(1e-6);
        if (i <= 6) expect(minVeg).toBeGreaterThan(0.95);
        expect((at60 - from) / (plan.freq - from)).toBeGreaterThan(0.9);
      }
    }
    expect(into).toEqual([false, true, true, true, true, true, true, true, false, false]);
  });
});
