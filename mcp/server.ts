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
import { buildAcidTrack } from '../src/app/generator.js';
import { renderTB303Haps, analyzeSignal, type RenderHap } from '../src/strudel/offline.js';

// 1. Initialize MCP Server
const server = new McpServer({
  name: 'strudel-tb303-mcp',
  version: '1.1.0',
});

// 2. Local WebSocket Bridge for Live Browser Communication
const WS_PORT = Number(process.env.TB303_WS_PORT) || 3031;
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

interface BrowserClient {
  ws: WebSocket;
  id: string;
  title?: string;
  url?: string;
  connectedAt: number;
}

const clients = new Map<WebSocket, BrowserClient>();
let wss: WebSocketServer | null = null;
/** Why the WebSocket bridge is unavailable (e.g. port already used by another server instance). */
let wsError: string | null = null;

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
    clients.set(ws, { ws, id: `c${clients.size + 1}`, connectedAt: Date.now() });
    ws.on('message', (data) => {
      let msg: any;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      const client = clients.get(ws);
      if (!client) return;
      if (msg.type === 'hello') {
        client.id = String(msg.clientId || client.id);
        client.title = typeof msg.title === 'string' ? msg.title : undefined;
        client.url = typeof msg.url === 'string' ? msg.url : undefined;
      } else if (msg.type === 'result') {
        const key = `${msg.clientId || client.id}:${msg.id}`;
        const waiter = pending.get(key);
        if (waiter) {
          pending.delete(key);
          waiter(msg);
        }
      }
    });
    ws.on('close', () => clients.delete(ws));
  });
  wss.on('error', (err: any) => {
    wsError =
      err?.code === 'EADDRINUSE'
        ? `WebSocket port ${WS_PORT} is already in use (another tb303 MCP server instance is probably running). Stop it, or start this server with TB303_WS_PORT=<port> and open the app with ?mcp=1&mcpport=<port>.`
        : `WebSocket bridge failed: ${err?.message || err}`;
    console.error(`[tb303-mcp] ${wsError}`);
    wss = null;
  });
} catch (err: any) {
  wsError = `WebSocket bridge failed to start: ${err?.message || err}`;
  wss = null;
}

const pending = new Map<string, (msg: any) => void>();
let requestSeq = 0;

interface ClientReply {
  clientId: string;
  title?: string;
  reply?: any;
  error?: string;
}

/** Send a request to the selected browser windows and wait for each reply (or a timeout). */
async function requestBrowsers(message: Record<string, unknown>, target?: string, timeoutMs = 20000): Promise<ClientReply[]> {
  const targets = [...clients.values()].filter(
    (c) => c.ws.readyState === WebSocket.OPEN && (!target || c.id === target || c.id.startsWith(target)),
  );
  return Promise.all(
    targets.map(
      (c) =>
        new Promise<ClientReply>((resolve) => {
          const id = ++requestSeq;
          const key = `${c.id}:${id}`;
          const timer = setTimeout(() => {
            pending.delete(key);
            resolve({ clientId: c.id, title: c.title, error: `no reply within ${timeoutMs} ms` });
          }, timeoutMs);
          pending.set(key, (reply) => {
            clearTimeout(timer);
            resolve({ clientId: c.id, title: c.title, reply });
          });
          c.ws.send(JSON.stringify({ ...message, id }));
        }),
    ),
  );
}

const noBrowserText = (target?: string) =>
  wsError
    ? `⚠️ ${wsError}`
    : target
      ? `⚠️ No connected browser window matches target "${target}". Use tb303_list_clients.`
      : `⚠️ No browser app is connected at ws://localhost:${WS_PORT}. Open http://localhost:3000/?mcp=1 (the ?mcp=1 is required) and wait for AGENT READY.`;

const targetParam = z.string().optional().describe('Browser window id from tb303_list_clients (default: all connected windows)');

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
$: n("0 0 7 4 ~ 2 3 0").scale("c2:minor")
  .s("tb303")
  .accent("0 1 0 0 0 1 0 0")
  .slide("0 0 1 0 0 0 1 0")
  .tbcut(sine.range(300, 3200).slow(4))
  .tbres(0.85).tbenv(0.70).tbdec(0.22)
