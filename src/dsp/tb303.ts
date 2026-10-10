import { PolyBlepOscillator, type TBWaveform } from './polyblep';
import { DiodeLadderFilter } from './ladder';
import { TptLadderFilter } from './ladder-tpt';
import { DistortionUnit, type DistortionType } from './distortion';

export interface TB303Params {
  cutoff: number;      // Base cutoff freq in Hz (50 - 8000)
  resonance: number;   // Resonance amount (0.0 - 1.0)
  envMod: number;      // Envelope mod amount (0.0 - 1.0)
  decay: number;       // MEG decay in seconds (0.1 - 2.0)
  waveform: TBWaveform;// 'saw' | 'square'
  slideTime: number;   // Portamento slide duration in seconds (~0.06s)
  gain?: number;       // Note volume / velocity scaling (0.0 - 2.0, default 1.0)
  distDrive?: number;  // Distortion amount 0.0 to 1.0
  distTone?: number;   // Distortion tone 0.0 to 1.0
  distMix?: number;    // Distortion dry/wet 0.0 to 1.0
  distType?: DistortionType; // 'rat' | 'tube' | 'fuzz'
  distEnabled?: boolean;     // false = bypass the distortion unit
  filterModel?: FilterModel; // 'tpt' (default) or 'diode' (coupled nonlinear diode ladder)
  filterDrive?: number;      // 0.0 - 1.0 filter saturation (default: 0 for 'tpt', DIODE_DEFAULT_DRIVE for 'diode')
  filterAsym?: number;       // 0.0 - 1.0 diode-pair asymmetry of the 'diode' model (even harmonics, bite)
  vegRelease?: number;       // seconds: amp envelope release after the gate closes (default 0.015)
  glide?: number;            // seconds: short pitch lag on notes that do not slide (default 0 = instant)
  slideCurve?: 'log' | 'hz'; // glide shape: 'log' (exponential in semitones, default) or 'hz' (old)
}

export type FilterModel = 'tpt' | 'diode';

/** Parameters a knob lane can move continuously (see TB303Voice.setKnobs). */
export const DIODE_DEFAULT_DRIVE = 0.1;

/** filterAsym 1.0 maps to this asymmetry in the diode characteristic (normalised units). */
export const DIODE_MAX_ASYMMETRY = 1.5;

export type KnobKey = 'cutoff' | 'resonance' | 'envMod' | 'decay' | 'filterDrive' | 'distDrive' | 'distTone';
export type KnobValues = Partial<Record<KnobKey, number>>;

interface KnobRamp {
  from: number;
  to: number;
  pos: number;
  len: number;
}

export interface TB303Trigger {
  freq: number;        // Target frequency in Hz
  accent: boolean;     // Accent flag
  slide: boolean;      // Slide flag (from current note into this note / legato)
  gateLength: number;  // Gate length in seconds
}

/**
 * Voice output trim. Chosen so that, with superdough's default gain (0.8), a plain 303 line sits
 * about 3 dB under a TR-909 kick instead of ~9 dB under (measured via MCP review, 2026-10-10).
 */
export const OUTPUT_LEVEL = 1.2;

/**
 * On an accented step the filter sweep is short regardless of the DECAY knob (published TB-303
 * descriptions put it near 200 ms). Not measured on hardware here; tune against a reference.
 */
export const ACCENT_MEG_DECAY = 0.2;

/**
 * A 50% pulse carries ~4.8 dB more power than a saw of the same peak, and after the filter the
 * square was measured ~5 dB louder. Scale it so switching waveforms does not jump in level.
 */
export const SQUARE_LEVEL = 0.55;

/** Level trim for the diode-ladder model so both filter models sit at a similar loudness. */
export const DIODE_FILTER_LEVEL = 0.68;

/** Input-stage asymmetry of the TPT model at full drive (adds even harmonics). */
export const TPT_ASYMMETRY = 0.15;

/** Output stage soft saturation: transparent below `knee`, approaches 1.0 smoothly above it. */
const SOFT_KNEE = 0.8;
export function softLimit(x: number): number {
  const a = Math.abs(x);
  if (a <= SOFT_KNEE) return x;
  const y = SOFT_KNEE + (1 - SOFT_KNEE) * Math.tanh((a - SOFT_KNEE) / (1 - SOFT_KNEE));
  return x < 0 ? -y : y;
}

