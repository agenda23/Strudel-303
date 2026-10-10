import './style.css';
import {
  initStrudel,
  evaluate,
  hush,
  getAudioContext,
  evalScope,
  samples,
} from '@strudel/web';
import { registerTB303Controls } from './strudel/controls';
import { TB303Bridge } from './strudel/bridge';
import { installMasterLimiter, type MasterLimiter } from './strudel/master';
import { getSuperdoughAudioController } from '@strudel/web';
import { createCodeEditor } from './app/editor';
import { connectAgent } from './app/agent';
import { createMeter } from './strudel/meter';
import { startHighlighter } from './app/highlight';
import { openManualModal } from './app/manual';
import { AIAgentComposer } from './app/composer';
import { PRESETS } from './app/presets';
import type { EditorView } from 'codemirror';

const SAVED_CODE_KEY = 'strudel_tb303_saved_code';

let bridge: TB303Bridge | null = null;
let isAudioInitialized = false;
let editorView: EditorView | null = null;
let strudelRepl: any = null;
let masterLimiter: MasterLimiter | null = null;
let preMeter: ReturnType<typeof createMeter> | null = null;
let postMeter: ReturnType<typeof createMeter> | null = null;
const LIMITER_KEY = 'strudel_tb303_limiter';
const limiterWanted = () => {
  try {
    return localStorage.getItem(LIMITER_KEY) !== '0';
  } catch {
    return true;
  }
};
let evaluatedCode: string | null = null;
let animFrameId: number | null = null;

// Distortion state
let distortionState = {
  enabled: true,
  drive: 0.0,
  tone: 0.7,
  mix: 1.0,
  type: 'rat',
};

