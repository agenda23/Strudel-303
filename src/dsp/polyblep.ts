/**
 * PolyBLEP (Polynomial Band-Limited Step) oscillator helper.
 * Provides quasi band-limited sawtooth and square/pulse waves to suppress aliasing.
 */

export function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const n = t / dt;
    return 2 * n - n * n - 1.0;
  } else if (t > 1.0 - dt) {
    const n = (t - 1.0) / dt;
    return n * n + 2 * n + 1.0;
  }
  return 0.0;
}

export type TBWaveform = 'saw' | 'square';

export class PolyBlepOscillator {
  private phase = 0.0;

  /**
   * Render one sample of the oscillator.
   * @param freq Frequency in Hz
   * @param sampleRate Audio sample rate in Hz
   * @param wave Waveform ('saw' or 'square')
   */
  process(freq: number, sampleRate: number, wave: TBWaveform = 'saw'): number {
    const dt = Math.max(1e-6, Math.min(0.5, freq / sampleRate));

    let sample = 0.0;
    if (wave === 'saw') {
      // Raw naive sawtooth [-1, 1]
      sample = 2.0 * this.phase - 1.0;
      // Subtract PolyBLEP residual at transition (t = 0)
      sample -= polyBlep(this.phase, dt);
    } else {
      // Naive square wave (50% pulse)
      sample = this.phase < 0.5 ? 1.0 : -1.0;
      // Correct transition at t = 0
      sample += polyBlep(this.phase, dt);
      // Correct transition at t = 0.5
      sample -= polyBlep((this.phase + 0.5) % 1.0, dt);
    }

    // Advance phase
    this.phase += dt;
    if (this.phase >= 1.0) {
      this.phase -= 1.0;
    }

    return sample;
  }

  reset(): void {
    this.phase = 0.0;
  }
}