export const DEFAULT_TB303_PARAMS: TB303Params = {
  cutoff: 400,
  resonance: 0.6,
  envMod: 0.7,
  decay: 0.25,
  waveform: 'saw',
  slideTime: 0.06,
  gain: 1.0,
  distDrive: 0.0,
  distTone: 0.7,
  distMix: 1.0,
  distType: 'rat',
  distEnabled: true,
  filterModel: 'tpt',
  filterAsym: 0.5,
};

export class TB303Voice {
  private osc = new PolyBlepOscillator();
  private filter = new TptLadderFilter();
  private diodeFilter = new DiodeLadderFilter();
  // DC blocker after the filter (asymmetric saturation produces a DC component)
  private dcX = 0.0;
  private dcY = 0.0;
  public distortion = new DistortionUnit();

  // Control parameters
  public params: TB303Params = { ...DEFAULT_TB303_PARAMS };

  // Smoothed internal parameters
  private currentCutoff = 400;
  private currentResonance = 0.6;

  // Pitch / Slide state
  private currentPitch = 110;
  private targetPitch = 110;
  private slideActive = false;
  private slideCoeff = 0.0;

  // Gate & Envelopes
  private gate = false;
  private gateSamplesRemaining = 0;
  private vegLevel = 0.0;
  private megLevel = 0.0;
  private vegAttackRate = 0.0;
  private megAttackRate = 0.0;
  private isAttacking = false;

  // Accent capacitor charge accumulation
  private accentCharge = 0.0;
  private isAccented = false;

  // Continuous knob lanes: per-parameter ramps toward a target, advanced every sample
  private knobRamps = new Map<KnobKey, KnobRamp>();
  private knobOwned = new Set<KnobKey>();

  constructor() {}

  /**
   * Move knobs smoothly: each given parameter ramps from its current value to the target over
   * `rampSamples` (cutoff in the log-frequency domain, like turning the real knob). Parameters
   * set this way are "owned" by the lane: later notes keep them unless a note sets them itself.
   */
  setKnobs(values: KnobValues, rampSamples: number): void {
    const len = Math.max(1, Math.round(rampSamples));
    for (const key of Object.keys(values) as KnobKey[]) {
      const to = values[key];
      if (typeof to !== 'number' || !Number.isFinite(to)) continue;
      const from = Number(this.params[key] ?? to);
      this.knobRamps.set(key, { from, to, pos: 0, len });
      this.knobOwned.add(key);
    }
  }

  /** Release all knob lanes (new evaluation / stop): parameters fall back to per-note values. */
  clearKnobs(): void {
    this.knobRamps.clear();
    this.knobOwned.clear();
  }

  /**
   * Apply a note's parameter set. Parameters owned by a knob lane keep their lane value unless the
   * note sets them explicitly (an explicit value wins at the note onset and cancels the ramp).
   */
  applyNoteParams(p: TB303Params, explicit: ReadonlyArray<keyof TB303Params> = []): void {
    const next: TB303Params = { ...p };
    for (const key of this.knobOwned) {
      if (explicit.includes(key)) {
        this.knobRamps.delete(key);
      } else {
        (next as any)[key] = this.params[key];
      }
    }
    this.params = next;
  }

  private advanceKnobs(): void {
    for (const [key, r] of this.knobRamps) {
      r.pos++;
      const t = r.pos >= r.len ? 1 : r.pos / r.len;
      let v: number;
      if (key === 'cutoff' && r.from > 0 && r.to > 0) v = r.from * Math.pow(r.to / r.from, t);
      else v = r.from + (r.to - r.from) * t;
      (this.params as any)[key] = v;
      if (t >= 1) this.knobRamps.delete(key);
    }
  }

