import { TB303Voice, DEFAULT_TB303_PARAMS, type TB303Params } from '../dsp/tb303';

interface ScheduledEvent {
  time: number; // Scheduled onset time in AudioContext seconds
  freq: number;
  accent: boolean;
  slide: boolean;
  gateDuration: number;
  params?: Partial<TB303Params>;
}

class TB303WorkletProcessor extends AudioWorkletProcessor {
  private voice: TB303Voice;
  private eventQueue: ScheduledEvent[] = [];
  private frameCounter = 0;

  constructor() {
    super();
    this.voice = new TB303Voice();

    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'trigger') {
        this.eventQueue.push({
          time: typeof data.time === 'number' ? data.time : 0,
          freq: data.freq,
          accent: Boolean(data.accent),
          slide: Boolean(data.slide),
          gateDuration: data.gateDuration || 0.1,
          params: data.params,
        });
        // Sort events chronologically by absolute AudioContext time
        this.eventQueue.sort((a, b) => a.time - b.time);
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
        const evt = this.eventQueue.shift()!;
        if (evt.params) {
          // B-3: Reset to defaults before applying event-specific parameters
          this.voice.params = { ...DEFAULT_TB303_PARAMS, ...evt.params };
        }
        this.voice.triggerNote(
          evt.freq,
          evt.accent,
          evt.slide,
          evt.gateDuration,
          sampleRate
        );
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
