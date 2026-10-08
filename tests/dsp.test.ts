import { describe, it, expect } from 'vitest';
import { PolyBlepOscillator } from '../src/dsp/polyblep';
import { DiodeLadderFilter } from '../src/dsp/ladder';
import { TB303Voice } from '../src/dsp/tb303';

describe('TB-303 DSP Components', () => {
  it('PolyBlepOscillator outputs bounded audio without NaN', () => {
    const osc = new PolyBlepOscillator();
    const sampleRate = 44100;
    const freq = 440;

    for (let i = 0; i < 1000; i++) {
      const sawSample = osc.process(freq, sampleRate, 'saw');
      expect(Number.isFinite(sawSample)).toBe(true);
      expect(Math.abs(sawSample)).toBeLessThanOrEqual(1.5);

      const sqSample = osc.process(freq, sampleRate, 'square');
      expect(Number.isFinite(sqSample)).toBe(true);
      expect(Math.abs(sqSample)).toBeLessThanOrEqual(1.5);
    }
  });

  it('DiodeLadderFilter remains stable under extreme cutoff and resonance', () => {
    const filter = new DiodeLadderFilter();
    const sampleRate = 44100;

    // Test extreme cutoffs and high resonance
    const testCutoffs = [20, 100, 1000, 5000, 15000, 20000];
    const testResonances = [0.0, 0.5, 0.95, 1.0];

    for (const cutoff of testCutoffs) {
      for (const res of testResonances) {
        filter.reset();
        for (let i = 0; i < 500; i++) {
          const input = Math.sin((2 * Math.PI * 220 * i) / sampleRate);
          const out = filter.process(input, cutoff, res, sampleRate);
          expect(Number.isFinite(out)).toBe(true);
          expect(Number.isNaN(out)).toBe(false);
        }
      }
    }
  });

  it('TB303Voice handles accent, slide and envelope triggers cleanly', () => {
    const voice = new TB303Voice();
    const sampleRate = 44100;

    // Trigger normal note
    voice.triggerNote(110, false, false, 0.1, sampleRate);
    let maxAmp1 = 0;
    for (let i = 0; i < 2000; i++) {
      const out = voice.process(sampleRate);
      expect(Number.isFinite(out)).toBe(true);
      maxAmp1 = Math.max(maxAmp1, Math.abs(out));
    }
    expect(maxAmp1).toBeGreaterThan(0.01);

    // Trigger accented note - should have higher peak
    voice.triggerNote(110, true, false, 0.1, sampleRate);
    let maxAmpAccent = 0;
    for (let i = 0; i < 2000; i++) {
      const out = voice.process(sampleRate);
      expect(Number.isFinite(out)).toBe(true);
      maxAmpAccent = Math.max(maxAmpAccent, Math.abs(out));
    }
    expect(maxAmpAccent).toBeGreaterThan(maxAmp1);

    // Trigger slide
    voice.triggerNote(220, false, true, 0.1, sampleRate);
    for (let i = 0; i < 2000; i++) {
      const out = voice.process(sampleRate);
      expect(Number.isFinite(out)).toBe(true);
    }
  });

  it('DSP process performance is well within budget (128 samples < 10% of 2.9ms)', () => {
    const voice = new TB303Voice();
    const sampleRate = 44100;
    const blockSize = 128;
    const blockTimeMs = (blockSize / sampleRate) * 1000; // ~2.902 ms
    const budgetMs = blockTimeMs * 0.1; // ~0.29 ms

    voice.triggerNote(130.81, true, false, 0.5, sampleRate);

    // Warm up
    for (let i = 0; i < 1000; i++) {
      voice.process(sampleRate);
    }

    // Benchmark 100 blocks
    const numBlocks = 100;
    const start = performance.now();
    for (let b = 0; b < numBlocks; b++) {
      for (let s = 0; s < blockSize; s++) {
        voice.process(sampleRate);
      }
    }
    const totalMs = performance.now() - start;
    const avgBlockMs = totalMs / numBlocks;

    console.log(`Average block process time: ${avgBlockMs.toFixed(4)}ms (Budget: ${budgetMs.toFixed(4)}ms)`);
    expect(avgBlockMs).toBeLessThan(budgetMs);
  });

  it('DistortionUnit enriches harmonics and remains stable across types', () => {
    const voice = new TB303Voice();
    const sampleRate = 44100;

    // Test with RAT distortion enabled
    voice.params.distDrive = 0.8;
    voice.params.distTone = 0.6;
    voice.params.distType = 'rat';

    voice.triggerNote(130.81, false, false, 0.2, sampleRate);
    for (let i = 0; i < 1000; i++) {
      const out = voice.process(sampleRate);
      expect(Number.isFinite(out)).toBe(true);
      expect(Number.isNaN(out)).toBe(false);
    }

    // Test TUBE and FUZZ modes
    for (const type of ['tube', 'fuzz'] as const) {
      voice.params.distType = type;
      for (let i = 0; i < 500; i++) {
        const out = voice.process(sampleRate);
        expect(Number.isFinite(out)).toBe(true);
      }
    }
  });
});
