// Generic HTTP adapter: iOS Shortcuts, PWA, curl, any client.
//   POST /api/ask     { text }        Authorization: Bearer <clientToken>
//   GET  /api/skills                  列出服务器已学技能（供手机展示）
//   POST /api/skills/reload           热加载技能目录
const express = require('express');

const TOKENS = new Set((process.env.CLIENT_TOKENS || '').split(',').filter(Boolean));

function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!TOKENS.has(t)) return res.status(401).json({ error: 'unauthorized' });
  req.clientId = t;
  next();
}

module.exports = function (hub, skills) {
  const r = express.Router();

  r.post('/ask', auth, async (req, res) => {
    const out = await hub.handle('http:' + req.clientId, req.body?.text);
    res.json(out);   // { text } — 快捷指令直接朗读这个字段
  });

  r.get('/skills', auth, (req, res) => res.json({ skills: skills.list() }));

  r.post('/skills/reload', auth, (req, res) => {
    skills.loadAll();
    res.json({ skills: skills.list() });
  });

  return r;
};
