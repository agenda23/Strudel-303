# Strudel 303 MCP Server

> 日本語の手順は [`docs/03-AI機能.md`](../docs/03-AI機能.md) を参照してください。接続には、アプリを **`http://localhost:3000/?mcp=1`** で開く必要があります（既定ではオフ）。

Model Context Protocol (MCP) server for the Strudel × TB-303 Acid Synthesizer and live coding sequencer.

## 🛠 Available Tools

1. **`tb303_get_reference`**
   - Returns the complete syntax reference, parameter guide (cutoff, resonance, accent, slide, distortion), and Roland TR-909 pattern formats.

2. **`tb303_generate_pattern`**
   - Procedurally generates executable Strudel × TB-303 acid patterns based on style (`classic`, `hard_rat`, `square_screamer`, `trance`, `minimal`), root key, scale, and distortion.

3. **`tb303_play_live_pattern`**
   - Injects the generated pattern code directly into the active browser live-coding environment (`http://localhost:3000/`) over WebSocket and starts immediate playback.

4. **`tb303_stop_live_playback`**
   - Stops playback in all connected browser windows (Hush).

5. **`tb303_render_audio_file`**
   - Uses the internal pure TypeScript DSP engine (PolyBLEP + 4-Pole TPT Diode Ladder + Acid Overdrive) to render a TB-303 acid sequence offline into a 16-bit 44.1kHz WAV file.

---

## 🚀 Running the MCP Server

```bash
npm run mcp
```

Or via `npx`:
```bash
npx -y tsx mcp/server.ts
```

---

## ⚙ Client Configuration

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "strudel-tb303": {
      "command": "npx",
      "args": ["-y", "tsx", "d:/workspace/303seq/mcp/server.ts"]
    }
  }
}
```

### Antigravity (`.agents/mcp_config.json`)
Already pre-configured in `.agents/mcp_config.json`!
