import { describe, it, expect, beforeAll } from 'vitest';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import { transpiler } from '@strudel/transpiler';
import { evalScope, evaluate } from '@strudel/core';
import { defineTB303Controls } from '../src/strudel/controls-def';
import { buildAcidTrack, varyNotes, varyFlags, varySlides, type AcidTrackOptions } from '../src/app/generator';

const base: AcidTrackOptions = {
  label: 'Test Track',
  bpm: 138,
  scale: 'c2:minor',
  notes: '0 0 7 4 ~ 2 3 0 0 7 6 4 ~ 3 2 0',
  accents: '0 1 0 0 0 1 0 0 0 0 1 0 0 1 0 0',
  slides: '0 0 1 0 0 0 1 0 0 0 0 1 0 0 1 0',
  wave: 'saw',
  cutoffLow: 300,
  cutoffHigh: 3200,
  lfoSlow: 4,
  res: 0.85,
  env: 0.7,
  dec: 0.22,
  dist: { drive: 0.3, tone: 0.65, type: 'rat' },
};

const steps = (s: string) => s.trim().split(/\s+/).length;

describe('variation helpers', () => {
  it('keep 16 steps, rests and the degree range', () => {
    for (const notes of [base.notes, '0 ~ 0 0 ~ 2 0 ~ 0 ~ 0 0 ~ 2 0 ~', '0 2 4 6 7 6 4 2 0 4 7 8 7 4 3 2']) {
      const v = varyNotes(notes);
      expect(steps(v)).toBe(16);
      expect(v).not.toBe(notes);
      notes.split(' ').forEach((t, i) => {
        if (t === '~') expect(v.split(' ')[i]).toBe('~');
      });
      for (const n of v.match(/\d+/g)!.map(Number)) expect(n).toBeLessThanOrEqual(8);
    }
    expect(steps(varyFlags(base.accents))).toBe(16);
    expect(varyFlags(base.accents)).not.toBe(base.accents);
    expect(steps(varySlides(base.slides))).toBe(16);
    expect(varySlides(base.slides)).not.toBe(base.slides);
  });
});

describe('buildAcidTrack', () => {
  for (const arrange of [true, false]) {
    describe(arrange ? 'arranged' : 'flat', () => {
      const code = buildAcidTrack({ ...base, arrange });

      it('follows the mixing / language conventions', () => {
        expect(code).toMatch(/setcps\(138\/60\/4\)/);
        expect(code).not.toMatch(/\.(delay|room)\(/);
        for (const l of code.split('\n').filter((x) => x.includes('RolandTR909'))) {
          expect(l).toMatch(/gain\(/);
          if (l.includes('.cut(1)')) expect(l).not.toMatch(/\b(bd|cp|rm)\b/);
        }
        const nums = [...code.matchAll(/n\("([^"]*)"\)/g)].flatMap((m) => m[1].match(/\d+/g)!.map(Number));
        expect(Math.max(...nums)).toBeLessThanOrEqual(8);
      });

      it(arrange ? 'enters the 303 on bar 3 and alternates the phrase' : 'has no masks', () => {
        if (arrange) {
          expect(code).toContain('.mask("<0 0 1 1 1 1 1 1>")');
          expect(code).toMatch(/n\("<\[[^\]]+\] \[[^\]]+\]>"\)/);
        } else {
          expect(code).not.toContain('.mask(');
        }
      });
    });
  }
});

describe('generated code evaluates as Strudel code', () => {
  beforeAll(async () => {
    await evalScope(core, mini);
    await evalScope({ setcps: () => {}, $: undefined });
    await evalScope(defineTB303Controls((n) => core.registerControl(n)));
  });

  // `$:` blocks and `.scale()` come from the REPL / @strudel/tonal (not loadable under Node), so
  // turn the blocks into stack() entries and drop the scale call; mini-notation, masks and
  // controls are evaluated for real.
  const asStack = (code: string) => {
    const blocks = code
      .replace(/\.scale\("[^"]*"\)/, '')
      .split(/^\$: /m)
      .slice(1)
      .map((b) => b.trim());
    return `stack(${blocks.join(',\n')})`;
  };

  for (const arrange of [true, false]) {
    it(`${arrange ? 'arranged' : 'flat'} track evaluates and produces 303 and drum haps`, async () => {
      const code = asStack(buildAcidTrack({ ...base, arrange }));
      const { pattern } = await evaluate(code, transpiler);
      const haps = (pattern as any).queryArc(4, 5).filter((h: any) => h.hasOnset());
      const acid = haps.filter((h: any) => h.value.s === 'tb303');
      const drums = haps.filter((h: any) => h.value.s !== 'tb303');
      expect(acid.length).toBeGreaterThan(8);
      expect(drums.length).toBeGreaterThan(10);
    });
  }

  it('arrangement: bars 1-2 have no 303, bar 3 onwards does', async () => {
    const { pattern } = await evaluate(asStack(buildAcidTrack({ ...base, arrange: true })), transpiler);
    const count = (c: number) =>
      (pattern as any).queryArc(c, c + 1).filter((h: any) => h.hasOnset() && h.value.s === 'tb303').length;
    expect(count(0)).toBe(0);
    expect(count(1)).toBe(0);
    expect(count(2)).toBeGreaterThan(8);
    expect(count(7)).toBeGreaterThan(8);
    const clap = (c: number) =>
      (pattern as any).queryArc(c, c + 1).filter((h: any) => h.hasOnset() && h.value.s === 'cp').length;
    expect(clap(0)).toBe(0);
    for (const c of [1, 2, 4, 5, 7]) expect(clap(c)).toBe(2);
    const hat = (c: number) =>
      (pattern as any).queryArc(c, c + 1).filter((h: any) => h.hasOnset() && h.value.s === 'hh').length;
    expect(hat(1)).toBe(0);
    for (const c of [2, 3, 4, 5, 6, 7]) expect(hat(c)).toBe(16);
  });
});