\`\`\`

## Continuous knob moves (important for a 303 feel)
- Per-note values (.tbcut(sine...) on the notes) are sampled once per step and sound stair-stepped. Put knob moves on a lane instead: $: s("tb303ctl").segment(96).tbcut(sine.range(300, 2400).slow(8)).tbres(sine.range(0.78, 0.93).slow(12)).tbenv(...).tbdec(...). Layer signals with .add() / .mul(). Do not also set those controls on the notes.

## Notes
- n() values are SCALE DEGREES: 0 = root, 4 = fifth, 7 = one octave up (do not use 12 for an octave). Keep jumps within 0..8.

## Mixing
- Drums: \`.gain(0.7)\` kick/clap, \`.gain(0.35)\` hats; 303 plays about 3 dB under the kick by default. Distortion (tbdist) is level-matched. A master limiter (LIMIT) is on by default.

## Synthesis Parameters
- accent: 0 or 1 per step. Boosts VCA, increases envelope modulation, and charges capacitor memory circuit.
- slide: 0 or 1 per step. The step glides into the NEXT step (60ms portamento) without retriggering envelopes; a rest in between breaks the glide.
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
$: s("bd*4, ~ cp ~ cp").bank("RolandTR909").gain(0.6)
$: s("hh*8, [~ oh]*4").bank("RolandTR909").cut(1).gain(0.35)
\`\`\`
`;
    return {
      content: [{ type: 'text', text: referenceText }],
    };
  }
);

// 4. Register Tool: tb303_generate_pattern
const STYLES = {
  classic: { bpm: 138, notes: '0 0 7 4 ~ 2 3 0 0 7 6 4 ~ 3 2 0', accents: '0 1 0 0 0 1 0 0 0 0 1 0 0 1 0 0', slides: '0 0 1 0 0 0 1 0 0 0 0 1 0 0 1 0', wave: 'saw', res: 0.85, drive: 0.0, type: 'rat', cutLow: 300, cutHigh: 3200, lfo: 4 },
  hard_rat: { bpm: 140, notes: '0 0 7 4 ~ 2 3 0 0 7 6 4 ~ 3 2 0', accents: '1 0 1 0 0 1 0 1 1 0 0 1 0 1 1 0', slides: '0 0 1 0 0 0 1 0 0 0 0 1 0 0 1 0', wave: 'saw', res: 0.92, drive: 0.85, type: 'rat', cutLow: 300, cutHigh: 3800, lfo: 4 },
  square_screamer: { bpm: 136, notes: '0 2 4 6 7 6 4 2 0 2 4 6 7 6 4 2', accents: '1 0 1 0 0 1 0 1 1 0 1 0 0 1 0 1', slides: '0 0 1 0 0 0 1 0 0 0 0 1 0 0 1 0', wave: 'square', res: 0.94, drive: 0.5, type: 'fuzz', cutLow: 300, cutHigh: 3200, lfo: 4 },
  trance: { bpm: 142, notes: '0 4 7 8 7 4 3 2 0 4 7 8 7 4 3 2', accents: '0 1 0 0 0 1 0 0 0 0 1 0 0 1 0 0', slides: '0 1 0 0 1 0 1 0 0 1 0 0 1 0 1 0', wave: 'saw', res: 0.85, drive: 0.6, type: 'tube', cutLow: 300, cutHigh: 3200, lfo: 8 },
  minimal: { bpm: 132, notes: '0 ~ 0 0 ~ 2 0 ~ 0 ~ 0 0 ~ 2 0 ~', accents: '0 0 1 0 0 1 0 0 0 0 1 0 0 1 0 0', slides: '0 0 1 0 0 0 1 0 0 0 0 1 0 0 1 0', wave: 'saw', res: 0.65, drive: 0.0, type: 'rat', cutLow: 240, cutHigh: 1600, lfo: 4 },
} as const;

