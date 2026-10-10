export interface PresetDefinition {
  id: string;
  name: string;
  bpm: number;
  description: string;
  code: string;
}

export const PRESETS: Record<string, PresetDefinition> = {
  classic: {
    id: 'classic',
    name: 'Classic 303 (138)',
    bpm: 138,
    description: '138 BPM Berlin Acid with 909 choke hats, resonant sweeps, and slides',
    code: `// Classic Acid Bassline (138 BPM)
setcps(138/60/4)

$: n("0 0 7 4 ~ 2 3 0").scale("c2:minor")
  .s("tb303")
  .accent("0 1 0 0 0 1 0 0")
  .slide("0 0 1 0 0 0 1 0")
  .tbcut(sine.range(280, 3400).slow(4))
  .tbres(0.85)
  .tbenv(0.68)
  .tbdec(0.24)
  .gain(0.7)

$: s("bd*4, ~ cp ~ cp").bank("RolandTR909").gain(0.6)
$: s("hh*8, [~ oh]*4").bank("RolandTR909").gain(0.35).cut(1)
`,
  },

  rat: {
    id: 'rat',
    name: 'RAT Drive (140)',
    bpm: 140,
    description: '140 BPM Hard Acid with ProCo RAT clipping, screaming resonance, and riding cymbals',
    code: `// Hard Acid with RAT Diode Clipping (140 BPM)
setcps(140/60/4)

$: n("0 0 7 4 ~ 2 3 0").scale("c2:minor")
  .s("tb303")
  .accent("0 1 0 0 0 1 0 0")
  .slide("0 0 1 0 0 0 1 0")
  .tbcut(sine.range(350, 4200).slow(4))
  .tbres(0.94)
  .tbenv(0.78)
  .tbdec(0.20)
  .tbdist(0.85)
  .tbdisttone(0.65)
  .tbdisttype("rat")
  .gain(0.7)

$: s("bd*4, [~ cp]*2").bank("RolandTR909").gain(0.6)
$: s("hh*8, [~ oh]*4, ~ ~ ~ rd*2").bank("RolandTR909").gain(0.35).cut(1)
`,
  },

  square: {
    id: 'square',
    name: 'Square Wave (136)',
    bpm: 136,
    description: '136 BPM Aggressive Square wave acid with rapid cutoffs and sidechain-ready feel',
    code: `// Square Wave Hollow Acid (136 BPM)
setcps(136/60/4)

$: n("0 2 4 6 7 6 4 2").scale("c2:minor")
  .s("tb303")
  .tbwave("square")
  .accent("1 0 1 0 0 1 0 1")
  .slide("0 1 0 0 1 0 1 0")
  .tbcut(cosine.range(420, 3900).slow(2))
  .tbres(0.92)
  .tbenv(0.80)
  .tbdec(0.18)
  .tbdist(0.55)
  .gain(0.5)

$: s("bd*4, [~ cp]*2").bank("RolandTR909").gain(0.6)
$: s("hh*16").bank("RolandTR909").gain(0.35).cut(1)
`,
  },

  trance: {
    id: 'trance',
    name: 'Acid Trance (142)',
    bpm: 142,
    description: '142 BPM Peak-time Acid Trance with extended portamento slides and tube warmth',
    code: `// Peak-Time Acid Trance (142 BPM)
setcps(142/60/4)

$: n("0 4 7 8 7 4 3 2").scale("d2:minor")
  .s("tb303")
  .accent("0 1 0 1 0 1 0 1")
  .slide("1 0 1 0 1 0 1 0")
  .tbcut(sine.range(500, 4800).slow(8))
  .tbres(0.84)
  .tbenv(0.75)
  .tbdec(0.28)
  .tbslidetime(0.08)
  .tbdist(0.60)
  .tbdisttype("tube")
  .gain(0.7)

$: s("bd*4, ~ cp ~ cp").bank("RolandTR909").gain(0.6)
$: s("[~ oh]*4, rd*8").bank("RolandTR909").gain(0.35).cut(1)
`,
  },

  minimal: {
    id: 'minimal',
    name: 'Minimal Sub (132)',
    bpm: 132,
    description: '132 BPM Dark Detroit Minimal with deep sub-bass and sparse, hypnotic groove',
    code: `// Minimal Detroit Sub-Bass (132 BPM)
setcps(132/60/4)

$: n("0 ~ 0 0 ~ 2 0 ~").scale("f1:minor")
  .s("tb303")
  .accent("0 0 1 0 0 1 0 0")
  .slide("0 0 0 1 0 0 0 0")
  .tbcut(340)
  .tbres(0.65)
  .tbenv(0.50)
  .tbdec(0.35)
  .gain(0.75)

$: s("bd*4, ~ rm ~ rm").bank("RolandTR909").gain(0.6)
$: s("hh*8").bank("RolandTR909").gain(0.35).cut(1)
`,
  },
};