  /**
   * Trigger a new note event according to TB-303 logic.
   * @param freq Target frequency in Hz
   * @param accent Whether accent is enabled on this step
   * @param slide Whether sliding from previous note into this step (tie pitch/envelope)
   * @param gateDurationSec Length of gate in seconds
   * @param sampleRate Audio sample rate
   */
  triggerNote(
    freq: number,
    accent: boolean,
    slide: boolean,
    gateDurationSec: number,
    sampleRate: number
  ): void {
    this.targetPitch = freq;
    this.isAccented = accent;

    if (accent) {
      // Accumulate charge into accent capacitor (saturates smoothly)
      this.accentCharge = Math.min(1.5, this.accentCharge + 0.6);
    }

    if (slide && this.gate) {
      // SLIDE (only while the previous gate is still held): do not retrigger
      // envelopes, pitch glides smoothly to target. A slide into a silent
      // voice falls back to a normal retrigger so the note is never muted.
      this.slideActive = true;
      const slideSamples = Math.max(1, this.params.slideTime * sampleRate);
      this.slideCoeff = Math.exp(-3.0 / slideSamples);
      this.isAttacking = false;
    } else {
      // NEW NOTE: retrigger MEG and VEG with an anti-click micro-attack (~2.5ms).
      // Pitch moves instantly, or with a very short lag when `glide` is set (the pitch CV of the
      // real machine passes through small RC stages, which smooths note-to-note steps).
      const glide = this.params.glide ?? 0;
      if (glide > 0 && this.vegLevel > 0.01) {
        this.slideActive = true;
        this.slideCoeff = Math.exp(-3.0 / Math.max(1, glide * sampleRate));
      } else {
        this.slideActive = false;
        this.currentPitch = freq;
      }
      // 2.5ms attack rate calculation to prevent pop/click on steep onsets
      const attackSamples = Math.max(1, Math.round(0.0025 * sampleRate));
      this.vegAttackRate = (1.0 - this.vegLevel) / attackSamples;
      this.megAttackRate = (1.0 - this.megLevel) / attackSamples;
      this.isAttacking = true;
    }

    this.gate = true;
    this.gateSamplesRemaining = Math.max(1, Math.floor(gateDurationSec * sampleRate));
  }

  /**
   * Release the current gate.
   */
  gateOff(): void {
    this.gate = false;
  }

