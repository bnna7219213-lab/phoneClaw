# iOS 快捷指令：国行 iPhone 的 "Siri AI" 替代

国行 iPhone 没有 Apple Intelligence，也无法换区合法开启。但系统"快捷指令"可以
调任意 HTTPS API，等于自己造一个语音 AI 入口，完全合规。

## 快捷指令步骤（共 4 个动作）

1. 「听写文本」— 语言选 中文(中国大陆)，停止聆听选"暂停后"
2. 「获取 URL 内容」
   - URL: `https://你的域名/api/ask`
   - 方法: POST
   - 标头: `Authorization: Bearer dev-token-123`，`Content-Type: application/json`
   - 请求体: JSON → `{"text": 听写的文本}`
3. 「获取词典值」— 键 `text`（从 URL 内容的结果中取）
4. 「朗读文本」— 朗读词典值

## 唤起方式（任选）

- 添加到主屏幕，点图标即可说话
- 设置 → 辅助功能 → 触控 → 轻点背面 → 选这个快捷指令
- iPhone 15 Pro+: Action Button 绑定
- 直接说 "嘿 Siri，问 Claw"（把快捷指令命名为"问 Claw"）

## 变体

- 不加「朗读文本」，改成「显示通知」→ 适合代码等长文本
- 开头加「选择菜单」→ 一个入口选择 闲聊/编程/查技能 等模式
  （对应先自动发 /agent 或 /use xxx 再说内容）
