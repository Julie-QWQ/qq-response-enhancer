import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  ChatMessage,
  ChatMessageSegment,
  ChatSession,
  ConnectionStatus,
  LLMTestResult,
  OutboundMessageMode,
  ReplyPayload,
  RuntimeState,
  Sentiment,
  SessionType,
} from "./types";
import { QQ_FACE_NAME_BY_ID_EXTRA } from "./qqFaceMap";

const DEFAULT_SETTINGS: AppSettings = {
  wsUrl: "ws://127.0.0.1:8000/ws",
  notifyOnNew: true,
  focusOnNew: true,
  shortcut: "CommandOrControl+Shift+R",
  onebotHttpUrl: "http://127.0.0.1:3000",
  onebotAccessToken: "",
  appMaxHistory: 30,
  llmProvider: "custom",
  llmApiBase: "",
  llmApiKey: "",
  llmModel: "",
  llmTimeoutSeconds: 30,
  promptSystem: "",
  promptUserTemplate: "",
};

const sentimentSet = new Set<Sentiment>(["positive", "neutral", "negative", "urgent"]);
const QQ_FACE_NAME_BY_ID: Record<number, string> = {
  0: "惊讶",
  1: "撇嘴",
  2: "色",
  3: "发呆",
  4: "得意",
  5: "流泪",
  6: "害羞",
  7: "闭嘴",
  8: "睡",
  9: "大哭",
  10: "尴尬",
  11: "发怒",
  12: "调皮",
  13: "呲牙",
  14: "微笑",
  15: "难过",
  16: "酷",
  18: "抓狂",
  19: "吐",
  20: "偷笑",
  21: "可爱",
  22: "白眼",
  23: "傲慢",
  24: "饥饿",
  25: "困",
  26: "惊恐",
  27: "流汗",
  28: "憨笑",
  29: "悠闲",
  30: "奋斗",
  31: "咒骂",
  32: "疑问",
  33: "嘘",
  34: "晕",
  35: "折磨",
  36: "衰",
  37: "骷髅",
  38: "敲打",
  39: "再见",
  41: "发抖",
  42: "爱情",
  43: "跳跳",
  46: "猪头",
  49: "拥抱",
  53: "蛋糕",
  54: "闪电",
  55: "炸弹",
  56: "刀",
  57: "足球",
  59: "便便",
  60: "咖啡",
  61: "饭",
  63: "玫瑰",
  64: "凋谢",
  66: "爱心",
  67: "心碎",
  69: "礼物",
  74: "太阳",
  75: "月亮",
  76: "赞",
  77: "踩",
  78: "握手",
  79: "胜利",
  85: "飞吻",
  86: "怄火",
  89: "西瓜",
  96: "冷汗",
  97: "擦汗",
  98: "抠鼻",
  99: "鼓掌",
  100: "糗大了",
  101: "坏笑",
  102: "左哼哼",
  103: "右哼哼",
  104: "哈欠",
  105: "鄙视",
  106: "委屈",
  107: "快哭了",
  108: "阴险",
  109: "亲亲",
  110: "吓",
  111: "可怜",
  112: "菜刀",
  113: "啤酒",
  114: "篮球",
  115: "乒乓",
  116: "示爱",
  117: "瓢虫",
  118: "抱拳",
  119: "勾引",
  120: "拳头",
  121: "差劲",
  122: "爱你",
  123: "NO",
  124: "OK",
  125: "转圈",
  126: "磕头",
  127: "回头",
  128: "跳绳",
  129: "挥手",
  130: "激动",
  131: "街舞",
  132: "献吻",
  133: "左太极",
  134: "右太极",
  136: "双喜",
  137: "鞭炮",
  138: "灯笼",
  140: "K歌",
  144: "喝彩",
  145: "祈祷",
  146: "爆筋",
  147: "棒棒糖",
  148: "喝奶",
  151: "飞机",
  158: "钞票",
  168: "药",
  169: "手枪",
  171: "茶",
  172: "眨眼睛",
  173: "泪奔",
  174: "无奈",
  175: "卖萌",
  176: "小纠结",
  177: "喷血",
  178: "斜眼笑",
  180: "惊喜",
  181: "骚扰",
  182: "笑哭",
  183: "我最美",
  184: "河蟹",
  185: "羊驼",
  187: "幽灵",
  188: "蛋",
  190: "菊花",
  192: "红包",
  193: "大笑",
  194: "不开心",
  197: "冷漠",
  198: "呃",
  199: "好棒",
  200: "拜托",
  201: "点赞",
  202: "无聊",
  203: "托脸",
  204: "吃",
  205: "送花",
  206: "害怕",
  207: "花痴",
  208: "小样儿",
  210: "飙泪",
  211: "我不看",
  212: "托腮",
  214: "啵啵",
  215: "糊脸",
  216: "拍头",
  217: "扯一扯",
  218: "舔一舔",
  219: "蹭一蹭",
  220: "拽炸天",
  221: "顶呱呱",
  222: "抱抱",
  223: "暴击",
  224: "开枪",
  225: "撩一撩",
  226: "拍桌",
  227: "拍手",
  228: "恭喜",
  229: "干杯",
  230: "嘲讽",
  231: "哼",
  232: "佛系",
  233: "掐一掐",
  234: "惊呆",
  235: "颤抖",
  236: "啃头",
  237: "偷看",
  238: "扇脸",
  239: "原谅",
  240: "喷脸",
  241: "生日快乐",
  242: "头撞击",
  243: "甩头",
  244: "扔狗",
  245: "加油必胜",
  246: "加油抱抱",
  247: "口罩护体",
  260: "搬砖中",
  261: "忙到飞起",
  262: "脑阔疼",
  263: "沧桑",
  264: "捂脸",
  265: "辣眼睛",
  266: "哦哟",
  267: "头秃",
  268: "问号脸",
  269: "暗中观察",
  270: "emm",
  271: "吃瓜",
  272: "呵呵哒",
  273: "我酸了",
  274: "太南了",
  276: "辣椒酱",
  277: "汪汪",
  278: "汗",
  279: "打脸",
  280: "击掌",
  281: "无眼笑",
  282: "敬礼",
  283: "狂笑",
  284: "面无表情",
  285: "摸鱼",
  286: "魔鬼笑",
  287: "哦",
  288: "请",
  289: "睁眼",
  290: "敲开心",
  291: "震惊",
  292: "让我康康",
  293: "摸锦鲤",
  294: "期待",
  295: "拿到红包",
  296: "真好",
  297: "拜谢",
  298: "元宝",
  299: "牛啊",
  300: "胖三斤",
  301: "好闪",
  302: "左拜年",
  303: "右拜年",
  304: "红包包",
  305: "右亲亲",
  306: "牛气冲天",
  307: "喵喵",
  308: "求红包",
  309: "谢红包",
  310: "新年烟花",
  311: "打call",
  312: "变形",
  313: "嗑到了",
  314: "仔细分析",
  315: "加油",
  316: "我没事",
  317: "菜汪",
  318: "崇拜",
  319: "比心",
  320: "庆祝",
  321: "老色痞",
  322: "拒绝",
  323: "嫌弃",
  324: "吃糖",
};
Object.assign(QQ_FACE_NAME_BY_ID, QQ_FACE_NAME_BY_ID_EXTRA);
const QQ_FACE_ID_BY_NAME = Object.entries(QQ_FACE_NAME_BY_ID).reduce<Record<string, number>>((acc, [idText, name]) => {
  const id = Number(idText);
  const normalized = normalizeFaceName(String(name || ""));
  if (Number.isInteger(id) && id >= 0 && normalized) {
    acc[normalized] = id;
  }
  return acc;
}, {});

type OneBotEventLike = Record<string, unknown>;

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = -1): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asTimestampMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return Date.now();
  }
  if (value < 10_000_000_000) {
    return Math.floor(value * 1000);
  }
  return Math.floor(value);
}

function normalizeFaceName(value: string): string {
  const raw = value.trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("[/") && raw.endsWith("]")) {
    return raw.slice(2, -1).trim();
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw.slice(1, -1).trim();
  }
  if (raw.startsWith("/")) {
    return raw.slice(1).trim();
  }
  return raw;
}

function parseFaceInputToId(input: string): number | null {
  const raw = input.trim();
  if (!raw) {
    return null;
  }

  const direct = Number(raw);
  if (Number.isInteger(direct) && direct >= 0) {
    return direct;
  }

  const normalized = normalizeFaceName(raw);
  if (!normalized) {
    return null;
  }

  const prefixed = normalized.match(/^表情\s*(\d+)$/);
  if (prefixed) {
    const id = Number(prefixed[1]);
    return Number.isInteger(id) && id >= 0 ? id : null;
  }

  if (Object.prototype.hasOwnProperty.call(QQ_FACE_ID_BY_NAME, normalized)) {
    return QQ_FACE_ID_BY_NAME[normalized];
  }
  return null;
}

function buildFaceLabelById(id: number): string {
  const name = QQ_FACE_NAME_BY_ID[id];
  return name ? `[/${name}]` : `[/表情${id}]`;
}

function convertFaceLabelToCqText(text: string): string {
  if (!text.includes("[/")) {
    return text;
  }
  return text.replace(/\[\/([^\]]+)\]/g, (raw, inner: string) => {
    const id = parseFaceInputToId(inner);
    if (id === null) {
      return raw;
    }
    return `[CQ:face,id=${id}]`;
  });
}

function convertAtAndReplyLabelToCqText(text: string): string {
  let out = text;
  // [@123456] / [@all]
  out = out.replace(/\[@\s*(all|\d+)\s*\]/gi, (_raw, qq: string) => `[CQ:at,qq=${qq.toLowerCase()}]`);
  // [回复:123456789] / [reply:123456789]
  out = out.replace(/\[(?:回复|reply)\s*:\s*(\d+)\s*\]/gi, (_raw, id: string) => `[CQ:reply,id=${id}]`);
  return out;
}

function applyPendingMentionsToCq(
  text: string,
  pendingMentions: Array<{ qq: string; display: string }>,
): string {
  let out = text;
  for (const m of pendingMentions) {
    const display = (m.display || "").trim();
    const qq = (m.qq || "").trim();
    if (!display || !qq) continue;
    const token = `@${display}`;
    const idx = out.indexOf(token);
    if (idx >= 0) {
      out = `${out.slice(0, idx)}[CQ:at,qq=${qq}]${out.slice(idx + token.length)}`;
    }
  }
  return out;
}

