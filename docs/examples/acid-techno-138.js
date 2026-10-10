// Acid Techno 138 BPM - tuned via MCP review
// 303: n() = scale degrees (7 = octave). Level-matched distortion, default 303 gain sits ~3 dB under the kick.
setcps(138/60/4)

// 303: degrees of C minor (7 = octave). 8 bars, enters at bar 3
$: n("<[0 0 7 4 ~ 2 3 0 0 7 5 4 ~ 3 2 0] [0 0 7 4 ~ 2 3 0 0 7 4 2 ~ 3 4 7]>").scale("c2:minor")
  .s("tb303")
  .accent("<[0 1 0 0 0 1 0 0 0 0 1 0 0 1 0 0] [1 0 0 1 0 1 0 0 0 0 1 0 0 1 0 1]>")
  .slide("<[0 0 1 0 0 0 1 0 0 0 0 1 0 0 1 0] [0 0 1 0 0 0 0 0 0 0 1 0 0 0 1 0]>")
  .tbcut(sine.range(280, 2800).slow(8))
  .tbres(0.85).tbenv(0.65).tbdec(0.22)
  .tbdist(0.25).tbdisttype("rat")
  .mask("<0 0 1 1 1 1 1 1>")
  .gain(0.7)

$: s("bd*4").bank("RolandTR909").gain(.6)
$: s("~ cp ~ cp").bank("RolandTR909").gain(.5).mask("<0 1 1 1 1 1 1 1>")
$: s("[~ oh]*4").bank("RolandTR909").cut(1).gain(.35)
$: s("hh*16").bank("RolandTR909").cut(1).gain("[.25 .4]*8").mask("<0 0 1 1 1 1 1 1>")
