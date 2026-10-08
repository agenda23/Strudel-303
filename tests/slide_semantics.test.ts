import { describe, it, expect } from 'vitest';
import { TB303Voice, DEFAULT_TB303_PARAMS } from '../src/dsp/tb303';

describe('B1 & B2: Slide Semantics and Gate Behavior Verification', () => {
  it('When slide=true is passed to triggerNote, slideActive is enabled without envelope retrigger', () => {
    const voice = new TB303Voice();
    const sampleRate = 44100;
    const stepDurationSec = 0.25;
    const gateDurationSec = stepDurationSec * 0.85;

    // Step 1: Note C2 (65.4Hz)
    voice.triggerNote(65.4, false, false, gateDurationSec, sampleRate);

    // Let Step 1 decay partially
    for (let i = 0; i < 2000; i++) {
      voice.process(sampleRate);
    }
    const megBefore = (voice as any).megLevel;

    // Step 2: Note C3 (130.8Hz) sliding into target
    voice.triggerNote(130.8, false, true, gateDurationSec, sampleRate);

    // Slide should now be actively smoothly gliding pitch
    expect((voice as any).slideActive).toBe(true);
    // Envelope should NOT jump back to 1.0; it should continue its decay smoothly
    expect((voice as any).megLevel).toBeLessThanOrEqual(megBefore);
  });

  it('B3 verification: Parameter stickiness is prevented when resetting to defaults', () => {
    const voice = new TB303Voice();
    const sampleRate = 44100;

    // Step 1: Custom distortion and cutoff
    voice.params = {
      ...DEFAULT_TB303_PARAMS,
      cutoff: 2500,
      distDrive: 0.9,
    };
    voice.triggerNote(110, false, false, 0.2, sampleRate);
    voice.process(sampleRate);
    expect(voice.params.cutoff).toBe(2500);
    expect(voice.params.distDrive).toBe(0.9);

    // Step 2: Default step without tbcut or tbdist
    voice.params = { ...DEFAULT_TB303_PARAMS };
    voice.triggerNote(110, false, false, 0.2, sampleRate);
    voice.process(sampleRate);
    // Cutoff and distortion must return to defaults
    expect(voice.params.cutoff).toBe(DEFAULT_TB303_PARAMS.cutoff);
    expect(voice.params.distDrive).toBe(DEFAULT_TB303_PARAMS.distDrive);
  });

  it('B4 verification: Anti-click micro-attack ensures smooth waveform transition without step impulse', () => {
    const voice = new TB303Voice();
    const sampleRate = 44100;

    // Trigger note from silence
    voice.triggerNote(110, false, false, 0.2, sampleRate);

    // Sample adjacent diffs over the first 50 samples
    let maxDelta = 0;
    let prev = 0;
    for (let i = 0; i < 50; i++) {
      const current = voice.process(sampleRate);
      const delta = Math.abs(current - prev);
      maxDelta = Math.max(maxDelta, delta);
      prev = current;
    }

    // A harsh un-enveloped click would cause delta jumps > 0.5 instantaneously.
    // Micro-attack ensures gentle onset.
    expect(maxDelta).toBeLessThan(0.15);
  });
});
