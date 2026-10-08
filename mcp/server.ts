#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import fs from 'node:fs';
import pkg from 'wavefile';
const { WaveFile } = pkg;
import { TB303Voice } from '../src/dsp/tb303.js';

// 1. Initialize MCP Server
const server = new McpServer({
  name: 'strudel-tb303-mcp',
  version: '1.0.0',
});

// 2. Local WebSocket Bridge for Live Browser Communication
const WS_PORT = 3031;
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);
let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

try {
  wss = new WebSocketServer({
    host: '127.0.0.1',
    port: WS_PORT,
    verifyClient: (info, callback) => {
      // Exact-match allowlist. Requests without an Origin (non-browser clients) are rejected:
      // only the app page in a browser needs this socket.
      const origin = info.origin || info.req.headers.origin;
      if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) {
        callback(true);
      } else {
        callback(false, 403, 'Forbidden origin');
      }
    },
  });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });
  wss.on('error', (err: any) => {
    // Gracefully ignore port binding conflicts (e.g. multiple MCP server instances)
    wss = null;
  });
} catch (err) {
  wss = null;
}

function broadcastToBrowser(message: any): number {
  let count = 0;
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
      count++;
    }
  }
  return count;
}

// 3. Register Tool: tb303_get_reference
server.tool(
  'tb303_get_reference',
  'Returns the complete syntax reference and parameter guide for TB-303 synthesis and Strudel patterns.',
  {},
  async () => {
    const referenceText = `# Strudel × TB-303 Reference Manual

## Pattern Routing
To use the custom TB-303 AudioWorklet synthesizer, chain \`.s("tb303")\` onto any note pattern:
\`\`\`javascript
$: n("0 0 12 7 ~ 3 5 0").scale("c2:minor")
  .s("tb303")
  .accent("0 1 0 0 0 1 0 0")
  .slide("0 0 1 0 0 0 1 0")
  .tbcut(sine.range(300, 3200).slow(4))
  .tbres(0.85).tbenv(0.70).tbdec(0.22)
\`\`\`

## Synthesis Parameters
- accent: 0 or 1 per step. Boosts VCA, increases envelope modulation, and charges capacitor memory circuit.
- slide: 0 or 1 per step. Continuous 60ms portamento legato glide without retriggering envelopes.
- tbcut: Cutoff frequency in Hz (50 - 8000 Hz). Supports LFOs like sine.range(300, 3200).slow(4).
- tbres: Resonance (0.0 to 1.0). Diode ladder negative feedback with non-linear saturation.
- tbenv: MEG envelope mod depth (0.0 to 1.0).
- tbdec: Filter decay in seconds (0.05 to 2.0s). Shortens on accented notes.
- tbwave: Waveform ("saw" | "square"). PolyBLEP anti-aliased.
- tbslidetime: Glide duration in seconds (default 0.06).

## Distortion / Overdrive Parameters
- tbdist: Drive amount (0.0 to 1.0).
- tbdisttone: Tone cutoff (0.0 = dark 700Hz to 1.0 = screaming 14kHz).
- tbdisttype: Circuit flavor ("rat" = asymmetric diode clipping | "tube" = warm saturation | "fuzz" = hard clipping).
- tbdistmix: Dry/Wet balance (0.0 to 1.0).

## Roland TR-909 Drums
\`\`\`javascript
$: s("bd*4, [~ cp]*2, hh*16").bank("RolandTR909")
\`\`\`
`;
    return {
      content: [{ type: 'text', text: referenceText }],
    };
  }
);

