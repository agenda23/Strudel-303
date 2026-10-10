import { describe, it, expect } from 'vitest';
import { TptLadderFilter as DiodeLadderFilter } from '../src/dsp/ladder-tpt';
import { PolyBlepOscillator } from '../src/dsp/polyblep';
import { TB303Voice, softLimit } from '../src/dsp/tb303';

const SR = 44100;
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));

function gainAt(f: number, cutoff: number, res: number, amp = 0.02) {
  const flt = new DiodeLadderFilter();
  const N = SR;
  let sIn = 0, sOut = 0;
  for (let i = 0; i < N; i++) {
    const x = amp * Math.sin((2 * Math.PI * f * i) / SR);
    const y = flt.process(x, cutoff, res, SR);
    if (i > N / 2) { sIn += x * x; sOut += y * y; }
  }
  return Math.sqrt(sOut / sIn);
}

describe('TB-303 filter character (measured)', () => {
  it('rolls off at about 18 dB/oct (not the 24 dB/oct of a plain 4-pole ladder)', () => {
    const slope = (db(gainAt(8000, 1000, 0)) - db(gainAt(2000, 1000, 0))) / 2;
    expect(slope).toBeLessThan(-16);
    expect(slope).toBeGreaterThan(-20);
  });

  it('resonance peak grows with the knob and gets strongly resonant near the top', () => {
    const peak = (res: number) => {
      let best = -99;
      for (let f = 600; f <= 1400; f += 25) best = Math.max(best, db(gainAt(f, 1000, res)));
      return best;
    };
    expect(peak(0.5)).toBeLessThan(peak(0.8));
    expect(peak(0.8)).toBeLessThan(peak(0.95));
    expect(peak(0.95)).toBeGreaterThan(10);
  });

  it('resonance thins the low end (feedback loss), as on the real filter', () => {
    expect(db(gainAt(100, 1000, 0.85))).toBeLessThan(db(gainAt(100, 1000, 0)) - 6);
  });

  it('keeps more bass at high resonance (feedback highpass) and does not self-oscillate at res 1.0', () => {
    // low-note fundamentals through a low cutoff: a plain ladder loses ~13 dB here
    expect(db(gainAt(55, 300, 0.85))).toBeGreaterThan(-10);
    const f = new DiodeLadderFilter();
    let tail = 0;
    for (let i = 0; i < SR * 3; i++) {
      const y = f.process(i === 0 ? 1 : 0, 1000, 1.0, SR);
      if (i > SR * 2.5) tail = Math.max(tail, Math.abs(y));
    }
    expect(tail).toBeLessThan(1e-3);
  });

  it('stays finite for extreme settings', () => {
    for (const cutoff of [20, 200, 2000, 15000]) {
      for (const res of [0, 0.7, 1]) {
        const f = new DiodeLadderFilter();
        for (let i = 0; i < 5000; i++) {
          const y = f.process(Math.sin(i * 0.05) * 1.5, cutoff, res, SR);
          expect(Number.isFinite(y)).toBe(true);
          expect(Math.abs(y)).toBeLessThan(10);
        }
      }
    }
  });
});

describe('oscillator alias floor in the audible filter range', () => {
  function fftMag(x: Float64Array) {
    const n = x.length;
    const re = Float64Array.from(x), im = new Float64Array(n);
    for (let i = 1, j = 0; i < n; i++) {
      let b = n >> 1;
      for (; j & b; b >>= 1) j ^= b;
      j ^= b;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const a = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k), wi = Math.sin(a * k);
        const ur = re[i + k], ui = im[i + k], xr = re[i + k + len / 2], xi = im[i + k + len / 2];
        const vr = xr * wr - xi * wi, vi = xr * wi + xi * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
    return Array.from(re, (r, i) => r * r + im[i] * im[i]);
  }
  for (const wave of ['saw', 'square'] as const) {
    for (const f0 of [110, 523.25]) {
      it(`${wave} ${f0} Hz: non-harmonic energy below 5 kHz is under -45 dB`, () => {
        const N = 1 << 14;
        const osc = new PolyBlepOscillator();
        for (let i = 0; i < 4000; i++) osc.process(f0, SR, wave);
        const x = new Float64Array(N);
        for (let i = 0; i < N; i++) x[i] = osc.process(f0, SR, wave) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
        const p = fftMag(x);
        let tot = 0, alias = 0;
        for (let k = 1; k < N / 2; k++) {
          const f = (k * SR) / N;
          tot += p[k];
          const h = Math.round(f / f0);
          const harmonic = h >= 1 && Math.abs(f - h * f0) < (4 * SR) / N;
          if (!harmonic && f < 5000) alias += p[k];
        }
        expect(10 * Math.log10(alias / tot)).toBeLessThan(-45);
      });
    }
  }
});

