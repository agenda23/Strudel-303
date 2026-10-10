/**
 * Shared acid-track code generator (used by the in-app pattern generator and the MCP server).
 *
 * Conventions (see spec/MCP検証と改修計画.md):
 *  - n() values are scale degrees (0 = root, 7 = octave up), kept within 0..8
 *  - drums carry gains (kick/clap 0.6/0.5, hats 0.35) and `cut(1)` only on hats
 *  - no delay/room
 *  - with `arrange`, the track is an 8-bar loop: drums first, clap from bar 2,
 *    303 and closed hats from bar 3, with a phrase variation every second bar
 */

export type DistType = 'rat' | 'tube' | 'fuzz';

export interface AcidTrackOptions {
  label: string;
  bpm: number;
  /** e.g. "c2:minor" */
  scale: string;
  /** 16-step degree pattern, e.g. "0 0 7 4 ~ 2 3 0 0 7 6 4 ~ 3 2 0" */
  notes: string;
  accents: string;
  slides: string;
  wave: 'saw' | 'square';
  cutoffLow: number;
  cutoffHigh: number;
  /** cycles per cutoff LFO period */
  lfoSlow: number;
  res: number;
  env: number;
  dec: number;
  dist: { drive: number; tone: number; type: DistType };
  arrange?: boolean;
}

const tokens = (s: string) => s.trim().split(/\s+/);

/** A phrase-end variation of a 16-step degree pattern (last notes move, rests stay). */
export function varyNotes(notes: string): string {
  const t = tokens(notes);
  const last = [t.length - 1, t.length - 2, t.length - 4].filter((i) => i >= 0);
  const repl = ['7', '4', '2'];
  last.forEach((idx, k) => {
    if (t[idx] !== '~') t[idx] = repl[k];
  });
  return t.join(' ');
}

/** Toggle the first and last step (a different accent push on every second bar). */
export function varyFlags(flags: string): string {
  const t = tokens(flags);
  t[0] = t[0] === '1' ? '0' : '1';
  t[t.length - 1] = t[t.length - 1] === '1' ? '0' : '1';
  return t.join(' ');
}

/** Drop the first slide so the bar-pair variation also changes the glide. */
export function varySlides(slides: string): string {
  const t = tokens(slides);
  const i = t.indexOf('1');
  if (i >= 0) t[i] = '0';
  return t.join(' ');
}

const f2 = (x: number) => x.toFixed(2);

export function buildAcidTrack(o: AcidTrackOptions): string {
  const arrange = o.arrange !== false;
  const alt = (a: string, b: string) => (arrange ? `<[${a}] [${b}]>` : a);
  const notes = alt(o.notes, varyNotes(o.notes));
  const accents = alt(o.accents, varyFlags(o.accents));
  const slides = alt(o.slides, varySlides(o.slides));

  const mask303 = arrange ? '\n  .mask("<0 0 1 1 1 1 1 1>")' : '';
  const maskClap = arrange ? '.mask("<0 1 1 1 1 1 1 1>")' : '';
  const maskHat = arrange ? '.mask("<0 0 1 1 1 1 1 1>")' : '';

  return `// ⚡ ${o.label} (${o.bpm} BPM${arrange ? ', 8-bar arrangement' : ''})
setcps(${o.bpm}/60/4)

// 303: n() values are scale degrees (7 = octave)
$: n("${notes}").scale("${o.scale}")
  .s("tb303")
  .tbwave("${o.wave}")
  .accent("${accents}")
  .slide("${slides}")
  .tbcut(sine.range(${o.cutoffLow}, ${o.cutoffHigh}).slow(${o.lfoSlow}))
  .tbres(${f2(o.res)})
  .tbenv(${f2(o.env)})
  .tbdec(${f2(o.dec)})
  .tbdist(${f2(o.dist.drive)})
  .tbdisttone(${f2(o.dist.tone)})
  .tbdisttype("${o.dist.type}")${mask303}

$: s("bd*4").bank("RolandTR909").gain(0.6)
$: s("~ cp ~ cp").bank("RolandTR909").gain(0.5)${maskClap}
$: s("[~ oh]*4").bank("RolandTR909").cut(1).gain(0.35)
$: s("hh*16").bank("RolandTR909").cut(1).gain("[0.25 0.4]*8")${maskHat}
`;
}
