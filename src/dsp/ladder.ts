/**
 * 4-pole Diode Ladder Filter model (TPT-based with per-stage non-linear saturation).
 * Characteristic of the Roland TB-303 lowpass filter.
 */

// Fast tanh approximation for audio DSP saturation
export function fastTanh(x: number): number {
  const x2 = x * x;
  return (x * (27.0 + x2)) / (27.0 + 9.0 * x2);
}

export class DiodeLadderFilter {
  // State variables for the 4 filter stages
  private s1 = 0.0;
  private s2 = 0.0;
  private s3 = 0.0;
  private s4 = 0.0;

  // Oversampling factor (typically 2x for stability and anti-aliasing with tanh saturation)
  public oversample = 2;

  /**
   * Process a single audio sample through the 4-pole diode ladder.
   * @param input Audio input sample [-1, 1]
   * @param cutoff Filter cutoff frequency in Hz (approx 50Hz to 8000Hz)
   * @param resonance Resonance amount [0, 1]
   * @param sampleRate Base audio sample rate in Hz
   */
  process(input: number, cutoff: number, resonance: number, sampleRate: number): number {
    const os = this.oversample;
    const fs = sampleRate * os;

    // Constrain cutoff safely below Nyquist
    const clampedCutoff = Math.max(20.0, Math.min(cutoff, fs * 0.45));
    // TPT integrator tuning parameter: g = tan(pi * fc / fs)
    const g = Math.tan((Math.PI * clampedCutoff) / fs);
    // Feedback resonance gain: TB-303 self-oscillates around max res
    const k = Math.min(3.96, Math.max(0.0, resonance * 3.8));

    let output = 0.0;

    // Run oversampled internal loop
    for (let i = 0; i < os; i++) {
      // 1-pole stages with diode ladder weighting and feedback
      // Feedback loop equation with non-linear saturation
      const feedback = k * this.s4;
      const inSaturated = fastTanh(input - feedback);

      // Stage 1
      const v1 = (inSaturated - this.s1) * (g / (1.0 + g));
      const y1 = v1 + this.s1;
      this.s1 = y1 + v1;

      // Stage 2
      const sat1 = fastTanh(y1);
      const v2 = (sat1 - this.s2) * (g / (1.0 + g));
      const y2 = v2 + this.s2;
      this.s2 = y2 + v2;

      // Stage 3
      const sat2 = fastTanh(y2);
      const v3 = (sat2 - this.s3) * (g / (1.0 + g));
      const y3 = v3 + this.s3;
      this.s3 = y3 + v3;

      // Stage 4
      const sat3 = fastTanh(y3);
      const v4 = (sat3 - this.s4) * (g / (1.0 + g));
      const y4 = v4 + this.s4;
      this.s4 = y4 + v4;

      output += y4;
    }

    return output / os;
  }

  reset(): void {
    this.s1 = 0.0;
    this.s2 = 0.0;
    this.s3 = 0.0;
    this.s4 = 0.0;
  }
}
