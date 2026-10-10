/**
 * Nonlinear diode-ladder lowpass (virtual-analog model of the TB-303 filter).
 *
 * The circuit is four capacitors coupled by diode pairs. In normalised units (voltage / 2Vt,
 * time in units of 1/omega) each node obeys
 *
 *     x1' = T(u - x1) - T(x1 - x2)
 *     x2' = T(x1 - x2) - T(x2 - x3)
 *     x3' = T(x2 - x3) - T(x3 - x4)
 *     x4' = T(x3 - x4)                 with T = tanh (the diode-pair characteristic)
 *
 * u is the input minus the resonance feedback. Because neighbouring stages load each other the
 * four poles are not identical: the small-signal response is a real-pole lowpass with a
 * -3 dB point at 0.1185 omega, about -19 dB/oct, and the loop self-oscillates at k = 18.4 (the
 * published "k = 17" of the diode ladder). Driven hard, the stages saturate, which is the growl
 * of an acid line: level-dependent gain, intermodulation and soft compression.
 *
 * The ODE is integrated with the trapezoidal rule and solved implicitly (Newton iterations on the
 * 4x4 system, warm-started from the previous sample), so feedback is zero-delay and stable at high
 * cutoff. A one-pole highpass in the feedback path (the coupling capacitor) keeps low notes from
 * losing all their body when resonance is turned up.
 */

/** Rational tanh approximation (exact at +-3, clamped beyond). */
export function fastTanh(x: number): number {
  if (x >= 3) return 1;
  if (x <= -3) return -1;
  const x2 = x * x;
  return (x * (27.0 + x2)) / (27.0 + 9.0 * x2);
}

/** -3 dB frequency of the small-signal ladder in units of omega (see header). */
export const LADDER_KAPPA = 0.1185;

/**
 * Frequency (in units of omega) where the loop phase is -180 degrees: the resonant peak for any
 * feedback gain, and the self-oscillation frequency. The CUTOFF control is mapped to this, because
 * on the real filter the knob moves the resonance; the unresonant knee therefore sits about a decade
 * lower, which is why turning resonance up on a 303 makes the filter sound brighter and quieter.
 */
export const LADDER_PEAK = 1.1952;

/** Feedback gain at which the loop self-oscillates (linear analysis). */
export const LADDER_K_CRIT = 18.4;

/** Feedback gain at resonance = 1.0 (a little below the self-oscillation point). */
export const RES_K_MAX = 18.0;

/** Corner of the highpass in the resonance feedback path (Hz); 0 disables it. */
export const FEEDBACK_HP_HZ = 120.0;

/**
 * Output makeup for the passband loss caused by feedback (DC gain is 1/(1+k)). Full compensation
 * would remove the 303's resonance-dependent loss, none leaves it ~25 dB down; the exponent keeps
 * part of it (a resonant 303 is quieter, but not that much).
 */
export const RES_MAKEUP_EXPONENT = 0.55;

/** Default input drive in normalised units (input of +-1 becomes +-DEFAULT_INPUT_DRIVE). */
export const DEFAULT_INPUT_DRIVE = 2.5;

const NEWTON_ITERATIONS = 3;

export class DiodeLadderFilter {
  // Capacitor voltages (normalised) and the derivative at the previous step
  private x1 = 0;
  private x2 = 0;
  private x3 = 0;
  private x4 = 0;
  private f1 = 0;
  private f2 = 0;
  private f3 = 0;
  private f4 = 0;
  // Feedback highpass state (TPT lowpass whose complement is the highpass)
  private sh = 0;
  // Previous (driven) input, for interpolation across oversampled steps
  private prevIn = 0;

  /** Oversampling factor. The model's internal rate is ~8x the corner, so 4x keeps 4-5 kHz accurate. */
  public oversample = 4;
  /** Input drive in normalised units; higher = more saturation (the output is scaled back). */
  public drive = DEFAULT_INPUT_DRIVE;
  /**
   * Asymmetry of the diode-pair characteristic in normalised units: T(d) = tanh(d + a) - tanh(a),
   * rescaled to unit slope at 0. A mismatched pair clips the two half-waves differently, which
   * adds even harmonics (brightness and "bite") without the low-pass effect of plain saturation.
   * 0 = symmetric.
   */
  public asymmetry = 0;

  // Scratch for the Newton solve
  private readonly J = new Float64Array(16);
  private readonly R = new Float64Array(4);