// 4. Register Tool: tb303_generate_pattern
server.tool(
  'tb303_generate_pattern',
  'Generates a complete, executable Strudel × TB-303 pattern with TR-909 drums based on stylistic parameters.',
  {
    style: z.enum(['classic', 'hard_rat', 'square_screamer', 'trance', 'minimal']).default('classic')
      .describe('Style of acid track to generate'),
    root: z.string().default('c2').describe('Root note e.g. c2, d2, f1, a1'),
    scale: z.enum(['minor', 'phrygian', 'dorian', 'locrian']).default('minor')
      .describe('Musical scale'),
    distortion: z.number().min(0).max(1).optional().describe('Distortion drive amount 0.0 to 1.0'),
  },
  async ({ style, root, scale, distortion }) => {
    let notes = '0 0 12 7 ~ 3 5 0 0 12 10 7 ~ 5 3 0';
    let accents = '0 1 0 0 0 1 0 0 0 0 1 0 0 1 0 0';
    let slides = '0 0 1 0 0 0 1 0 0 0 0 1 0 0 1 0';
    let wave = 'saw';
    let distDrive = distortion !== undefined ? distortion : 0.0;
    let distType = 'rat';
    let distTone = 0.65;
    let cutoffLow = 300;
    let cutoffHigh = 3200;
    let lfoSpeed = 4;
    let res = 0.85;

    if (style === 'hard_rat') {
      accents = '1 0 1 0 0 1 0 1 1 0 0 1 0 1 1 0';
      distDrive = distortion !== undefined ? distortion : 0.85;
      distType = 'rat';
      cutoffHigh = 3800;
      res = 0.92;
    } else if (style === 'square_screamer') {
      wave = 'square';
      notes = '0 3 7 10 12 10 7 3 0 3 7 10 12 10 7 3';
      accents = '1 0 1 0 0 1 0 1 1 0 1 0 0 1 0 1';
      distDrive = distortion !== undefined ? distortion : 0.5;
      distType = 'fuzz';
      res = 0.94;
    } else if (style === 'trance') {
      notes = '0 7 12 14 12 7 5 3 0 7 12 14 12 7 5 3';
      slides = '0 1 0 0 1 0 1 0 0 1 0 0 1 0 1 0';
      distDrive = distortion !== undefined ? distortion : 0.6;
      distType = 'tube';
      lfoSpeed = 8;
    } else if (style === 'minimal') {
      notes = '0 ~ 0 0 ~ 3 0 ~ 0 ~ 0 0 ~ 3 0 ~';
      accents = '0 0 1 0 0 1 0 0 0 0 1 0 0 1 0 0';
      cutoffLow = 240;
      cutoffHigh = 1600;
      res = 0.65;
    }

    const bpm = { classic: 138, hard_rat: 140, square_screamer: 136, trance: 142, minimal: 132 }[style];
    const code = `// ⚡ Generated Acid Track (${style.toUpperCase()}, ${bpm} BPM)
setcps(${bpm}/60/4)

$: n("${notes}").scale("${root}:${scale}")
  .s("tb303")
  .tbwave("${wave}")
  .accent("${accents}")
  .slide("${slides}")
  .tbcut(sine.range(${cutoffLow}, ${cutoffHigh}).slow(${lfoSpeed}))
  .tbres(${res})
  .tbenv(0.70)
  .tbdec(0.22)
  .tbdist(${distDrive})
  .tbdisttone(${distTone})
  .tbdisttype("${distType}")

$: s("bd*4, [~ cp]*2, hh*16").bank("RolandTR909")
`;
    return {
      content: [{ type: 'text', text: code }],
    };
  }
);

// 5. Register Tool: tb303_play_live_pattern
server.tool(
  'tb303_play_live_pattern',
  'Sends the given Strudel code directly to the active browser app and evaluates/plays it in real-time.',
  {
    code: z.string().describe('The complete Strudel pattern code to inject and execute in browser'),
  },
  async ({ code }) => {
    const clientsCount = broadcastToBrowser({
      type: 'play_pattern',
      code,
    });

    if (clientsCount === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Code generated, but no active browser app is connected at ws://localhost:${WS_PORT}. Open http://localhost:3000/ in your browser to enable live execution.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ Successfully broadcasted pattern to ${clientsCount} connected browser window(s). Live playback started.`,
        },
      ],
    };
  }
);

// 6. Register Tool: tb303_stop_live_playback
server.tool(
  'tb303_stop_live_playback',
  'Stops playback in all connected live browser windows (Hush).',
  {},
  async () => {
    const clientsCount = broadcastToBrowser({ type: 'stop_playback' });
    return {
      content: [
        {
          type: 'text',
          text: `🛑 Sent stop command to ${clientsCount} browser window(s).`,
        },
      ],
    };
  }
);

