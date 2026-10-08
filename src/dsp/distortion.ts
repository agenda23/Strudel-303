/**
 * Distortion / Overdrive DSP Unit tailored for TB-303 Acid synthesis.
 * Models diode clipping (ProCo RAT style), tube saturation, and hard fuzz,
 * with DC blocking and post-distortion tone filtering.
 */

export type DistortionType = 'rat' | 'tube' | 'fuzz';

export interface DistortionParams {
  enabled: boolean;
  drive: number;     // 0.0 (clean) to 1.0 (extreme saturation, up to 25x gain)
  tone: number;      // 0.0 (dark / lowpass ~800Hz) to 1.0 (bright / full ~14kHz)
  mix: number;       // 0.0 (100% dry) to 1.0 (100% wet)
  type: DistortionType;
}

export class DistortionUnit {
  public params: DistortionParams = {
    enabled: true,
    drive: 0.0,
    tone: 0.7,
    mix: 1.0,
    type: 'rat',
  };

  // 1-pole Tone filter state
  private toneState = 0.0;
  // DC blocker state
  private dcInputPrev = 0.0;
  private dcOutputPrev = 0.0;

  /**
   * Process a single audio sample through the distortion unit.
   * @param input Raw audio sample [-1, 1]
   * @param sampleRate Audio sample rate in Hz
   */
  process(input: number, sampleRate: number): number {
    if (!this.params.enabled || this.params.drive <= 0.001) {
      return input;
    }

    const drive = Math.max(0.0, Math.min(1.0, this.params.drive));
    // Gain scale from 1.0x to 24.0x
    const preGain = 1.0 + drive * 23.0;
    const x = input * preGain;

    let wet = 0.0;

    switch (this.params.type) {
      case 'rat': {
        // ProCo RAT style: Asymmetric diode clipping with smooth compression curve
        // Asymmetric bias adds even harmonics (warm, aggressive growl)
        const bias = 0.15 * drive;
        const biased = x + bias;
        // Hyperbolic tangent saturation
        const sat = Math.tanh(biased) - Math.tanh(bias);
        // Soft diode limiter
        wet = sat * 0.9;
        break;
      }
      case 'tube': {
        // Warm vacuum tube emulation (smooth symmetrical saturation)
        if (x > 1.4) {
          wet = 0.95;
        } else if (x < -1.4) {
          wet = -0.95;
        } else {
          wet = x - (x * x * x) / 5.88;
        }
        break;
      }
      case 'fuzz': {
        // Aggressive hard-clip fuzz
        const amplified = x * 1.5;
        if (amplified > 0.8) {
          wet = 0.8;
        } else if (amplified < -0.8) {
          wet = -0.8;
        } else {
          wet = amplified;
        }
        break;
      }
      default:
        wet = Math.tanh(x);
        break;
    }

    // 1. Post-distortion Tone filter (1-pole lowpass)
    // Tone 0.0: 700 Hz cutoff (deep & thick)
    // Tone 1.0: 14000 Hz cutoff (screaming treble)
    const toneCutoff = 700 + Math.pow(this.params.tone, 2.0) * 13300;
    const toneCoeff = 1.0 - Math.exp((-2.0 * Math.PI * toneCutoff) / sampleRate);
    this.toneState += toneCoeff * (wet - this.toneState);
    const filtered = this.toneState;

    // 2. DC Blocker filter (Highpass at ~15Hz to remove DC offsets from asymmetric clipping)
    // y[n] = x[n] - x[n-1] + R * y[n-1], R ~ 0.995
    const R = 0.995;
    const dcCleaned = filtered - this.dcInputPrev + R * this.dcOutputPrev;
    this.dcInputPrev = filtered;
    this.dcOutputPrev = dcCleaned;

    // Compensate output level so it sits comfortably in mix
    const postGain = 1.0 / (1.0 + drive * 1.8);
    const outputWet = dcCleaned * postGain * 1.5;

    // Dry / Wet crossfade
    const mix = Math.max(0.0, Math.min(1.0, this.params.mix));
    return input * (1.0 - mix) + outputWet * mix;
  }

  reset(): void {
    this.toneState = 0.0;
    this.dcInputPrev = 0.0;
    this.dcOutputPrev = 0.0;
  }
}
