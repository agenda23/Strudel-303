// ===== HARDFLOOR-STYLE ACID with CONTINUOUS KNOB MOVES -- 136 BPM, A minor, 32 bars =====
//
// A real TB-303 is played with its hands: cutoff, resonance, env mod and decay are turned while the
// sequence loops. Writing those as per-note values gives a staircase (one value per 16th step).
// Here the knobs live on a separate "lane":
//
//     s("tb303ctl").segment(96)          -> 96 control points per bar (~18 ms), each one a ramp target
//       .tbcut(<signal>)  .tbres(<signal>)  .tbenv(<signal>)  .tbdec(<signal>)  .tbdist(<signal>)
//
// Any Strudel signal works (sine, saw, cosine, perlin ...), and signals can be added/multiplied to
// layer a slow swell, a wobble and an occasional "twist" on one knob. The notes below set NO knob
// values themselves, so the lane owns them for the whole track.
//
// Arrangement (bars):  1-4 drums | 5-8 303 enters, filter closed, opening | 9-12 wobble + accents
//                      13-16 break: kick out, resonance up, big cutoff twist | 17-24 drop, octave slides
//                      25-32 peak: two-octave + chained slides, fast wobble, filter closes at the end
setcps(136/60/4)

// ---- 303 notes (A-minor degrees: 0 = A1, 7 = A2, 14 = A3). slide=1 glides into the NEXT note. ----
$: n("<[0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6]!4 [0 ~ 0 7 0 0 4 ~ 0 7 0 0 6 0 4 3]!4 [0 0 4 7 0 0 7 4 0 0 3 7 0 6 4 0]!4 [0 7 0 7 4 4 11 4 0 7 0 7 3 4 6 7]!4 [0 0 7 7 0 0 7 7 0 7 0 7 0 0 7 0]!4 [0 0 7 0 0 4 0 7 0 0 7 0 3 4 0 6]!4 [0 14 0 14 7 0 14 7 0 14 0 7 14 0 7 14]!4 [0 7 4 11 7 14 11 7 4 0 7 4 2 4 7 4]!4>").scale("a1:minor")
  .s("tb303")
  .accent("<[1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0]!8 [1 0 1 0 0 1 0 1 1 0 0 1 0 1 0 0]!4 [1 0 0 1 0 1 0 0 1 0 0 1 0 0 1 0]!4 [1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0]!4 [1 0 0 1 0 0 1 0 0 1 0 0 1 0 0 0]!4 [1 0 1 1 0 1 0 1 1 0 1 0 1 1 0 0]!8>")
  .slide("<[0 0 1 0 0 0 0 1 0 0 1 0 0 0 1 0]!4 [0 0 0 1 0 0 0 0 0 1 0 0 0 1 0 0]!4 [0 1 0 0 0 1 0 0 0 0 1 0 0 1 0 0]!4 [0 0 1 0 0 0 1 0 0 0 1 0 0 0 1 0]!4 [0 1 0 1 0 1 0 1 0 1 0 0 1 0 1 0]!4 [0 0 1 0 0 0 0 1 0 0 1 0 0 0 1 0]!4 [1 0 1 0 1 1 0 1 1 0 1 0 0 1 1 0]!4 [1 1 1 1 1 1 1 0 1 1 1 1 1 1 1 0]!4>")
  .legato(0.85).tbrel(0.03).tbglide(0.006)
  .tbwave("<saw!24 square!2 saw!6>")
  .gain(0.6)
  .mask("<0!4 1!28>")

// ---- KNOB LANE: the "hands" ----
$: s("tb303ctl").segment(96)
  // CUTOFF: slow swell over the whole track + a 2-bar wobble that grows + a 4-bar twist in the break and peak
  .tbcut(
    saw.range(250, 1500).slow(32)
      .add(sine.range(0, 500).slow(2).mul(saw.range(0.2, 1).slow(32)))
      .add(saw.range(0, 1600).slow(4).mul("<0!12 1!4 0!8 1!8>"))
  )
  // RESONANCE: breathes between .78 and .95 (about one breath every 12 bars), highest in the break
  .tbres(sine.range(0.78, 0.93).slow(12).add("<0!12 0.03!4 0!16>"))
  // ENV MOD: how far the filter envelope opens on each note; pumps with the 2-bar wobble
  .tbenv(sine.range(0.55, 0.9).slow(6))
  // DECAY: long and wet in the intro, shorter and snappier in the drop
  .tbdec(saw.range(0.8, 0.45).slow(32))
  // DISTORTION: opens a little as the track builds
  .tbdist(saw.range(0.0, 0.35).slow(32))
  .tbdisttype("rat")

// ---- drums ----
$: s("bd*4").bank("RolandTR909").gain(0.5)
  .mask("<1!12 0!4 1!16>")
$: s("~ cp ~ cp").bank("RolandTR909").gain(0.45)
  .mask("<0!8 1!4 0!4 1!16>")
$: s("[~ oh]*4").bank("RolandTR909").cut(1).gain(0.3)
  .mask("<0!4 1!28>")
$: s("hh*16").bank("RolandTR909").cut(1).gain("[0.22 0.38 0.3 0.38]*4")
  .mask("<0!8 1!24>")
