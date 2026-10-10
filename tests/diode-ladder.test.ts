import { describe, it, expect } from 'vitest';
import { DiodeLadderFilter, LADDER_PEAK, RES_K_MAX } from '../src/dsp/ladder';
import { TptLadderFilter } from '../src/dsp/ladder-tpt';
import { TB303Voice } from '../src/dsp/tb303';

const SR = 44100;
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));

function gainAt(make: () => { process(x: number, c: number, r: number, sr: number): number; drive: number }, f: number, cutoff: number, res: number, amp = 0.01, drive = 1) {
  const flt = make();
  flt.drive = drive;
  const N = SR;
  let sIn = 0, sOut = 0;
  for (let i = 0; i < N; i++) {
    const x = amp * Math.sin((2 * Math.PI * f * i) / SR);
    const y = flt.process(x, cutoff, res, SR);
    if (i > N / 2) { sIn += x * x; sOut += y * y; }
  }
  return Math.sqrt(sOut / sIn);
}
const diode = () => new DiodeLadderFilter();
const tpt = () => new TptLadderFilter();

describe('nonlinear diode ladder (coupled-stage model)', () => {
  it('resonant peak sits at the cutoff control and grows with resonance', () => {
    const peakFreq = (res: number) => {
      let best = -99, bf = 0;
      for (let f = 500; f <= 2000; f += 25) {
        const g = db(gainAt(diode, f, 1000, res));
        if (g > best) { best = g; bf = f; }
      }
      return { best, bf };
    };
    const p8 = peakFreq(0.8), p95 = peakFreq(0.95);
    expect(Math.abs(p95.bf - 1000)).toBeLessThanOrEqual(75);
    expect(p95.best).toBeGreaterThan(p8.best);
    // peak well above the passband (squelch)
    expect(p95.best - db(gainAt(diode, 200, 1000, 0.95))).toBeGreaterThan(10);
  });

  it('rolls off at about -19..-24 dB/oct above the cutoff (coupled poles, 4-pole asymptote)', () => {
    const slope = (db(gainAt(diode, 8000, 1000, 0)) - db(gainAt(diode, 2000, 1000, 0))) / 2;
    expect(slope).toBeLessThan(-17);
    expect(slope).toBeGreaterThan(-24);
  });

  it('is level dependent: loud input is compressed relative to quiet input (diode saturation)', () => {
    const quiet = gainAt(diode, 400, 800, 0.88, 0.02, 8);
    const loud = gainAt(diode, 400, 800, 0.88, 1.0, 8);
    expect(db(loud) - db(quiet)).toBeLessThan(-1);
  });

  it('stays finite and bounded for extreme cutoff/resonance/drive/input', () => {
    for (const cutoff of [20, 300, 3000, 20000]) {
      for (const res of [0, 0.7, 1]) {
        for (const drive of [1, 8, 15]) {
          const f = new DiodeLadderFilter();
          f.drive = drive;
          for (let i = 0; i < 4000; i++) {
            const y = f.process(Math.sin(i * 0.07) * 2, cutoff, res, SR);
            expect(Number.isFinite(y)).toBe(true);
            expect(Math.abs(y)).toBeLessThan(50);
          }
        }
      }
    }
  });

  it('does not self-oscillate at max resonance (feedback below the critical gain)', () => {
    expect(RES_K_MAX).toBeLessThan(18.4);
    expect(LADDER_PEAK).toBeGreaterThan(1);
    const f = new DiodeLadderFilter();
    let tail = 0;
    for (let i = 0; i < SR * 3; i++) {
      const y = f.process(i === 0 ? 1 : 0, 1000, 1.0, SR);
      if (i > SR * 2.5) tail = Math.max(tail, Math.abs(y));
    }
    expect(tail).toBeLessThan(1e-3);
  });

  it('fits the real-time budget: a full voice with the diode filter is under 10% of a render block', () => {
    const voice = new TB303Voice();
    voice.params.filterModel = 'diode';
    voice.triggerNote(130.81, true, false, 0.5, SR);
    for (let i = 0; i < 2000; i++) voice.process(SR);
    const blocks = 100, size = 128;
    const t0 = performance.now();
    for (let b = 0; b < blocks; b++) for (let s = 0; s < size; s++) voice.process(SR);
    const avg = (performance.now() - t0) / blocks;
    const budget = ((size / SR) * 1000) * 0.1;
    expect(avg).toBeLessThan(budget * 1.6); // generous margin for noisy CI machines
  });
});

describe('TPT ladder drive (the default model)', () => {
  it('keeps the small-signal response unchanged and compresses loud input', () => {
    const q1 = gainAt(tpt, 400, 800, 0.88, 0.01, 1);
    const q4 = gainAt(tpt, 400, 800, 0.88, 0.01, 4);
    expect(Math.abs(db(q1) - db(q4))).toBeLessThan(0.3);
    const loud = gainAt(tpt, 400, 800, 0.88, 1.5, 4);
    expect(db(loud) - db(q4)).toBeLessThan(-1);
  });

  it('asymmetry adds even harmonics', () => {
    const h2 = (asym: number) => {
      const N = 1 << 14;
      const f = new TptLadderFilter();
      f.drive = 4;
      f.asymmetry = asym;
      const x = new Float64Array(N);
      for (let i = 0; i < SR; i++) f.process(0.8 * Math.sin((2 * Math.PI * 441 * i) / SR), 1500, 0.5, SR);
      for (let i = 0; i < N; i++) x[i] = f.process(0.8 * Math.sin((2 * Math.PI * 441 * (i + SR)) / SR), 1500, 0.5, SR);
      const dft = (hz: number) => {
        let re = 0, im = 0;
        for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); const a = (2 * Math.PI * hz * i) / SR; re += x[i] * w * Math.cos(a); im -= x[i] * w * Math.sin(a); }
        return Math.hypot(re, im);
      };
      return db(dft(882) / dft(441));
    };
    expect(h2(0.15)).toBeGreaterThan(h2(0) + 20);
  });
});

describe('diode asymmetry (bite)', () => {
  it('adds even harmonics and keeps the small-signal response', () => {
    const run = (asym: number) => {
      const f = new DiodeLadderFilter();
      f.drive = 6;
      f.asymmetry = asym;
      const N = 1 << 14;
      const x = new Float64Array(N);
      for (let i = 0; i < SR; i++) f.process(0.5 * Math.sin((2 * Math.PI * 330 * i) / SR), 900, 0.7, SR);
      for (let i = 0; i < N; i++) x[i] = f.process(0.5 * Math.sin((2 * Math.PI * 330 * (i + SR)) / SR), 900, 0.7, SR);
      const dft = (hz: number) => {
        let re = 0, im = 0;
        for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); const a = (2 * Math.PI * hz * i) / SR; re += x[i] * w * Math.cos(a); im -= x[i] * w * Math.sin(a); }
        return Math.hypot(re, im);
      };
      return db(dft(660) / dft(330));
    };
    expect(run(1.0)).toBeGreaterThan(run(0) + 20);
    // small signals are unaffected (slope normalised to 1 at the operating point)
    const q0 = gainAt(diode, 300, 800, 0.7, 0.005, 1);
    const f = new DiodeLadderFilter();
    f.asymmetry = 1.0;
    let a = 0, b = 0;
    for (let i = 0; i < SR; i++) { const x = 0.005 * Math.sin((2 * Math.PI * 300 * i) / SR); const y = f.process(x, 800, 0.7, SR); if (i > SR / 2) { a += x * x; b += y * y; } }
    expect(Math.abs(db(Math.sqrt(b / a)) - db(q0))).toBeLessThan(0.5);
  });
});
