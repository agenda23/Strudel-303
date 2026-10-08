/**
 * Procedural & AI Pattern Generator for Strudel x TB-303
 */

const SYSTEM_PROMPT = `You are an electronic music producer specializing in Acid Techno with Strudel.
Generate valid Strudel live coding patterns using TB-303 (.s("tb303")) and Roland TR-909 drums.

SYNTAX RULES:
1. TB-303 basslines:
   - Must use .s("tb303")
   - Use .scale("root:scale") e.g. "c2:minor", "d2:phrygian", "f1:dorian"
   - Use .accent("...") with 0 and 1
   - Use .slide("...") with 0 and 1
   - Use .tbcut(...) for cutoff (e.g. sine.range(min, max).slow(cycles))
   - Use .tbres(0.0 to 1.0)
   - Use .tbenv(0.0 to 1.0)
   - Use .tbdec(0.1 to 1.5)
   - Optional: .tbwave("saw" or "square")
   - Optional distortion: .tbdist(0.0 to 1.0), .tbdisttone(0.0 to 1.0), .tbdisttype("rat"|"tube"|"fuzz")
2. Drums:
   - $: s("bd*4, ~ cp ~ cp").bank("RolandTR909")
   - $: s("hh*8, [~ oh]*4").bank("RolandTR909").cut(1)   (choke only hats)

OUTPUT FORMAT:
Output ONLY clean executable JavaScript pattern code. Do not wrap in markdown prose.`;

export interface ComposerCallbacks {
  onApplyCode: (code: string, runImmediately: boolean) => void;
}

export class AIAgentComposer {
  private callbacks: ComposerCallbacks;
  private apiKey: string = '';
  private modalEl: HTMLElement | null = null;

  constructor(callbacks: ComposerCallbacks) {
    this.callbacks = callbacks;
    this.apiKey = sessionStorage.getItem('strudel_gemini_api_key') || localStorage.getItem('strudel_gemini_api_key') || '';
  }

