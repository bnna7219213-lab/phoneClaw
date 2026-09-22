// Example skill: /use echo 然后说什么它复读什么。
// 新技能照此格式写：manifest + async run(ctx, text) → { text }
module.exports = {
  manifest: {
    name: 'echo',
    description: '复读测试技能',
    triggers: ['复读', 'echo'],
    params: {}
  },
  async run(ctx, text) {
    return { text: `你说的是: ${text}（历史 ${ctx.history.length} 条）` };
  }
};
