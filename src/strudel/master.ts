/**
 * Master safety limiter. superdough has no output limiter, and 909 samples are recorded hot
 * (kick/clap/hat peaks of 0.8), so a 303 + drums mix regularly exceeds full scale.
 *
 * Chain (when enabled):  destinationGain -> compressor (fast limiter) -> soft clipper -> destination
 */

export interface MasterLimiter {
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** Node carrying the limited signal (tap an AnalyserNode here to meter the final output). */
  output: AudioNode;
}

/** Linear up to `knee`, then a smooth approach to 1.0 (never exceeds 1). */
const CEILING = 0.98; // leave ~0.2 dB below full scale

export function softClipCurve(size = 4096, knee = 0.9): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size) as Float32Array<ArrayBuffer>;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    curve[i] = Math.sign(x) * y * CEILING;
  }
  return curve;
}

export function installMasterLimiter(ctx: AudioContext, destinationGain: GainNode, enabled = true): MasterLimiter {
  const comp = new DynamicsCompressorNode(ctx, {
    threshold: -3,
    knee: 0,
    ratio: 20,
    attack: 0.002,
    release: 0.12,
  });
  const clip = new WaveShaperNode(ctx, { curve: softClipCurve(), oversample: '2x' });
  comp.connect(clip);
  clip.connect(ctx.destination);

  // destinationGain is already wired straight to the destination by superdough.
  // Only that one connection is swapped, so analysers/scopes attached to it keep working.
  let on = false;
  const apply = (value: boolean) => {
    if (value === on) return;
    on = value;
    if (on) {
      destinationGain.disconnect(ctx.destination);
      destinationGain.connect(comp);
    } else {
      destinationGain.disconnect(comp);
      destinationGain.connect(ctx.destination);
    }
  };
  apply(enabled);

  return {
    setEnabled: apply,
    isEnabled: () => on,
    output: clip,
  };
}
