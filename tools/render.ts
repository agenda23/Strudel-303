import fs from 'node:fs';
import path from 'node:path';
import pkg from 'wavefile';
const { WaveFile } = pkg;
import { TB303Voice } from '../src/dsp/tb303';

function midiToFreq(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

// Classic 16-step TB-303 Acid test pattern
interface Step {
  note: number;
  accent?: boolean;
  slide?: boolean;
}

const pattern: (Step | null)[] = [
  { note: 36, accent: false, slide: false }, // C2
  { note: 36, accent: true,  slide: false }, // C2 Acc
  { note: 48, accent: false, slide: true  }, // C3 Slide ->
  { note: 43, accent: false, slide: false }, // G2
  null,                                      // Rest
  { note: 39, accent: false, slide: false }, // Eb2
  { note: 41, accent: true,  slide: true  }, // F2 Acc Slide ->
  { note: 36, accent: false, slide: false }, // C2
  { note: 36, accent: false, slide: false }, // C2
  { note: 48, accent: true,  slide: false }, // C3 Acc
  { note: 46, accent: false, slide: true  }, // Bb2 Slide ->
  { note: 39, accent: false, slide: false }, // Eb2
  { note: 41, accent: false, slide: false }, // F2
  { note: 43, accent: true,  slide: true  }, // G2 Acc Slide ->
  { note: 48, accent: false, slide: false }, // C3
  null,                                      // Rest
];

function renderSequence(): void {
  const sampleRate = 44100;
  const bpm = 135;
  const stepDurationSec = 60 / (bpm * 4); // 16th note duration
  const gateFraction = 0.8;
  const loops = 4;

  const totalSteps = pattern.length * loops;
  const totalSamples = Math.floor(totalSteps * stepDurationSec * sampleRate);
  const audioData = new Float32Array(totalSamples);

  const voice = new TB303Voice();
  voice.params.cutoff = 500;
  voice.params.resonance = 0.85;
  voice.params.envMod = 0.75;
  voice.params.decay = 0.22;
  voice.params.waveform = 'saw';

  let currentSampleIdx = 0;
  let prevSlide = false; // slide=1 on a step glides into the NEXT step

  for (let l = 0; l < loops; l++) {
    // Open cutoff gradually over loops
    voice.params.cutoff = 300 + l * 450;
    // Gradually crank up RAT distortion in loops 2 and 3
    if (l >= 2) {
      voice.params.distDrive = 0.5 + (l - 2) * 0.35;
      voice.params.distTone = 0.65;
      voice.params.distType = 'rat';
    } else {
      voice.params.distDrive = 0.0;
    }

    for (let s = 0; s < pattern.length; s++) {
      const step = pattern[s];
      const stepSamples = Math.floor(stepDurationSec * sampleRate);

      if (step) {
        const freq = midiToFreq(step.note);
        const gateDuration = step.slide ? stepDurationSec * 1.05 : stepDurationSec * gateFraction;
        voice.triggerNote(
          freq,
          Boolean(step.accent),
          prevSlide,
          gateDuration,
          sampleRate
        );
      } else {
        voice.gateOff();
      }
      prevSlide = Boolean(step?.slide);

      for (let i = 0; i < stepSamples; i++) {
        if (currentSampleIdx < totalSamples) {
          audioData[currentSampleIdx] = voice.process(sampleRate);
          currentSampleIdx++;
        }
      }
    }
  }

  // Create WAV file using wavefile
  const wav = new WaveFile();
  wav.fromScratch(1, sampleRate, '32f', [audioData]);
  wav.toBitDepth('16'); // Convert to standard 16-bit PCM

  const outDir = path.resolve(process.cwd(), 'scratch');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'rendered_303.wav');
  fs.writeFileSync(outPath, wav.toBuffer());
  console.log(`Successfully rendered 303 audio to: ${outPath}`);
  console.log(`Rendered ${totalSamples} samples (${(totalSamples / sampleRate).toFixed(2)}s) at ${sampleRate}Hz.`);
}

renderSequence();
