import { describe, it, expect, beforeAll } from 'vitest';
import { evalScope, evaluate } from '@strudel/core';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import { transpiler } from '@strudel/transpiler';
import { defineTB303Controls } from '../src/strudel/controls-def';
import { planTrigger, initialSlideState } from '../src/strudel/trigger';

// (.scale() is covered in-browser: @strudel/tonal's @tonaljs deps do not load under Node.)
/**
 * Strudel-compatibility snippets: standard Strudel code, with `.s("tb303")`,
 * must produce haps the bridge turns into the expected 303 triggers.
 */
async function haps(code: string, cycles = 1) {
  const { pattern } = await evaluate(code, transpiler);
  return (pattern as any).queryArc(0, cycles).filter((h: any) => h.hasOnset());
}

beforeAll(async () => {
  await evalScope(core, mini);
  mini.miniAllStrings?.();
  await evalScope({ setcps: () => {} }); // defined by the REPL in the app
  await evalScope(defineTB303Controls((n) => core.registerControl(n)));
});

describe('strudel snippets on tb303', () => {
  it('note names + scale resolve to the same pitches as stock Strudel', async () => {
    const hs = await haps('note("c2 eb2 g2").s("tb303")');
    const f = hs.map((h: any) => planTrigger(h.value, 0, 0.25, initialSlideState())!.freq);
    expect(f[0]).toBeCloseTo(65.406, 2);
    expect(f[1]).toBeCloseTo(77.782, 2);
    expect(f[2]).toBeCloseTo(97.999, 2);
  });

  it('bare n() is flagged legacy', async () => {
    const hs = await haps('n("0 12").s("tb303")');
    expect(planTrigger(hs[0].value, 0, 0.25, initialSlideState())!.legacyN).toBe(true);
  });

  it('accent/slide/tb* controls reach the hap value; slide ties to the next step', async () => {
    const hs = await haps('note("c2 c3 c2 c3").s("tb303").accent("1 0 0 0").slide("1 0 0 0").tbcut(900).tbres(0.8)');
    expect(hs.length).toBe(4);
    const st = initialSlideState();
    const step = 0.25;
    const plans = hs.map((h: any, i: number) => planTrigger(h.value, i * step, step, st)!);
    expect(plans[0].accent).toBe(true);
    expect(plans[0].params.cutoff).toBe(900);
    expect(plans[0].params.resonance).toBe(0.8);
    expect(plans[1].slide).toBe(true);
    expect(plans[2].slide).toBe(false);
  });

  it('mini-notation rests produce no haps, and a rest breaks the slide tie', async () => {
    const hs = await haps('note("c2 ~ c3 c2").s("tb303").slide("1 0 0 0")');
    expect(hs.length).toBe(3);
    const st = initialSlideState();
    const plans = [0, 2, 3].map((slot, i) => planTrigger(hs[i].value, slot * 0.25, 0.25, st)!);
    expect(plans[1].slide).toBe(false);
  });

  it('standard controls (gain, lpf, delay, room) stay on the hap for superdough to apply', async () => {
    const hs = await haps('note("c2").s("tb303").gain(.5).lpf(800).delay(.4).room(.3)');
    expect(hs[0].value).toMatchObject({ gain: 0.5, cutoff: 800, delay: 0.4, room: 0.3 });
  });

  it('hap context carries mini-notation locations for highlighting', async () => {
    const hs = await haps('note("c2 c3").s("tb303")');
    expect(hs[0].context.locations?.length).toBeGreaterThan(0);
  });

  it('stack and tempo statements evaluate ($: blocks come from the REPL; checked in-browser)', async () => {
    const hs = await haps('setcps(138/60/4)\nstack(note("c2").s("tb303"), s("bd*4"))');
    expect(hs.length).toBe(5);
  });
});
