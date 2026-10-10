// ===== CONTINUITY A/B (round 3): do the notes flow into each other like a real 303? =====
// Feedback: "the notes lack continuity compared with the real machine". Measured cause: the last
// tracks used legato .5 (gate = half a step) with a 15 ms amp release and a short decay, so the sound
// spent ~21% of the time below -30 dB between notes (0% at legato .85).
//
// Each situation plays 5 variants for 2 bars each, in this order (cue = rim clicks on beat 1):
//   1 rim click(s): what the last tracks used: legato .5, release 15 ms, decay .2, no glide
//   2 rim click(s): legato .85, decay .5
//   3 rim click(s): legato .85, decay .5, release 30 ms
//   4 rim click(s): legato .85, decay .5, release 30 ms, glide 6 ms
//   5 rim click(s): most continuous: legato .92, decay .8, release 40 ms, glide 8 ms
//
// bars  situation
//    1-10  PLAIN LINE   16ths, a few accents, no slides
//   11-20  SLIDE RUNS   3-5 glides in a row, then a plain note
//
// New controls used here: tbrel (amp release, seconds) and tbglide (short pitch lag on notes that
// do not slide, seconds). Filter = diode model (defaults). Levels are matched per situation.
setcps(138/60/4)

$: n("<[0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6] [0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6] [0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6] [0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6] [0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6] [0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6] [0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6] [0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6] [0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6] [0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0] [0 7 4 7 0 0 5 9 7 0 0 7 4 2 4 0]>").scale("e1:minor")
  .s("tb303")
  .tbfilter("diode")
  .accent("<[1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0] [1 0 0 0 0 0 1 0 0 0 1 0 0 0 0 0]>")
  .slide("<[0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0] [1 1 1 0 0 1 1 1 1 0 0 1 1 1 0 0]>")
  .legato("<0.5 0.5 0.85 0.85 0.85 0.85 0.85 0.85 0.92 0.92 0.5 0.5 0.85 0.85 0.85 0.85 0.85 0.85 0.92 0.92>")
  .tbrel("<0.015 0.015 0.015 0.015 0.03 0.03 0.03 0.03 0.04 0.04 0.015 0.015 0.015 0.015 0.03 0.03 0.03 0.03 0.04 0.04>")
  .tbglide("<0 0 0 0 0 0 0.006 0.006 0.008 0.008 0 0 0 0 0 0 0.006 0.006 0.008 0.008>")
  .tbdec("<0.2 0.2 0.5 0.5 0.5 0.5 0.5 0.5 0.8 0.8 0.2 0.2 0.5 0.5 0.5 0.5 0.5 0.5 0.8 0.8>")
  .tbenv(0.75)
  .gain("<0.8 0.8 0.63 0.63 0.62 0.62 0.62 0.62 0.61 0.61 0.8 0.8 0.74 0.74 0.73 0.73 0.73 0.73 0.73 0.73>")

// knob lane: cutoff / resonance fixed per situation (continuous, no per-note values)
$: s("tb303ctl").segment(96)
  .tbcut("<700 700 700 700 700 700 700 700 700 700 700 700 700 700 700 700 700 700 700 700>")
  .tbres("<0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85>")

$: s("bd*4").bank("RolandTR909").gain(0.5)
$: s("[~ oh]*4").bank("RolandTR909").cut(1).gain(0.25)
// cues: N rim clicks on the first beat of each 2-bar variant (1..5)
$: s("rim").bank("RolandTR909").gain(0.5).mask("<1 0 0 0 0 0 0 0 0 0>")
$: s("rim*2").bank("RolandTR909").gain(0.5).mask("<0 0 1 0 0 0 0 0 0 0>")
$: s("rim*3").bank("RolandTR909").gain(0.5).mask("<0 0 0 0 1 0 0 0 0 0>")
$: s("rim*4").bank("RolandTR909").gain(0.5).mask("<0 0 0 0 0 0 1 0 0 0>")
$: s("rim*5").bank("RolandTR909").gain(0.5).mask("<0 0 0 0 0 0 0 0 1 0>")
