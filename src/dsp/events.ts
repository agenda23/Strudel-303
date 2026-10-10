import { TB303Voice, type KnobValues, type TB303Params } from './tb303';

/** Scheduled instructions for the voice. Shared by the AudioWorklet and the offline renderer. */
export type VoiceEvent =
  | {
      kind: 'note';
      /** onset time in seconds */
      time: number;
      freq: number;
      accent: boolean;
      slide: boolean;
      gateDuration: number;
      params: TB303Params;
      /** parameters the note set itself (others yield to knob lanes) */
      explicit: ReadonlyArray<keyof TB303Params>;
    }
  | {
      kind: 'knobs';
      time: number;
      values: KnobValues;
      /** ramp length in seconds (the control step: the knob arrives at the target by then) */
      rampSec: number;
    }
  | { kind: 'clearKnobs'; time: number };

export function applyVoiceEvent(voice: TB303Voice, evt: VoiceEvent, sampleRate: number): void {
  switch (evt.kind) {
    case 'note':
      voice.applyNoteParams(evt.params, evt.explicit);
      voice.triggerNote(evt.freq, evt.accent, evt.slide, evt.gateDuration, sampleRate);
      break;
    case 'knobs':
      voice.setKnobs(evt.values, evt.rampSec * sampleRate);
      break;
    case 'clearKnobs':
      voice.clearKnobs();
      break;
  }
}
