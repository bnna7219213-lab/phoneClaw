# ClawBridge — 本地 Agent 与手机/微信 之间的服务器桥梁

手机只做"话筒+喇叭+屏幕"，所有智能在服务器与本地 PC 的 Agent 上。

## 架构

```
微信语音/文字 | iOS快捷指令 | Android PWA | 任意HTTP客户端
        │ HTTPS / WSS
        ▼
┌─ ClawBridge Server (公网, Node.js) ──────────────┐
│  adapters/wechat   微信公众号回调(语音自动转写)     │
│  adapters/http     通用 REST 入口(快捷指令/PWA)    │
│  hub/              会话路由 + 消息总线 + 身份        │
│  skills/           技能注册表(可热加载JS技能模块)   │
│  agent-bridge/     通过WSS把任务下发给本地Agent     │
└──────────────────────────────────────────────────┘
        ▲ WSS (本地主动连出, 穿透 NAT, 无需公网IP)
        ▼
agent-connector (运行在家里PC)
   ├─ → Hermes Agent (HTTP)
   └─ → OpenCode (ACP 子进程)
```

## 为什么是公众号而不是改 App / 小程序

- 改微信 App 源码：闭源+签名校验+封号风险，不可行。
- 小程序：不能常驻、不能主动推送，只适合做展示面板。
- 公众号：官方 API、语音消息服务端自动转文字、客服消息可主动推送，零客户端开发。
- iOS 国行无 AI Siri：用系统"快捷指令"(听写→POST→朗读) 即可语音唤起，见 docs/IOS-SHORTCUT.md。

## 快速开始

```bash
cd server
npm install
cp .env.example .env   # 填 APPID/SECRET/TOKEN
npm start
```

本地 PC：

```bash
cd agent-connector
npm install
node connector.js --server wss://your-domain/ws/agent --token <device-token>
```

## 目录

- `server/`        服务器（接入层 + Hub + Skill Registry + Agent Bridge）
- `agent-connector/` 本地 PC 连接器（桥接 Hermes Agent / OpenCode）
- `phone-web/`     H5/PWA 手机面板（技能列表 + 对话，可加桌面图标）
- `docs/`          架构、协议、iOS 快捷指令、公众号配置指南
