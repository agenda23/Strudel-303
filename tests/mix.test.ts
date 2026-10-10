import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { TB303Voice } from '../src/dsp/tb303';
import { PRESETS } from '../src/app/presets';
import { softClipCurve } from '../src/strudel/master';

const SR = 44100;

function renderLine(distDrive: number, distType: 'rat' | 'tube' | 'fuzz') {
  const step = 60 / 138 / 4;
  const notes = [36, 36, 48, 43, -1, 39, 41, 36, 36, 48, 46, 39, 41, 43, 48, -1];
  const acc = [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0];
  const v = new TB303Voice();
  Object.assign(v.params, { cutoff: 500, resonance: 0.85, envMod: 0.65, decay: 0.22, distDrive, distType });
  let sum = 0, n = 0, peak = 0;
  for (let loop = 0; loop < 2; loop++) {
    for (let s = 0; s < 16; s++) {
      if (notes[s] > 0) v.triggerNote(440 * Math.pow(2, (notes[s] - 69) / 12), !!acc[s], false, step * 0.85, SR);
      for (let i = 0; i < step * SR; i++) {
        const y = v.process(SR);
        if (loop === 1) { sum += y * y; n++; peak = Math.max(peak, Math.abs(y)); }
      }
    }
  }
  return { rms: Math.sqrt(sum / n), peak };
}

describe('I-1: distortion is level-matched', () => {
  const dry = renderLine(0, 'rat');
  for (const type of ['rat', 'tube', 'fuzz'] as const) {
    for (const drive of [0.05, 0.25, 0.5, 0.85, 1]) {
      it(`${type} drive ${drive}: RMS within ±3 dB of dry, peak within +6 dB`, () => {
        const wet = renderLine(drive, type);
        const rmsDb = 20 * Math.log10(wet.rms / dry.rms);
        const peakDb = 20 * Math.log10(wet.peak / dry.peak);
        expect(Math.abs(rmsDb)).toBeLessThan(3);
        expect(peakDb).toBeLessThan(6);
      });
    }
  }
});

describe('I-2: default 303 level', () => {
  it('plain line peaks well below full scale at default gain', () => {
    expect(renderLine(0, 'rat').peak).toBeLessThan(1.0);
    expect(renderLine(0, 'rat').rms).toBeGreaterThan(0.08);
  });
});

describe('I-3: soft clip curve', () => {
  const c = softClipCurve();
  it('never exceeds the ceiling, is odd-symmetric and monotonic', () => {
    for (let i = 0; i < c.length; i++) expect(Math.abs(c[i])).toBeLessThanOrEqual(0.98 + 1e-6);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1] - 1e-9);
    expect(c[0]).toBeCloseTo(-c[c.length - 1], 6);
  });
  it('is transparent (linear) below the knee', () => {
    const mid = c.length >> 1;
    const x = (i: number) => (i / (c.length - 1)) * 2 - 1;
    for (const i of [mid + 200, mid + 600, mid + 1200]) expect(c[i]).toBeCloseTo(x(i) * 0.98, 3);
  });
});

describe('H: presets and sample song follow the conventions', () => {
  const codes: [string, string][] = [
    ...Object.entries(PRESETS).map(([k, p]) => [`preset ${k}`, p.code] as [string, string]),
    ['docs/examples/acid-techno-138.js', fs.readFileSync('docs/examples/acid-techno-138.js', 'utf8')],
  ];
  for (const [name, code] of codes) {
    it(`${name}: scale degrees stay within 0..8 (no semitone-style 12/14)`, () => {
      const lines = code.split('\n').filter((l) => /\bn\(/.test(l));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) {
        const m = l.match(/n\("([^"]*)"\)/);
        if (!m) continue;
        const nums = m[1].match(/-?\d+/g)?.map(Number) ?? [];
        for (const v of nums) expect(v).toBeLessThanOrEqual(8);
      }
    });
    it(`${name}: cut(1) is only on hat/cymbal blocks and drums carry gains`, () => {
      for (const l of code.split('\n').filter((x) => x.includes('RolandTR909'))) {
        expect(l).toMatch(/gain\(/);
        if (l.includes('.cut(1)')) expect(l).not.toMatch(/\b(bd|cp|rm)\b/);
      }
    });
    it(`${name}: no delay/room`, () => {
      expect(code).not.toMatch(/\.(delay|room)\(/);
    });
  }
});