server.tool(
  'tb303_generate_pattern',
  'Generates a complete, executable Strudel x TB-303 track with TR-909 drums. By default an 8-bar arrangement (drums first, clap from bar 2, 303 and closed hats from bar 3, phrase variation every 2 bars) with balanced gains.',
  {
    style: z.enum(['classic', 'hard_rat', 'square_screamer', 'trance', 'minimal']).default('classic')
      .describe('Style of acid track to generate'),
    root: z.string().default('c2').describe('Root note e.g. c2, d2, f1, a1'),
    scale: z.enum(['minor', 'phrygian', 'dorian', 'locrian']).default('minor')
      .describe('Musical scale'),
    distortion: z.number().min(0).max(1).optional().describe('Distortion drive amount 0.0 to 1.0'),
    arrange: z.boolean().default(true).describe('true: 8-bar arrangement with intro/entrances; false: flat 1-bar loop with everything playing'),
  },
  async ({ style, root, scale, distortion, arrange }) => {
    const st = STYLES[style];
    const code = buildAcidTrack({
      label: `Generated Acid Track (${style.toUpperCase()})`,
      bpm: st.bpm,
      scale: `${root}:${scale}`,
      notes: st.notes,
      accents: st.accents,
      slides: st.slides,
      wave: st.wave,
      cutoffLow: st.cutLow,
      cutoffHigh: st.cutHigh,
      lfoSlow: st.lfo,
      res: st.res,
      env: 0.7,
      dec: 0.22,
      dist: { drive: distortion ?? st.drive, tone: 0.65, type: st.type },
      arrange,
    });
    return { content: [{ type: 'text' as const, text: code }] };
  },
);

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

// 5. Register Tool: tb303_list_clients
server.tool(
  'tb303_list_clients',
  'Lists the browser windows (Strudel 303 app pages opened with ?mcp=1) connected to this MCP server.',
  {},
  async () => {
    if (wsError) return text(`⚠️ ${wsError}`);
    const list = [...clients.values()].filter((c) => c.ws.readyState === WebSocket.OPEN);
    if (list.length === 0) return text(noBrowserText());
    return text(list.map((c) => `- id ${c.id}: ${c.title ?? '(untitled)'} ${c.url ?? ''}`).join('\n'));
  },
);

// 6. Register Tool: tb303_play_live_pattern
server.tool(
  'tb303_play_live_pattern',
  'Puts the given Strudel code into the browser app editor, evaluates it and starts playback. Returns the evaluation result per window, including the error message when the code is invalid.',
  {
    code: z.string().describe('The complete Strudel pattern code to inject and execute in browser'),
    target: targetParam,
  },
  async ({ code, target }) => {
    const replies = await requestBrowsers({ type: 'play_pattern', code }, target);
    if (replies.length === 0) return text(noBrowserText(target));
    const lines = replies.map((r) => {
      if (r.error) return `⚠️ [${r.clientId}] ${r.error}`;
      return r.reply.ok
        ? `✅ [${r.clientId}] evaluated and playing${r.reply.warning ? `
⚠️ ${r.reply.warning}` : ''}`
        : `❌ [${r.clientId}] evaluation FAILED: ${r.reply.error}`;
    });
    return text(lines.join('\n'));
  },
);

// 7. Register Tool: tb303_stop_live_playback
server.tool(
  'tb303_stop_live_playback',
  'Stops playback in the connected browser windows (Hush).',
  { target: targetParam },
  async ({ target }) => {
    const replies = await requestBrowsers({ type: 'stop_playback' }, target, 5000);
    if (replies.length === 0) return text(noBrowserText(target));
    return text(replies.map((r) => (r.error ? `⚠️ [${r.clientId}] ${r.error}` : `🛑 [${r.clientId}] stopped`)).join('\n'));
  },
);

// 8. Register Tool: tb303_get_state
server.tool(
  'tb303_get_state',
  'Reads the current state of the browser app: editor code, whether it was evaluated and is playing, the last evaluation/scheduler error, tempo (BPM) and limiter state.',
  { target: targetParam },
  async ({ target }) => {
    const replies = await requestBrowsers({ type: 'get_state' }, target, 8000);
    if (replies.length === 0) return text(noBrowserText(target));
    return text(
      replies.map((r) => (r.error ? `⚠️ [${r.clientId}] ${r.error}` : `[${r.clientId}] ${JSON.stringify(r.reply.state, null, 2)}`)).join('\n\n'),
    );
  },
);

