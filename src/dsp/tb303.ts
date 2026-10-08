import { PolyBlepOscillator, type TBWaveform } from './polyblep';
import { DiodeLadderFilter } from './ladder';
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
}

export interface TB303Trigger {
  freq: number;        // Target frequency in Hz
  accent: boolean;     // Accent flag
  slide: boolean;      // Slide flag (from current note into this note / legato)
  gateLength: number;  // Gate length in seconds
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
};

export class TB303Voice {
  private osc = new PolyBlepOscillator();
  private filter = new DiodeLadderFilter();
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

  constructor() {}

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
      // NEW NOTE: Reset slide, retrigger MEG and VEG with anti-click micro-attack (~2.5ms)
      this.slideActive = false;
      this.currentPitch = freq;
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
    // 1. Gate countdown
    if (this.gate) {
      if (this.gateSamplesRemaining > 0) {
        this.gateSamplesRemaining--;
        if (this.gateSamplesRemaining === 0) {
          this.gate = false;
        }
      }
    }

    // 2. Pitch / Slide smoothing
    if (this.slideActive) {
      this.currentPitch =
        this.targetPitch + (this.currentPitch - this.targetPitch) * this.slideCoeff;
      if (Math.abs(this.currentPitch - this.targetPitch) < 0.1) {
        this.currentPitch = this.targetPitch;
        this.slideActive = false;
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
      // MEG: Decay rate decreases when accented
      const effectiveDecay = this.isAccented
        ? this.params.decay * 0.7
        : this.params.decay;
      const megDecayRate = Math.exp(-1.0 / (Math.max(0.01, effectiveDecay) * sampleRate));
      this.megLevel *= megDecayRate;
    }

    // VEG: Fast attack, when gate closed exponential decay (~15ms release)
    if (!this.gate) {
      this.isAttacking = false;
      const vegReleaseRate = Math.exp(-1.0 / (0.015 * sampleRate));
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
    const oscSample = this.osc.process(
      this.currentPitch,
      sampleRate,
      this.params.waveform
    );

    // 7. VCF
    const filteredSample = this.filter.process(
      oscSample,
      modCutoff,
      this.currentResonance,
      sampleRate
    );

    // 8. VCA (with accent volume boost and note gain)
    const vcaAccentBoost = this.isAccented ? 1.4 + this.accentCharge * 0.3 : 1.0;
    const noteGain = typeof this.params.gain === 'number' ? this.params.gain : 1.0;
    const output = filteredSample * this.vegLevel * vcaAccentBoost * 0.7 * noteGain;

    // 9. Post-VCA Distortion Unit
    if (this.params.distDrive !== undefined) this.distortion.params.drive = this.params.distDrive;
    if (this.params.distTone !== undefined) this.distortion.params.tone = this.params.distTone;
    if (this.params.distMix !== undefined) this.distortion.params.mix = this.params.distMix;
    if (this.params.distType !== undefined) this.distortion.params.type = this.params.distType;
    if (this.params.distEnabled !== undefined) this.distortion.params.enabled = this.params.distEnabled;

    return this.distortion.process(output, sampleRate);
  }

  reset(): void {
    this.osc.reset();
    this.filter.reset();
    this.distortion.reset();
    this.megLevel = 0.0;
    this.vegLevel = 0.0;
    this.accentCharge = 0.0;
    this.gate = false;
    this.slideActive = false;
    this.isAttacking = false;
  }
}
