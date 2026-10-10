/**
 * Previous filter model (kept for A/B comparison and as a cheap fallback): four identical TPT
 * one-pole stages with tanh between them, zero-delay linear feedback loop with a feedback highpass,
 * and a 3rd/4th stage output mix for about 18 dB/oct. Nearly linear at normal levels.
 */

// Fast tanh approximation for audio DSP saturation
export function fastTanh(x: number): number {
  const x2 = x * x;
  return (x * (27.0 + x2)) / (27.0 + 9.0 * x2);
}

/**
 * Feedback gain at resonance = 1.0. A plain 4-pole ladder oscillates at exactly 4; the feedback
 * highpass adds phase lead at the cutoff, so slightly more is needed for the same squelch
 * (4.4 = rings for a long time at res 1.0; 4.6 would self-oscillate).
 */
export const RES_K_MAX = 4.4;

/**
 * Corner of the highpass in the resonance feedback path (Hz). Below this the loop gain falls off,
 * so low notes keep their body at high resonance. Set to 0 to disable (plain ladder behaviour).
 */
export const FEEDBACK_HP_HZ = 120.0;

/** Effective number of poles seen at the output (3 = 18 dB/oct, 4 = 24 dB/oct). */
export const OUTPUT_POLES = 3.0;

export class TptLadderFilter {
  // State variables for the 4 filter stages
  private s1 = 0.0;
  private s2 = 0.0;
  private s3 = 0.0;
  private s4 = 0.0;
  // State of the feedback-path lowpass whose complement is the feedback highpass
  private sh = 0.0;

  // Oversampling factor (2x keeps the tanh stages and the high-cutoff tuning well behaved)
  public oversample = 2;

  /**
   * Saturation drive. Each stage saturates as tanh(D*y)/D, so the small-signal response (and the
   * level of quiet notes) is unchanged, while loud signals compress and generate harmonics.
   * D = 1 is the previous, nearly linear behaviour.
   */
  public drive = 1.0;
  /** Input-stage asymmetry (diode/transistor mismatch); adds even harmonics. 0 = symmetric. */
  public asymmetry = 0.0;

  /**
   * Process a single audio sample through the ladder.
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
    const G = g / (1.0 + g); // per-stage gain
    const invOnePlusG = 1.0 / (1.0 + g);
    const G2 = G * G;
    const G3 = G2 * G;
    const G4 = G2 * G2;
    // Feedback highpass tuning (one-pole TPT lowpass; HP = input - LP)
    const gh = FEEDBACK_HP_HZ > 0 ? Math.tan((Math.PI * Math.min(FEEDBACK_HP_HZ, fs * 0.2)) / fs) : 0;
    const Gh = gh / (1.0 + gh);
    const invOnePlusGh = 1.0 / (1.0 + gh);
    const k = Math.min(RES_K_MAX, Math.max(0.0, resonance * RES_K_MAX));

    // 3rd/4th stage mix for the audio output (OUTPUT_POLES in [3, 4])
    const mix4 = Math.min(1.0, Math.max(0.0, OUTPUT_POLES - 3.0));

    const D = Math.max(1.0, this.drive);
    const invD = 1.0 / D;
    const a = this.asymmetry;
    // Asymmetric input saturation with unit small-signal slope: (T(D(u+a)) - T(Da)) / (D (1 - T(Da)^2))
    const ta = fastTanh(D * a);
    const asymNorm = 1.0 / (D * (1.0 - ta * ta));

    let output = 0.0;

    for (let i = 0; i < os; i++) {
      // Zero-delay solve of the linear loop. Stage states contribute S to the 4th stage output:
      //   y4 = G^4 * u + S.   Feedback f = k * HP(y4) with HP(y) = (1 - Gh) * y - c, c = sh/(1 + gh),
      //   u = x - f   =>   y4 = (G^4 * (x + k*c) + S) / (1 + k * G^4 * (1 - Gh)).
      const S =
        G3 * this.s1 * invOnePlusG +
        G2 * this.s2 * invOnePlusG +
        G * this.s3 * invOnePlusG +
        this.s4 * invOnePlusG;
      const c = this.sh * invOnePlusGh;
      const y4lin = (G4 * (input + k * c) + S) / (1.0 + k * G4 * (1.0 - Gh));
      const u = input - k * ((1.0 - Gh) * y4lin - c);
      const inSaturated = a === 0 ? fastTanh(D * u) * invD : (fastTanh(D * (u + a)) - ta) * asymNorm;

      // Stage 1
      const v1 = (inSaturated - this.s1) * G;
      const y1 = v1 + this.s1;
      this.s1 = y1 + v1;

      // Stage 2
      const v2 = (fastTanh(D * y1) * invD - this.s2) * G;
      const y2 = v2 + this.s2;
      this.s2 = y2 + v2;

      // Stage 3
      const v3 = (fastTanh(D * y2) * invD - this.s3) * G;
      const y3 = v3 + this.s3;
      this.s3 = y3 + v3;

      // Stage 4
      const v4 = (fastTanh(D * y3) * invD - this.s4) * G;
      const y4 = v4 + this.s4;
      this.s4 = y4 + v4;

      // Advance the feedback-path lowpass with the actual 4th stage output
      const vh = (y4 - this.sh) * Gh;
      this.sh = this.sh + 2.0 * vh;

      output += y3 * (1.0 - mix4) + y4 * mix4;
    }

    return output / os;
  }

  reset(): void {
    this.s1 = 0.0;
    this.s2 = 0.0;
    this.s3 = 0.0;
    this.s4 = 0.0;
    this.sh = 0.0;
  }
}