  /**
   * Process a single audio output sample.
   */
  process(sampleRate: number): number {
    if (this.knobRamps.size > 0) this.advanceKnobs();

    // 1. Gate countdown
    if (this.gate) {
      if (this.gateSamplesRemaining > 0) {
        this.gateSamplesRemaining--;
        if (this.gateSamplesRemaining === 0) {
          this.gate = false;
        }
      }
    }

    // 2. Pitch / Slide smoothing. The real RC acts on the (exponential) pitch control voltage, so the
    //    glide is exponential in semitones, not in Hz: equal speed up and down, and a straight
    //    contour on a logarithmic frequency axis. `slideCurve: 'hz'` keeps the old linear-Hz behaviour.
    if (this.slideActive) {
      if (this.params.slideCurve === 'hz') {
        this.currentPitch =
          this.targetPitch + (this.currentPitch - this.targetPitch) * this.slideCoeff;
        if (Math.abs(this.currentPitch - this.targetPitch) < 0.1) {
          this.currentPitch = this.targetPitch;
          this.slideActive = false;
        }
      } else {
        const lt = Math.log2(this.targetPitch);
        const lp = lt + (Math.log2(this.currentPitch) - lt) * this.slideCoeff;
        if (Math.abs(lp - lt) < 1e-4) {
          this.currentPitch = this.targetPitch;
          this.slideActive = false;
        } else {
          this.currentPitch = Math.pow(2, lp);
        }
      }
    } else {
      this.currentPitch = this.targetPitch;
    }

    // 3. Envelopes (with anti-click micro-attack)
    if (this.isAttacking) {
      this.vegLevel += this.vegAttackRate;
      this.megLevel += this.megAttackRate;
      if (this.vegLevel >= 1.0) {
        this.vegLevel = 1.0;
        this.megLevel = 1.0;
        this.isAttacking = false;
      }
    } else {
      // MEG: accented steps use a short, fixed sweep (see ACCENT_MEG_DECAY)
      const effectiveDecay = this.isAccented
        ? Math.min(this.params.decay, ACCENT_MEG_DECAY)
        : this.params.decay;
      const megDecayRate = Math.exp(-1.0 / (Math.max(0.01, effectiveDecay) * sampleRate));
      this.megLevel *= megDecayRate;
    }

    // VEG: Fast attack, when gate closed exponential decay (~15ms release)
    if (!this.gate) {
      this.isAttacking = false;
      const vegReleaseRate = Math.exp(-1.0 / (Math.max(0.002, this.params.vegRelease ?? 0.015) * sampleRate));
      this.vegLevel *= vegReleaseRate;
    }

    // Accent discharge (simulating RC discharge circuit)
    const accentDischargeRate = Math.exp(-1.0 / (0.35 * sampleRate)); // ~350ms discharge
    this.accentCharge *= accentDischargeRate;

    // 4. Parameter smoothing (cutoff & resonance slewing)
    const slew = Math.exp(-1.0 / (0.005 * sampleRate)); // 5ms slew
    this.currentCutoff = this.params.cutoff + (this.currentCutoff - this.params.cutoff) * slew;
    this.currentResonance =
      this.params.resonance + (this.currentResonance - this.params.resonance) * slew;

    // 5. Calculate effective filter cutoff with EnvMod and Accent sweep
    const accentBoost = this.isAccented ? 1.0 + this.accentCharge * 0.5 : 1.0;
    const envModAmount = this.params.envMod * accentBoost;
    // TB-303 exponential cutoff modulation
    const modCutoff = this.currentCutoff * Math.pow(2.0, this.megLevel * envModAmount * 3.5);

    // 6. VCO
    const oscSample =
      this.osc.process(this.currentPitch, sampleRate, this.params.waveform) *
      (this.params.waveform === 'square' ? SQUARE_LEVEL : 1.0);

    // 7. VCF
    const isDiode = this.params.filterModel === 'diode';
    const drive = Math.min(1, Math.max(0, this.params.filterDrive ?? (isDiode ? DIODE_DEFAULT_DRIVE : 0)));
    let filteredSample: number;
    if (isDiode) {
      this.diodeFilter.drive = 1.0 + 14.0 * drive;
      this.diodeFilter.asymmetry = DIODE_MAX_ASYMMETRY * Math.min(1, Math.max(0, this.params.filterAsym ?? 0.5));
      filteredSample =
        this.diodeFilter.process(oscSample, modCutoff, this.currentResonance, sampleRate) * DIODE_FILTER_LEVEL;
    } else {
      this.filter.drive = 1.0 + 5.0 * drive;
      this.filter.asymmetry = TPT_ASYMMETRY * drive;
      filteredSample = this.filter.process(oscSample, modCutoff, this.currentResonance, sampleRate);
    }
    {
      // One-pole DC blocker, corner ~10 Hz
      const R = 1.0 - (2.0 * Math.PI * 10.0) / sampleRate;
      const y = filteredSample - this.dcX + R * this.dcY;
      this.dcX = filteredSample;
      this.dcY = y;
      filteredSample = y;
    }

    // 8. VCA (with accent volume boost and note gain)
    const vcaAccentBoost = this.isAccented ? 1.4 + this.accentCharge * 0.3 : 1.0;
    const noteGain = typeof this.params.gain === 'number' ? this.params.gain : 1.0;
    const output = filteredSample * this.vegLevel * vcaAccentBoost * OUTPUT_LEVEL;

    // 9. Post-VCA Distortion Unit
    if (this.params.distDrive !== undefined) this.distortion.params.drive = this.params.distDrive;
    if (this.params.distTone !== undefined) this.distortion.params.tone = this.params.distTone;
    if (this.params.distMix !== undefined) this.distortion.params.mix = this.params.distMix;
    if (this.params.distType !== undefined) this.distortion.params.type = this.params.distType;
    if (this.params.distEnabled !== undefined) this.distortion.params.enabled = this.params.distEnabled;

    // Final soft limit after the distortion (resonance spikes and accents stay under full scale)
    return softLimit(this.distortion.process(output, sampleRate)) * noteGain;
  }

  reset(): void {
    this.osc.reset();
    this.filter.reset();
    this.diodeFilter.reset();
    this.clearKnobs();
    this.dcX = 0.0;
    this.dcY = 0.0;
    this.distortion.reset();
    this.megLevel = 0.0;
    this.vegLevel = 0.0;
    this.accentCharge = 0.0;
    this.gate = false;
    this.slideActive = false;
    this.isAttacking = false;
  }
}
