// SkillRegistry: hot-loadable JS skill modules = the server "learning" skills.
// Drop a file into skills/installed/ and POST /api/skills/reload (or restart).
const fs = require('fs');
const path = require('path');

class SkillRegistry {
  constructor(dir) {
    this.dir = dir;
    this.skills = new Map(); // name -> module
  }

  loadAll() {
    fs.mkdirSync(this.dir, { recursive: true });
    this.skills.clear();
    for (const f of fs.readdirSync(this.dir).filter(f => f.endsWith('.js'))) {
      const full = path.join(this.dir, f);
      try {
        delete require.cache[require.resolve(full)];
        const mod = require(full);
        if (!mod.manifest?.name || typeof mod.run !== 'function') {
          console.warn(`[skills] ${f}: missing manifest/run, skipped`);
          continue;
        }
        this.skills.set(mod.manifest.name, mod);
        console.log(`[skills] loaded ${mod.manifest.name}`);
      } catch (e) {
        console.error(`[skills] ${f} failed: ${e.message}`);
      }
    }
  }

  has(name) { return this.skills.has(name); }
  list() { return [...this.skills.values()].map(m => m.manifest); }
  run(name, ctx, text) {
    const s = this.skills.get(name);
    if (!s) throw new Error('no such skill');
    return s.run(ctx, text);
  }
}

module.exports = { SkillRegistry };
