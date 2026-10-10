// ===== HAMBURG-STYLE ACID (original composition) -- 138 BPM, E minor, 48 bars =====
// An original track in the spirit of Hamburg acid techno: one hard-working 303 line whose knobs
// are "played" by hand (knob lane), octave / two-octave slides, 909 four-on-the-floor with an
// off-beat open hat, and a long build -> break -> drop -> peak -> outro arrangement.
// The note sequences below are original; nothing here is transcribed from an existing record.
//
// Sections (bars):
//    1- 4  intro        kick + hats                 | 303 enters at bar 5
//    5-12  groove       phrase A, filter closed and slowly opening, clap from bar 9
//   13-20  octaves      phrase B with octave leaps and glides, wobble deepens
//   21-24  BREAK        kick out, sparse 303, resonance up, big cutoff twist
//   25-32  DROP         phrase C: two-octave slides, then chained legato slides (bars 29-32)
//   33-40  PEAK         phrase D, fast wobble, second cutoff twist, highest resonance
//   41-44  return       phrase B again, everything still open
//   45-48  outro        phrase A, filter closing, decay lengthening
//
// n() = E-minor scale degrees (0 = E1, 7 = E2, 14 = E3). slide=1 glides into the NEXT note.
// Continuity (round-3 listening feedback): legato .85, 30 ms amp release, 6 ms pitch glide, decay .8 -> .45.
// Filter: the diode model (tbfilter("diode")). Delete that line to hear the older "tpt" filter.
setcps(138/60/4)

$: n("<[0 0 7 0 0 5 0 7 0 0 4 0 3 0 2 3]!12 [0 7 0 7 4 0 5 0 0 7 0 6 0 4 3 2]!8 [0 ~ ~ 0 ~ ~ 7 ~ 0 ~ ~ 4 ~ 5 ~ 7]!4 [0 14 0 14 7 0 11 7 0 14 4 7 0 11 7 4]!4 [0 7 4 11 7 14 11 7 4 0 7 4 2 4 7 4]!4 [0 0 4 7 0 4 7 11 0 0 5 8 0 5 7 4]!8 [0 7 0 7 4 0 5 0 0 7 0 6 0 4 3 2]!4 [0 0 7 0 0 5 0 7 0 0 4 0 3 0 2 3]!4>").scale("e1:minor")
  .s("tb303")
  .tbfilter("diode").tbasym(0.7)
  .accent("<[1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0]!8 [1 0 0 1 0 1 0 0 1 0 0 1 0 0 1 0]!4 [1 0 1 0 0 1 0 1 1 0 0 1 0 1 0 0]!8 [1 0 0 1 0 0 1 0 0 1 0 0 1 0 1 0]!4 [1 0 1 1 0 1 0 1 1 0 1 0 1 1 0 0]!8 [1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0]!8 [1 0 1 0 0 1 0 1 1 0 0 1 0 1 0 0]!4 [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0]!4>")
  .slide("<[0 0 1 0 0 0 0 1 0 0 1 0 0 1 0 0]!12 [0 1 0 1 0 0 1 0 0 1 0 1 0 1 0 0]!8 [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0]!4 [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0]!4 [1 1 1 1 1 1 1 0 1 1 1 1 1 1 1 0]!4 [0 1 0 0 1 0 1 0 0 1 0 0 1 0 1 0]!8 [0 1 0 1 0 0 1 0 0 1 0 1 0 1 0 0]!4 [0 0 1 0 0 0 0 1 0 0 1 0 0 1 0 0]!4>")
  .legato(0.85).tbrel(0.03).tbglide(0.006)
  .tbwave("<saw!24 square!2 saw!22>")
  .gain(0.5)
  .mask("<0!4 1!44>")

// ---- KNOB LANE: cutoff / resonance / env mod / decay / distortion played continuously ----
$: s("tb303ctl").segment(96)
  .tbcut(
    saw.range(260, 1400).slow(48)
      .add(sine.range(0, 450).slow(2).mul(saw.range(0.2, 1).slow(48)))
      .add(saw.range(0, 1800).slow(4).mul("<0!20 1!4 0!8 1!8 0!8>"))
      .mul("<1!44 0.85 0.7 0.55 0.45>")
  )
  .tbres(sine.range(0.78, 0.93).slow(10).add("<0!20 0.03!4 0!8 0.03!8 0!8>"))
  .tbenv(sine.range(0.55, 0.9).slow(6))
  .tbdec(saw.range(0.8, 0.45).slow(40).add("<0!44 0.1 0.2 0.3 0.4>"))
  .tbdist(saw.range(0, 0.3).slow(48))
  .tbdisttype("rat")

// ---- 909 ----
$: s("bd*4").bank("RolandTR909").gain(0.5)
  .mask("<1!20 0!4 1!24>")
$: s("~ cp ~ cp").bank("RolandTR909").gain(0.45)
  .mask("<0!8 1!12 0!4 1!24>")
$: s("[~ oh]*4").bank("RolandTR909").cut(1).gain(0.3)
  .mask("<0!2 1!46>")
$: s("hh*16").bank("RolandTR909").cut(1).gain("[0.22 0.38 0.3 0.38]*4")
  .mask("<0!2 1!46>")