async function setupApp() {
  const appMount = document.querySelector<HTMLDivElement>('#app')!;
  appMount.innerHTML = `
    <header>
      <div class="brand">
        <span class="badge-303">TB-303</span>
        <div class="brand-text">
          <h1>Strudel 303</h1>
          <span class="subtitle">BASS LINE WORKSTATION</span>
        </div>
      </div>
      <div class="header-actions">
        <div class="bpm-control">
          <label for="input-bpm">TEMPO</label>
          <input type="number" id="input-bpm" min="80" max="180" value="138" step="1" title="Pattern BPM">
          <span class="bpm-unit">BPM</span>
        </div>
        <button id="btn-limiter" class="btn btn-secondary" title="Master limiter / soft clipper (prevents digital clipping)">LIMIT</button>
        <button id="btn-manual" class="btn btn-secondary">DOCS</button>
        <a class="btn btn-secondary" href="https://github.com/agenda23/Strudel-303" target="_blank" rel="noopener noreferrer" title="Source code (AGPL-3.0-or-later)">SOURCE</a>
        <button id="btn-ai-toggle" class="btn btn-secondary">AI ASSIST</button>
        <span id="mcp-status" class="mcp-indicator">AGENT OFFLINE</span>
        <div class="status-badge">
          <span class="status-dot" id="status-dot"></span>
          <span id="status-text">STOPPED</span>
        </div>
        <button id="btn-play" class="btn btn-play">EVAL</button>
        <button id="btn-stop" class="btn btn-stop">STOP</button>
      </div>
    </header>

    <main>
      <section class="editor-container">
        <div class="editor-header">
          <span class="editor-title">Pattern Editor (Strudel-compatible)</span>
          <div class="editor-shortcuts">
            <kbd>Ctrl+Enter</kbd> Eval &nbsp;·&nbsp; <kbd>Ctrl+.</kbd> Stop
          </div>
        </div>
        <div id="editor-error-banner" class="editor-error-banner" style="display: none;"></div>
        <div class="editor-stage">
          <canvas id="test-canvas"></canvas>
          <div id="editor-mount"></div>
        </div>
      </section>

      <aside>
        <div class="panel-header">
          <span>OSCILLOSCOPE</span>
          <span class="panel-tag">ANALOG 303 OUT</span>
        </div>

        <div class="panel-section">
          <div class="scope-card">
            <canvas id="scope-canvas"></canvas>
          </div>
          <div class="indicator-row">
            <div class="indicator-badge">
              <span>ACCENT</span>
              <span class="indicator-led" id="led-accent"></span>
            </div>
            <div class="indicator-badge">
              <span>SLIDE</span>
              <span class="indicator-led" id="led-slide"></span>
            </div>
          </div>
        </div>

        <!-- Overdrive / Distortion Unit -->
        <div class="panel-section">
          <div class="pedal-box">
            <div class="pedal-header-row">
              <span class="pedal-title">OVERDRIVE / DISTORTION</span>
              <button class="toggle-btn active" id="btn-dist-toggle">ACTIVE</button>
            </div>

            <div class="pedal-type-selector">
              <button class="type-btn active" data-type="rat">RAT</button>
              <button class="type-btn" data-type="tube">TUBE</button>
              <button class="type-btn" data-type="fuzz">FUZZ</button>
            </div>

            <div class="slider-group">
              <div class="slider-row">
                <div class="slider-header">
                  <span>DRIVE</span>
                  <span class="slider-val" id="disp-drive">0%</span>
                </div>
                <input type="range" class="pedal-slider" id="slider-drive" min="0" max="100" value="0">
              </div>

              <div class="slider-row">
                <div class="slider-header">
                  <span>TONE</span>
                  <span class="slider-val" id="disp-tone">70%</span>
                </div>
                <input type="range" class="pedal-slider" id="slider-tone" min="0" max="100" value="70">
              </div>

              <div class="slider-row">
                <div class="slider-header">
                  <span>MIX</span>
                  <span class="slider-val" id="disp-mix">100%</span>
                </div>
                <input type="range" class="pedal-slider" id="slider-mix" min="0" max="100" value="100">
              </div>
            </div>
          </div>
        </div>

        <div class="panel-section">
          <h3>VCF / ENVELOPE TELEMETRY</h3>
          <div class="knob-grid">
            <div class="knob-card">
              <span class="knob-label">CUTOFF</span>
              <span class="knob-value" id="val-cut">--</span>
            </div>
            <div class="knob-card">
              <span class="knob-label">RESONANCE</span>
              <span class="knob-value" id="val-res">--</span>
            </div>
            <div class="knob-card">
              <span class="knob-label">ENV MOD</span>
              <span class="knob-value" id="val-env">--</span>
            </div>
            <div class="knob-card">
              <span class="knob-label">DECAY</span>
              <span class="knob-value" id="val-dec">--</span>
            </div>
          </div>
        </div>

        <div class="panel-section">
          <h3>PATTERNS</h3>
          <div class="preset-grid">
            <button class="btn-preset" data-preset="classic">Classic 303 (138)</button>
            <button class="btn-preset" data-preset="rat">RAT Drive (140)</button>
            <button class="btn-preset" data-preset="square">Square Wave (136)</button>
            <button class="btn-preset" data-preset="trance">Acid Trance (142)</button>
            <button class="btn-preset" data-preset="minimal">Minimal Sub (132)</button>
          </div>
        </div>
      </aside>
    </main>
  `;

  // 1. Register Strudel custom controls
  const controls = registerTB303Controls();
  evalScope(controls);

  // 2. Load saved code or default preset
  let savedCode = localStorage.getItem(SAVED_CODE_KEY);
  if (savedCode && /"[^"]*\.cut\([^\)]*\)[^"]*"/.test(savedCode)) {
    savedCode = null;
    localStorage.removeItem(SAVED_CODE_KEY);
  }
  const initialCode = savedCode && savedCode.trim() ? savedCode : PRESETS.classic.code;

  // Resume audio on the first interaction (browsers keep the context suspended until then)
  for (const ev of ['pointerdown', 'keydown'] as const) {
    document.addEventListener(ev, () => void getAudioContext().resume?.(), { once: true });
  }

  // 3. Initialize CodeMirror
  const editorMount = document.querySelector<HTMLDivElement>('#editor-mount')!;
  editorView = createCodeEditor(editorMount, initialCode, {
    onEvaluate: handleRun,
    onStop: handleStop,
  });

  // Strudel-style active-step highlight and pianoroll canvas (`.pianoroll()` draws into #test-canvas)
  startHighlighter(editorView, () => strudelRepl?.scheduler ?? null, () => evaluatedCode);
  const stage = document.querySelector<HTMLElement>('.editor-stage')!;
  const roll = document.querySelector<HTMLCanvasElement>('#test-canvas')!;
  const fitRoll = () => {
    const dpr = window.devicePixelRatio || 1;
    roll.width = Math.max(1, Math.floor(stage.clientWidth * dpr));
    roll.height = Math.max(1, Math.floor(stage.clientHeight * dpr));
  };
  new ResizeObserver(fitRoll).observe(stage);
  fitRoll();

  // 4. UI Buttons & Presets
  const btnPlay = document.querySelector<HTMLButtonElement>('#btn-play')!;
  const btnStop = document.querySelector<HTMLButtonElement>('#btn-stop')!;
  const bpmInput = document.querySelector<HTMLInputElement>('#input-bpm')!;
  const btnAiToggle = document.querySelector<HTMLButtonElement>('#btn-ai-toggle')!;

  btnPlay.addEventListener('click', () => {
    if (editorView) {
      handleRun(editorView.state.doc.toString());
    }
  });

  btnStop.addEventListener('click', () => {
    handleStop();
  });

  document.querySelector('#btn-limiter')?.addEventListener('click', () => {
    const next = !(masterLimiter ? masterLimiter.isEnabled() : limiterWanted());
    try {
      localStorage.setItem(LIMITER_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    masterLimiter?.setEnabled(next);
    syncLimiterButton(next);
  });
  syncLimiterButton(limiterWanted());

  document.querySelector('#btn-manual')?.addEventListener('click', () => {
    openManualModal();
  });

  bpmInput.addEventListener('change', () => {
    const bpm = Math.min(200, Math.max(60, Number(bpmInput.value) || 138));
    bpmInput.value = String(bpm);
    applyTempo(bpm);
    if (editorView) {
      // keep a tempo statement in the code in sync, but never rewrite other tempo forms
      const code = editorView.state.doc.toString();
      const synced = code
        .replace(/setcps\([^)]*\)/, `setcps(${bpm}/60/4)`)
        .replace(/setcpm\([^)]*\)/, `setcpm(${bpm}/4)`);
      if (synced !== code) {
        editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: synced } });
      }
    }
  });

  document.querySelectorAll<HTMLButtonElement>('.btn-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pKey = btn.dataset.preset;
      if (pKey && PRESETS[pKey] && editorView) {
        const preset = PRESETS[pKey];
        bpmInput.value = String(preset.bpm);
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: preset.code },
        });
        handleRun(preset.code);
      }
    });
  });

  // 6. Setup AI Agent Composer Modal
  const composer = new AIAgentComposer({
    onApplyCode: (code: string, runImmediately: boolean) => {
      if (editorView) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: code },
        });
        if (runImmediately) {
          handleRun(code);
        }
      }
    },
  });

  btnAiToggle.addEventListener('click', () => {
    composer.open();
  });

  // 7. Setup Distortion UI Controls
  setupDistortionControls();

  // 8. Setup Scope Canvas loop
  setupOscilloscope();

  // 9. Background prefetch samples
  loadSamples();

  // 10. Initialize local MCP Bridge WebSocket connection
  initMcpBridge();
}

