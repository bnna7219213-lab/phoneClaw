// AgentBridge: manages WSS connections FROM local PC connectors.
// Connector dials out to wss://server/ws/agent?device=X&token=Y, so no public
// IP / port forwarding is needed on the home PC.
const crypto = require('crypto');

class AgentBridge {
  constructor(tokenSpec) {
    // "my-pc:tokenA,other-pc:tokenB"
    this.tokens = new Map();
    for (const pair of tokenSpec.split(',').filter(Boolean)) {
      const [dev, tok] = pair.split(':');
      if (dev && tok) this.tokens.set(dev, tok);
    }
    this.sockets = new Map();  // deviceId -> ws
    this.pending = new Map();  // taskId -> {resolve, timer}
  }

  attach(ws, req) {
    const url = new URL(req.url, 'http://x');
    const device = url.searchParams.get('device');
    const token = url.searchParams.get('token');
    if (!device || this.tokens.get(device) !== token) {
      ws.close(4401, 'unauthorized');
      return;
    }
    // one connection per device; replace old
    this.sockets.get(device)?.close();
    this.sockets.set(device, ws);
    console.log(`[agent-bridge] ${device} online`);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === 'result' && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        p.resolve(msg.text);
      }
    });
    ws.on('close', () => {
      if (this.sockets.get(device) === ws) this.sockets.delete(device);
      console.log(`[agent-bridge] ${device} offline`);
    });
  }

  online() { return [...this.sockets.keys()]; }
  isOnline(device) { return this.sockets.has(device); }

  // Send a task to a local agent, wait for result (timeout 120s).
  dispatch(device, prompt, context) {
    const ws = this.sockets.get(device);
    if (!ws) return Promise.resolve(`agent ${device} 不在线`);
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve('（本地 Agent 处理超时 120s）');
      }, 120_000);
      this.pending.set(id, { resolve, timer });
      ws.send(JSON.stringify({ type: 'task', id, prompt, context }));
    });
  }
}

module.exports = { AgentBridge };
