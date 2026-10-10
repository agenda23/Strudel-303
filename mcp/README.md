# Strudel 303 MCP Server

> 日本語の手順は [`docs/03-AI機能.md`](../docs/03-AI機能.md) を参照してください。接続には、アプリを **`http://localhost:3000/?mcp=1`** で開く必要があります（既定ではオフ）。

Model Context Protocol (MCP) server for the Strudel × TB-303 Acid Synthesizer and live coding sequencer.

## 🛠 Available Tools

| Tool | Description |
| --- | --- |
| `tb303_get_reference` | Syntax reference and parameter guide (scale degrees, mixing, controls). |
| `tb303_generate_pattern` | Generates an acid pattern (style, root, scale, distortion) with tempo and balanced drum gains. |
| `tb303_list_clients` | Lists connected browser windows (id, title, url). |
| `tb303_play_live_pattern` | Puts code into the app editor, evaluates and plays it. **Returns the evaluation result** (success, or the error message). |
| `tb303_stop_live_playback` | Stops playback (hush). |
| `tb303_get_state` | Editor code, evaluated/playing flags, last error, BPM, limiter state. |
| `tb303_get_levels` | Measures the real output for a few seconds: peak / RMS / clipped samples before and after the master limiter. |
| `tb303_render_current` | Renders the 303 part of the loaded pattern offline (same trigger logic as playback), saves a WAV and returns metrics (peak, RMS dB, clipping, spectral centroid, activity, per-bar RMS). |
| `tb303_render_audio_file` | Renders a fixed 16-step 303 demo sequence to WAV with the internal DSP. |

Tools that take `target` can address one window by id (default: all connected windows).

The browser cannot play audio until the page has been clicked once; evaluation (and its errors) work regardless, and `tb303_play_live_pattern` adds a warning when audio is still locked.

If the bridge port is taken by another server, tools fail with the reason. Use `TB303_WS_PORT=<port>` for the server and `?mcp=1&mcpport=<port>` for the app. The server exits when the MCP client disconnects.

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
