import { TB303Voice } from '../dsp/tb303';
import { applyVoiceEvent, type VoiceEvent } from '../dsp/events';
import { extractKnobs, initialSlideState, planTrigger } from './trigger';

/** A queried Strudel event reduced to plain data (cycle positions + control values). */
export interface RenderHap {
  begin: number;
  end: number;
  value: Record<string, any>;
}

/** Superdough's default gain; applied per note so offline levels match the app. */
const SUPERDOUGH_DEFAULT_GAIN = 0.8;

/**
 * Render the 303 haps of a pattern offline with the same trigger planning (pitch, slide tie,
 * gate length, parameters) the live bridge uses. Drums and effects are not rendered.
 */
export function renderTB303Haps(haps: RenderHap[], cps: number, cycles: number, sampleRate = 44100): Float32Array {
  const tail = 0.5;
  const total = Math.max(1, Math.floor((cycles / cps + tail) * sampleRate));
  const out = new Float32Array(total);
  const voice = new TB303Voice();
  const state = initialSlideState();

  type Timed = { frame: number; evt: VoiceEvent; gain?: number };
  const events: Timed[] = haps
    .filter((h) => h.begin >= 0 && h.begin < cycles)
    .sort((a, b) => a.begin - b.begin)
    .flatMap((h): Timed[] => {
      const t = h.begin / cps;
      const dur = (h.end - h.begin) / cps;
      if (h.value.s === 'tb303ctl') {
        const values = extractKnobs(h.value);
        return Object.keys(values).length ? [{ frame: Math.round(t * sampleRate), evt: { kind: 'knobs', time: t, values, rampSec: dur } }] : [];
      }
      const plan = planTrigger(h.value, t, dur, state);
      if (!plan) return [];
      const gain = typeof h.value.gain === 'number' ? h.value.gain : SUPERDOUGH_DEFAULT_GAIN;
      const velocity = typeof h.value.velocity === 'number' ? h.value.velocity : 1;
      return [
        {
          frame: Math.round(t * sampleRate),
          gain: gain * velocity,
          evt: {
            kind: 'note',
            time: t,
            freq: plan.freq,
            accent: plan.accent,
            slide: plan.slide,
            gateDuration: plan.gateDuration,
            params: plan.params,
            explicit: plan.explicit,
          },
        },
      ];
    });

  let next = 0;
  let gain = SUPERDOUGH_DEFAULT_GAIN;
  for (let i = 0; i < total; i++) {
    while (next < events.length && events[next].frame <= i) {
      const e = events[next++];
      applyVoiceEvent(voice, e.evt, sampleRate);
      if (e.gain !== undefined) gain = e.gain;
    }
    out[i] = voice.process(sampleRate) * gain;
  }
  return out;
}

export interface SignalMetrics {
  seconds: number;
  peak: number;
  rmsDb: number;
  clipSamples: number;
  dcOffset: number;
  /** fraction of 10 ms windows with audible signal */
  activeFraction: number;
  /** mean spectral centroid (Hz) over active frames */
  centroidHz: number;
  /** RMS per cycle (bar) */
  cycleRms: number[];
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k), wi = Math.sin(a * k);
        const ur = re[i + k], ui = im[i + k];
        const xr = re[i + k + len / 2], xi = im[i + k + len / 2];
        const vr = xr * wr - xi * wi, vi = xr * wi + xi * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

export function analyzeSignal(x: Float32Array, sampleRate: number, cps?: number): SignalMetrics {
  let peak = 0, sum = 0, dc = 0, clip = 0;
  for (const v of x) {
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 1) clip++;
    sum += v * v;
    dc += v;
  }
  const win = Math.max(1, Math.floor(sampleRate * 0.01));
  let active = 0, wins = 0;
  for (let i = 0; i + win <= x.length; i += win) {
    let s = 0;
    for (let k = 0; k < win; k++) s += x[i + k] ** 2;
    wins++;
    if (Math.sqrt(s / win) > 0.002) active++;
  }

  const N = 2048;
  const re = new Float64Array(N), im = new Float64Array(N);
  let cSum = 0, cN = 0;
  for (let i = 0; i + N <= x.length; i += N * 2) {
    let e = 0;
    for (let k = 0; k < N; k++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / N);
      re[k] = x[i + k] * w; im[k] = 0; e += re[k] * re[k];
    }
    if (Math.sqrt(e / N) < 0.002) continue;
    fft(re, im);
    let num = 0, den = 0;
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] ** 2 + im[k] ** 2;
      num += ((k * sampleRate) / N) * p;
      den += p;
    }
    if (den > 0) { cSum += num / den; cN++; }
  }

  const cycleRms: number[] = [];
  if (cps && cps > 0) {
    const len = Math.floor(sampleRate / cps);
    for (let i = 0; i + len <= x.length; i += len) {
      let s = 0;
      for (let k = 0; k < len; k++) s += x[i + k] ** 2;
      cycleRms.push(+Math.sqrt(s / len).toFixed(4));
    }
  }

  const rms = Math.sqrt(sum / Math.max(1, x.length));
  return {
    seconds: +(x.length / sampleRate).toFixed(2),
    peak: +peak.toFixed(3),
    rmsDb: +(20 * Math.log10(Math.max(rms, 1e-9))).toFixed(1),
    clipSamples: clip,
    dcOffset: +(dc / Math.max(1, x.length)).toFixed(5),
    activeFraction: +(active / Math.max(1, wins)).toFixed(2),
    centroidHz: cN ? Math.round(cSum / cN) : 0,
    cycleRms,
  };
}
