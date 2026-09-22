// ClawBridge agent connector — runs on the home PC.
// Dials OUT to the server (wss://server/ws/agent) so no public IP needed.
// On task: forwards prompt to a local agent backend (opencode / hermes / shell echo),
// then returns the result.
//
// Usage:
//   node connector.js --server wss://your-domain/ws/agent --device my-pc --token agent-token-456 \
//        --backend opencode --workdir C:\Users\you\workspace
const WebSocket = require('ws');
const { spawn, execFile } = require('child_process');

const args = {};
for (let i = 2; i < process.argv.length; i += 2)
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

const SERVER = args.server || 'ws://127.0.0.1:8080/ws/agent';
const DEVICE = args.device || 'my-pc';
const TOKEN = args.token || '';
const BACKEND = args.backend || 'echo';
const WORKDIR = args.workdir || process.cwd();

function runLocal(prompt, context) {
  return new Promise((resolve) => {
    const full = context ? `上下文:\n${context}\n\n任务:\n${prompt}` : prompt;
    if (BACKEND === 'opencode') {
      // OpenCode CLI 非交互模式（一次性任务）
      execFile('opencode', ['run', full], { cwd: WORKDIR, timeout: 110_000, maxBuffer: 8 << 20 },
        (err, stdout, stderr) => resolve(err ? `opencode 出错: ${stderr || err.message}` : stdout.trim()));
    } else if (BACKEND === 'hermes') {
      // Hermes Agent 本地 HTTP 网关（假设监听 :19998，按实际配置改）
      fetch('http://127.0.0.1:19998/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: full })
      }).then(r => r.json()).then(j => resolve(j.text || JSON.stringify(j)))
        .catch(e => resolve('hermes 不可达: ' + e.message));
    } else {
      resolve(`[echo backend] 收到任务: ${prompt}`);
    }
  });
}

function connect() {
  const ws = new WebSocket(`${SERVER}?device=${DEVICE}&token=${TOKEN}`);
  ws.on('open', () => console.log(`[connector] connected as ${DEVICE}, backend=${BACKEND}`));
  ws.on('message', async (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type !== 'task') return;
    console.log(`[connector] task ${msg.id}: ${msg.prompt.slice(0, 60)}`);
    const text = await runLocal(msg.prompt, msg.context);
    ws.send(JSON.stringify({ type: 'result', id: msg.id, text }));
  });
  ws.on('close', (code, reason) => {
    console.log(`[connector] closed (${code} ${reason}), retry in 5s`);
    setTimeout(connect, 5000);
  });
  ws.on('error', () => ws.close());
}
connect();
