import { TptLadderFilter as DiodeLadderFilter } from '../src/dsp/ladder-tpt';
import { PolyBlepOscillator } from '../src/dsp/polyblep';
import { TB303Voice } from '../src/dsp/tb303';
const SR = 44100;
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));

// --- a) steady-state magnitude response
function gainAt(f: number, cutoff: number, res: number, amp = 0.02) {
  const flt = new DiodeLadderFilter();
  const N = SR; let sIn = 0, sOut = 0, c = 0;
  for (let i = 0; i < N; i++) {
    const x = amp * Math.sin(2 * Math.PI * f * i / SR);
    const y = flt.process(x, cutoff, res, SR);
    if (i > N / 2) { sIn += x * x; sOut += y * y; c++; }
  }
  return Math.sqrt(sOut / sIn);
}
console.log('== ladder magnitude (cutoff 1000 Hz, linear-range input) ==');
for (const res of [0, 0.5, 0.8, 0.95, 1.0]) {
  const fr = [100, 250, 500, 1000, 2000, 4000, 8000].map(f => db(gainAt(f, 1000, res)).toFixed(1));
  console.log('res', res, fr.join(' | '), '  [100,250,500,1k,2k,4k,8k Hz in dB]');
}
const g2 = db(gainAt(2000, 1000, 0)), g8 = db(gainAt(8000, 1000, 0));
console.log('slope 2k->8k (res 0): ', ((g8 - g2) / 2).toFixed(1), 'dB/oct');
// peak
let peak = -99, pf = 0; for (let f = 500; f < 1600; f += 25) { const g = db(gainAt(f, 1000, 1.0)); if (g > peak) { peak = g; pf = f; } }
console.log('res 1.0 peak', peak.toFixed(1), 'dB at', pf, 'Hz');

// --- b) ringing (self-oscillation)
{
  const flt = new DiodeLadderFilter(); let max = 0, tail = 0;
  for (let i = 0; i < SR * 2; i++) { const y = flt.process(i === 0 ? 1 : 0, 1000, 1.0, SR); if (i > SR * 1.5) tail = Math.max(tail, Math.abs(y)); max = Math.max(max, Math.abs(y)); }
  console.log('impulse ringing res=1.0: peak', max.toFixed(3), ' amplitude at 1.5-2s:', tail.toExponential(2));
}

// --- c) aliasing of saw/square
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const wr = Math.cos(a * k), wi = Math.sin(a * k); const ur = re[i + k], ui = im[i + k]; const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; } }
}
console.log('== oscillator aliasing (energy not on harmonics, dB rel total) ==');
for (const wave of ['saw', 'square'] as const) for (const f0 of [110, 523.25, 1318.5, 2093]) {
  const N = 1 << 15; const osc = new PolyBlepOscillator(); const re = new Float64Array(N), im = new Float64Array(N);
  const bin = f0 * N / SR; // use exactly periodic? choose f so harmonic bins are non-integer -> use window
  for (let i = 0; i < 4000; i++) osc.process(f0, SR, wave);
  for (let i = 0; i < N; i++) re[i] = osc.process(f0, SR, wave) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  fft(re, im); let tot = 0, harm = 0; const half = N / 2;
  const isHarm = (k: number) => { const f = k * SR / N; const h = Math.round(f / f0); return h >= 1 && Math.abs(f - h * f0) < 4 * SR / N; };
  let low = 0;
  for (let k = 1; k < half; k++) { const p = re[k] ** 2 + im[k] ** 2; tot += p; if (isHarm(k)) harm += p; else if (k * SR / N < 5000) low += p; }
  console.log(wave.padEnd(6), f0.toFixed(0).padStart(5), 'Hz  non-harmonic: all', (10 * Math.log10((tot - harm) / tot)).toFixed(1), 'dB | below 5 kHz', (10 * Math.log10(low / tot)).toFixed(1), 'dB (what the lowpass leaves)');
}

