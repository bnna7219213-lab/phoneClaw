# ClawBridge 架构设计

## 1. 设计原则

1. 手机零智能：不跑模型、不做计算，只做 I/O（语音采集/播放、文字展示）。
2. 服务器是星型中心：所有端（微信、快捷指令、PWA、本地 Agent）都是服务器的客户端。
3. 本地 Agent 主动连出：家庭宽带无公网 IP，connector 用 WSS 长连接穿透 NAT。
4. 单后端自包含：不拆微服务，一个 Node 进程 + 插件式 skill 目录。

## 2. 三条手机接入通道

### 通道 A：微信公众号（主对话通道）
- 用户在公众号发文字或语音。
- 微信服务器 POST XML 到 `/wechat/callback`。
- 语音消息带 `Recognition` 字段 = 微信官方语音转文字结果（开启"语音识别"接口能力后）。
- 服务器处理完后：
  - 5 秒内能完成 → 直接同步 XML 回复；
  - 耗时长（编程任务）→ 先回 "收到，处理中"，完成后用客服消息 API 异步推送。

### 通道 B：iOS 快捷指令（Siri 替代品，国行可用）
- 快捷指令：听写文本 → POST /api/ask → 朗读 answer。
- 绑定到 Action Button / 轻点背面 / “嘿 Siri，问 Claw”。
- 详见 docs/IOS-SHORTCUT.md。

### 通道 C：H5/PWA 面板（phone-web/）
- 任何手机浏览器打开，"添加到主屏幕"后体验接近原生 App。
- 功能：对话、技能商店（列出服务器已学 skill，一键调用）、任务进度。
- Android 进阶：套 WebView 壳 + 通知监听服务，可把其它 App 的通知转发给服务器处理。

## 3. Hub 会话模型

每个用户一个 session；session 内维护：
- channel（wechat / shortcut / pwa）
- route：当前消息流向哪个 handler
  - `skill:<name>` 直接调服务器本地技能
  - `agent:<deviceId>` 转发给某台本地 PC 的 agent
- context：最近 N 条消息（供连续语音对话，“把柱状图改成折线图”）

路由解析顺序：
1. 斜杠命令（/skills /agent /auto /code /whoami）
2. session 被命令显式钉住的 sticky route
3. LLM 意图分类器自动路由（intent.js）：
   - 配置了 LLM_BASE/LLM_KEY（任意 OpenAI 兼容端点）→ 让 LLM 在
     [各skill清单 | agent:default | chat] 中选择，temperature=0，失败自动降级
   - 未配置 → 关键词启发式：skill triggers 命中 → skill；
     编程关键词正则 → agent；其余 → chat（默认 agent）
   - /use /agent 会钉住路由（sticky），/auto 或 /reset 恢复自动

## 4. Skill 系统（服务器"学习"能力）

skill = 一个 JS 文件，导出：

```js
module.exports = {
  manifest: { name, description, triggers: [...], params: {...} },
  async run(ctx, args) { return { text: "..." } }
}
```

- `skills/registry.js` 启动时扫描 `skills/installed/` 并热加载。
- "学习新 skill" = 把 JS 文件放进 installed/ 并 POST /api/skills/reload（或 watch 文件变化）。
- 手机端 GET /api/skills 获得 manifest 列表用于展示。
- 本地 Agent 也是一种 skill：`agent:code`，run() 内部通过 Agent Bridge 下发。

## 5. Agent Bridge（服务器 ↔ 本地 PC）

- 本地 connector 启动时 WSS 连到 /ws/agent，携带 deviceToken 认证。
- 服务器维护 deviceId → socket 映射。
- 下发消息：`{type:"task", id, prompt, context}`；connector 调用本地 Hermes/OpenCode，回 `{type:"result", id, text}`。
- 心跳 30s；掉线时服务器回复用户"本地 Agent 不在线"。

## 6. 安全

- 公众号：消息签名验证（token + timestamp + nonce sha1）。
- HTTP/WSS：每个手机端/设备一个 bearer token，放在 .env / 配置页。
- 服务器必须 HTTPS（微信回调和快捷指令都要求）。

## 7. 与 HermesClaw 的区别（自研点）

| 维度 | HermesClaw | ClawBridge |
|---|---|---|
| 微信接入 | 个人号 iLink（灰色、独占） | 公众号官方 API（合法、多客服并发） |
| 拓扑 | 单机路由三个本地 agent | 服务器星型中心 + 远程本地 agent |
| 手机端 | 仅微信 | 微信 + 快捷指令 + PWA + 任意HTTP |
| 能力扩展 | 无 skill 概念 | Skill Registry 热加载，手机端可浏览调用 |
| 本地算力 | 与网关同机 | 任意多台 PC，跨 NAT 接入 |