function parseCqTextSegments(text: string, imageProxyBase = ""): ChatMessageSegment[] {
  const src = text.trim();
  if (!src) return [];
  const segments: ChatMessageSegment[] = [];
  const regex = /\[CQ:([a-zA-Z_]+),([^\]]*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null = null;
  while ((m = regex.exec(src)) !== null) {
    const idx = m.index;
    if (idx > last) {
      const plain = src.slice(last, idx).trim();
      if (plain) segments.push({ kind: "text", text: plain });
    }
    const kind = String(m[1] || "").toLowerCase();
    const paramText = String(m[2] || "");
    const params = new URLSearchParams(paramText.replace(/,/g, "&"));
    if (kind === "at") {
      const qq = (params.get("qq") || "").trim();
      segments.push({
        kind: "mention",
        text: qq === "all" ? "@全体成员" : qq ? `@${qq}` : "@某人",
        mentionId: qq || undefined,
      });
    } else if (kind === "reply") {
      const id = (params.get("id") || "").trim();
      segments.push({
        kind: "reply",
        text: id ? `回复消息 #${id}` : "回复消息",
        replyMessageId: id || undefined,
      });
    } else if (kind === "image") {
      const rawUrl = (params.get("url") || "").trim();
      const fileRef = (params.get("file") || "").trim();
      const token = rawUrl || fileRef;
      if (token.startsWith("base64://")) {
        segments.push({ kind: "image", url: `data:image/png;base64,${token.slice("base64://".length)}`, text: "[图片]" });
      } else if (/^https?:\/\//.test(token)) {
        segments.push({ kind: "image", url: token, text: "[图片]" });
      } else if (token && imageProxyBase) {
        const proxied = `${imageProxyBase}/onebot/image_proxy?file=${encodeURIComponent(token)}`;
        segments.push({ kind: "image", url: proxied, text: "[图片]" });
      } else {
        segments.push({ kind: "emoji", text: "[图片]" });
      }
    } else if (kind === "video") {
      const rawUrl = (params.get("url") || "").trim();
      const fileRef = (params.get("file") || "").trim();
      const token = rawUrl || fileRef;
      if (/^https?:\/\//.test(token) || token.startsWith("file://")) {
        segments.push({ kind: "video", url: token, text: "[视频]" });
      } else {
        segments.push({ kind: "emoji", text: "[视频]" });
      }
    } else if (kind === "face") {
      const id = (params.get("id") || "").trim();
      const faceId = Number(id);
      const label = Number.isInteger(faceId) && faceId >= 0 ? buildFaceLabelById(faceId) : "[/表情]";
      segments.push({ kind: "emoji", text: label, emojiId: id || undefined });
    } else {
      segments.push({ kind: "emoji", text: `[${kind || "CQ"}]` });
    }
    last = regex.lastIndex;
  }
  if (last < src.length) {
    const tail = src.slice(last).trim();
    if (tail) segments.push({ kind: "text", text: tail });
  }
  return segments;
}

function backendBaseFromWsUrl(wsUrl: string): string {
  const raw = wsUrl.trim();
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    if (url.protocol === "ws:") {
      return `http://${url.host}`;
    }
    if (url.protocol === "wss:") {
      return `https://${url.host}`;
    }
  } catch {
    // ignore invalid URL
  }
  return "";
}

function buildLocalImagePreviewUrl(filePath: string, wsUrl: string): string {
  const base = backendBaseFromWsUrl(wsUrl);
  if (base) {
    return `${base}/onebot/image_proxy?file=${encodeURIComponent(filePath)}`;
  }
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `file:///${encodeURI(normalized)}`;
}

function parseRuntimeSettingsToPatch(raw: unknown): Partial<AppSettings> {
  const root = asObject(raw);
  const settingsObj = asObject(root.settings);
  if (!Object.keys(settingsObj).length) {
    return {};
  }
  const timeoutRaw = settingsObj.llm_timeout_seconds;
  const timeout =
    typeof timeoutRaw === "number" && Number.isFinite(timeoutRaw)
      ? Math.max(5, Math.min(300, timeoutRaw))
      : DEFAULT_SETTINGS.llmTimeoutSeconds;
  return {
    appMaxHistory:
      typeof settingsObj.app_max_history === "number" && Number.isFinite(settingsObj.app_max_history)
        ? Math.max(5, Math.min(500, Math.floor(settingsObj.app_max_history)))
        : DEFAULT_SETTINGS.appMaxHistory,
    llmProvider: asText(settingsObj.llm_provider, DEFAULT_SETTINGS.llmProvider),
    llmApiBase: asText(settingsObj.llm_api_base, ""),
    llmApiKey: asText(settingsObj.llm_api_key, ""),
    llmModel: asText(settingsObj.llm_model, ""),
    llmTimeoutSeconds: timeout,
    promptSystem: asText(settingsObj.prompt_system, ""),
    promptUserTemplate: asText(settingsObj.prompt_user_template, ""),
  };
}

function parseReplyPayload(raw: unknown): ReplyPayload | null {
  const src = asObject(raw);
  if (!Array.isArray(src.suggestions)) {
    return null;
  }

  const sentimentRaw = asText(src.sentiment, "neutral");
  const sentiment: Sentiment = sentimentSet.has(sentimentRaw as Sentiment)
    ? (sentimentRaw as Sentiment)
    : "neutral";

  const suggestions = src.suggestions.map((item) => {
    const row = asObject(item);
    return {
      text: asText(row.text, "(empty)"),
      tone: asText(row.tone, "unknown"),
      intent: asText(row.intent, "unknown"),
      notes: asText(row.notes, ""),
    };
  });

  return {
    peer_id: asNumber(src.peer_id, -1),
    session_type: asText(src.session_type, "private") === "group" ? "group" : "private",
    sentiment,
    suggestions,
  };
}

function parseOneBotSegments(
  rawMessage: unknown,
  fallbackRaw: unknown,
  imageProxyBase: string,
): ChatMessageSegment[] {
  const fallbackText = asText(fallbackRaw).trim();

  if (typeof rawMessage === "string" && rawMessage.trim()) {
    const fromCq = parseCqTextSegments(rawMessage, imageProxyBase);
    return fromCq.length ? fromCq : [{ kind: "text", text: rawMessage.trim() }];
  }

  if (!Array.isArray(rawMessage)) {
    if (!fallbackText) return [];
    const fromCq = parseCqTextSegments(fallbackText, imageProxyBase);
    return fromCq.length ? fromCq : [{ kind: "text", text: fallbackText }];
  }

  const segments: ChatMessageSegment[] = [];
  for (const item of rawMessage) {
    const row = asObject(item);
    const segType = asText(row.type).toLowerCase();
    const data = asObject(row.data);

    if (segType === "text") {
      const text = asText(data.text).trim();
      if (text) {
        segments.push({ kind: "text", text });
      }
      continue;
    }

    if (segType === "at") {
      const qq = asText(data.qq, asText(data.user_id, asText(data.uin, ""))).trim();
      const rawName = asText(data.name, asText(data.text, "")).trim();
      const label = qq === "all" ? "@全体成员" : rawName || (qq ? `@${qq}` : "@某人");
      segments.push({ kind: "mention", text: label, mentionId: qq || undefined });
      continue;
    }

    if (segType === "reply") {
      const replyId = asText(data.id, asText(data.message_id, "")).trim();
      const brief = asText(data.text, "").trim();
      const label = brief || (replyId ? `回复消息 #${replyId}` : "回复消息");
      segments.push({ kind: "reply", text: label, replyMessageId: replyId || undefined });
      continue;
    }

    if (segType === "face" || segType === "emoji" || segType === "mface" || segType === "market_face") {
      const id = asText(data.id).trim();
      const rawName = asText(
        data.name,
        asText(
          data.text,
          asText(
            data.summary,
            asText(
              data.desc,
              asText(data.description, asText(data.face_text, asText(data.emoji_name, ""))),
            ),
          ),
        ),
      ).trim();
      const imageUrl = asText(data.url, asText(data.src)).trim();
      const faceId = Number(id);

      let faceName = normalizeFaceName(rawName);
      if (!faceName && Number.isInteger(faceId) && faceId >= 0) {
        faceName = QQ_FACE_NAME_BY_ID[faceId] || "";
      }
      if (!faceName) {
        // Extra fallback for some market/mface payloads.
        faceName = normalizeFaceName(
          asText(data.key, asText(data.wording, asText(data.alt, asText(data.label, "")))),
        );
      }

      const label = faceName ? `[/${faceName}]` : id ? `[/表情${id}]` : "[/表情]";

      // For QQ face segments, numeric id is usually not a downloadable image token.
      // Prefer text label fallback; only render as image when an explicit URL is provided.
      if (/^https?:\/\//.test(imageUrl) || imageUrl.startsWith("data:image/")) {
        segments.push({ kind: "image", url: imageUrl, text: label, emojiId: id || undefined });
      } else {
        segments.push({ kind: "emoji", text: label, emojiId: id || undefined });
      }
      continue;
    }

    if (segType === "image" || segType === "img" || segType === "picture" || segType === "photo") {
      const rawUrl = asText(data.url, asText(data.src, asText(data.path, ""))).trim();
      const fileRef = asText(data.file, asText(data.file_id, asText(data.fileId, ""))).trim();
      const token = rawUrl || fileRef;

      if (rawUrl.startsWith("base64://")) {
        segments.push({ kind: "image", url: `data:image/png;base64,${rawUrl.slice("base64://".length)}`, text: "[图片]" });
      } else if (token && imageProxyBase) {
        const proxied = `${imageProxyBase}/onebot/image_proxy?file=${encodeURIComponent(token)}`;
        segments.push({ kind: "image", url: proxied, text: "[图片]" });
      } else if (/^https?:\/\//.test(rawUrl)) {
        segments.push({ kind: "image", url: rawUrl, text: "[图片]" });
      } else {
        segments.push({ kind: "emoji", text: "[图片]" });
      }
      continue;
    }

    if (segType === "video") {
      const rawUrl = asText(data.url, asText(data.src, asText(data.path, ""))).trim();
      const fileRef = asText(data.file, asText(data.file_id, asText(data.fileId, ""))).trim();
      const token = rawUrl || fileRef;
      if (/^https?:\/\//.test(token) || token.startsWith("file://")) {
        segments.push({ kind: "video", url: token, text: "[视频]" });
      } else {
        segments.push({ kind: "emoji", text: "[视频]" });
      }
      continue;
    }

    const genericText = asText(data.text);
    if (genericText.trim()) {
      segments.push({ kind: "text", text: genericText.trim() });
    } else {
      segments.push({ kind: "emoji", text: `[${segType || "消息"}]` });
    }
  }

  if (segments.length === 0 && fallbackText) {
    segments.push({ kind: "text", text: fallbackText });
  }
  return segments;
}

function buildFallbackMessageId(input: {
  sessionType: SessionType;
  peerId: number;
  senderId: number;
  timestamp: number;
  segments: ChatMessageSegment[];
}): string {
  const text = input.segments
    .map((s) => s.text || s.url || s.emojiId || "")
    .join("|")
    .slice(0, 160);
  return `fallback:${input.sessionType}:${input.peerId}:${input.senderId}:${input.timestamp}:${text}`;
}