function initMcpBridge(): void {
  connectAgent(
    {
      run: async (code) => {
        if (editorView) {
          editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: code } });
        }
        return handleRun(code);
      },
      stop: () => handleStop(),
      getState: () => {
        const st = strudelRepl?.state;
        const err = st?.evalError || st?.schedulerError;
        return {
          code: editorView?.state.doc.toString() ?? '',
          evaluated: evaluatedCode !== null && evaluatedCode === editorView?.state.doc.toString(),
          playing: Boolean(st?.started),
          error: err ? String(err.message || err) : null,
          bpm: strudelRepl?.scheduler ? Math.round(strudelRepl.scheduler.cps * 240 * 10) / 10 : null,
          limiter: masterLimiter?.isEnabled() ?? limiterWanted(),
        };
      },
      measureLevels: async (ms) => {
        if (!preMeter || !postMeter) return { error: 'audio not started yet: run a pattern first' };
        const [pre, post] = await Promise.all([preMeter(ms), postMeter(ms)]);
        return { durationMs: ms, preLimiter: pre, postLimiter: post, limiter: masterLimiter?.isEnabled() };
      },
      getHaps: (cycles) => {
        const pattern = strudelRepl?.state?.pattern;
        const cps = strudelRepl?.scheduler?.cps;
        if (!pattern || !cps) return { cps: cps ?? null, haps: [], note: 'no pattern evaluated yet' };
        const haps: any[] = [];
        for (const h of pattern.queryArc(0, cycles)) {
          h.ensureObjectValue?.();
          if (!h.whole || !h.hasOnset?.() || (h.value?.s !== 'tb303' && h.value?.s !== 'tb303ctl')) continue;
          const value: Record<string, string | number> = {};
          for (const [k, v] of Object.entries(h.value)) {
            if (typeof v === 'number' || typeof v === 'string') value[k] = v;
          }
          haps.push({ begin: Number(h.whole.begin.valueOf()), end: Number(h.whole.end.valueOf()), value });
        }
        return { cps, cycles, haps };
      },
    },
    document.querySelector<HTMLElement>('#mcp-status'),
  );
}