  /**
   * @param input Audio sample [-1, 1]
   * @param cutoff -3 dB frequency of the unresonant filter in Hz
   * @param resonance [0, 1]
   * @param sampleRate Base audio sample rate
   */
  process(input: number, cutoff: number, resonance: number, sampleRate: number): number {
    const os = this.oversample;
    const fs = sampleRate * os;
    const D = this.drive;

    // Trapezoid coefficient A = tan(omega / (2 fs)), omega = 2 pi fc / LADDER_PEAK. Clamped so very high
    // cutoffs stay inside the accurate range of the integrator.
    const fc = Math.max(20.0, Math.min(cutoff, fs * 0.30));
    const A = Math.tan((Math.PI * fc) / (LADDER_PEAK * fs));

    const k = Math.min(RES_K_MAX, Math.max(0.0, resonance * RES_K_MAX));

    // Feedback highpass: HP(y) = (1 - Gh) y - c, c = sh / (1 + gh)
    const gh = FEEDBACK_HP_HZ > 0 ? Math.tan((Math.PI * Math.min(FEEDBACK_HP_HZ, fs * 0.2)) / fs) : 0;
    const Gh = gh / (1.0 + gh);
    const invOnePlusGh = 1.0 / (1.0 + gh);
    const kh = k * (1.0 - Gh); // du/dx4 = -kh

    // Diode characteristic T(d) = (tanh(d + a) - tanh(a)) * norm, norm = 1 / (1 - tanh(a)^2)
    const a = this.asymmetry;
    const ta = a === 0 ? 0 : fastTanh(a);
    const norm = a === 0 ? 1.0 : 1.0 / (1.0 - ta * ta);

    const uTarget = D * input;
    const uStart = this.prevIn;
    this.prevIn = uTarget;

    const J = this.J;
    const R = this.R;
    let out = 0;

    for (let step = 0; step < os; step++) {
      const uIn = uStart + ((uTarget - uStart) * (step + 1)) / os;
      const c = this.sh * invOnePlusGh;

      // Warm start: previous state, nudged by its derivative
      let x1 = this.x1 + A * this.f1;
      let x2 = this.x2 + A * this.f2;
      let x3 = this.x3 + A * this.f3;
      let x4 = this.x4 + A * this.f4;

      for (let it = 0; it < NEWTON_ITERATIONS; it++) {
        const u = uIn - k * ((1.0 - Gh) * x4 - c);
        const h0 = fastTanh(u - x1 + a);
        const h1 = fastTanh(x1 - x2 + a);
        const h2 = fastTanh(x2 - x3 + a);
        const h3 = fastTanh(x3 - x4 + a);
        const t0 = (h0 - ta) * norm;
        const t1 = (h1 - ta) * norm;
        const t2 = (h2 - ta) * norm;
        const t3 = (h3 - ta) * norm;

        R[0] = x1 - this.x1 - A * (this.f1 + t0 - t1);
        R[1] = x2 - this.x2 - A * (this.f2 + t1 - t2);
        R[2] = x3 - this.x3 - A * (this.f3 + t2 - t3);
        R[3] = x4 - this.x4 - A * (this.f4 + t3);

        const s0 = (1.0 - h0 * h0) * norm;
        const s1 = (1.0 - h1 * h1) * norm;
        const s2 = (1.0 - h2 * h2) * norm;
        const s3 = (1.0 - h3 * h3) * norm;

        // J = I - A * dF/dx   (row-major 4x4)
        J[0] = 1.0 + A * (s0 + s1); J[1] = -A * s1;             J[2] = 0;                    J[3] = A * s0 * kh;
        J[4] = -A * s1;             J[5] = 1.0 + A * (s1 + s2); J[6] = -A * s2;              J[7] = 0;
        J[8] = 0;                   J[9] = -A * s2;             J[10] = 1.0 + A * (s2 + s3); J[11] = -A * s3;
        J[12] = 0;                  J[13] = 0;                  J[14] = -A * s3;             J[15] = 1.0 + A * s3;

        // Solve J d = -R by Gaussian elimination (diagonally dominant; no pivoting needed)
        for (let i = 0; i < 4; i++) {
          const piv = 1.0 / J[i * 5];
          for (let j = i + 1; j < 4; j++) {
            const f = J[j * 4 + i] * piv;
            if (f !== 0) {
              for (let m = i; m < 4; m++) J[j * 4 + m] -= f * J[i * 4 + m];
              R[j] -= f * R[i];
            }
          }
        }
        const d4 = -R[3] / J[15];
        const d3 = -(R[2] + J[11] * d4) / J[10];
        const d2 = -(R[1] + J[6] * d3 + J[7] * d4) / J[5];
        const d1 = -(R[0] + J[1] * d2 + J[2] * d3 + J[3] * d4) / J[0];

        x1 += d1;
        x2 += d2;
        x3 += d3;
        x4 += d4;
      }

      // Derivative at the converged point (needed by the next trapezoid step)
      const u = uIn - k * ((1.0 - Gh) * x4 - c);
      const t0 = (fastTanh(u - x1 + a) - ta) * norm;
      const t1 = (fastTanh(x1 - x2 + a) - ta) * norm;
      const t2 = (fastTanh(x2 - x3 + a) - ta) * norm;
      const t3 = (fastTanh(x3 - x4 + a) - ta) * norm;
      this.f1 = t0 - t1;
      this.f2 = t1 - t2;
      this.f3 = t2 - t3;
      this.f4 = t3;

      this.x1 = x1;
      this.x2 = x2;
      this.x3 = x3;
      this.x4 = x4;

      // Feedback highpass state follows the actual 4th stage output
      const vh = (x4 - this.sh) * Gh;
      this.sh += 2.0 * vh;

      out += x4;
    }

    return (out / (os * D)) * Math.pow(1.0 + k, RES_MAKEUP_EXPONENT);
  }

  reset(): void {
    this.x1 = this.x2 = this.x3 = this.x4 = 0;
    this.f1 = this.f2 = this.f3 = this.f4 = 0;
    this.sh = 0;
    this.prevIn = 0;
  }
}
