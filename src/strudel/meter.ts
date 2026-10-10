export interface LevelReading {
  peak: number;
  rms: number;
  clipSamples: number;
}

/** Polling level meter on an AnalyserNode tap (does not alter the audio path). */
export function createMeter(ctx: AudioContext, source: AudioNode) {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  return async function measure(ms: number): Promise<LevelReading> {
    let peak = 0, clip = 0, sum = 0, n = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      analyser.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) {
        s += v * v;
        const a = Math.abs(v);
        if (a > peak) peak = a;
        if (a >= 0.999) clip++;
      }
      sum += s / buf.length;
      n++;
      await new Promise((r) => setTimeout(r, 40));
    }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / Math.max(1, n)).toFixed(4), clipSamples: clip };
  };
}