function parseOneBotEvent(raw: unknown, wsUrl: string) {
  const src = asObject(raw) as OneBotEventLike;
  if (asText(src.post_type) !== "message") {
    return null;
  }

  const messageTypeRaw = asText(src.message_type, "private");
  const sessionType: SessionType =
    messageTypeRaw === "private" ? "private" : messageTypeRaw === "group" ? "group" : "unknown";
  const peerId = sessionType === "group" ? asNumber(src.group_id, -1) : asNumber(src.user_id, -1);
  if (peerId < 0) {
    return null;
  }

  const sender = asObject(src.sender);
  const groupName = asText(src.group_name).trim();
  const senderName = asText(sender.card).trim() || asText(sender.nickname).trim() || `用户 ${asNumber(sender.user_id, 0)}`;
  const title = sessionType === "group" ? groupName || `群 ${peerId}` : senderName || `会话 ${peerId}`;
  const senderId = asNumber(sender.user_id, asNumber(src.user_id, -1));
  const selfId = asNumber(src.self_id, -2);
  const senderRole = senderId >= 0 && senderId === selfId ? "self" : "peer";

  const segments = parseOneBotSegments(src.message, src.raw_message, backendBaseFromWsUrl(wsUrl));
  if (segments.length === 0) {
    return null;
  }

  const timestamp = asTimestampMs(src.time);
  const rawMessageId = src.message_id;
  const messageId =
    rawMessageId === null || rawMessageId === undefined || String(rawMessageId).trim() === ""
      ? buildFallbackMessageId({ sessionType, peerId, senderId, timestamp, segments })
      : `msg:${String(rawMessageId).trim()}`;

  const message: ChatMessage = {
    id: messageId,
    sender: senderRole,
    senderName: senderRole === "peer" ? senderName : "我",
    senderId,
    timestamp,
    segments,
  };

  return { peerId, title, type: sessionType, message };
}

function formatPreview(segments: ChatMessageSegment[]): string {
  if (!segments.length) {
    return "(空消息)";
  }
  const first = segments[0];
  if (first.kind === "image") {
    return "[图片]";
  }
  return first.text || "(空消息)";
}

function formatTime(ts: number): string {
  const date = new Date(ts);
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  return `${hh}:${mm}`;
}

function buildQqAvatarUrl(qq: number): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=100`;
}

function buildSessionAvatarUrl(sessionType: SessionType, peerId: number): string {
  if (sessionType === "group") {
    return `https://p.qlogo.cn/gh/${peerId}/${peerId}/100`;
  }
  return buildQqAvatarUrl(peerId);
}

const LAST_READ_STORAGE_KEY = "qq_panel_last_read_v1";

