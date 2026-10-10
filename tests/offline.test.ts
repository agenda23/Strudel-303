import { describe, it, expect } from 'vitest';
import { renderTB303Haps, analyzeSignal, type RenderHap } from '../src/strudel/offline';

const CPS = 138 / 60 / 4;

function bar(notes: (number | null)[], extra: Record<string, any> = {}): RenderHap[] {
  const step = 1 / notes.length;
  return notes.flatMap((n, i) =>
    n === null ? [] : [{ begin: i * step, end: (i + 1) * step, value: { s: 'tb303', note: n, ...extra } }],
  );
}

describe('renderTB303Haps', () => {
  it('renders audible, finite audio of the expected length', () => {
    const haps = bar([36, 36, 48, 43, null, 39, 41, 36, 36, 48, 46, 39, 41, 43, 48, null], { tbcut: 600, tbres: 0.8 });
    const audio = renderTB303Haps(haps, CPS, 1, 44100);
    expect(audio.length).toBeGreaterThan(44100 * (1 / CPS));
    expect(audio.every(Number.isFinite)).toBe(true);
    const m = analyzeSignal(audio, 44100, CPS);
    expect(m.peak).toBeGreaterThan(0.1);
    expect(m.peak).toBeLessThan(1);
    expect(m.clipSamples).toBe(0);
    expect(m.activeFraction).toBeGreaterThan(0.5);
    expect(m.centroidHz).toBeGreaterThan(100);
  });

  it('applies the slide tie: a slid note keeps the envelope running (quieter retrigger transient)', () => {
    const plain = renderTB303Haps(bar([36, 48, null, null]), CPS, 1);
    const slid = renderTB303Haps(bar([36, 48, null, null], { slide: 1 }), CPS, 1);
    expect(slid.length).toBe(plain.length);
    expect(slid).not.toEqual(plain);
  });

  it('is deterministic', () => {
    const haps = bar([36, 39, 41, 43]);
    expect(renderTB303Haps(haps, CPS, 1)).toEqual(renderTB303Haps(haps, CPS, 1));
  });
});

describe('analyzeSignal', () => {
  it('counts clipping and per-cycle rms', () => {
    const sr = 44100;
    const x = new Float32Array(sr * 2).fill(0);
    for (let i = 0; i < sr; i++) x[i] = i % 2 ? 1.2 : -1.2;
    const m = analyzeSignal(x, sr, 1);
    expect(m.clipSamples).toBe(sr);
    expect(m.peak).toBeCloseTo(1.2, 2);
    expect(m.cycleRms.length).toBe(2);
    expect(m.cycleRms[0]).toBeGreaterThan(1);
    expect(m.cycleRms[1]).toBe(0);
    expect(m.activeFraction).toBeCloseTo(0.5, 1);
  });
});
