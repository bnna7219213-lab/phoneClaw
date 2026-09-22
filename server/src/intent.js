// Intent classifier: when a message arrives without an explicit route
// (no slash command, no /use, no /agent), decide automatically where it goes:
//   { kind: 'skill', name }   → server-local skill
//   { kind: 'agent', device } → local PC agent (coding/automation)
//   { kind: 'chat' }          → default agent conversational route
//
// Two tiers:
//   1. LLM classification via any OpenAI-compatible endpoint (LLM_BASE/LLM_KEY/LLM_MODEL)
//   2. Keyword-heuristic fallback when no LLM is configured or it fails

const CODING_HINTS = /代码|编程|写个|bug|修复|函数|接口|api|脚本|项目|报错|debug|refactor|code|deploy|docker|sql|数据库|commit/i;

class IntentClassifier {
  constructor(skills) {
    this.skills = skills;
    this.base = process.env.LLM_BASE || '';   // e.g. https://api.deepseek.com/v1
    this.key = process.env.LLM_KEY || '';
    this.model = process.env.LLM_MODEL || 'deepseek-chat';
  }

  get enabled() { return !!(this.base && this.key); }

  async classify(text, history = []) {
    if (this.enabled) {
      try {
        const r = await this.llmClassify(text, history);
        if (r) return r;
      } catch (e) {
        console.warn('[intent] LLM failed, fallback to heuristic:', e.message);
      }
    }
    return this.heuristic(text);
  }

  async llmClassify(text, history) {
    const menu = [
      ...this.skills.list().map(m => `skill:${m.name} — ${m.description}`),
      'agent:default — 编程/修Bug/搭项目/需要本地PC算力或文件系统的任务',
      'chat — 闲聊、问答、知识咨询（走默认agent对话）'
    ].join('\n');

    const recent = history.slice(-4).map(m => `${m.role}: ${m.text}`).join('\n');
    const prompt =
      `你是消息路由器。根据用户消息和可用能力列表，只回复一行路由目标（skill:名 / agent:default / chat），不要任何解释。\n` +
      `可用能力:\n${menu}\n\n最近对话:\n${recent}\n\n用户消息: ${text}\n路由目标:`;

    const resp = await fetch(`${this.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + this.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model, temperature: 0, max_tokens: 20,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!resp.ok) throw new Error('LLM HTTP ' + resp.status);
    const j = await resp.json();
    const target = (j.choices?.[0]?.message?.content || '').trim().toLowerCase();
    return this.parse(target, text);
  }

  parse(target, text) {
    const m = target.match(/^skill:([\w-]+)/);
    if (m && this.skills.has(m[1])) return { kind: 'skill', name: m[1] };
    if (/^agent/.test(target)) return { kind: 'agent', device: null };
    if (target === 'chat') return { kind: 'chat' };
    return null; // 无法解析 → fallback
  }

  heuristic(text) {
    // 触发词匹配已注册 skill
    for (const m of this.skills.list()) {
      if ((m.triggers || []).some(t => t && text.toLowerCase().includes(t.toLowerCase())))
        return { kind: 'skill', name: m.name };
    }
    // 编程类 → 本地 agent
    if (CODING_HINTS.test(text)) return { kind: 'agent', device: null };
    return { kind: 'chat' };
  }
}

module.exports = { IntentClassifier };
