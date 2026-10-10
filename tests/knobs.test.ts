import { describe, it, expect, beforeAll } from 'vitest';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import { transpiler } from '@strudel/transpiler';
import { evalScope, evaluate } from '@strudel/core';
import { defineTB303Controls } from '../src/strudel/controls-def';
import { TB303Voice, DEFAULT_TB303_PARAMS } from '../src/dsp/tb303';
import { renderTB303Haps, type RenderHap } from '../src/strudel/offline';
import { extractKnobs, initialSlideState, planTrigger } from '../src/strudel/trigger';

const SR = 44100;

describe('voice knob lanes (continuous parameter movement)', () => {
  it('ramps linearly in samples, cutoff in the log domain, and lands exactly on the target', () => {
    const v = new TB303Voice();
    v.params.cutoff = 200;
    v.params.resonance = 0.5;
    v.setKnobs({ cutoff: 1600, resonance: 0.9 }, 1000);
    const trace: number[] = [];
    const res: number[] = [];
    for (let i = 0; i < 1000; i++) {
      v.process(SR);
      trace.push(v.params.cutoff);
      res.push(v.params.resonance);
    }
    expect(trace[999]).toBeCloseTo(1600, 3);
    expect(res[999]).toBeCloseTo(0.9, 6);
    // log ramp: the midpoint is the geometric mean (200 * 8^0.5 = 565.7), not the arithmetic one
    expect(trace[499]).toBeCloseTo(200 * Math.pow(8, 0.5), 0);
    // smooth: no sample-to-sample jump larger than the constant ratio step
    for (let i = 1; i < trace.length; i++) expect(trace[i] / trace[i - 1]).toBeLessThan(1.0025);
  });

  it('lane-owned parameters survive new notes; an explicit note value wins and cancels the ramp', () => {
    const v = new TB303Voice();
    v.setKnobs({ cutoff: 3000, resonance: 0.95 }, 10);
    for (let i = 0; i < 20; i++) v.process(SR);
    // a note that sets nothing: defaults would reset cutoff to 400, but the lane owns it
    v.applyNoteParams({ ...DEFAULT_TB303_PARAMS }, []);
    expect(v.params.cutoff).toBeCloseTo(3000, 3);
    expect(v.params.resonance).toBeCloseTo(0.95, 6);
    // a note that sets its own cutoff overrides the lane value
    v.applyNoteParams({ ...DEFAULT_TB303_PARAMS, cutoff: 500 }, ['cutoff']);
    expect(v.params.cutoff).toBe(500);
    // the lane resumes on its next message
    v.setKnobs({ cutoff: 2000 }, 10);
    for (let i = 0; i < 20; i++) v.process(SR);
    expect(v.params.cutoff).toBeCloseTo(2000, 3);
  });

  it('clearKnobs hands parameters back to per-note values', () => {
    const v = new TB303Voice();
    v.setKnobs({ cutoff: 3000 }, 5);
    for (let i = 0; i < 10; i++) v.process(SR);
    v.clearKnobs();
    v.applyNoteParams({ ...DEFAULT_TB303_PARAMS }, []);
    expect(v.params.cutoff).toBe(DEFAULT_TB303_PARAMS.cutoff);
  });
});

describe('knob lanes from Strudel signals', () => {
  beforeAll(async () => {
    await evalScope(core, mini);
    await evalScope({ setcps: () => {} });
    await evalScope(defineTB303Controls((n) => core.registerControl(n)));
  });
  const haps = async (code: string, cycles = 1) =>
    ((await evaluate(code, transpiler)).pattern as any).queryArc(0, cycles).filter((h: any) => h.hasOnset());

  it('segment() gives many smooth control points per cycle, where per-note sampling gives one per note', async () => {
    const notes = await haps('note("c2*16").s("tb303").tbcut(sine.range(300,2400).slow(2))');
    const lane = await haps('s("tb303ctl").segment(128).tbcut(sine.range(300,2400).slow(2))');
    expect(notes.length).toBe(16);
    expect(lane.length).toBe(128);
    const maxStep = (hs: any[]) => Math.max(...hs.slice(1).map((h, i) => Math.abs(h.value.tbcut - hs[i].value.tbcut)));
    expect(maxStep(lane)).toBeLessThan(maxStep(notes) / 6);
    expect(extractKnobs(lane[10].value)).toEqual({ cutoff: lane[10].value.tbcut });
  });

  it('a lane changes the rendered sound smoothly compared with the same sweep sampled per note', async () => {
    const hapsToRender = (hs: any[]): RenderHap[] =>
      hs.map((h) => ({ begin: Number(h.whole.begin.valueOf()), end: Number(h.whole.end.valueOf()), value: h.value }));
    const phrase = hapsToRender(await haps('note("a1 a1 a2 a1 a1 e2 a1 a2").s("tb303").tbres(0.85).tbenv(0.6).tbdec(0.2)', 2));
    const lane = hapsToRender(await haps('s("tb303ctl").segment(128).tbcut(saw.range(200,3000).slow(2))', 2));
    const flat = renderTB303Haps(phrase, 0.55, 2, SR);
    const swept = renderTB303Haps([...phrase, ...lane], 0.55, 2, SR);
    expect(swept.every(Number.isFinite)).toBe(true);
    // the sweep opens the filter: more high-frequency energy late in the sweep than in the flat render
    const hf = (x: Float32Array, a: number, b: number) => {
      let d = 0;
      for (let i = Math.floor(a * SR) + 1; i < Math.floor(b * SR); i++) d += (x[i] - x[i - 1]) ** 2;
      return d;
    };
    expect(hf(swept, 3.0, 3.6)).toBeGreaterThan(hf(flat, 3.0, 3.6) * 1.5);
    // no clicks: the rendered signal has no isolated spikes at the lane's control steps
    let maxJump = 0;
    for (let i = 1; i < swept.length; i++) maxJump = Math.max(maxJump, Math.abs(swept[i] - swept[i - 1]));
    expect(maxJump).toBeLessThan(0.5);
  });

  it('planTrigger reports which parameters a note set explicitly', () => {
    const st = initialSlideState();
    const p = planTrigger({ note: 36, tbcut: 700, tbres: 0.8 }, 0, 0.25, st)!;
    expect([...p.explicit].sort()).toEqual(['cutoff', 'resonance']);
    expect(planTrigger({ note: 36 }, 1, 0.25, st)!.explicit).toEqual([]);
  });
});