// 7. Register Tool: tb303_render_audio_file
server.tool(
  'tb303_render_audio_file',
  'Renders a TB-303 acid sequence offline using the internal DSP core (PolyBLEP + TPT Diode Ladder + Distortion) and saves it as a 16-bit WAV file.',
  {
    outputPath: z.string().optional().describe('Relative or absolute file path to save the .wav file'),
    bpm: z.number().default(135).describe('Tempo in BPM'),
    loops: z.number().default(4).describe('Number of 16-step pattern repetitions'),
    cutoff: z.number().default(600).describe('Base filter cutoff in Hz'),
    resonance: z.number().default(0.85).describe('Resonance amount 0.0 to 1.0'),
    distortionDrive: z.number().default(0.7).describe('Distortion drive 0.0 to 1.0'),
    distortionType: z.enum(['rat', 'tube', 'fuzz']).default('rat'),
    waveform: z.enum(['saw', 'square']).default('saw'),
  },
  async ({ outputPath, bpm, loops, cutoff, resonance, distortionDrive, distortionType, waveform }) => {
    const sampleRate = 44100;
    const stepDurationSec = 60 / (bpm * 4);
    const gateFraction = 0.85;

    // 16-step test pattern
    const pattern = [
      { note: 36, accent: false, slide: false },
      { note: 36, accent: true, slide: false },
      { note: 48, accent: false, slide: true },
      { note: 43, accent: false, slide: false },
      null,
      { note: 39, accent: false, slide: false },
      { note: 41, accent: true, slide: true },
      { note: 36, accent: false, slide: false },
      { note: 36, accent: false, slide: false },
      { note: 48, accent: true, slide: false },
      { note: 46, accent: false, slide: true },
      { note: 39, accent: false, slide: false },
      { note: 41, accent: false, slide: false },
      { note: 43, accent: true, slide: true },
      { note: 48, accent: false, slide: false },
      null,
    ];

    const totalSteps = pattern.length * loops;
    const totalSamples = Math.floor(totalSteps * stepDurationSec * sampleRate);
    const audioData = new Float32Array(totalSamples);

    const voice = new TB303Voice();
    voice.params.cutoff = cutoff;
    voice.params.resonance = resonance;
    voice.params.envMod = 0.75;
    voice.params.decay = 0.22;
    voice.params.waveform = waveform;
    voice.params.distDrive = distortionDrive;
    voice.params.distTone = 0.65;
    voice.params.distType = distortionType;

    let currentSampleIdx = 0;
    let prevSlide = false; // slide=1 on a step glides into the NEXT step
    for (let l = 0; l < loops; l++) {
      // Dynamic cutoff evolution
      voice.params.cutoff = cutoff + l * 300;

      for (let s = 0; s < pattern.length; s++) {
        const step = pattern[s];
        const stepSamples = Math.floor(stepDurationSec * sampleRate);

        if (step) {
          const freq = 440 * Math.pow(2, (step.note - 69) / 12);
          const gateDuration = step.slide ? stepDurationSec * 1.05 : stepDurationSec * gateFraction;
          voice.triggerNote(freq, step.accent, prevSlide, gateDuration, sampleRate);
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

    const wav = new WaveFile();
    wav.fromScratch(1, sampleRate, '32f', [audioData]);
    wav.toBitDepth('16');

    const destPath = outputPath
      ? path.resolve(process.cwd(), outputPath)
      : path.resolve(process.cwd(), 'scratch', `rendered_303_${Date.now()}.wav`);

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.writeFileSync(destPath, wav.toBuffer());

    return {
      content: [
        {
          type: 'text',
          text: `🎵 Successfully rendered TB-303 audio:\n- File: ${destPath}\n- Length: ${(totalSamples / sampleRate).toFixed(2)} seconds (${totalSamples} samples)\n- Format: 16-bit Linear PCM @ ${sampleRate}Hz\n- DSP Parameters: Cutoff=${cutoff}Hz, Res=${resonance}, Drive=${distortionDrive} (${distortionType.toUpperCase()}), Wave=${waveform}`,
        },
      ],
    };
  }
);

// 8. Start MCP Server Transport
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error('Fatal MCP Server error:', err);
  process.exit(1);
});