  public open(): void {
    if (this.modalEl) {
      this.modalEl.remove();
    }

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal-backdrop';
    this.modalEl.innerHTML = `
      <div class="modal-dialog composer-dialog">
        <div class="modal-header">
          <div class="modal-title-group">
            <span class="modal-title">PATTERN GENERATOR</span>
            <span class="modal-badge">EXPERIMENTAL</span>
          </div>
          <button class="modal-close" id="btn-close-composer">&times;</button>
        </div>

        <div class="modal-body">
          <div class="composer-settings-row">
            <label for="input-api-key">Gemini API Key (Optional):</label>
            <input type="password" id="input-api-key" placeholder="Leave blank to use built-in algorithmic engine" value="${this.apiKey}">
          </div>

          <div class="composer-presets-row">
            <span class="gen-chip" data-prompt="Dark driving 140 BPM Berlin acid with heavy RAT distortion">Berlin 140</span>
            <span class="gen-chip" data-prompt="Psychedelic hypnotic Goa 303 with wild filter sweeps and 16th hats">Hypnotic 138</span>
            <span class="gen-chip" data-prompt="Aggressive Industrial Hardcore with Square wave and Fuzz clipping">Industrial 142</span>
            <span class="gen-chip" data-prompt="Deep funky Detroit minimal groove with clean accents">Detroit 132</span>
          </div>

          <div class="composer-prompt-row">
            <textarea id="ai-prompt-input" rows="3" placeholder="Enter pattern description (e.g. '138 BPM resonant minor acid with screaming accents and synchronized 909')..."></textarea>
          </div>

          <div class="composer-actions-bar">
            <button id="btn-generate-ai" class="btn btn-play">GENERATE PATTERN</button>
          </div>

          <div id="ai-output-box" class="ai-output-box" style="display: none;">
            <div class="ai-output-header">
              <span>GENERATED CODE</span>
              <div class="ai-output-buttons">
                <button class="btn btn-stop" id="btn-apply-only">LOAD CODE</button>
                <button class="btn btn-play" id="btn-apply-run">LOAD & RUN</button>
              </div>
            </div>
            <pre><code id="ai-output-code"></code></pre>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
    this.attachEvents();
  }

  public close(): void {
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
  }

  private attachEvents(): void {
    if (!this.modalEl) return;

    const btnClose = this.modalEl.querySelector<HTMLButtonElement>('#btn-close-composer')!;
    const btnGen = this.modalEl.querySelector<HTMLButtonElement>('#btn-generate-ai')!;
    const inputPrompt = this.modalEl.querySelector<HTMLTextAreaElement>('#ai-prompt-input')!;
    const inputApiKey = this.modalEl.querySelector<HTMLInputElement>('#input-api-key')!;

    btnClose.addEventListener('click', () => this.close());
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    inputApiKey.addEventListener('change', () => {
      this.apiKey = inputApiKey.value.trim();
      sessionStorage.setItem('strudel_gemini_api_key', this.apiKey);
    });

    this.modalEl.querySelectorAll<HTMLSpanElement>('.gen-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const p = chip.dataset.prompt;
        if (p) {
          inputPrompt.value = p;
          this.generateMusic(p);
        }
      });
    });

    btnGen.addEventListener('click', () => {
      const prompt = inputPrompt.value.trim() || 'Classic 138 BPM acid bassline with 909 drums';
      this.generateMusic(prompt);
    });

    const btnApplyRun = this.modalEl.querySelector<HTMLButtonElement>('#btn-apply-run')!;
    const btnApplyOnly = this.modalEl.querySelector<HTMLButtonElement>('#btn-apply-only')!;
    const codeEl = this.modalEl.querySelector<HTMLElement>('#ai-output-code')!;

    btnApplyRun.addEventListener('click', () => {
      if (codeEl.textContent) {
        this.callbacks.onApplyCode(codeEl.textContent, true);
        this.close();
      }
    });

    btnApplyOnly.addEventListener('click', () => {
      if (codeEl.textContent) {
        this.callbacks.onApplyCode(codeEl.textContent, false);
        this.close();
      }
    });
  }

  private async generateMusic(userPrompt: string): Promise<void> {
    if (!this.modalEl) return;

    const btnGen = this.modalEl.querySelector<HTMLButtonElement>('#btn-generate-ai')!;
    const outputBox = this.modalEl.querySelector<HTMLDivElement>('#ai-output-box')!;
    const codeEl = this.modalEl.querySelector<HTMLElement>('#ai-output-code')!;

    btnGen.disabled = true;
    btnGen.textContent = 'GENERATING...';

    try {
      let generatedCode = '';
      if (this.apiKey) {
        generatedCode = await this.callGeminiAPI(userPrompt);
      } else {
        generatedCode = this.algorithmicAcidGenerator(userPrompt);
      }

      codeEl.textContent = generatedCode;
      outputBox.style.display = 'block';
    } catch {
      const fallback = this.algorithmicAcidGenerator(userPrompt);
      codeEl.textContent = fallback;
      outputBox.style.display = 'block';
    } finally {
      btnGen.disabled = false;
      btnGen.textContent = 'GENERATE PATTERN';
    }
  }

  private async callGeminiAPI(promptText: string): Promise<string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${SYSTEM_PROMPT}\n\nUser Request: ${promptText}\n\nGenerate the complete Strudel pattern code.` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      }
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
    return text;
  }

  private algorithmicAcidGenerator(promptText: string): string {
    const isHard = /hard|heavy|berlin|fast|140|145|screamer/i.test(promptText);
    const isSquare = /square|hollow|fuzz/i.test(promptText);
    const isTrance = /trance|goa|psy|hypnotic/i.test(promptText);
    const isMinimal = /minimal|detroit|deep|clean/i.test(promptText);

    const bpm = isTrance ? 142 : isHard ? 140 : isMinimal ? 132 : 138;
    const scales = isTrance ? ['d2:phrygian', 'e2:minor', 'a1:minor'] :
                   isHard ? ['c2:minor', 'f1:phrygian', 'd2:minor'] :
                   ['c2:minor', 'g1:minor', 'bb1:dorian'];
    const scale = scales[Math.floor(Math.random() * scales.length)];

    const notePatterns = [
      '0 0 12 7 ~ 3 5 0 0 12 10 7 ~ 5 3 0',
      '0 3 7 10 12 10 7 3 0 7 12 14 12 7 5 3',
      '0 ~ 0 12 ~ 7 3 5 0 0 ~ 10 12 ~ 7 0',
      '0 0 0 12 ~ 3 0 7 0 12 0 3 ~ 7 5 0',
    ];
    const notes = notePatterns[Math.floor(Math.random() * notePatterns.length)];

    const accents = isHard ? '1 0 1 0 0 1 0 1 1 0 0 1 0 1 1 0' : '0 1 0 0 0 1 0 0 0 0 1 0 0 1 0 0';
    const slides = isTrance ? '0 1 0 0 1 0 1 0 0 1 0 0 1 0 0 0' : '0 0 1 0 0 0 1 0 0 0 0 1 0 0 1 0';

    const wave = isSquare ? 'square' : 'saw';
    const distDrive = isHard ? (0.75 + Math.random() * 0.2).toFixed(2) : (0.2 + Math.random() * 0.4).toFixed(2);
    const distType = isHard ? (isSquare ? 'fuzz' : 'rat') : 'tube';
    const distTone = (0.55 + Math.random() * 0.25).toFixed(2);

    const cutoffLow = isMinimal ? 250 : 350;
    const cutoffHigh = isHard ? 3800 : 3200;
    const lfoSpeed = isTrance ? 8 : 4;

    return `// Generated Acid Pattern (${bpm} BPM)
setcps(${bpm}/60/4)

$: n("${notes}").scale("${scale}")
  .s("tb303")
  .tbwave("${wave}")
  .accent("${accents}")
  .slide("${slides}")
  .tbcut(sine.range(${cutoffLow}, ${cutoffHigh}).slow(${lfoSpeed}))
  .tbres(${(0.80 + Math.random() * 0.12).toFixed(2)})
  .tbenv(${(0.65 + Math.random() * 0.15).toFixed(2)})
  .tbdec(${(0.18 + Math.random() * 0.10).toFixed(2)})
  .tbdist(${distDrive})
  .tbdisttone(${distTone})
  .tbdisttype("${distType}")
  .gain(0.9)

$: s("bd*4, ~ cp ~ cp").bank("RolandTR909")
$: s("hh*8, [~ oh]*4").bank("RolandTR909").cut(1)
`;
  }
}
