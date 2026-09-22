// WeChat Official Account adapter.
// GET  /wechat/callback  — 服务器配置验证（echostr 回显）
// POST /wechat/callback  — 接收消息；语音消息的 Recognition 字段即官方转写
// 长任务先回"处理中"，完成后走客服消息 API 异步推送。
const express = require('express');
const crypto = require('crypto');
const xml2js = require('xml2js');
const axios = require('axios');

const TOKEN = process.env.WECHAT_TOKEN || '';
const APPID = process.env.WECHAT_APPID || '';
const SECRET = process.env.WECHAT_SECRET || '';

let cachedToken = { value: null, exp: 0 };
async function accessToken() {
  if (cachedToken.value && Date.now() < cachedToken.exp) return cachedToken.value;
  const r = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: { grant_type: 'client_credential', appid: APPID, secret: SECRET }
  });
  cachedToken = { value: r.data.access_token, exp: Date.now() + (r.data.expires_in - 300) * 1000 };
  return cachedToken.value;
}

async function pushCustom(openid, text) {
  const at = await accessToken();
  // 客服消息单条文本上限 2048 字节，分段推送
  for (let i = 0; i < text.length; i += 1800) {
    await axios.post(`https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${at}`, {
      touser: openid, msgtype: 'text',
      text: { content: text.slice(i, i + 1800) }
    });
  }
}

function checkSignature(query) {
  const { signature, timestamp, nonce } = query;
  const s = crypto.createHash('sha1')
    .update([TOKEN, timestamp, nonce].sort().join('')).digest('hex');
  return s === signature;
}

function xmlReply(to, from, text) {
  return `<xml><ToUserName><![CDATA[${to}]]></ToUserName>` +
    `<FromUserName><![CDATA[${from}]]></FromUserName>` +
    `<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>` +
    `<MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${text}]]></Content></xml>`;
}

module.exports = function (hub) {
  const r = express.Router();

  r.get('/callback', (req, res) => {
    if (checkSignature(req.query)) res.send(req.query.echostr);
    else res.status(403).send('bad signature');
  });

  r.post('/callback', async (req, res) => {
    if (!checkSignature(req.query)) return res.status(403).send('bad signature');
    const msg = (await xml2js.parseStringPromise(req.body, { explicitArray: false })).xml;
    const openid = msg.FromUserName;

    // 语音 → 用官方转写；文字 → 直接用
    let text = null;
    if (msg.MsgType === 'text') text = msg.Content;
    else if (msg.MsgType === 'voice' && msg.Recognition) text = msg.Recognition;
    else return res.send(xmlReply(msg.ToUserName, openid,
      '暂只支持文字和语音（语音请在公众号后台开启"语音识别"）'));

    // 快速命令同步回；其余异步推送，避免 5 秒超时
    if (text.trim().startsWith('/')) {
      const out = await hub.handle('wechat:' + openid, text);
      return res.send(xmlReply(msg.ToUserName, openid, out.text));
    }
    res.send(xmlReply(msg.ToUserName, openid, '收到，处理中…（结果将由客服消息推送）'));
    hub.handle('wechat:' + openid, text)
      .then(out => pushCustom(openid, out.text))
      .catch(e => console.error('[wechat] push failed:', e.message));
  });

  return r;
};