function loadLastReadMap(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(LAST_READ_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveLastReadMap(map: Record<string, number>) {
  try {
    window.localStorage.setItem(LAST_READ_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore write failure
  }
}

function appendMessage(
  prev: ChatSession[],
  selectedSessionId: string | null,
  update: { peerId: number; title: string; type: SessionType; message: ChatMessage },
  options?: { markUnread?: boolean },
): ChatSession[] {
  const buildSegmentSignature = (segments: ChatMessageSegment[]): string =>
    segments
      .map((s) => `${s.kind}:${s.text || ""}:${s.url || ""}:${s.emojiId || ""}`)
      .join("|")
      .slice(0, 512);

  const markUnread = options?.markUnread ?? true;
  const sessionId = `${update.type}-${update.peerId}`;
  const eventTs = Number.isFinite(update.message.timestamp) ? update.message.timestamp : Date.now();
  const index = prev.findIndex((session) => session.id === sessionId);

  if (index < 0) {
    const newSession: ChatSession = {
      id: sessionId,
      peerId: update.peerId,
      title: update.title,
      type: update.type,
      unread: markUnread && selectedSessionId !== sessionId ? 1 : 0,
      updatedAt: eventTs,
      messages: [update.message],
    };
    return [newSession, ...prev].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const current = prev[index];
  if (current.messages.some((m) => m.id === update.message.id)) {
    return prev;
  }

  // Guard against duplicated deliveries, but do NOT dedupe deliberate repeated messages
  // (e.g. 3 suggestion placeholders with identical text).
  const incomingSig = buildSegmentSignature(update.message.segments);
  const incomingId = String(update.message.id || "");
  const isIncomingSuggestion = !!update.message.suggestionBatchId;
  if (!isIncomingSuggestion) {
    const duplicateIndex = current.messages.findIndex((m) => {
      if (m.sender !== update.message.sender) return false;
      if (m.suggestionBatchId || update.message.suggestionBatchId) return false;
      const dt = Math.abs((m.timestamp || 0) - eventTs);
      if (dt > 8_000) return false;
      return buildSegmentSignature(m.segments) === incomingSig;
    });

    if (duplicateIndex >= 0) {
      const existing = current.messages[duplicateIndex];
      const existingId = String(existing.id || "");
      const incomingIsMsg = incomingId.startsWith("msg:");
      const existingIsMsg = existingId.startsWith("msg:");
      const incomingIsFallback = incomingId.startsWith("fallback:");
      const existingIsFallback = existingId.startsWith("fallback:");

      // Keep the authoritative version with real message_id.
      const existingIsSelfLocal = existingId.startsWith("self-local-");
      if (incomingIsMsg && (existingIsFallback || existingIsSelfLocal)) {
        const replacedMessages = [...current.messages];
        replacedMessages[duplicateIndex] = update.message;
        const replaced: ChatSession = {
          ...current,
          title: update.title || current.title,
          updatedAt: Math.max(current.updatedAt, eventTs),
          messages: replacedMessages.slice(-200),
        };
        const next = [...prev];
        next.splice(index, 1);
        next.push(replaced);
        return next.sort((a, b) => b.updatedAt - a.updatedAt);
      }

      // Existing is already authoritative; ignore fallback duplicate.
      if ((incomingIsFallback && existingIsMsg) || (incomingId.startsWith("self-local-") && existingIsMsg)) {
        return prev;
      }

      // Same class duplicate (fallback/fallback or msg/msg): keep first one.
      if ((incomingIsFallback && existingIsFallback) || (incomingIsMsg && existingIsMsg)) {
        return prev;
      }

      // Conservative fallback for other duplicate id patterns.
      return prev;
    }
  }

  const merged: ChatSession = {
    ...current,
    title: update.title || current.title,
    updatedAt: Math.max(current.updatedAt, eventTs),
    unread: markUnread && selectedSessionId !== sessionId ? current.unread + 1 : current.unread,
    messages: [...current.messages, update.message].slice(-200),
  };

  const next = [...prev];
  next.splice(index, 1);
  next.push(merged);
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

function appendSelfMessage(
  prev: ChatSession[],
  sessionId: string,
  segments: ChatMessageSegment[],
  timestamp = Date.now(),
): ChatSession[] {
  return prev.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }
    const msg: ChatMessage = {
      id: `self-local-${timestamp}-${Math.random().toString(16).slice(2)}`,
      sender: "self",
      senderName: "我",
      senderId: 0,
      timestamp,
      segments,
    };
    return {
      ...session,
      updatedAt: timestamp,
      messages: [...session.messages, msg].slice(-200),
    };
  });
}

function extractMessageText(message: ChatMessage): string {
  return message.segments
    .map((seg) => seg.text || "")
    .join("")
    .trim();
}

function buildMessagePreview(message: ChatMessage): string {
  for (const seg of message.segments) {
    if (seg.kind === "text" && (seg.text || "").trim()) return (seg.text || "").trim();
    if (seg.kind === "image") return "[图片]";
    if (seg.kind === "video") return "[视频]";
    if (seg.kind === "emoji" && (seg.text || "").trim()) return (seg.text || "").trim();
  }
  return "(无内容)";
}

function renderSegment(segment: ChatMessageSegment, idx: number) {
  if (segment.kind === "image" && segment.url) {
    return (
      <img
        key={idx}
        className="msg-image"
        src={segment.url}
        alt={segment.text || "图片"}
        onError={(e) => {
          const target = e.currentTarget;
          target.style.display = "none";
          const fallback = document.createElement("span");
          fallback.className = "msg-emoji";
          fallback.textContent = "[图片加载失败]";
          target.parentElement?.appendChild(fallback);
        }}
      />
    );
  }
  if (segment.kind === "video" && segment.url) {
    return (
      <video key={idx} className="msg-video" src={segment.url} controls preload="metadata">
        你的环境不支持视频播放
      </video>
    );
  }
  if (segment.kind === "emoji") {
    return (
      <span key={idx} className="msg-emoji">
        {segment.text || "[表情]"}
      </span>
    );
  }
  if (segment.kind === "mention") {
    return (
      <span key={idx} className="msg-mention">
        {segment.text || "@某人"}
      </span>
    );
  }
  if (segment.kind === "reply") {
    return (
      <span key={idx} className="msg-reply">
        {segment.text || "回复消息"}
      </span>
    );
  }
  return (
    <span key={idx} className="msg-text">
      {segment.text || ""}
    </span>
  );
}

export default function App() {
  const autoResizeTextarea = (el: HTMLTextAreaElement | null, minHeight = 96) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  };

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = window.localStorage.getItem("ui_theme");
    return saved === "light" ? "light" : "dark";
  });
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({
    alwaysOnTop: false,
    autostartEnabled: false,
  });
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [showSettings, setShowSettings] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionRenderEpoch, setSessionRenderEpoch] = useState<Record<string, number>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");
  const [composeText, setComposeText] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [suggestBusyBySession, setSuggestBusyBySession] = useState<Record<string, boolean>>({});
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [llmTestBusy, setLlmTestBusy] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<LLMTestResult | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [draftImage, setDraftImage] = useState<{ filePath?: string; base64?: string; previewUrl: string; name: string } | null>(
    null,
  );
  const [showFaceDialog, setShowFaceDialog] = useState(false);
  const [faceInput, setFaceInput] = useState("微笑");
  const [videoTransfer, setVideoTransfer] = useState<{
    taskId: string;
    progress: number;
    status: "queued" | "sending" | "success" | "failed";
    detail: string;
  } | null>(null);
  const [pendingReply, setPendingReply] = useState<{
    messageId: string;
    senderName: string;
    preview: string;
  } | null>(null);
  const [pendingMentions, setPendingMentions] = useState<Array<{ qq: string; display: string }>>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "bubble" | "avatar";
    message: ChatMessage;
  } | null>(null);
  const [avatarErrorMap, setAvatarErrorMap] = useState<Record<string, boolean>>({});
  const [sessionAvatarErrorMap, setSessionAvatarErrorMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!sendError) {
      return;
    }
    const timer = window.setTimeout(() => setSendError(""), 5000);
    return () => window.clearTimeout(timer);
  }, [sendError]);

  useEffect(() => {
    window.localStorage.setItem("ui_theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const composeRef = useRef<HTMLTextAreaElement | null>(null);
  const promptSystemRef = useRef<HTMLTextAreaElement | null>(null);
  const promptUserTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const lastReadMapRef = useRef<Record<string, number>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const selectedSessionRef = useRef<string | null>(null);
  const sendInFlightRef = useRef(false);
  const videoPollTimerRef = useRef<number | null>(null);
  const videoHideTimerRef = useRef<number | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const lastSessionIdForScrollRef = useRef<string | null>(null);

  useEffect(() => {
    lastReadMapRef.current = loadLastReadMap();
  }, []);

  useEffect(() => {
    selectedSessionRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    return () => {
      if (videoPollTimerRef.current) {
        window.clearInterval(videoPollTimerRef.current);
        videoPollTimerRef.current = null;
      }
      if (videoHideTimerRef.current) {
        window.clearTimeout(videoHideTimerRef.current);
        videoHideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as Node | null;
      if (target && contextMenuRef.current?.contains(target)) {
        return;
      }
      if (event.button === 0) {
        close();
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!showSettings) return;
    autoResizeTextarea(promptSystemRef.current);
    autoResizeTextarea(promptUserTemplateRef.current);
  }, [showSettings, settings.promptSystem, settings.promptUserTemplate]);

  const visibleSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    if (!q) {
      return sessions;
    }
    return sessions.filter((item) => {
      return (
        item.title.toLowerCase().includes(q) ||
        String(item.peerId).includes(q) ||
        item.messages.some((m) =>
          m.segments.some((segment) => (segment.text || "").toLowerCase().includes(q)),
        )
      );
    });
  }, [sessions, sessionSearch]);

  const selectedSession = useMemo(() => {
    if (!selectedSessionId) {
      return null;
    }
    return sessions.find((session) => session.id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);
  const selectedSuggestBusy = !!(selectedSession && suggestBusyBySession[selectedSession.id]);

  const mentionNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!selectedSession) return map;
    for (const msg of selectedSession.messages) {
      if (msg.sender !== "peer") continue;
      if (!Number.isInteger(msg.senderId) || (msg.senderId as number) < 0) continue;
      const id = String(msg.senderId);
      const name = (msg.senderName || "").trim();
      if (name && !map.has(id)) {
        map.set(id, name);
      }
    }
    return map;
  }, [selectedSession]);

  const replyTargetMap = useMemo(() => {
    const map = new Map<string, { senderName: string; preview: string }>();
    if (!selectedSession) return map;
    for (const msg of selectedSession.messages) {
      const id = String(msg.id || "");
      if (!id.startsWith("msg:")) continue;
      const rawId = id.slice(4).trim();
      if (!rawId) continue;
      map.set(rawId, {
        senderName: msg.senderName || (msg.sender === "self" ? "我" : "对方"),
        preview: buildMessagePreview(msg),
      });
    }
    return map;
  }, [selectedSession]);

  const syncRuntimeSettingsFromBackend = async (wsUrl: string) => {
    const backendBase = backendBaseFromWsUrl(wsUrl);
    if (!backendBase) return;
    try {
      const resp = await fetch(`${backendBase}/settings/runtime`);
      if (!resp.ok) return;
      const patch = parseRuntimeSettingsToPatch(await resp.json());
      if (!Object.keys(patch).length) return;
      setSettings((prev) => ({ ...prev, ...patch }));
    } catch {
      // ignore runtime settings bootstrap failure
    }
  };

  const pushRuntimeSettingsToBackend = async (nextSettings: AppSettings) => {
    const backendBase = backendBaseFromWsUrl(nextSettings.wsUrl);
    if (!backendBase) {
      throw new Error("wsUrl 无法解析后端地址");
    }
    const resp = await fetch(`${backendBase}/settings/runtime`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm_provider: nextSettings.llmProvider,
        app_max_history: nextSettings.appMaxHistory,
        llm_api_base: nextSettings.llmApiBase,
        llm_api_key: nextSettings.llmApiKey,
        llm_model: nextSettings.llmModel,
        llm_timeout_seconds: nextSettings.llmTimeoutSeconds,
        prompt_system: nextSettings.promptSystem,
        prompt_user_template: nextSettings.promptUserTemplate,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`后端保存失败: HTTP ${resp.status}${text ? ` ${text.slice(0, 200)}` : ""}`);
    }
  };

  const rebuildSessionFromHistory = (
    sessionType: SessionType,
    peerId: number,
    title: string,
    historyRows: unknown[],
  ): ChatSession | null => {
    let temp: ChatSession[] = [];
    for (const raw of historyRows) {
      const chatEvent = parseOneBotEvent(raw, settings.wsUrl);
      if (!chatEvent) continue;
      if (chatEvent.type !== sessionType || chatEvent.peerId !== peerId) continue;
      temp = appendMessage(temp, null, chatEvent, { markUnread: false });
    }
    if (!temp.length) return null;
    const sessionId = `${sessionType}-${peerId}`;
    const built = temp.find((s) => s.id === sessionId) || temp[0];
    return {
      ...built,
      id: sessionId,
      title: title || built.title,
      unread: 0,
    };
  };

  const reloadSessionHistory = async (session: ChatSession) => {
    try {
      const backendBase = backendBaseFromWsUrl(settings.wsUrl);
      if (!backendBase) return;

      const pageSize = 500;
      const maxPages = 20;
      let offset = 0;
      const collected: unknown[] = [];

      for (let i = 0; i < maxPages; i += 1) {
        const historyUrl = `${backendBase}/chat/history?session_type=${encodeURIComponent(session.type)}&peer_id=${
          session.peerId
        }&limit=${pageSize}&offset=${offset}`;
        const resp = await fetch(historyUrl);
        if (!resp.ok) break;
        const data = (await resp.json()) as { messages?: unknown[]; count?: number };
        const rows = Array.isArray(data.messages) ? data.messages : [];
        if (!rows.length) break;
        // Backend returns each page in ascending order within that page, but
        // pagination offsets are from newest -> older pages. Prepend older pages
        // so final collected remains chronological.
        collected.unshift(...rows);
        if (rows.length < pageSize) break;
        offset += pageSize;
      }

      if (!collected.length) return;
      const rebuilt = rebuildSessionFromHistory(session.type, session.peerId, session.title, collected);
      if (!rebuilt) return;
      setSessions((prev) =>
        prev.map((item) => {
          if (item.id !== session.id) return item;
          // Preserve local suggestion bubbles (including "正在生成中...") across history reload.
          const localSuggestionMessages = item.messages.filter((m) => !!m.suggestionBatchId);
          const mergedMessages = [...rebuilt.messages];
          for (const local of localSuggestionMessages) {
            if (!mergedMessages.some((x) => x.id === local.id)) {
              mergedMessages.push(local);
            }
          }
          mergedMessages.sort((a, b) => a.timestamp - b.timestamp);
          return {
            ...rebuilt,
            messages: mergedMessages.slice(-300),
          };
        }),
      );
    } catch {
      // ignore reload failure
    }
  };

  const refreshCurrentSession = async () => {
    if (!selectedSession || refreshBusy) {
      return;
    }
    const targetSession = selectedSession;
    const targetSessionId = targetSession.id;
    const backendBase = backendBaseFromWsUrl(settings.wsUrl);
    if (!backendBase) {
      setSendError("刷新失败：wsUrl 无法解析后端地址");
      return;
    }
    setRefreshBusy(true);
    setSendError("");
    // 先清空当前会话气泡，再从历史重建，保证刷新行为可见且确定。
    setSessions((prev) =>
      prev.map((item) =>
        item.id === targetSessionId
          ? {
              ...item,
              messages: [],
              unread: 0,
            }
          : item,
      ),
    );
    setSessionRenderEpoch((prev) => ({
      ...prev,
      [targetSessionId]: (prev[targetSessionId] || 0) + 1,
    }));
    try {
      // Best-effort pull from QQ side, then reload local DB-backed history for this session.
      await fetch(`${backendBase}/chat/import_onebot_history?recent_count=20&per_session_count=50`, {
        method: "POST",
      }).catch(() => undefined);
      await reloadSessionHistory(targetSession);
      setSessionRenderEpoch((prev) => ({
        ...prev,
        [targetSessionId]: (prev[targetSessionId] || 0) + 1,
      }));
    } catch (error) {
      setSendError(`刷新失败: ${String(error)}`);
    } finally {
      setRefreshBusy(false);
    }
  };

  const requestSmartSuggestions = async () => {
    if (!selectedSession) return;
    const targetSession = selectedSession;
    if (suggestBusyBySession[targetSession.id]) return;
    const suggestionBatchId = `suggest-batch-${targetSession.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const backendBase = backendBaseFromWsUrl(settings.wsUrl);
    if (!backendBase) {
      setSendError("建议生成失败：wsUrl 无法解析后端地址");
      return;
    }
    const placeholderIds = Array.from({ length: 3 }, (_, idx) =>
      `suggest-pending-${targetSession.id}-${Date.now()}-${idx}-${Math.random().toString(16).slice(2)}`,
    );
    setSessions((prev) => {
      let next = prev;
      const baseTs = Date.now();
      for (const [idx, id] of placeholderIds.entries()) {
        const pendingMessage: ChatMessage = {
          id,
          sender: "self",
          senderName: "我",
          timestamp: baseTs + idx,
          segments: [{ kind: "text", text: "正在生成中..." }],
          suggestionSelectable: false,
          suggestionBatchId,
        };
        next = appendMessage(
          next,
          selectedSessionRef.current,
          {
            peerId: targetSession.peerId,
            title: targetSession.title,
            type: targetSession.type,
            message: pendingMessage,
          },
          { markUnread: false },
        );
      }
      return next;
    });
    requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });

    setSuggestBusyBySession((prev) => ({ ...prev, [targetSession.id]: true }));
    setSendError("");
    try {
      const updateSlotMessage = (slot: number, text: string, selectable: boolean) => {
        const placeholderId = placeholderIds[slot];
        setSessions((prev) =>
          prev.map((session) => {
            if (session.id !== targetSession.id) return session;
            return {
              ...session,
              messages: session.messages.map((msg) =>
                msg.id === placeholderId
                  ? {
                      ...msg,
                      segments: [{ kind: "text", text }],
                      suggestionSelectable: selectable,
                      suggestionBatchId,
                    }
                  : msg,
              ),
            };
          }),
        );
      };

      const fetchOneSuggestion = async (slot: number): Promise<{ ok: boolean; error?: string }> => {
        const resp = await fetch(`${backendBase}/suggest/reply_one`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_type: targetSession.type,
            peer_id: targetSession.peerId,
            slot,
          }),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          updateSlotMessage(slot, "生成失败，请重试", false);
          return { ok: false, error: `槽位${slot + 1}: HTTP ${resp.status}${text ? ` ${text.slice(0, 160)}` : ""}` };
        }

        const parsed = asObject(await resp.json());
        const suggestion = asObject(parsed.suggestion);
        const suggestionText = asText(suggestion.text).trim();
        if (!suggestionText) {
          updateSlotMessage(slot, "（无可用建议）", false);
          return { ok: false, error: `槽位${slot + 1}: 返回为空` };
        }

        updateSlotMessage(slot, suggestionText, true);
        return { ok: true };
      };

      const tasks = [0, 1, 2].map((slot) => fetchOneSuggestion(slot));
      const settled = await Promise.allSettled(tasks);
      const errors: string[] = [];
      for (const item of settled) {
        if (item.status === "fulfilled") {
          if (!item.value.ok && item.value.error) {
            errors.push(item.value.error);
          }
        } else {
          errors.push(String(item.reason));
        }
      }
      if (errors.length) {
        setSendError(`建议生成部分失败: ${errors.slice(0, 3).join(" | ")}`);
      }
    } catch (error) {
      setSendError(`建议生成失败: ${String(error)}`);
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== targetSession.id) return session;
          return {
            ...session,
            messages: session.messages.map((msg) =>
              placeholderIds.includes(msg.id)
                ? {
                    ...msg,
                    segments: [{ kind: "text", text: "生成失败，请重试" }],
                    suggestionSelectable: false,
                  }
                : msg,
            ),
          };
        }),
      );
    } finally {
      setSuggestBusyBySession((prev) => ({ ...prev, [targetSession.id]: false }));
    }
  };

  useEffect(() => {
    if (!selectedSession) {
      return;
    }
    const sessionId = selectedSession.id;
    const isSessionChanged = lastSessionIdForScrollRef.current !== sessionId;
    if (isSessionChanged) {
      // Switched session: jump to latest once.
      messageEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      lastSessionIdForScrollRef.current = sessionId;
      autoScrollEnabledRef.current = true;
      return;
    }
    if (!autoScrollEnabledRef.current) {
      return;
    }
    // Same session and user is near bottom: keep following new messages.
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedSession?.id, selectedSession?.messages.length]);

  useEffect(() => {
    let removeRuntimeListener: (() => void) | undefined;

    const loadInitialChats = async (wsUrl: string) => {
      try {
        const backendBase = backendBaseFromWsUrl(wsUrl);
        if (!backendBase) {
          return;
        }

        // Try importing QQ-side historical messages on startup (best effort).
        await fetch(`${backendBase}/chat/import_onebot_history?recent_count=20&per_session_count=50`, {
          method: "POST",
        }).catch(() => undefined);

        const sessionsResp = await fetch(`${backendBase}/chat/sessions`);
        if (!sessionsResp.ok) {
          return;
        }
        const sessionsData = (await sessionsResp.json()) as { sessions?: Array<Record<string, unknown>> };
        const rawSessions = Array.isArray(sessionsData?.sessions) ? sessionsData.sessions : [];
        if (!rawSessions.length) {
          return;
        }

        const historyResults = await Promise.all(
          rawSessions.map(async (row) => {
            const sessionType = asText(row.session_type, "private");
            const peerId = asNumber(row.peer_id, -1);
            if ((sessionType !== "private" && sessionType !== "group") || peerId < 0) {
              return [];
            }
            const historyUrl = `${backendBase}/chat/history?session_type=${encodeURIComponent(sessionType)}&peer_id=${peerId}&limit=200`;
            const historyResp = await fetch(historyUrl);
            if (!historyResp.ok) {
              return [];
            }
            const historyData = (await historyResp.json()) as { messages?: unknown[] };
            return Array.isArray(historyData?.messages) ? historyData.messages : [];
          }),
        );

        let nextSessions: ChatSession[] = [];
        for (const messages of historyResults) {
          for (const raw of messages) {
            const chatEvent = parseOneBotEvent(raw, wsUrl);
            if (chatEvent) {
              nextSessions = appendMessage(nextSessions, null, chatEvent, { markUnread: false });
            }
          }
        }

        if (!nextSessions.length) {
          return;
        }
        const withUnreadFromReadState = nextSessions.map((session) => {
          const lastRead = lastReadMapRef.current[session.id] || 0;
          if (lastRead <= 0) {
            return { ...session, unread: 0 };
          }
          const unread = session.messages.filter((m) => m.sender === "peer" && m.timestamp > lastRead).length;
          return { ...session, unread };
        });
        setSessions((prev) => {
          if (!prev.length) return withUnreadFromReadState;
          // Merge in any live messages that arrived during bootstrap.
          let merged = withUnreadFromReadState;
          for (const live of prev) {
            for (const msg of live.messages) {
              merged = appendMessage(
                merged,
                selectedSessionRef.current,
                { peerId: live.peerId, title: live.title, type: live.type, message: msg },
                { markUnread: false },
              );
            }
            merged = merged.map((s) => (s.id === live.id ? { ...s, unread: Math.max(s.unread, live.unread) } : s));
          }
          return merged;
        });
        setSelectedSessionId((prev) => prev || nextSessions[0].id);
      } catch {
        // Ignore bootstrap failures; realtime WS stream remains the source of truth.
      }
    };

    const init = async () => {
      const loaded = await window.electronAPI.getSettings();
      const mergedLoaded = { ...DEFAULT_SETTINGS, ...loaded };
      setSettings(mergedLoaded);
      await syncRuntimeSettingsFromBackend(mergedLoaded.wsUrl);
      await loadInitialChats(mergedLoaded.wsUrl);

      const runtime = await window.electronAPI.getRuntimeState();
      setRuntimeState(runtime);

      removeRuntimeListener = window.electronAPI.onRuntimeState((next) => {
        setRuntimeState(next);
      });
    };

    void init();

    return () => {
      if (removeRuntimeListener) {
        removeRuntimeListener();
      }
    };
  }, []);

  useEffect(() => {
    const onKey = async (event: KeyboardEvent) => {
      if (event.key === "Escape" && lightboxImageUrl) {
        setLightboxImageUrl(null);
        return;
      }

      if (event.key === "Escape") {
        await window.electronAPI.hideWindow();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxImageUrl]);

  const renderMessageSegment = (segment: ChatMessageSegment, idx: number) => {
    if (segment.kind === "image" && segment.url) {
      return (
        <img
          key={idx}
          className="msg-image"
          src={segment.url}
          alt={segment.text || "图片"}
          title="点击放大"
          onClick={() => setLightboxImageUrl(segment.url || null)}
          onError={(e) => {
            const target = e.currentTarget;
            target.style.display = "none";
            const fallback = document.createElement("span");
            fallback.className = "msg-emoji";
            fallback.textContent = "[图片加载失败]";
            target.parentElement?.appendChild(fallback);
          }}
        />
      );
    }
    if (segment.kind === "mention") {
      const mentionId = (segment.mentionId || "").trim();
      const nickname = mentionId && mentionId !== "all" ? mentionNameMap.get(mentionId) || "" : "";
      const label = mentionId === "all" ? "@全体成员" : nickname ? `@${nickname}` : segment.text || "@某人";
      return (
        <span key={idx} className="msg-mention">
          {label}
        </span>
      );
    }
    if (segment.kind === "reply") {
      const replyId = (segment.replyMessageId || "").trim();
      const hit = replyId ? replyTargetMap.get(replyId) : undefined;
      const label = hit
        ? `回复 ${hit.senderName}：${hit.preview}`
        : segment.text || (replyId ? `回复消息 #${replyId}` : "回复消息");
      return (
        <span key={idx} className="msg-reply">
          {label}
        </span>
      );
    }
    return renderSegment(segment, idx);
  };

  const renderAvatar = (message: ChatMessage) => {
    if (message.sender !== "peer" && message.sender !== "self") {
      return null;
    }
    const numericId =
      Number.isInteger(message.senderId) && (message.senderId as number) > 0
        ? (message.senderId as number)
        : message.sender === "peer" && selectedSession?.type === "private"
          ? selectedSession.peerId
          : -1;
    const fallbackText = message.sender === "self" ? "我" : (message.senderName || "U").slice(0, 1).toUpperCase();
    const openAvatarMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: "avatar",
        message,
      });
    };
    if (numericId > 0 && !avatarErrorMap[message.id]) {
      const url = buildQqAvatarUrl(numericId);
      return (
        <img
          className="msg-avatar"
          src={url}
          alt={message.senderName || (message.sender === "self" ? "我" : "用户")}
          title={message.senderName || String(numericId)}
          onError={() => {
            setAvatarErrorMap((prev) => ({ ...prev, [message.id]: true }));
          }}
          onContextMenu={openAvatarMenu}
        />
      );
    }
    return (
      <span className="msg-avatar-fallback" onContextMenu={openAvatarMenu}>
        {fallbackText}
      </span>
    );
  };

  const insertComposeToken = (token: string) => {
    const input = composeRef.current;
    if (!input) {
      setComposeText((prev) => `${prev}${token}`);
      return;
    }
    const start = input.selectionStart ?? composeText.length;
    const end = input.selectionEnd ?? composeText.length;
    const next = `${composeText.slice(0, start)}${token}${composeText.slice(end)}`;
    setComposeText(next);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + token.length;
      input.setSelectionRange(pos, pos);
    });
  };

  const insertMentionToCompose = (qq: string, display: string) => {
    const safeDisplay = (display || qq).trim() || qq;
    insertComposeToken(`@${safeDisplay} `);
    setPendingMentions((prev) => [...prev, { qq, display: safeDisplay }]);
  };

  const extractReplyMessageId = (message: ChatMessage): string | null => {
    const id = String(message.id || "");
    if (!id.startsWith("msg:")) return null;
    const value = id.slice(4).trim();
    return value || null;
  };

  const recallMessage = async (message: ChatMessage) => {
    const messageId = extractReplyMessageId(message);
    if (!messageId || !selectedSession) {
      setSendError("该消息暂无可撤回的 message_id");
      return;
    }
    const backendBase = backendBaseFromWsUrl(settings.wsUrl);
    if (!backendBase) {
      setSendError("撤回失败：wsUrl 无法解析后端地址");
      return;
    }
    try {
      const resp = await fetch(`${backendBase}/onebot/recall_message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: Number(messageId) }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        setSendError(`撤回失败: HTTP ${resp.status}${text ? ` ${text.slice(0, 180)}` : ""}`);
        return;
      }
      const targetId = `msg:${messageId}`;
      setSessions((prev) =>
        prev.map((session) =>
          session.id === selectedSession.id
            ? {
                ...session,
                messages: session.messages.filter((m) => m.id !== targetId),
              }
            : session,
        ),
      );
    } catch (error) {
      setSendError(`撤回失败: ${String(error)}`);
    }
  };

  useEffect(() => {
    const connect = () => {
      if (!settings.wsUrl.trim()) {
        setStatus("disconnected");
        return;
      }

      setStatus(reconnectAttemptRef.current > 0 ? "reconnecting" : "disconnected");
      const socket = new WebSocket(settings.wsUrl.trim());
      wsRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setStatus("connected");
      };

      socket.onmessage = (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }

        const chatEvent = parseOneBotEvent(parsed, settings.wsUrl);
        if (chatEvent) {
          setSessions((prev) => appendMessage(prev, selectedSessionRef.current, chatEvent));
          if (!selectedSessionRef.current) {
            setSelectedSessionId(`${chatEvent.type}-${chatEvent.peerId}`);
          }
          return;
        }

        const reply = parseReplyPayload(parsed);
        if (!reply || reply.peer_id < 0 || reply.suggestions.length === 0) {
          return;
        }

        const assistantText = reply.suggestions.map((item, idx) => `${idx + 1}. ${item.text}`).join("\n");
        const assistantMessage: ChatMessage = {
          id: `assist-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          sender: "assistant",
          timestamp: Date.now(),
          segments: [{ kind: "text", text: assistantText }],
          suggestions: reply.suggestions.map((x) => x.text),
        };

        const update = {
          peerId: reply.peer_id,
          title: reply.session_type === "group" ? `群 ${reply.peer_id}` : `会话 ${reply.peer_id}`,
          type: reply.session_type as SessionType,
          message: assistantMessage,
        };
        setSessions((prev) => appendMessage(prev, selectedSessionRef.current, update));
        if (!selectedSessionRef.current) {
          setSelectedSessionId(`${update.type}-${update.peerId}`);
        }

        // Disabled by default: avoid popping notifications/window on each incoming message.
      };

      const scheduleReconnect = () => {
        if (reconnectTimerRef.current) {
          window.clearTimeout(reconnectTimerRef.current);
        }

        reconnectAttemptRef.current += 1;
        setStatus("reconnecting");
        const delay = Math.min(1000 * 2 ** (reconnectAttemptRef.current - 1), 30000);
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };

      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
      setStatus("disconnected");
    };
  }, [settings.wsUrl, settings.notifyOnNew, settings.focusOnNew]);

  const toggleAlwaysOnTop = async () => {
    const next = !runtimeState.alwaysOnTop;
    const result = await window.electronAPI.setAlwaysOnTop(next);
    setRuntimeState((prev) => ({ ...prev, alwaysOnTop: result }));
  };

  const toggleAutostart = async () => {
    const next = !runtimeState.autostartEnabled;
    const result = await window.electronAPI.setAutostart(next);
    setRuntimeState((prev) => ({ ...prev, autostartEnabled: result }));
  };

  const saveAndApplySettings = async () => {
    const saved = await window.electronAPI.saveSettings(settings);
    const mergedSaved = { ...DEFAULT_SETTINGS, ...saved };
    setSettings(mergedSaved);
    try {
      await pushRuntimeSettingsToBackend(mergedSaved);
    } catch (error) {
      setSendError(`设置保存成功，但LLM配置未同步：${String(error)}`);
    }
    setShowSettings(false);
  };

  const testLLMConnection = async () => {
    if (llmTestBusy) return;
    setLlmTestBusy(true);
    setLlmTestResult(null);
    try {
      const result = await window.electronAPI.testLLMConnection(settings);
      setLlmTestResult(result);
      if (!result.ok) {
        setSendError(result.message || "LLM连接测试失败");
      }
    } catch (error) {
      const message = `LLM连接测试失败: ${String(error)}`;
      setLlmTestResult({ ok: false, message });
      setSendError(message);
    } finally {
      setLlmTestBusy(false);
    }
  };

  const selectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setSendError("");
    const session = sessions.find((x) => x.id === sessionId);
    if (session?.messages?.length) {
      const lastTs = session.messages[session.messages.length - 1]?.timestamp || Date.now();
      const next = { ...lastReadMapRef.current, [sessionId]: lastTs };
      lastReadMapRef.current = next;
      saveLastReadMap(next);
    }
    setSessions((prev) => prev.map((item) => (item.id === sessionId ? { ...item, unread: 0 } : item)));
    if (session) {
      void reloadSessionHistory(session);
    }
  };

  const sendMessage = async (
    input: {
      mode?: OutboundMessageMode;
      text?: string;
      wireText?: string;
      filePath?: string;
      faceId?: number;
      imageBase64?: string;
    },
  ) => {
    if (!selectedSession) {
      return;
    }
    const mode = input.mode || "text";
    if (mode !== "video" && (sendBusy || sendInFlightRef.current)) {
      return;
    }
    const message = (input.text || "").trim();
    if (mode === "text" && !message) {
      return;
    }
    if (mode === "image" && !input.filePath && !input.imageBase64) {
      return;
    }
    if (mode === "video") {
      if (!input.filePath) {
        return;
      }
      if (videoTransfer && (videoTransfer.status === "queued" || videoTransfer.status === "sending")) {
        setSendError("已有视频发送任务进行中，请稍候");
        return;
      }
      const backendBase = backendBaseFromWsUrl(settings.wsUrl);
      if (!backendBase) {
        setSendError("视频发送失败：wsUrl 无法解析后端地址");
        return;
      }
      setSendError("");
      try {
        const resp = await fetch(`${backendBase}/onebot/send_message_async`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_type: selectedSession.type,
            peer_id: selectedSession.peerId,
            mode: "video",
            file_path: input.filePath,
            message: message,
          }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          setSendError(`视频发送失败: HTTP ${resp.status}${text ? ` ${text.slice(0, 200)}` : ""}`);
          return;
        }
        const data = asObject(await resp.json());
        const taskId = asText(data.task_id).trim();
        if (!taskId) {
          setSendError("视频发送失败：后端未返回任务ID");
          return;
        }
        const now = Date.now();
        const localSegments: ChatMessageSegment[] = [
          { kind: "emoji", text: `[视频 ${input.filePath.split(/[\\/]/).pop() || ""}]` },
        ];
        if (message) {
          localSegments.push({ kind: "text", text: message });
        }
        setSessions((prev) => appendSelfMessage(prev, selectedSession.id, localSegments, now));
        setComposeText("");
        setDraftImage(null);
        setPendingReply(null);
        setPendingMentions([]);

        const syncTaskStatus = async () => {
          try {
            const statusResp = await fetch(
              `${backendBase}/onebot/send_task_status?task_id=${encodeURIComponent(taskId)}`,
            );
            if (!statusResp.ok) {
              const text = await statusResp.text().catch(() => "");
              setVideoTransfer((prev) =>
                prev && prev.taskId === taskId
                  ? {
                      ...prev,
                      status: "failed",
                      progress: 100,
                      detail: `状态查询失败: HTTP ${statusResp.status}${text ? ` ${text.slice(0, 120)}` : ""}`,
                    }
                  : prev,
              );
              return;
            }
            const statusData = asObject(await statusResp.json());
            const statusRaw = asText(statusData.status, "sending");
            const status: "queued" | "sending" | "success" | "failed" =
              statusRaw === "queued" || statusRaw === "sending" || statusRaw === "success" || statusRaw === "failed"
                ? statusRaw
                : "sending";
            const progress = Math.max(0, Math.min(100, Math.floor(asNumber(statusData.progress, 0))));
            const detailText =
              status === "success"
                ? "视频发送完成"
                : status === "failed"
                  ? `发送失败: ${asText(statusData.error, "未知错误")}`
                  : "视频发送中";
            setVideoTransfer((prev) =>
              prev && prev.taskId === taskId
                ? {
                    ...prev,
                    status,
                    progress,
                    detail: detailText,
                  }
                : prev,
            );
            if (status === "success" || status === "failed") {
              if (videoPollTimerRef.current) {
                window.clearInterval(videoPollTimerRef.current);
                videoPollTimerRef.current = null;
              }
              if (status === "failed") {
                setSendError(detailText);
              }
              if (videoHideTimerRef.current) {
                window.clearTimeout(videoHideTimerRef.current);
              }
              videoHideTimerRef.current = window.setTimeout(() => {
                setVideoTransfer((prev) => (prev && prev.taskId === taskId ? null : prev));
                videoHideTimerRef.current = null;
              }, 2500);
            }
          } catch (error) {
            setVideoTransfer((prev) =>
              prev && prev.taskId === taskId
                ? {
                    ...prev,
                    status: "failed",
                    progress: 100,
                    detail: `状态查询失败: ${String(error)}`,
                  }
                : prev,
            );
          }
        };

        setVideoTransfer({
          taskId,
          status: "queued",
          progress: Math.max(0, Math.min(100, Math.floor(asNumber(data.progress, 3)))),
          detail: "已加入发送队列",
        });
        if (videoPollTimerRef.current) {
          window.clearInterval(videoPollTimerRef.current);
          videoPollTimerRef.current = null;
        }
        void syncTaskStatus();
        videoPollTimerRef.current = window.setInterval(() => {
          void syncTaskStatus();
        }, 1000);
      } catch (error) {
        setSendError(`视频发送失败: ${String(error)}`);
      }
      return;
    }

    sendInFlightRef.current = true;
    setSendBusy(true);
    setSendError("");
    try {
      const wireMessage = (input.wireText ?? message).trim();
      const result = await window.electronAPI.sendMessage({
        sessionType: selectedSession.type,
        peerId: selectedSession.peerId,
        message: wireMessage,
        mode,
        filePath: input.filePath,
        faceId: input.faceId,
        imageBase64: input.imageBase64,
      });

      if (!result.ok) {
        setSendError(result.message || "发送失败");
        return;
      }

      const now = Date.now();
      const localSegments: ChatMessageSegment[] = [];
      if (mode === "image" && input.filePath) {
        localSegments.push({ kind: "image", url: buildLocalImagePreviewUrl(input.filePath, settings.wsUrl), text: "[图片]" });
        if (message) {
          localSegments.push({ kind: "text", text: message });
        }
      } else if (mode === "image" && input.imageBase64) {
        localSegments.push({ kind: "image", url: `data:image/png;base64,${input.imageBase64}`, text: "[图片]" });
        if (message) {
          localSegments.push({ kind: "text", text: message });
        }
      } else if (mode === "video" && input.filePath) {
        const normalized = input.filePath.replace(/\\/g, "/");
        localSegments.push({ kind: "video", url: `file:///${encodeURI(normalized)}`, text: "[视频]" });
        if (message) {
          localSegments.push({ kind: "text", text: message });
        }
      } else if (mode === "face" && Number.isInteger(input.faceId)) {
        localSegments.push({ kind: "emoji", text: buildFaceLabelById(input.faceId) });
        if (message) {
          localSegments.push({ kind: "text", text: message });
        }
      } else {
        const parsedTextSegments = parseOneBotSegments(
          wireMessage,
          wireMessage,
          backendBaseFromWsUrl(settings.wsUrl),
        );
        if (parsedTextSegments.length) {
          localSegments.push(...parsedTextSegments);
        } else {
          localSegments.push({ kind: "text", text: message });
        }
      }
      setSessions((prev) => appendSelfMessage(prev, selectedSession.id, localSegments, now));
      setComposeText("");
      setDraftImage(null);
      setPendingReply(null);
      setPendingMentions([]);
    } finally {
      sendInFlightRef.current = false;
      setSendBusy(false);
    }
  };

  const submitCompose = () => {
    const rawText = composeText;
    let wireText = convertAtAndReplyLabelToCqText(convertFaceLabelToCqText(rawText));
    wireText = applyPendingMentionsToCq(wireText, pendingMentions);
    if (pendingReply?.messageId) {
      wireText = `[CQ:reply,id=${pendingReply.messageId}]${wireText}`;
    }
    if (draftImage) {
      void sendMessage({
        mode: "image",
        text: rawText,
        wireText,
        filePath: draftImage.filePath,
        imageBase64: draftImage.base64,
      });
      return;
    }
    void sendMessage({ mode: "text", text: rawText, wireText });
  };

  const onComposeKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitCompose();
    }
  };

  const sendImage = async () => {
    const fp = await window.electronAPI.pickMediaFile("image");
    if (!fp) {
      return;
    }
    const name = fp.split(/[\\/]/).pop() || "图片";
    setDraftImage({
      filePath: fp,
      previewUrl: buildLocalImagePreviewUrl(fp, settings.wsUrl),
      name,
    });
    setSendError("");
  };

  const sendVideo = async () => {
    const fp = await window.electronAPI.pickMediaFile("video");
    if (!fp) {
      return;
    }
    void sendMessage({ mode: "video", filePath: fp });
  };

  const sendFace = async () => {
    setFaceInput("微笑");
    setShowFaceDialog(true);
  };

  const confirmSendFace = () => {
    const id = parseFaceInputToId(faceInput);
    if (id === null) {
      setSendError("表情无效：请输入ID或名称");
      return;
    }
    const label = buildFaceLabelById(id);
    const input = composeRef.current;
    if (!input) {
      setComposeText((prev) => `${prev}${label}`);
      setShowFaceDialog(false);
      return;
    }
    const start = input.selectionStart ?? composeText.length;
    const end = input.selectionEnd ?? composeText.length;
    const next = `${composeText.slice(0, start)}${label}${composeText.slice(end)}`;
    setComposeText(next);
    setShowFaceDialog(false);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + label.length;
      input.setSelectionRange(pos, pos);
    });
  };

  const onComposePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboard = event.clipboardData;
    const items = Array.from(clipboard.items || []);
    const videoItem = items.find((it) => it.type.startsWith("video/"));
    let videoFile = videoItem?.getAsFile() || null;
    if (!videoFile) {
      const fromFiles = Array.from(clipboard.files || []).find((f) => f.type.startsWith("video/"));
      videoFile = fromFiles || null;
    }
    if (videoFile) {
      event.preventDefault();
      if (!selectedSession || sendBusy || sendInFlightRef.current) {
        setSendError("当前不可发送，请稍后再试");
        return;
      }
      try {
        const directPath = asText((videoFile as unknown as { path?: string }).path).trim();
        if (directPath) {
          setSendError("");
          void sendMessage({ mode: "video", filePath: directPath });
          return;
        }

        const buffer = await videoFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = "";
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        const b64 = window.btoa(binary);
        if (!b64) {
          setSendError("粘贴视频失败：无法解析视频数据");
          return;
        }
        if (typeof window.electronAPI.saveClipboardTemp !== "function") {
          setSendError("粘贴视频失败：客户端未更新，请完全退出并重启桌面端");
          return;
        }
        const tempPath = await window.electronAPI.saveClipboardTemp({
          kind: "video",
          base64: b64,
          mimeType: videoFile.type,
          name: videoFile.name || "粘贴视频",
        });
        if (!tempPath) {
          setSendError("粘贴视频失败：无法落盘临时文件");
          return;
        }
        setSendError("");
        void sendMessage({ mode: "video", filePath: tempPath });
      } catch (error) {
        setSendError(`粘贴视频失败：读取失败（${String(error)}）`);
      }
      return;
    }

    const imageItem = items.find((it) => it.type.startsWith("image/"));
    let file = imageItem?.getAsFile() || null;
    if (!file) {
      const imageFile = Array.from(clipboard.files || []).find((f) => f.type.startsWith("image/"));
      file = imageFile || null;
    }
    if (!file) return;

    event.preventDefault();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const prefix = "base64,";
      const idx = dataUrl.indexOf(prefix);
      if (idx < 0) {
        setSendError("粘贴图片失败：无法解析base64");
        return;
      }
      const b64 = dataUrl.slice(idx + prefix.length);
      setDraftImage({
        base64: b64,
        previewUrl: dataUrl,
        name: file?.name || "粘贴图片",
      });
      setSendError("");
    };
    reader.onerror = () => {
      setSendError("粘贴图片失败：读取剪贴板异常");
    };
    reader.readAsDataURL(file);
  };

  return (
    <main className="app-shell">
      {sendError && (
        <div className="error-toast" role="alert" aria-live="assertive">
          <span>{sendError}</span>
          <button className="error-toast-close" onClick={() => setSendError("")}>
            关闭
          </button>
        </div>
      )}

      <header className="topbar">
        <div className="title-wrap">
          <h1>QQ 消息面板</h1>
          <div className="status-wrap">
            <span className={`status-dot ${status}`} />
            <span className="status-text">{status}</span>
          </div>
        </div>
        <div className="top-actions">
          <button className="toggle" disabled={!selectedSession || refreshBusy} onClick={() => void refreshCurrentSession()}>
            {refreshBusy ? "刷新中..." : "刷新"}
          </button>
          <label className="theme-switch" title={theme === "dark" ? "切换浅色" : "切换深色"}>
            <input
              type="checkbox"
              checked={theme === "light"}
              onChange={(e) => setTheme(e.target.checked ? "light" : "dark")}
            />
            <span className="theme-slider" />
          </label>
          <button className={runtimeState.alwaysOnTop ? "toggle active" : "toggle"} onClick={toggleAlwaysOnTop}>
            置顶
          </button>
          <button className="toggle" onClick={() => setShowSettings(true)}>
            设置
          </button>
        </div>
      </header>

      <section className="chat-layout">
        <aside className="session-panel">
          <input
            className="session-search"
            value={sessionSearch}
            onChange={(e) => setSessionSearch(e.target.value)}
            placeholder="搜索会话 / peer_id / 内容"
          />

          <div className="session-list">
            {visibleSessions.length === 0 && <div className="empty">暂无会话</div>}
            {visibleSessions.map((session) => {
              const lastMessage = session.messages[session.messages.length - 1];
              const preview = lastMessage ? formatPreview(lastMessage.segments) : "(无消息)";
              const selected = selectedSessionId === session.id;
              const sessionAvatarUrl = buildSessionAvatarUrl(session.type, session.peerId);
              const sessionAvatarText = (session.title || "会").slice(0, 1).toUpperCase();
              return (
                <button
                  key={session.id}
                  className={selected ? "session-item active" : "session-item"}
                  onClick={() => selectSession(session.id)}
                >
                  {sessionAvatarErrorMap[session.id] ? (
                    <span className="session-avatar-fallback">{sessionAvatarText}</span>
                  ) : (
                    <img
                      className="session-avatar"
                      src={sessionAvatarUrl}
                      alt={session.title}
                      onError={() => {
                        setSessionAvatarErrorMap((prev) => ({ ...prev, [session.id]: true }));
                      }}
                    />
                  )}
                  <div className="session-main">
                    <div className="session-title">{session.title}</div>
                    <div className="session-preview">{preview}</div>
                  </div>
                  <div className="session-meta">
                    <span className="session-time">{formatTime(session.updatedAt)}</span>
                    {session.unread > 0 && <span className="unread">{session.unread}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="chat-panel">
          {!selectedSession && <div className="chat-empty">请选择左侧会话。收到消息后会自动创建会话。</div>}

          {selectedSession && (
            <>
              <div className="chat-header">
                <div className="chat-header-main">
                  <img
                    className="chat-session-avatar"
                    src={buildSessionAvatarUrl(selectedSession.type, selectedSession.peerId)}
                    alt={selectedSession.title}
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                    }}
                  />
                  <div>
                    <div className="chat-title">{selectedSession.title}</div>
                    <div className="chat-subtitle">
                      {selectedSession.type} · peer_id {selectedSession.peerId}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="message-list"
                ref={messageListRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                  autoScrollEnabledRef.current = distanceToBottom <= 48;
                }}
              >
                {selectedSession.messages.map((message) => (
                  <div
                    key={`${selectedSession.id}-${sessionRenderEpoch[selectedSession.id] || 0}-${message.id}`}
                    className={`message-row ${message.sender}`}
                  >
                    {renderAvatar(message)}
                    <div
                      className={[
                        "bubble",
                        message.suggestionSelectable ? "bubble-suggestion-selectable" : "",
                        message.suggestionBatchId ? "bubble-suggestion-generated" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          type: "bubble",
                          message,
                        });
                      }}
                      onClick={() => {
                        if (!message.suggestionSelectable) return;
                        const text = extractMessageText(message);
                        if (!text) return;
                        const batchId = message.suggestionBatchId;
                        if (batchId && selectedSession) {
                          setSessions((prev) =>
                            prev.map((session) =>
                              session.id === selectedSession.id
                                ? {
                                    ...session,
                                    messages: session.messages.filter((m) => m.suggestionBatchId !== batchId),
                                  }
                                : session,
                            ),
                          );
                        }
                        void sendMessage({
                          mode: "text",
                          text,
                          wireText: convertAtAndReplyLabelToCqText(convertFaceLabelToCqText(text)),
                        });
                      }}
                    >
                      {selectedSession.type === "group" && message.sender === "peer" && (
                        <div className="sender-name">{message.senderName || "群成员"}</div>
                      )}
                      <div className="segments">
                        {message.segments.map((segment, idx) => renderMessageSegment(segment, idx))}
                      </div>
                      <div className="message-time">{formatTime(message.timestamp)}</div>
                    </div>
                  </div>
                ))}
                <div ref={messageEndRef} />
              </div>

              <div className="composer">
                <textarea
                  ref={composeRef}
                  value={composeText}
                  onChange={(e) => setComposeText(e.target.value)}
                  onKeyDown={onComposeKeyDown}
                  onPaste={onComposePaste}
                  placeholder="输入消息（支持 [/微笑]、[@123456]、[回复:消息ID]），Ctrl+V 可粘贴图片/视频，Enter 发送，Shift+Enter 换行"
                />
                {pendingReply && (
                  <div className="reply-indicator">
                    <div className="reply-indicator-text">
                      <strong>回复 {pendingReply.senderName}</strong>
                      <span>{pendingReply.preview || "（无内容）"}</span>
                    </div>
                    <button
                      className="reply-indicator-close"
                      title="取消回复"
                      onClick={() => setPendingReply(null)}
                    >
                      ×
                    </button>
                  </div>
                )}
                {draftImage && (
                  <div className="composer-attachment">
                    <img src={draftImage.previewUrl} alt={draftImage.name} />
                    <div className="composer-attachment-meta">
                      <span>待发送图片：{draftImage.name}</span>
                      <button disabled={sendBusy} onClick={() => setDraftImage(null)}>
                        移除
                      </button>
                    </div>
                  </div>
                )}
                <div className="composer-actions">
                  <div className="suggestion-actions">
                    <button
                      className="btn-generate"
                      disabled={selectedSuggestBusy}
                      onClick={() => void requestSmartSuggestions()}
                    >
                      {selectedSuggestBusy ? "生成中..." : "生成建议"}
                    </button>
                    <button disabled={sendBusy} onClick={() => void sendImage()}>
                      图片
                    </button>
                    <button disabled={sendBusy} onClick={() => void sendVideo()}>
                      视频
                    </button>
                    <button disabled={sendBusy} onClick={() => void sendFace()}>
                      表情
                    </button>
                  </div>
                  <div className="composer-send-area">
                    {videoTransfer && (
                      <div className={`video-progress ${videoTransfer.status}`}>
                        <div className="video-progress-head">
                          <span>{videoTransfer.detail}</span>
                          <span>{videoTransfer.progress}%</span>
                        </div>
                        <div className="video-progress-track">
                          <div
                            className="video-progress-fill"
                            style={{ width: `${Math.max(2, Math.min(100, videoTransfer.progress))}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <button
                      className="btn-send"
                      disabled={sendBusy || (!composeText.trim() && !draftImage)}
                      onClick={() => submitCompose()}
                    >
                      {sendBusy ? "发送中..." : "发送"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </section>

      {showSettings && (
        <div className="modal-mask" onClick={() => setShowSettings(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>设置</h2>
              <p>按分组管理网络、模型和提示词配置。</p>
            </div>

            <div className="settings-top-row">
              <section className="settings-section">
                <div className="settings-section-head">
                  <h3>网络设置</h3>
                  <span>连接后端与 OneBot</span>
                </div>
                <div className="settings-grid">
                  <label>
                    WebSocket URL
                    <input
                      value={settings.wsUrl}
                      onChange={(e) => setSettings((prev) => ({ ...prev, wsUrl: e.target.value }))}
                      placeholder="ws://127.0.0.1:8000/ws"
                    />
                  </label>
                  <label>
                    OneBot HTTP URL
                    <input
                      value={settings.onebotHttpUrl}
                      onChange={(e) => setSettings((prev) => ({ ...prev, onebotHttpUrl: e.target.value }))}
                      placeholder="http://127.0.0.1:3000"
                    />
                  </label>
                  <label className="span-2">
                    OneBot Access Token
                    <input
                      value={settings.onebotAccessToken}
                      onChange={(e) => setSettings((prev) => ({ ...prev, onebotAccessToken: e.target.value }))}
                      placeholder="可选"
                    />
                  </label>
                </div>
              </section>

              <section className="settings-section">
                <div className="settings-section-head">
                  <div className="settings-section-title">
                    <h3>模型设置</h3>
                    <span>回复建议生成参数</span>
                  </div>
                  <button className="btn-generate" disabled={llmTestBusy} onClick={() => void testLLMConnection()}>
                    {llmTestBusy ? "测试中..." : "测试连接"}
                  </button>
                </div>
                <div className="settings-grid">
                  <label>
                    LLM Provider
                    <select
                      value={settings.llmProvider}
                      onChange={(e) => setSettings((prev) => ({ ...prev, llmProvider: e.target.value }))}
                    >
                      <option value="custom">Custom</option>
                      <option value="siliconflow">SiliconFlow</option>
                      <option value="openai">OpenAI</option>
                      <option value="deepseek">DeepSeek</option>
                    </select>
                  </label>
                  <label>
                    LLM Model
                    <input
                      value={settings.llmModel}
                      onChange={(e) => setSettings((prev) => ({ ...prev, llmModel: e.target.value }))}
                      placeholder="gpt-4o-mini / zai-org/GLM-4.6V"
                    />
                  </label>
                  <label className="span-2">
                    LLM API Base
                    <input
                      value={settings.llmApiBase}
                      onChange={(e) => setSettings((prev) => ({ ...prev, llmApiBase: e.target.value }))}
                      placeholder="https://api.siliconflow.cn/v1"
                    />
                  </label>
                  <label>
                    LLM API Key
                    <input
                      value={settings.llmApiKey}
                      onChange={(e) => setSettings((prev) => ({ ...prev, llmApiKey: e.target.value }))}
                      placeholder="sk-..."
                    />
                  </label>
                  <label>
                    LLM Timeout (seconds)
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={settings.llmTimeoutSeconds}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          llmTimeoutSeconds: Math.max(5, Math.min(300, Number(e.target.value) || 30)),
                        }))
                      }
                      placeholder="30"
                    />
                  </label>
                  <label>
                    上下文条数上限
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={settings.appMaxHistory}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          appMaxHistory: Math.max(5, Math.min(500, Number(e.target.value) || 30)),
                        }))
                      }
                      placeholder="30"
                    />
                  </label>
                </div>
                {llmTestResult && (
                  <div className={llmTestResult.ok ? "llm-test-result ok" : "llm-test-result error"}>
                    {llmTestResult.message}
                  </div>
                )}
              </section>
            </div>

            <section className="settings-section">
              <div className="settings-section-head">
                <h3>Prompt 设置</h3>
                <span>完全由你定义提示词</span>
              </div>
              <div className="settings-grid">
                <label className="span-2">
                  系统提示词
                  <textarea
                    ref={promptSystemRef}
                    className="settings-autogrow"
                    value={settings.promptSystem}
                    onChange={(e) => {
                      autoResizeTextarea(e.currentTarget);
                      setSettings((prev) => ({ ...prev, promptSystem: e.target.value }));
                    }}
                    placeholder="完整 system prompt（不再内置硬编码）"
                  />
                </label>
                <label className="span-2">
                  用户提示词模板
                  <textarea
                    ref={promptUserTemplateRef}
                    className="settings-autogrow"
                    value={settings.promptUserTemplate}
                    onChange={(e) => {
                      autoResizeTextarea(e.currentTarget);
                      setSettings((prev) => ({ ...prev, promptUserTemplate: e.target.value }));
                    }}
                    placeholder={"可用占位符: {session_type} {history_text} {latest_message}"}
                  />
                </label>
              </div>
            </section>

            <section className="settings-section">
              <div className="settings-section-head">
                <h3>应用设置</h3>
                <span>通知与启动行为</span>
              </div>
              <div className="settings-grid">
                <label className="check-row span-2">
                  <input
                    type="checkbox"
                    checked={settings.notifyOnNew}
                    onChange={(e) => setSettings((prev) => ({ ...prev, notifyOnNew: e.target.checked }))}
                  />
                  新消息通知
                </label>
                <label className="check-row span-2">
                  <input
                    type="checkbox"
                    checked={settings.focusOnNew}
                    onChange={(e) => setSettings((prev) => ({ ...prev, focusOnNew: e.target.checked }))}
                  />
                  新消息自动显示并聚焦
                </label>
                <label>
                  全局快捷键
                  <input
                    value={settings.shortcut}
                    onChange={(e) => setSettings((prev) => ({ ...prev, shortcut: e.target.value }))}
                    placeholder="CommandOrControl+Shift+R"
                  />
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={runtimeState.autostartEnabled} onChange={toggleAutostart} />
                  开机自启
                </label>
              </div>
            </section>

            <div className="modal-actions">
              <button onClick={() => setShowSettings(false)}>取消</button>
              <button onClick={saveAndApplySettings}>保存</button>
            </div>
          </div>
        </div>
      )}

      {lightboxImageUrl && (
        <div className="lightbox-mask" onClick={() => setLightboxImageUrl(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img className="lightbox-image" src={lightboxImageUrl} alt="预览图片" />
            <button className="lightbox-close" onClick={() => setLightboxImageUrl(null)}>
              关闭
            </button>
          </div>
        </div>
      )}

      {showFaceDialog && (
        <div className="modal-mask" onClick={() => setShowFaceDialog(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>发送表情</h2>
            <label>
              表情名称或ID
              <input
                value={faceInput}
                onChange={(e) => setFaceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmSendFace();
                  }
                }}
                placeholder="例如：微笑 / 14 / [/微笑]"
              />
            </label>
            <div className="modal-actions">
              <button onClick={() => setShowFaceDialog(false)}>取消</button>
              <button onClick={confirmSendFace}>发送</button>
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "bubble" && (
            <>
              <button
                className="context-menu-item"
                disabled={!extractReplyMessageId(contextMenu.message)}
                onClick={() => {
                  const replyId = extractReplyMessageId(contextMenu.message);
                  if (!replyId) {
                    setSendError("该消息缺少可用 message_id，无法回复");
                    setContextMenu(null);
                    return;
                  }
                setPendingReply({
                  messageId: replyId,
                  senderName: contextMenu.message.senderName || "对方",
                  preview: extractMessageText(contextMenu.message).slice(0, 48),
                });
                requestAnimationFrame(() => {
                  const input = composeRef.current;
                  if (!input) return;
                  input.focus();
                  const pos = input.value.length;
                  input.setSelectionRange(pos, pos);
                });
                setContextMenu(null);
              }}
            >
                回复这条消息
              </button>
              {contextMenu.message.sender === "self" && (
                <button
                  className="context-menu-item"
                  disabled={!extractReplyMessageId(contextMenu.message)}
                  onClick={() => {
                    void recallMessage(contextMenu.message);
                    setContextMenu(null);
                  }}
                >
                  撤回这条消息
                </button>
              )}
            </>
          )}
          {contextMenu.type === "avatar" && (
            <button
              className="context-menu-item"
              disabled={!Number.isInteger(contextMenu.message.senderId) || (contextMenu.message.senderId || -1) <= 0}
              onClick={() => {
                const qq = contextMenu.message.senderId;
                if (!Number.isInteger(qq) || (qq || -1) <= 0) {
                  setSendError("该成员缺少可用QQ号，无法@");
                  setContextMenu(null);
                  return;
                }
                const display = (contextMenu.message.senderName || String(qq)).trim();
                insertMentionToCompose(String(qq), display);
                setContextMenu(null);
              }}
            >
              @对方
            </button>
          )}
        </div>
      )}
    </main>
  );
}