describe('accent, slide and envelope behaviour (measured)', () => {
  const step = 60 / 138 / 4;
  const linePeaks = (accent: boolean, count: number, params: any) => {
    const v = new TB303Voice();
    Object.assign(v.params, params);
    const peaks: number[] = [];
    for (let n = 0; n < count; n++) {
      v.triggerNote(65.4, accent, false, step * 0.85, SR);
      let pk = 0;
      for (let i = 0; i < step * SR; i++) pk = Math.max(pk, Math.abs(v.process(SR)));
      peaks.push(pk);
    }
    return peaks;
  };
  const params = { cutoff: 300, resonance: 0.8, envMod: 0.5, decay: 0.3 };

  it('an accented note is clearly louder than a plain one', () => {
    const ratio = linePeaks(true, 1, params)[0] / linePeaks(false, 1, params)[0];
    expect(ratio).toBeGreaterThan(1.3);
    expect(ratio).toBeLessThan(2.5);
  });

  it('consecutive accents build up (accent sweep) and then saturate', () => {
    const p = linePeaks(true, 8, params);
    expect(p[3]).toBeGreaterThan(p[0]);
    expect(Math.abs(p[7] - p[6])).toBeLessThan(0.02);
  });

  it('the accented filter sweep is short regardless of a long DECAY setting', () => {
    const megAt = (accent: boolean, t: number) => {
      const v: any = new TB303Voice();
      Object.assign(v.params, { cutoff: 300, resonance: 0.3, envMod: 1.0, decay: 1.5 });
      v.triggerNote(65.4, accent, false, 1.0, SR);
      for (let i = 0; i < t * SR; i++) v.process(SR);
      return v.megLevel;
    };
    // after 0.4 s the plain sweep is still mostly open, the accented one has mostly closed
    expect(megAt(false, 0.4)).toBeGreaterThan(0.7);
    expect(megAt(true, 0.4)).toBeLessThan(0.3);
  });

  it('slide glides to ~95% of the target in tbslidetime and never retriggers envelopes', () => {
    const v: any = new TB303Voice();
    Object.assign(v.params, { cutoff: 4000, resonance: 0.1, envMod: 0, decay: 1, slideTime: 0.06 });
    v.triggerNote(65.4, false, false, 0.3, SR);
    for (let i = 0; i < 0.2 * SR; i++) v.process(SR);
    const megBefore = v.megLevel;
    v.triggerNote(130.8, false, true, 0.2, SR);
    let at60 = 0;
    for (let i = 0; i < 0.12 * SR; i++) {
      v.process(SR);
      if (i === Math.floor(0.06 * SR)) at60 = v.currentPitch;
    }
    const progress = (at60 - 65.4) / (130.8 - 65.4);
    expect(progress).toBeGreaterThan(0.9);
    expect(progress).toBeLessThan(1.0);
    expect(v.megLevel).toBeLessThanOrEqual(megBefore);
  });

  it('the filter envelope decays exponentially with the DECAY time constant', () => {
    const v: any = new TB303Voice();
    Object.assign(v.params, { cutoff: 300, resonance: 0.5, envMod: 1.0, decay: 0.3 });
    v.triggerNote(65.4, false, false, 1.0, SR);
    const at: Record<string, number> = {};
    for (let i = 0; i <= 0.31 * SR; i++) {
      v.process(SR);
      if (i === Math.floor(0.01 * SR)) at.a = v.megLevel;
      if (i === Math.floor(0.31 * SR)) at.b = v.megLevel;
    }
    // 0.3 s later the level should have dropped by e^-1
    expect(at.b / at.a).toBeCloseTo(Math.exp(-1), 1);
  });
});