function setupDistortionControls() {
  const btnToggle = document.querySelector<HTMLButtonElement>('#btn-dist-toggle')!;
  const sliderDrive = document.querySelector<HTMLInputElement>('#slider-drive')!;
  const sliderTone = document.querySelector<HTMLInputElement>('#slider-tone')!;
  const sliderMix = document.querySelector<HTMLInputElement>('#slider-mix')!;
  const dispDrive = document.querySelector('#disp-drive')!;
  const dispTone = document.querySelector('#disp-tone')!;
  const dispMix = document.querySelector('#disp-mix')!;

  btnToggle.addEventListener('click', () => {
    distortionState.enabled = !distortionState.enabled;
    btnToggle.textContent = distortionState.enabled ? 'ACTIVE' : 'BYPASS';
    btnToggle.classList.toggle('active', distortionState.enabled);
    if (bridge) bridge.setDistortion(distortionState);
  });

  sliderDrive.addEventListener('input', () => {
    const val = Number(sliderDrive.value) / 100;
    distortionState.drive = val;
    dispDrive.textContent = `${sliderDrive.value}%`;
    if (bridge) bridge.setDistortion(distortionState);
  });

  sliderTone.addEventListener('input', () => {
    const val = Number(sliderTone.value) / 100;
    distortionState.tone = val;
    dispTone.textContent = `${sliderTone.value}%`;
    if (bridge) bridge.setDistortion(distortionState);
  });

  sliderMix.addEventListener('input', () => {
    const val = Number(sliderMix.value) / 100;
    distortionState.mix = val;
    dispMix.textContent = `${sliderMix.value}%`;
    if (bridge) bridge.setDistortion(distortionState);
  });

  document.querySelectorAll<HTMLButtonElement>('.type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type || 'rat';
      distortionState.type = type;
      if (bridge) bridge.setDistortion(distortionState);
    });
  });
}

function syncLimiterButton(on = masterLimiter ? masterLimiter.isEnabled() : limiterWanted()) {
  const btn = document.querySelector<HTMLButtonElement>('#btn-limiter');
  if (!btn) return;
  btn.textContent = on ? 'LIMIT ON' : 'LIMIT OFF';
  btn.classList.toggle('active', on);
}

let samplesPromise: Promise<void> | null = null;
/** Sample banks are fetched once; failures are reported instead of silently ignored. */
function loadSamples(): Promise<void> {
  if (!samplesPromise) {
    samplesPromise = Promise.allSettled([
      samples('https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json'),
      samples('github:tidalcycles/dirt-samples'),
    ]).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        console.warn(`Sample banks: ${failed}/${results.length} failed to load (offline?). Drums may be silent.`);
        updateStatus(false, 'Sample load failed (offline?)');
        samplesPromise = null; // allow retry on next run
      } else {
        console.log('Roland TR-909 drum samples ready.');
      }
    });
  }
  return samplesPromise;
}

/** Change tempo live through Strudel's own setcpm, without re-evaluating the pattern. */
function applyTempo(bpm: number) {
  try {
    (globalThis as any).setcpm?.(bpm / 4);
  } catch (e) {
    console.warn('setcpm failed:', e);
  }
}

async function ensureAudioReady() {
  if (isAudioInitialized && bridge) return;

  const audioCtx = getAudioContext();
  if (audioCtx.state === 'suspended') {
    // Without a user gesture the browser never resolves resume(); do not block evaluation on it
    // (an AI agent may drive the page before anyone has clicked). Playback starts after a click.
    await Promise.race([audioCtx.resume(), new Promise((r) => setTimeout(r, 1000))]);
  }

  // Strudel must be initialised first: the bridge registers `tb303` into superdough's sound map.
  strudelRepl = await initStrudel({ prebake: () => loadSamples() });
  masterLimiter = installMasterLimiter(audioCtx, getSuperdoughAudioController().output.destinationGain, limiterWanted());
  syncLimiterButton();
  preMeter = createMeter(audioCtx, getSuperdoughAudioController().output.destinationGain);
  postMeter = createMeter(audioCtx, masterLimiter.output);

  bridge = new TB303Bridge(audioCtx);
  bridge.onWarning = (msg) => console.warn(msg);
  await bridge.init();
  bridge.setDistortion(distortionState);

  // Attach live parameter monitor callbacks
  bridge.onParamUpdate = (params, accent, slide) => {
    if (params.cutoff !== undefined) {
      const el = document.querySelector('#val-cut');
      if (el) el.textContent = `${Math.round(params.cutoff)} Hz`;
    }
    if (params.resonance !== undefined) {
      const el = document.querySelector('#val-res');
      if (el) el.textContent = params.resonance.toFixed(2);
    }
    if (params.envMod !== undefined) {
      const el = document.querySelector('#val-env');
      if (el) el.textContent = params.envMod.toFixed(2);
    }
    if (params.decay !== undefined) {
      const el = document.querySelector('#val-dec');
      if (el) el.textContent = `${params.decay.toFixed(2)} s`;
    }

    // Reflect distDrive from pattern code to UI slider
    if (params.distDrive !== undefined) {
      const slider = document.querySelector<HTMLInputElement>('#slider-drive');
      const disp = document.querySelector('#disp-drive');
      const pct = Math.round(params.distDrive * 100);
      if (slider) slider.value = String(pct);
      if (disp) disp.textContent = `${pct}%`;
    }

    const ledAcc = document.querySelector('#led-accent');
    if (ledAcc) {
      if (accent) {
        ledAcc.classList.add('accent-on');
        setTimeout(() => ledAcc.classList.remove('accent-on'), 120);
      }
    }

    const ledSlide = document.querySelector('#led-slide');
    if (ledSlide) {
      if (slide) {
        ledSlide.classList.add('slide-on');
        setTimeout(() => ledSlide.classList.remove('slide-on'), 120);
      }
    }
  };

  isAudioInitialized = true;
}

