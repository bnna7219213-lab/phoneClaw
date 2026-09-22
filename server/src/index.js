require('dotenv').config();
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const { Hub } = require('./hub');
const { SkillRegistry } = require('./skills/registry');
const { AgentBridge } = require('./agent-bridge');
const wechatRouter = require('./adapters/wechat');
const httpRouter = require('./adapters/httpApi');

const app = express();
app.use(express.text({ type: ['text/xml', 'application/xml'] }));
app.use(express.json());

const skills = new SkillRegistry(__dirname + '/skills/installed');
skills.loadAll();

const agents = new AgentBridge(process.env.AGENT_TOKENS || '');
const hub = new Hub({ skills, agents, defaultAgent: process.env.DEFAULT_AGENT });

app.use('/wechat', wechatRouter(hub));
app.use('/api', httpRouter(hub, skills));
app.use('/app', express.static(__dirname + '/../../phone-web'));

const server = http.createServer(app);

// Local agent connectors connect here (outbound from home PC, NAT-friendly)
const wss = new WebSocketServer({ server, path: '/ws/agent' });
wss.on('connection', (ws, req) => agents.attach(ws, req));

const port = process.env.PORT || 8080;
server.listen(port, () => console.log(`[clawbridge] listening on :${port}`));
