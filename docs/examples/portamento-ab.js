// ===== PORTAMENTO A/B (round 4): does the line glide like a real 303? =====
// Feedback: "the real machine sounds like portamento is on; here it is separate notes without gaps".
// Engine facts measured before this round: the glide was exponential in Hz (octave up reached half
// the interval in 10.7 ms, down in 17.6 ms) and fixed at ~60 ms. The real RC acts on the pitch CV,
// i.e. exponential in semitones. New: tbslidecurve("log") (now the default) and a free tbslidetime.
//
// Each situation plays 5 variants for 2 bars each (cue = rim clicks on beat 1):
//   1 rim click(s): OLD: linear-Hz glide, 60 ms
//   2 rim click(s): log glide (RC on pitch CV), 60 ms
//   3 rim click(s): log glide 100 ms
//   4 rim click(s): log glide 160 ms
//   5 rim click(s): log glide 240 ms (strong portamento)
//
// bars  situation
//    1-10  SLIDE RUNS   3-5 glides in a row, then a plain note
//   11-20  OCTAVE LEAPS glides across 1-2 octaves
//   21-30  EVERY NOTE   all steps glide into the next (a pure portamento line)
//
// A step with slide=1 glides into the NEXT step; the filter/amp envelopes are not retriggered.
// Filter = diode model, legato .85 (continuous). n() = E-minor scale degrees.
setcps(138/60/4)

$: n("<[0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 14 0 14 7 0 14 7 0 14 0 7 14 0 7 14] [0 14 0 14 7 0 14 7 0 14 0 7 14 0 7 14] [0 14 0 14 7 0 14 7 0 14 0 7 14 0 7 14] [0 14 0 14 7 0 14 7 0 14 0 7 14 0 7 14] [0 14 0 14 7 0 14 7 0 14 0 7 14 0 7 14] [0 14 0 14 7 0 14 7 0 14 0 7 14 0 7 14] [0 14 0 14 7 0 14 7 0 14 0 7 14 0 7 14] [0 14 0 14 7 0 14 7 0 14 0 7 14 0 7 14] [0 14 0 14 7 0 14 7 0 14 0 7 14 0 7 14] [0 14 0 14 7 0 14 7 0 14 0 7 14 0 7 14] [0 2 4 6 7 6 4 2 0 3 5 7 9 7 5 3] [0 2 4 6 7 6 4 2 0 3 5 7 9 7 5 3] [0 2 4 6 7 6 4 2 0 3 5 7 9 7 5 3] [0 2 4 6 7 6 4 2 0 3 5 7 9 7 5 3] [0 2 4 6 7 6 4 2 0 3 5 7 9 7 5 3] [0 2 4 6 7 6 4 2 0 3 5 7 9 7 5 3] [0 2 4 6 7 6 4 2 0 3 5 7 9 7 5 3] [0 2 4 6 7 6 4 2 0 3 5 7 9 7 5 3] [0 2 4 6 7 6 4 2 0 3 5 7 9 7 5 3] [0 2 4 6 7 6 4 2 0 3 5 7 9 7 5 3]>").scale("e1:minor")
  .s("tb303")
  .tbfilter("diode")
  .accent("<[1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0] [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0] [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0] [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0] [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0] [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0] [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0] [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0] [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0] [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0] [1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0] [1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0] [1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0] [1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0] [1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0] [1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0] [1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0] [1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0] [1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0] [1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0]>")
  .slide("<[1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0] [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0] [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0] [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0] [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0] [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0] [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0] [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0] [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0] [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0] [1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1] [1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1] [1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1] [1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1] [1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1] [1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1] [1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1] [1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1] [1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1] [1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1]>")
  .legato(0.85).tbrel(0.03)
  .tbslidecurve("<hz hz log log log log log log log log hz hz log log log log log log log log hz hz log log log log log log log log>")
  .tbslidetime("<0.06 0.06 0.06 0.06 0.1 0.1 0.16 0.16 0.24 0.24 0.06 0.06 0.06 0.06 0.1 0.1 0.16 0.16 0.24 0.24 0.06 0.06 0.06 0.06 0.1 0.1 0.16 0.16 0.24 0.24>")
  .tbglide("<0 0 0 0 0.01 0.01 0.02 0.02 0.04 0.04 0 0 0 0 0.01 0.01 0.02 0.02 0.04 0.04 0 0 0 0 0.01 0.01 0.02 0.02 0.04 0.04>")
  .tbdec(0.5).tbenv(0.75)
  .gain(0.65)

$: s("tb303ctl").segment(96)
  .tbcut(700).tbres(0.85)

$: s("bd*4").bank("RolandTR909").gain(0.5)
$: s("[~ oh]*4").bank("RolandTR909").cut(1).gain(0.25)
// cues: N rim clicks on the first beat of each 2-bar variant (1..5)
$: s("rim").bank("RolandTR909").gain(0.5).mask("<1 0 0 0 0 0 0 0 0 0>")
$: s("rim*2").bank("RolandTR909").gain(0.5).mask("<0 0 1 0 0 0 0 0 0 0>")
$: s("rim*3").bank("RolandTR909").gain(0.5).mask("<0 0 0 0 1 0 0 0 0 0>")
$: s("rim*4").bank("RolandTR909").gain(0.5).mask("<0 0 0 0 0 0 1 0 0 0>")
$: s("rim*5").bank("RolandTR909").gain(0.5).mask("<0 0 0 0 0 0 0 0 1 0>")