// 9. Register Tool: tb303_get_levels
server.tool(
  'tb303_get_levels',
  'Measures the real output level of the playing browser app for a few seconds: peak, RMS and clipped-sample count, before and after the master limiter. Use it to check the mix after tb303_play_live_pattern.',
  {
    durationMs: z.number().int().min(500).max(15000).default(4000).describe('Measurement length in milliseconds'),
    target: targetParam,
  },
  async ({ durationMs, target }) => {
    const replies = await requestBrowsers({ type: 'get_levels', durationMs }, target, durationMs + 8000);
    if (replies.length === 0) return text(noBrowserText(target));
    return text(
      replies
        .map((r) => {
          if (r.error) return `⚠️ [${r.clientId}] ${r.error}`;
          const lv = r.reply.levels ?? {};
          if (lv.error) return `⚠️ [${r.clientId}] ${lv.error}`;
          const hint =
            lv.preLimiter?.clipSamples > 0
              ? `
Hint: ${lv.preLimiter.clipSamples} samples exceed full scale before the limiter. Lower gains (kick/clap ~0.6, hats ~0.35, 303 0.5-0.75) if the limiter is off or to keep headroom.`
              : '';
          return `[${r.clientId}] ${JSON.stringify(lv, null, 2)}${hint}`;
        })
        .join('\n\n'),
    );
  },
);

// 10. Register Tool: tb303_render_current
server.tool(
  'tb303_render_current',
  'Renders the 303 part of the pattern currently loaded in the browser app offline (same pitch/slide/gate/parameter logic as playback; drums and effects are not included) and returns metrics: peak, RMS, clipping, spectral brightness, activity and per-bar level. Saves a WAV file.',
  {
    cycles: z.number().int().min(1).max(64).default(8).describe('Number of cycles (bars) to render'),
    outputPath: z.string().optional().describe('Relative or absolute .wav path (default scratch/current_303_<time>.wav)'),
    target: targetParam,
  },
  async ({ cycles, outputPath, target }) => {
    const replies = await requestBrowsers({ type: 'get_haps', cycles }, target, 10000);
    if (replies.length === 0) return text(noBrowserText(target));
    const r = replies[0];
    if (r.error) return text(`⚠️ [${r.clientId}] ${r.error}`);
    if (!r.reply.ok) return text(`❌ [${r.clientId}] ${r.reply.error}`);
    const haps = r.reply.haps as RenderHap[];
    if (!haps.length) return text(`⚠️ [${r.clientId}] no tb303 events in the first ${cycles} cycles (${r.reply.note ?? 'is a tb303 pattern playing?'})`);

    const sampleRate = 44100;
    const cps = r.reply.cps as number;
    const audio = renderTB303Haps(haps, cps, cycles, sampleRate);
    const metrics = analyzeSignal(audio, sampleRate, cps);

    const wav = new WaveFile();
    wav.fromScratch(1, sampleRate, '32f', [audio]);
    wav.toBitDepth('16');
    const dest = outputPath
      ? path.resolve(process.cwd(), outputPath)
      : path.resolve(process.cwd(), 'scratch', `current_303_${Date.now()}.wav`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, wav.toBuffer());
    return text(
      `🎵 Rendered ${haps.length} notes of the 303 part (${cycles} cycles @ ${(cps * 240).toFixed(1)} BPM) from window ${r.clientId}
` +
        `File: ${dest}
Metrics: ${JSON.stringify(metrics, null, 2)}`,
    );
  },
);

// 11. Register Tool: tb303_render_audio_file
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
  // The WebSocket server keeps the event loop alive, so exit explicitly when the MCP client goes
  // away. Otherwise an orphaned server keeps the bridge port and blocks the next instance.
  const shutdown = () => process.exit(0);
  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
}

run().catch((err) => {
  console.error('Fatal MCP Server error:', err);
  process.exit(1);
});