async function handleRun(code: string): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const errorBanner = document.querySelector<HTMLElement>('#editor-error-banner');
  const fail = (message: string) => {
    updateStatus(false, `ERR: ${message}`.slice(0, 60));
    if (errorBanner) {
      errorBanner.style.display = 'block';
      errorBanner.textContent = `[EVAL ERROR] ${message}`;
    }
    return { ok: false, error: message };
  };
  try {
    try {
      localStorage.setItem(SAVED_CODE_KEY, code);
    } catch {
      /* storage unavailable */
    }

    await ensureAudioReady();
    updateStatus(true);
    bridge?.clearKnobs(); // lanes from the previous code stop owning parameters
    const pattern = await evaluate(code);
    // Strudel's evaluate() swallows errors (it logs and returns undefined), so read its state.
    const evalError = strudelRepl?.state?.evalError;
    if (evalError || pattern === undefined) {
      return fail(String(evalError?.message || evalError || 'evaluation failed'));
    }
    evaluatedCode = code;

    if (errorBanner) {
      errorBanner.style.display = 'none';
      errorBanner.textContent = '';
    }
    const locked = getAudioContext().state !== 'running';
    return locked
      ? { ok: true, warning: 'Code evaluated, but the browser has not unlocked audio yet: click once anywhere in the app window to hear it.' }
      : { ok: true };
  } catch (err: any) {
    console.error('Strudel evaluation error:', err);
    return fail(String(err?.message || err));
  }
}

function handleStop() {
  hush();
  if (bridge) {
    bridge.reset();
  }
  updateStatus(false);
}

function updateStatus(isPlaying: boolean, customMessage?: string) {
  const dot = document.querySelector('#status-dot');
  const text = document.querySelector('#status-text');
  if (dot && text) {
    if (isPlaying) {
      dot.className = 'status-dot running';
      text.textContent = 'RUNNING';
    } else {
      dot.className = 'status-dot';
      text.textContent = customMessage || 'STOPPED';
    }
  }
}

function setupOscilloscope() {
  const canvas = document.querySelector<HTMLCanvasElement>('#scope-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  function resize() {
    if (!canvas) return;
    canvas.width = canvas.clientWidth * window.devicePixelRatio;
    canvas.height = canvas.clientHeight * window.devicePixelRatio;
  }
  resize();
  window.addEventListener('resize', resize);

  const bufferLength = 1024;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    animFrameId = requestAnimationFrame(draw);
    if (!canvas || !ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Matte cathode background
    ctx.fillStyle = '#0c0d10';
    ctx.fillRect(0, 0, w, h);

    // Subtle graticule grid lines
    ctx.strokeStyle = '#181b22';
    ctx.lineWidth = 1;

    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // 4 Vertical divisions
    for (let div = 1; div < 4; div++) {
      ctx.beginPath();
      ctx.moveTo((w * div) / 4, 0);
      ctx.lineTo((w * div) / 4, h);
      ctx.stroke();
    }

    const analyser = bridge?.getAnalyser();
    if (!analyser) {
      ctx.strokeStyle = '#2d3748';
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    analyser.getByteTimeDomainData(dataArray);

    // Refined green phosphor beam
    ctx.lineWidth = 1.8 * window.devicePixelRatio;
    ctx.strokeStyle = '#10b981';
    ctx.beginPath();

    const sliceWidth = w / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * h) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();
  }

  draw();
}

window.addEventListener('DOMContentLoaded', () => {
  setupApp();
});
