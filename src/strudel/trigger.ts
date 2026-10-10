import { DEFAULT_TB303_PARAMS, type TB303Params } from '../dsp/tb303';

/** Pure helpers that turn a Strudel hap value into a 303 trigger message. */

const NOTE_OFFSETS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** "c2", "eb3", "f#1" -> MIDI number (c4 = 60, same convention as Strudel). */
export function noteNameToMidi(name: string): number | undefined {
  const m = name.toLowerCase().match(/^([a-g])([#bs]*)(-?\d+)?$/);
  if (!m) return undefined;
  let semis = NOTE_OFFSETS[m[1]];
  for (const ch of m[2]) semis += ch === '#' || ch === 's' ? 1 : -1;
  const oct = m[3] !== undefined ? parseInt(m[3], 10) : 3;
  return 12 * (oct + 1) + semis;
}

export interface FrequencyResult {
  freq: number | undefined;
  /** true when the legacy `n` (semitones above C2) interpretation was used */
  legacyN: boolean;
}

/**
 * Same resolution as superdough's getFrequencyFromValue (freq > note > default C2),
 * plus `octave` shift. A bare `n` without `note` (no `.scale()`) falls back to the
 * 303's historic "semitones above C2" meaning and is flagged so the UI can warn.
 */
export function resolveFrequency(val: Record<string, any>): FrequencyResult {
  let legacyN = false;
  let freq: number | undefined;
  if (typeof val.freq === 'number') {
    freq = val.freq;
  } else {
    let midi: number | undefined;
    if (typeof val.note === 'number') midi = val.note;
    else if (typeof val.note === 'string') midi = noteNameToMidi(val.note);
    else if (typeof val.n === 'number') {
      midi = 36 + val.n;
      legacyN = true;
    } else midi = 36;
    if (midi !== undefined) freq = 440 * Math.pow(2, (midi - 69) / 12);
  }
  if (freq !== undefined) {
    const oct = typeof val.octave === 'number' && !legacyN ? val.octave : 0;
    freq *= Math.pow(2, oct);
    if (!Number.isFinite(freq) || freq <= 0) freq = undefined;
  }
  return { freq, legacyN };
}

export const DEFAULT_LEGATO = 0.85;
/** Gate overlap used to tie a note into the next one when slide=1. */
export const SLIDE_TIE = 1.05;

export interface SlideState {
  /** previous note carried slide=1 */
  prevSlide: boolean;
  /** AudioContext time at which the previous gate closes */
  prevGateEnd: number;
}

export const initialSlideState = (): SlideState => ({ prevSlide: false, prevGateEnd: -Infinity });

export interface TriggerPlan {
  freq: number;
  accent: boolean;
  /** glide into THIS note from the previous one (no envelope retrigger) */
  slide: boolean;
  gateDuration: number;
  params: TB303Params;
  legacyN: boolean;
  /** this note's own slide flag, i.e. it glides into the NEXT note */
  slideOut: boolean;
  /** voice parameters this note set explicitly (the rest take defaults unless a knob lane owns them) */
  explicit: Array<keyof TB303Params>;
}

/**
 * Slide semantics (spec rule 3): a note with slide=1 glides into the *next* note.
 * The tie only applies when the next note actually starts while the slid note's
 * gate is still held; across a rest it is a normal retrigger.
 */
export function planTrigger(
  val: Record<string, any>,
  t: number,
  durationSec: number,
  state: SlideState,
  ui: Partial<TB303Params> = {},
): TriggerPlan | undefined {
  const { freq, legacyN } = resolveFrequency(val);
  if (freq === undefined) return undefined;

  const EPS = 1e-4;
  const slide = state.prevSlide && state.prevGateEnd >= t - EPS;
  const slideOut = Number(val.slide) > 0;

  const lengthFactor =
    typeof val.clip === 'number' ? val.clip : typeof val.legato === 'number' ? val.legato : DEFAULT_LEGATO;
  const base = Math.max(0.01, durationSec * lengthFactor);
  const gateDuration = slideOut ? Math.max(base, durationSec * SLIDE_TIE) : base;

  state.prevSlide = slideOut;
  state.prevGateEnd = t + gateDuration;

  const params: TB303Params = { ...DEFAULT_TB303_PARAMS, ...ui };
  const explicit: Array<keyof TB303Params> = [];
  const set = <K extends keyof TB303Params>(key: K, value: TB303Params[K]) => {
    params[key] = value;
    explicit.push(key);
  };
  if (typeof val.tbcut === 'number') set('cutoff', val.tbcut);
  if (typeof val.tbres === 'number') set('resonance', val.tbres);
  if (typeof val.tbenv === 'number') set('envMod', val.tbenv);
  if (typeof val.tbdec === 'number') set('decay', val.tbdec);
  if (val.tbwave === 'saw' || val.tbwave === 'square') set('waveform', val.tbwave);
  if (typeof val.tbslidetime === 'number') set('slideTime', val.tbslidetime);
  if (typeof val.tbdist === 'number') set('distDrive', val.tbdist);
  if (typeof val.tbdisttone === 'number') set('distTone', val.tbdisttone);
  if (typeof val.tbdistmix === 'number') set('distMix', val.tbdistmix);
  if (val.tbdisttype === 'rat' || val.tbdisttype === 'tube' || val.tbdisttype === 'fuzz') {
    set('distType', val.tbdisttype);
  }
  if (val.tbfilter === 'tpt' || val.tbfilter === 'diode') set('filterModel', val.tbfilter);
  if (typeof val.tbdrive === 'number') set('filterDrive', Math.min(1, Math.max(0, val.tbdrive)));
  if (typeof val.tbrel === 'number') set('vegRelease', Math.min(0.5, Math.max(0.002, val.tbrel)));
  if (typeof val.tbglide === 'number') set('glide', Math.min(0.2, Math.max(0, val.tbglide)));
  if (val.tbslidecurve === 'log' || val.tbslidecurve === 'hz') set('slideCurve', val.tbslidecurve);
  if (typeof val.tbasym === 'number') set('filterAsym', Math.min(1, Math.max(0, val.tbasym)));
  // gain / velocity are applied by superdough's chain, not inside the voice.
  params.gain = 1;

  return { freq, accent: Number(val.accent) > 0, slide, gateDuration, params, legacyN, slideOut, explicit };
}

/**
 * Continuous "knob lane" values: controls on an `s("tb303ctl")` event become ramp targets for the
 * voice's cutoff / resonance / env mod / decay / drive / distortion, so a signal such as
 * sine.range(...) moves the knob smoothly instead of once per note.
 */
export type KnobParams = Partial<Pick<TB303Params, 'cutoff' | 'resonance' | 'envMod' | 'decay' | 'filterDrive' | 'distDrive' | 'distTone'>>;

export function extractKnobs(val: Record<string, any>): KnobParams {
  const k: KnobParams = {};
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  if (num(val.tbcut)) k.cutoff = Math.max(20, val.tbcut);
  if (num(val.tbres)) k.resonance = Math.min(1, Math.max(0, val.tbres));
  if (num(val.tbenv)) k.envMod = Math.min(1, Math.max(0, val.tbenv));
  if (num(val.tbdec)) k.decay = Math.max(0.02, val.tbdec);
  if (num(val.tbdrive)) k.filterDrive = Math.min(1, Math.max(0, val.tbdrive));
  if (num(val.tbdist)) k.distDrive = Math.min(1, Math.max(0, val.tbdist));
  if (num(val.tbdisttone)) k.distTone = Math.min(1, Math.max(0, val.tbdisttone));
  return k;
}