// --- d) envelope / accent behavior (spectral brightness over time)
function centroidSeries(trigs: { t: number, f: number, acc: boolean, slide: boolean, gate: number }[], len: number, params: any) {
  const v = new TB303Voice(); Object.assign(v.params, params);
  const out = new Float32Array(Math.floor(len * SR)); let ti = 0;
  for (let i = 0; i < out.length; i++) { while (ti < trigs.length && trigs[ti].t * SR <= i) { const e = trigs[ti++]; v.triggerNote(e.f, e.acc, e.slide, e.gate, SR); } out[i] = v.process(SR); }
  return out;
}
function rmsWin(x: Float32Array, a: number, b: number) { let s = 0; for (let i = Math.floor(a * SR); i < Math.floor(b * SR); i++) s += x[i] ** 2; return Math.sqrt(s / ((b - a) * SR)); }
function zc(x: Float32Array, a: number, b: number) { let c = 0; for (let i = Math.floor(a * SR) + 1; i < Math.floor(b * SR); i++) if (x[i - 1] < 0 && x[i] >= 0) c++; return c / (b - a); }
console.log('== accent: peak/rms of 4 consecutive notes (plain vs accented), step 0.108s ==');
for (const acc of [false, true]) {
  const step = 60 / 138 / 4; const trigs = [0, 1, 2, 3].map(i => ({ t: i * step, f: 65.4, acc, slide: false, gate: step * 0.85 }));
  const y = centroidSeries(trigs, 4 * step, { cutoff: 400, resonance: 0.8, envMod: 0.6, decay: 0.25 });
  console.log(acc ? 'accent ' : 'plain  ', [0, 1, 2, 3].map(i => rmsWin(y, i * step, (i + 1) * step).toFixed(3)).join(' '), ' max|y|', Math.max(...y.map(Math.abs)).toFixed(3));
}
console.log('== slide: pitch trajectory C2(65.4)->C3(130.8), slideTime 0.06 ==');
{
  const step = 0.2; const y = centroidSeries([{ t: 0, f: 65.4, acc: false, slide: false, gate: step * 1.05 }, { t: step, f: 130.8, acc: false, slide: true, gate: step * 0.85 }], 2 * step, { cutoff: 4000, resonance: 0.1, envMod: 0, decay: 1 });
  for (const [a, b] of [[0.15, 0.2], [0.2, 0.22], [0.22, 0.24], [0.24, 0.26], [0.26, 0.28], [0.3, 0.35]]) console.log(`${a}-${b}s freq≈`, zc(y, a, b).toFixed(1), 'Hz');
  console.log('envelope continuity across slide (rms before/after boundary):', rmsWin(y, 0.19, 0.2).toFixed(3), rmsWin(y, 0.2, 0.21).toFixed(3));
}
console.log('== MEG sweep: brightness (zero-cross rate) vs time after a note, res 0.8, envmod 1.0, cutoff 300 ==');
{
  const y = centroidSeries([{ t: 0, f: 65.4, acc: false, slide: false, gate: 0.6 }], 0.6, { cutoff: 300, resonance: 0.8, envMod: 1.0, decay: 0.3 });
  console.log([0.005, 0.03, 0.08, 0.15, 0.25, 0.4].map(t => `${t}s: ${zc(y, t, t + 0.04).toFixed(0)}Hz rms ${rmsWin(y, t, t + 0.04).toFixed(3)}`).join('\n'));
}
console.log('== note off: release time of VEG ==');
{
  const y = centroidSeries([{ t: 0, f: 110, acc: false, slide: false, gate: 0.1 }], 0.3, { cutoff: 2000, resonance: 0.1, envMod: 0, decay: 1 });
  console.log([0.09, 0.105, 0.115, 0.13, 0.16, 0.2].map(t => `${t}s rms ${rmsWin(y, t, t + 0.005).toFixed(4)}`).join('  '));
}
