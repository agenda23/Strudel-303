/**
 * Browser side of the MCP bridge. The page connects to the local MCP server over WebSocket
 * (opt-in: ?mcp=1), identifies itself, and answers requests with results so the agent can
 * verify what it did (evaluation errors, state, levels, queried 303 events).
 */

export interface EvalResult {
  ok: boolean;
  error?: string;
  warning?: string;
}

export interface AgentHooks {
  run(code: string): Promise<EvalResult>;
  stop(): void;
  getState(): Record<string, unknown>;
  measureLevels(ms: number): Promise<Record<string, unknown>>;
  getHaps(cycles: number): Record<string, unknown>;
}

export function isAgentEnabled(): boolean {
  try {
    return new URLSearchParams(location.search).get('mcp') === '1' || localStorage.getItem('tb303_mcp') === '1';
  } catch {
    return false;
  }
}

function clientId(): string {
  try {
    let id = sessionStorage.getItem('tb303_client_id');
    if (!id) {
      id = Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('tb303_client_id', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 8);
  }
}

export function connectAgent(hooks: AgentHooks, statusEl: HTMLElement | null): void {
  if (!isAgentEnabled()) return;
  const port = Number(new URLSearchParams(location.search).get('mcpport')) || 3031;
  const id = clientId();

  const setStatus = (text: string, online: boolean) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('online', online);
  };

  const connect = () => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://localhost:${port}`);
    } catch {
      setTimeout(connect, 5000);
      return;
    }
    const reply = (reqId: unknown, payload: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'result', id: reqId, clientId: id, ...payload }));
      }
    };

    ws.onopen = () => {
      setStatus('AGENT READY', true);
      ws.send(JSON.stringify({ type: 'hello', clientId: id, title: document.title, url: location.href }));
    };

    ws.onmessage = async (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      try {
        switch (msg.type) {
          case 'play_pattern':
            if (typeof msg.code !== 'string') return reply(msg.id, { ok: false, error: 'code must be a string' });
            return reply(msg.id, { ...(await hooks.run(msg.code)) });
          case 'stop_playback':
            hooks.stop();
            return reply(msg.id, { ok: true });
          case 'get_state':
            return reply(msg.id, { ok: true, state: hooks.getState() });
          case 'get_levels': {
            const ms = Math.min(15000, Math.max(500, Number(msg.durationMs) || 3000));
            return reply(msg.id, { ok: true, levels: await hooks.measureLevels(ms) });
          }
          case 'get_haps': {
            const cycles = Math.min(64, Math.max(1, Number(msg.cycles) || 8));
            return reply(msg.id, { ok: true, ...hooks.getHaps(cycles) });
          }
        }
      } catch (e: any) {
        reply(msg.id, { ok: false, error: String(e?.message || e) });
      }
    };

    ws.onclose = () => {
      setStatus('AGENT OFFLINE', false);
      setTimeout(connect, 4000);
    };
    ws.onerror = () => ws.close();
  };

  connect();
}
