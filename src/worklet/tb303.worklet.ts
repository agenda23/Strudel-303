import { TB303Voice } from '../dsp/tb303';
import { applyVoiceEvent, type VoiceEvent } from '../dsp/events';

class TB303WorkletProcessor extends AudioWorkletProcessor {
  private voice: TB303Voice;
  private eventQueue: VoiceEvent[] = [];
  private frameCounter = 0;

  constructor() {
    super();
    this.voice = new TB303Voice();

    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'trigger') {
        this.schedule({
          kind: 'note',
          time: typeof data.time === 'number' ? data.time : 0,
          freq: data.freq,
          accent: Boolean(data.accent),
          slide: Boolean(data.slide),
          gateDuration: data.gateDuration || 0.1,
          params: data.params,
          explicit: Array.isArray(data.explicit) ? data.explicit : [],
        });
      } else if (data.type === 'knobs') {
        this.schedule({
          kind: 'knobs',
          time: typeof data.time === 'number' ? data.time : 0,
          values: data.values || {},
          rampSec: typeof data.rampSec === 'number' ? data.rampSec : 0.03,
        });
      } else if (data.type === 'clearKnobs') {
        this.schedule({ kind: 'clearKnobs', time: typeof data.time === 'number' ? data.time : 0 });
      } else if (data.type === 'setParam') {
        if (data.param && data.value !== undefined) {
          (this.voice.params as any)[data.param] = data.value;
        }
      } else if (data.type === 'setDistortion') {
        if (data.params) {
          if (data.params.drive !== undefined) this.voice.params.distDrive = data.params.drive;
          if (data.params.tone !== undefined) this.voice.params.distTone = data.params.tone;
          if (data.params.mix !== undefined) this.voice.params.distMix = data.params.mix;
          if (data.params.type !== undefined) this.voice.params.distType = data.params.type;
          if (data.params.enabled !== undefined) this.voice.params.distEnabled = data.params.enabled;
        }
      } else if (data.type === 'reset') {
        this.voice.reset();
        this.eventQueue = [];
      }
    };
  }

  private schedule(evt: VoiceEvent): void {
    this.eventQueue.push(evt);
    // Sort events chronologically by absolute AudioContext time
    this.eventQueue.sort((a, b) => a.time - b.time);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channelLeft = output[0];
    const channelRight = output[1] || channelLeft;
    const blockSize = channelLeft.length;

    // Use Web Audio API standard currentTime (seconds)
    // AudioWorkletGlobalScope currentTime gives the time of the first sample of this render quantum
    const blockStartTime = typeof currentTime !== 'undefined'
      ? currentTime
      : (this.frameCounter / sampleRate);

    for (let i = 0; i < blockSize; i++) {
      const sampleTime = blockStartTime + i / sampleRate;

      // Execute events scheduled at or before this sample time
      while (this.eventQueue.length > 0 && this.eventQueue[0].time <= sampleTime) {
        applyVoiceEvent(this.voice, this.eventQueue.shift()!, sampleRate);
      }

      const sample = this.voice.process(sampleRate);
      channelLeft[i] = sample;
      if (channelRight !== channelLeft) {
        channelRight[i] = sample;
      }
    }

    this.frameCounter += blockSize;
    return true;
  }
}

registerProcessor('tb303-processor', TB303WorkletProcessor);
