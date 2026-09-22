// Hub: session routing + message dispatch.
// A session belongs to one user on one channel; routes messages either to a
// server-local skill or to a local PC agent via the AgentBridge.

const { IntentClassifier } = require('./intent');

class Session {
  constructor(id) {
    this.id = id;
    this.route = null;        // null=自动 | 'agent:<deviceId>' | 'skill:<name>'
    this.sticky = false;      // true 表示用户用命令显式钉住，不走自动路由
    this.history = [];        // [{role, text}]
  }
}

class Hub {
  constructor({ skills, agents, defaultAgent }) {
    this.skills = skills;
    this.agents = agents;
    this.defaultAgent = defaultAgent;
    this.intent = new IntentClassifier(skills);
    this.sessions = new Map();
  }

  session(key) {
    if (!this.sessions.has(key)) this.sessions.set(key, new Session(key));
    return this.sessions.get(key);
  }

  // Entry point used by every channel adapter.
  // Returns { text } (adapters decide how to deliver).
  async handle(channelKey, userText) {
    const s = this.session(channelKey);
    const text = (userText || '').trim();
    if (!text) return { text: '（空消息）' };

    // 1) slash commands
    if (text.startsWith('/')) return this.command(s, text);

    s.history.push({ role: 'user', text });
    if (s.history.length > 20) s.history = s.history.slice(-20);

    // 2) explicit sticky route
    let reply;
    if (s.sticky && s.route?.startsWith('skill:')) {
      reply = await this.runSkill(s, s.route.slice(6), text);
    } else if (s.sticky && s.route?.startsWith('agent:')) {
      reply = await this.runAgent(s, s.route.slice(6), text);
    } else {
      // 3) auto intent routing (LLM, fallback heuristic)
      const intent = await this.intent.classify(text, s.history);
      if (intent.kind === 'skill') {
        reply = await this.runSkill(s, intent.name, text);
        reply += `\n\n(已自动路由到技能 ${intent.name}，/agent 切回，/reset 重置)`;
      } else {
        const device = intent.kind === 'agent' && intent.device
          ? intent.device : this.defaultAgent;
        reply = await this.runAgent(s, device, text);
      }
    }
    s.history.push({ role: 'assistant', text: reply });
    return { text: reply };
  }

  async command(s, text) {
    const [cmd, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ');
    switch (cmd) {
      case '/whoami':
        return { text: `route=${s.route || 'agent:' + this.defaultAgent}\nagents=${this.agents.online().join(',') || '无在线'}` };
      case '/skills':
        return { text: '已学技能:\n' + this.skills.list().map(m => `- ${m.name}: ${m.description}`).join('\n') };
      case '/use':   // /use weather  → route to a skill (sticky)
        if (!this.skills.has(arg)) return { text: `没有技能 ${arg}` };
        s.route = 'skill:' + arg; s.sticky = true;
        return { text: `已切换到技能 [${arg}]，直接说话即可。/auto 恢复自动路由` };
      case '/agent': // /agent [deviceId] → route to local PC agent (sticky)
        s.route = 'agent:' + (arg || this.defaultAgent); s.sticky = true;
        return { text: `已切换到本地 Agent [${arg || this.defaultAgent}]，/auto 恢复自动路由` };
      case '/auto':  // 清除钉住，恢复 LLM 自动路由
        s.sticky = false; s.route = null;
        return { text: '已恢复自动路由' };
      case '/code':  // one-shot coding task on local agent
        return { text: await this.runAgent(s, this.defaultAgent, arg) };
      case '/reset':
        s.history = []; s.route = null; s.sticky = false;
        return { text: '会话已重置' };
      default:
        return { text: '命令: /whoami /skills /use <名> /agent [设备] /auto /code <任务> /reset' };
    }
  }

  async runSkill(s, name, text) {
    try {
      const r = await this.skills.run(name, { history: s.history }, text);
      return r.text || String(r);
    } catch (e) {
      return `技能 ${name} 出错: ${e.message}`;
    }
  }

  async runAgent(s, device, text) {
    if (!this.agents.isOnline(device)) return `本地 Agent [${device}] 不在线，请先在 PC 上启动 connector`;
    const ctx = s.history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
    return await this.agents.dispatch(device, text, ctx);
  }
}

module.exports = { Hub };