describe('output level consistency', () => {
  it('softLimit is transparent below the knee and never exceeds full scale', () => {
    for (const x of [-0.5, -0.1, 0, 0.3, 0.79]) expect(softLimit(x)).toBeCloseTo(x, 9);
    let prev = -Infinity;
    for (let x = -5; x <= 5; x += 0.05) {
      const y = softLimit(x);
      expect(Math.abs(y)).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it('a loud resonant accent line stays within full scale and saw/square levels match within 2 dB', () => {
    const step = 60 / 136 / 4;
    const notes = [33, 33, 45, 33, 33, 40, 33, 45, 33, 33, 45, 33, 38, 40, 33, 43];
    const run = (waveform: 'saw' | 'square') => {
      const v = new TB303Voice();
      Object.assign(v.params, { cutoff: 600, resonance: 0.88, envMod: 0.85, decay: 0.2, waveform, distDrive: 0.25 });
      let sum = 0, n = 0, peak = 0;
      for (let loop = 0; loop < 3; loop++) {
        for (let s = 0; s < 16; s++) {
          v.triggerNote(440 * Math.pow(2, (notes[s] - 69) / 12), s % 4 === 0, false, step * 0.5, SR);
          for (let i = 0; i < step * SR; i++) {
            const y = v.process(SR);
            if (loop >= 1) { sum += y * y; n++; peak = Math.max(peak, Math.abs(y)); }
          }
        }
      }
      return { rms: Math.sqrt(sum / n), peak };
    };
    const saw = run('saw'), square = run('square');
    expect(saw.peak).toBeLessThanOrEqual(1);
    expect(square.peak).toBeLessThanOrEqual(1);
    expect(Math.abs(20 * Math.log10(square.rms / saw.rms))).toBeLessThan(2);
  });
});

describe('DC offset', () => {
  it('asymmetric saturation does not leave a DC offset at the voice output', () => {
    const v = new TB303Voice();
    Object.assign(v.params, { cutoff: 800, resonance: 0.8, envMod: 0.6, decay: 0.3, filterDrive: 1 });
    let sum = 0, n = 0;
    for (let note = 0; note < 12; note++) {
      v.triggerNote(55, false, false, 0.15, SR);
      for (let i = 0; i < 0.25 * SR; i++) { const y = v.process(SR); if (note >= 2) { sum += y; n++; } }
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.004);
  });
});

describe('note-to-note continuity controls', () => {
  const SR2 = 44100;
  const levelAfterGate = (release?: number) => {
    const v = new TB303Voice();
    Object.assign(v.params, { cutoff: 1500, resonance: 0.2, envMod: 0, decay: 1, vegRelease: release });
    v.triggerNote(110, false, false, 0.05, SR2);
    for (let i = 0; i < 0.05 * SR2 + 0.03 * SR2; i++) v.process(SR2); // 30 ms after the gate closed
    let s = 0;
    for (let i = 0; i < 200; i++) s += v.process(SR2) ** 2;
    return Math.sqrt(s / 200);
  };

  it('tbrel lengthens the amplitude release (more overlap between notes)', () => {
    expect(levelAfterGate(0.06)).toBeGreaterThan(levelAfterGate(0.015) * 3);
  });

  it('tbglide adds a short pitch lag on non-slide notes and is off by default', () => {
    const pitchAfter = (glide?: number) => {
      const v: any = new TB303Voice();
      Object.assign(v.params, { cutoff: 2000, resonance: 0.2, envMod: 0, decay: 1, glide });
      v.triggerNote(110, false, false, 0.2, SR2);
      for (let i = 0; i < 0.1 * SR2; i++) v.process(SR2);
      v.triggerNote(220, false, false, 0.2, SR2); // non-slide note, voice still sounding
      const samples: number[] = [];
      for (let i = 0; i < 0.02 * SR2; i++) { v.process(SR2); samples.push(v.currentPitch); }
      return samples;
    };
    const off = pitchAfter(undefined);
    expect(off[0]).toBe(220); // instant
    const on = pitchAfter(0.01);
    expect(on[0]).toBeLessThan(150); // starts near the old pitch
    expect(on[on.length - 1]).toBeGreaterThan(215); // arrives within ~20 ms
    for (let i = 1; i < on.length; i++) expect(on[i]).toBeGreaterThanOrEqual(on[i - 1] - 1e-9); // monotonic glide
  });
});

describe('slide curve (RC on the pitch control voltage)', () => {
  const timeToHalf = (from: number, to: number, curve: 'log' | 'hz') => {
    const v: any = new TB303Voice();
    Object.assign(v.params, { cutoff: 900, resonance: 0.4, envMod: 0, decay: 1, slideTime: 0.06, slideCurve: curve });
    v.triggerNote(from, false, false, 0.5, SR);
    for (let i = 0; i < 0.2 * SR; i++) v.process(SR);
    v.triggerNote(to, false, true, 0.5, SR);
    for (let i = 0; i < 0.2 * SR; i++) {
      v.process(SR);
      if (Math.log2(v.currentPitch / from) / Math.log2(to / from) >= 0.5) return (i / SR) * 1000;
    }
    return Infinity;
  };

  it('is symmetric up and down in semitones (log), unlike the old linear-Hz glide', () => {
    const up = timeToHalf(55, 110, 'log');
    const down = timeToHalf(110, 55, 'log');
    expect(Math.abs(up - down)).toBeLessThan(0.5);
    // the old behaviour was clearly asymmetric
    expect(Math.abs(timeToHalf(55, 110, 'hz') - timeToHalf(110, 55, 'hz'))).toBeGreaterThan(3);
  });

  it('reaches 95% of the interval (in cents) at slideTime for any interval size', () => {
    for (const [a, b] of [[55, 65], [55, 110], [55, 220], [220, 55]]) {
      const v: any = new TB303Voice();
      Object.assign(v.params, { cutoff: 900, resonance: 0.4, envMod: 0, decay: 1, slideTime: 0.06 });
      v.triggerNote(a, false, false, 0.5, SR);
      for (let i = 0; i < 0.2 * SR; i++) v.process(SR);
      v.triggerNote(b, false, true, 0.5, SR);
      for (let i = 0; i < 0.06 * SR; i++) v.process(SR);
      const prog = Math.log2(v.currentPitch / a) / Math.log2(b / a);
      expect(prog).toBeGreaterThan(0.93);
      expect(prog).toBeLessThan(0.97);
    }
  });
});
