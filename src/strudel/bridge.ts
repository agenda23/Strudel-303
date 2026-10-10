import { registerSound } from '@strudel/web';
import tb303WorkletUrl from '../worklet/tb303.worklet.ts?worker&url';
import type { TB303Params } from '../dsp/tb303';
import { extractKnobs, initialSlideState, planTrigger, type SlideState } from './trigger';

/** Seconds the tap stays open after the gate closes (VEG release tail). */
const TAIL_SEC = 0.2;
/** Cross-fade between consecutive taps; the source signal is identical, so this only hides chain differences. */
const TAP_FADE_SEC = 0.003;

interface Tap {
  gain: GainNode;
  closeAt: number;
}

/**
 * Connects the resident 303 AudioWorklet to Strudel through superdough's `registerSound`.
 *
 * The voice is monophonic and stateful, so one worklet node lives for the whole session.
 * Every hap gets a private "tap" GainNode fed by that node and returned to superdough,
 * which then runs the normal chain on it (gain, lpf, delay, room, pan, orbit, duck ...).
 * A tap is open from the note onset until the gate closes (or until the next onset).
 */
export class TB303Bridge {
  private node: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private lastTap: Tap | null = null;
  private slideState: SlideState = initialSlideState();
  private warnedLegacyN = false;
  private uiParams: Partial<TB303Params> = {};
  public onParamUpdate?: (params: Partial<TB303Params>, accent: boolean, slide: boolean) => void;
  public onWarning?: (message: string) => void;

  constructor(private audioContext: AudioContext) {}

  async init(): Promise<void> {
    if (this.node) return;

    await this.audioContext.audioWorklet.addModule(tb303WorkletUrl);
    this.node = new AudioWorkletNode(this.audioContext, 'tb303-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Analyser is a dead-end tap for the UI scope; audible output only goes through the per-hap taps.
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.node.connect(this.analyser);

    registerSound(
      'tb303',
      (t: number, value: any, onended: () => void) => this.trigger(t, value, onended),
      { type: 'synth' },
    );

    // Knob lane: `s("tb303ctl").segment(64).tbcut(sine.range(300, 2400).slow(8))` turns Strudel
    // signals into continuous knob movement. Each event is a ramp target, not a sound.
    registerSound(
      'tb303ctl',
      (t: number, value: any) => {
        this.knobLane(t, value);
        return undefined;
      },
      { type: 'synth' },
    );
  }

  private knobLane(t: number, value: any): void {
    if (!this.node) return;
    const values = extractKnobs(value);
    if (Object.keys(values).length === 0) return;
    const rampSec = typeof value.duration === 'number' && value.duration > 0 ? value.duration : 0.03;
    this.node.port.postMessage({ type: 'knobs', time: t, values, rampSec });
  }

  /** Release knob lanes (called when new code is evaluated, so removed lanes stop owning parameters). */
  clearKnobs(): void {
    this.node?.port.postMessage({ type: 'clearKnobs', time: 0 });
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /** Stop everything (hush): flush the voice, forget slide state, silence the open tap. */
  reset(): void {
    this.slideState = initialSlideState();
    this.node?.port.postMessage({ type: 'reset' });
    if (this.lastTap) {
      const now = this.audioContext.currentTime;
      this.lastTap.gain.gain.cancelScheduledValues(now);
      this.lastTap.gain.gain.setTargetAtTime(0, now, 0.01);
      this.lastTap = null;
    }
  }

  setDistortion(params: Partial<{ enabled: boolean; drive: number; tone: number; mix: number; type: string }>): void {
    if (params.enabled !== undefined) this.uiParams.distEnabled = params.enabled;
    if (params.drive !== undefined) this.uiParams.distDrive = params.drive;
    if (params.tone !== undefined) this.uiParams.distTone = params.tone;
    if (params.mix !== undefined) this.uiParams.distMix = params.mix;
    if (params.type === 'rat' || params.type === 'tube' || params.type === 'fuzz') {
      this.uiParams.distType = params.type;
    }
    this.node?.port.postMessage({ type: 'setDistortion', params });
  }

  private trigger(t: number, value: any, onended: () => void): { node: AudioNode; stop: (when?: number) => void } | undefined {
    if (!this.node) return undefined;

    const duration = typeof value.duration === 'number' ? value.duration : 0.25;
    const plan = planTrigger(value, t, duration, this.slideState, this.uiParams);
    if (!plan) return undefined;

    if (plan.legacyN && !this.warnedLegacyN) {
      this.warnedLegacyN = true;
      this.onWarning?.('tb303: bare n() is read as semitones above C2. Use note() or n().scale() for Strudel-compatible pitches.');
    }

    this.node.port.postMessage({
      type: 'trigger',
      time: t,
      freq: plan.freq,
      accent: plan.accent,
      slide: plan.slide,
      gateDuration: plan.gateDuration,
      params: plan.params,
      explicit: plan.explicit,
    });

    const closeAt = t + plan.gateDuration + TAIL_SEC;
    const tap = this.createTap(t, closeAt);
    setTimeout(onended, Math.max(0, (closeAt - this.audioContext.currentTime) * 1000) + 100);

    this.onParamUpdate?.(plan.params, plan.accent, plan.slideOut);

    return {
      node: tap.gain,
      stop: (when?: number) => {
        const at = Math.max(when ?? 0, this.audioContext.currentTime);
        tap.gain.gain.cancelScheduledValues(at);
        tap.gain.gain.setValueAtTime(tap.gain.gain.value, at);
        tap.gain.gain.linearRampToValueAtTime(0, at + TAP_FADE_SEC);
      },
    };
  }

  private createTap(t: number, closeAt: number): Tap {
    const gain = new GainNode(this.audioContext, { gain: 0 });
    this.node!.connect(gain);

    // The voice is monophonic: a new onset ends the previous tap.
    const prev = this.lastTap;
    if (prev && prev.closeAt > t) {
      const g = prev.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(1, t);
      g.linearRampToValueAtTime(0, t + TAP_FADE_SEC);
      prev.closeAt = t + TAP_FADE_SEC;
    }

    gain.gain.setValueAtTime(0, Math.max(0, t - TAP_FADE_SEC));
    gain.gain.linearRampToValueAtTime(1, t + TAP_FADE_SEC);
    gain.gain.setValueAtTime(1, closeAt);
    gain.gain.linearRampToValueAtTime(0, closeAt + TAP_FADE_SEC);

    const tap = { gain, closeAt };
    this.lastTap = tap;
    return tap;
  }
}
