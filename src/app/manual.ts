/**
 * TB-303 & Strudel Reference Manual Component.
 */

export const manualContent = `
<div class="manual-container">
  <div class="manual-header">
    <div class="manual-title-row">
      <span class="badge-303">MANUAL</span>
      <h2>Strudel × TB-303 Syntax & Reference</h2>
    </div>
    <button class="manual-close-btn" id="btn-manual-close">&times;</button>
  </div>

  <div class="manual-body">
    <!-- Quickstart -->
    <section class="manual-section">
      <h3>🚀 Quick Start</h3>
      <p>Use <code>.s("tb303")</code> on any Strudel pattern to route notes to the custom 4-pole diode ladder AudioWorklet.</p>
      <div class="code-box">
        <pre><code>$: n("0 0 7 4 ~ 2 3 0").scale("c2:minor")
  .s("tb303")
  .accent("0 1 0 0 0 1 0 0")
  .slide("0 0 1 0 0 0 1 0")
  .tbcut(sine.range(300, 3200).slow(4))
  .tbres(0.85).tbenv(0.7).tbdec(0.22)</code></pre>
        <button class="copy-snippet-btn" data-code='$: n("0 0 7 4 ~ 2 3 0").scale("c2:minor").s("tb303").accent("0 1 0 0 0 1 0 0").slide("0 0 1 0 0 0 1 0").tbcut(sine.range(300, 3200).slow(4)).tbres(0.85).tbenv(0.7).tbdec(0.22)'>Copy</button>
      </div>
    </section>

    <!-- 303 Parameters -->
    <section class="manual-section">
      <h3>🎛 TB-303 Parameters Reference</h3>
      <table class="manual-table">
        <thead>
          <tr>
            <th>Control</th>
            <th>Type / Range</th>
            <th>Description & Circuit Behavior</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>accent</code></td>
            <td><code>0</code> or <code>1</code> (Pattern)</td>
            <td>Triggers accent. Boosts VCA gain, increases MEG envelope mod, and charges the capacitor circuit.</td>
          </tr>
          <tr>
            <td><code>slide</code></td>
            <td><code>0</code> or <code>1</code> (Pattern)</td>
            <td>Continuous legato glide to next note (~60ms portamento) without retriggering envelopes.</td>
          </tr>
          <tr>
            <td><code>tbcut</code></td>
            <td>Hz (<code>50</code> ~ <code>8000</code>)</td>
            <td>Base filter cutoff frequency. Supports continuous LFOs like <code>sine.range(300, 3000).slow(4)</code>.</td>
          </tr>
          <tr>
            <td><code>tbres</code></td>
            <td><code>0.0</code> ~ <code>1.0</code></td>
            <td>Resonance amount with diode-ladder negative feedback and per-stage tanh non-linear saturation.</td>
          </tr>
          <tr>
            <td><code>tbenv</code></td>
            <td><code>0.0</code> ~ <code>1.0</code></td>
            <td>Filter Envelope Modulation depth (how much MEG opens the filter).</td>
          </tr>
          <tr>
            <td><code>tbdec</code></td>
            <td>Seconds (<code>0.05</code> ~ <code>2.0</code>)</td>
            <td>MEG filter decay time. Automatically shortens slightly when accented.</td>
          </tr>
          <tr>
            <td><code>tbwave</code></td>
            <td><code>"saw"</code> | <code>"square"</code></td>
            <td>PolyBLEP quasi band-limited oscillator waveform.</td>
          </tr>
          <tr>
            <td><code>tbslidetime</code></td>
            <td>Seconds (default <code>0.06</code>)</td>
            <td>Slide / portamento glide transition speed.</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Distortion Parameters -->
    <section class="manual-section">
      <h3>🔥 Distortion & Overdrive Parameters</h3>
      <table class="manual-table">
        <thead>
          <tr>
            <th>Control</th>
            <th>Type / Range</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>tbdist</code></td>
            <td><code>0.0</code> ~ <code>1.0</code></td>
            <td>Overdrive / distortion pre-gain drive amount.</td>
          </tr>
          <tr>
            <td><code>tbdisttone</code></td>
            <td><code>0.0</code> (Dark) ~ <code>1.0</code> (Bright)</td>
            <td>Post-distortion tone lowpass filter cutoff (700Hz - 14kHz).</td>
          </tr>
          <tr>
            <td><code>tbdisttype</code></td>
            <td><code>"rat"</code> | <code>"tube"</code> | <code>"fuzz"</code></td>
            <td>Distortion circuit flavor (ProCo RAT diode, Tube saturation, Hard fuzz).</td>
          </tr>
          <tr>
            <td><code>tbdistmix</code></td>
            <td><code>0.0</code> ~ <code>1.0</code></td>
            <td>Dry / Wet crossfade balance.</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Drum Machines -->
    <section class="manual-section">
      <h3>🥁 Synchronized Drum Machines</h3>
      <p>Combine your TB-303 acid line with the classic Roland TR-909 drum kit in synchronized loops:</p>
      <div class="code-box">
        <pre><code>// Roland TR-909 drum kit
$: s("bd*4, ~ cp ~ cp, hh*8").bank("RolandTR909")</code></pre>
      </div>
    </section>

    <!-- AI -->
    <section class="manual-section">
      <h3>🤖 AI Features (optional, experimental)</h3>
      <p><b>AI ASSIST</b> opens the pattern generator. With an empty API key field it uses the built-in
      generator (keywords such as <code>hard</code>, <code>square</code>, <code>trance</code>, <code>minimal</code> pick the style).
      With a Gemini API key it asks Gemini instead; on any error it silently falls back to the built-in generator.
      Use <b>LOAD CODE</b> to put the result in the editor, or <b>LOAD &amp; RUN</b> to play it.</p>
      <p>The key is kept only for the browser tab session, and every request (prompt + key) is sent to Google's API.
      Do not use it on shared machines.</p>
      <p><b>AI agents (MCP):</b> open the app at <code>http://localhost:3000/?mcp=1</code>, register
      <code>mcp/server.ts</code> in your MCP client, and wait for <b>AGENT READY</b>. Tools:
      <code>tb303_get_reference</code>, <code>tb303_generate_pattern</code>, <code>tb303_play_live_pattern</code>,
      <code>tb303_stop_live_playback</code>, <code>tb303_render_audio_file</code>.
      Code sent by an agent runs in your browser like code you typed &mdash; connect only trusted clients.</p>
      <p>Full guide (Japanese): <code>docs/03-AI機能.md</code></p>
    </section>
  </div>
</div>
`;

export function openManualModal(): void {
  let modal = document.querySelector<HTMLDivElement>('#manual-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'manual-modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = manualContent;
    document.body.appendChild(modal);

    modal.querySelector('#btn-manual-close')?.addEventListener('click', () => {
      modal!.classList.remove('open');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal!.classList.remove('open');
      }
    });

    modal.querySelectorAll<HTMLButtonElement>('.copy-snippet-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.code;
        if (code) {
          navigator.clipboard.writeText(code);
          btn.textContent = 'Copied!';
          setTimeout(() => (btn.textContent = 'Copy'), 1500);
        }
      });
    });
  }

  modal.classList.add('open');
}
