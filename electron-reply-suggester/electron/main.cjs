const electron = require("electron");
const { app, BrowserWindow, Menu, Tray, ipcMain, globalShortcut, Notification, clipboard, nativeImage, dialog, screen } = electron;
if (!ipcMain || !app || !BrowserWindow) {
  throw new Error(
    "Electron ???????????? ELECTRON_RUN_AS_NODE ?????????? npm run dev / npm run start ????????? ELECTRON_RUN_AS_NODE=1?",
  );
}
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const AutoLaunch = require("auto-launch");

const META_CONFIG_FILE = "config.json";
const DEFAULT_META_CONFIG = {
  appName: "Reply Suggester",
  mainWindowTitle: "Reply Suggester",
  mainWindowWidth: 1080,
  mainWindowHeight: 760,
  mainWindowMinWidth: 860,
  mainWindowMinHeight: 620,
  suggestionBubbleTitle: "回复建议",
  suggestionBubbleWidth: 320,
  suggestionBubbleHeight: 420,
};
const SETTINGS_FILE = "settings.json";
const DEFAULT_SETTINGS = {
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

let mainWindow = null;
let suggestionBubbleWindow = null;
let tray = null;
let metaConfig = { ...DEFAULT_META_CONFIG };
let currentSettings = { ...DEFAULT_SETTINGS };
let autoLauncher = null;
let linuxAutostartFallback = false;
const inflightSends = new Map();
const recentSendResults = new Map();

function getMetaConfigPath() {
  return path.join(__dirname, "..", META_CONFIG_FILE);
}

function sanitizeMetaConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const asText = (value, fallback) => (typeof value === "string" && value.trim() ? value.trim() : fallback);
  const asInt = (value, fallback, min, max) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(value)));
  };
  const appName = asText(src.appName, DEFAULT_META_CONFIG.appName);
  return {
    appName,
    mainWindowTitle: asText(src.mainWindowTitle, appName),
    mainWindowWidth: asInt(src.mainWindowWidth, DEFAULT_META_CONFIG.mainWindowWidth, 900, 2560),
    mainWindowHeight: asInt(src.mainWindowHeight, DEFAULT_META_CONFIG.mainWindowHeight, 640, 1600),
    mainWindowMinWidth: asInt(src.mainWindowMinWidth, DEFAULT_META_CONFIG.mainWindowMinWidth, 760, 2200),
    mainWindowMinHeight: asInt(src.mainWindowMinHeight, DEFAULT_META_CONFIG.mainWindowMinHeight, 520, 1400),
    suggestionBubbleTitle: asText(src.suggestionBubbleTitle, DEFAULT_META_CONFIG.suggestionBubbleTitle),
    suggestionBubbleWidth: asInt(src.suggestionBubbleWidth, DEFAULT_META_CONFIG.suggestionBubbleWidth, 260, 800),
    suggestionBubbleHeight: asInt(src.suggestionBubbleHeight, DEFAULT_META_CONFIG.suggestionBubbleHeight, 280, 1000),
  };
}

function readMetaConfig() {
  const filePath = getMetaConfigPath();
  if (!fs.existsSync(filePath)) {
    console.log(`[meta-config] not found at ${filePath}, using defaults`);
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_META_CONFIG, null, 2), "utf-8");
    return { ...DEFAULT_META_CONFIG };
  }
  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    const content = rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent;
    const parsed = JSON.parse(content);
    const next = sanitizeMetaConfig(parsed);
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf-8");
    console.log(`[meta-config] loaded from ${filePath}, mainWindowTitle=${next.mainWindowTitle}`);
    return next;
  } catch (error) {
    console.log(`[meta-config] parse failed at ${filePath}, using defaults: ${String(error)}`);
    return { ...DEFAULT_META_CONFIG };
  }
}

function resolveSuggestionBubblePosition() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = metaConfig.suggestionBubbleWidth;
  const height = metaConfig.suggestionBubbleHeight;
  const margin = 18;
  return {
    x: Math.max(area.x + margin, area.x + area.width - width - margin),
    y: Math.max(area.y + margin, area.y + area.height - height - margin),
    width,
    height,
  };
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

function readSettings() {
  const filePath = getSettingsPath();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf-8");
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return {
      wsUrl: typeof parsed.wsUrl === "string" && parsed.wsUrl.trim() ? parsed.wsUrl : DEFAULT_SETTINGS.wsUrl,
      notifyOnNew: typeof parsed.notifyOnNew === "boolean" ? parsed.notifyOnNew : DEFAULT_SETTINGS.notifyOnNew,
      focusOnNew: typeof parsed.focusOnNew === "boolean" ? parsed.focusOnNew : DEFAULT_SETTINGS.focusOnNew,
      shortcut: typeof parsed.shortcut === "string" && parsed.shortcut.trim() ? parsed.shortcut : DEFAULT_SETTINGS.shortcut,
      onebotHttpUrl:
        typeof parsed.onebotHttpUrl === "string" && parsed.onebotHttpUrl.trim()
          ? parsed.onebotHttpUrl
          : DEFAULT_SETTINGS.onebotHttpUrl,
      onebotAccessToken:
        typeof parsed.onebotAccessToken === "string"
          ? parsed.onebotAccessToken
          : DEFAULT_SETTINGS.onebotAccessToken,
      appMaxHistory:
        typeof parsed.appMaxHistory === "number" && Number.isFinite(parsed.appMaxHistory)
          ? Math.max(5, Math.min(500, Math.floor(parsed.appMaxHistory)))
          : DEFAULT_SETTINGS.appMaxHistory,
      llmProvider:
        typeof parsed.llmProvider === "string" && parsed.llmProvider.trim()
          ? parsed.llmProvider
          : DEFAULT_SETTINGS.llmProvider,
      llmApiBase: typeof parsed.llmApiBase === "string" ? parsed.llmApiBase : DEFAULT_SETTINGS.llmApiBase,
      llmApiKey: typeof parsed.llmApiKey === "string" ? parsed.llmApiKey : DEFAULT_SETTINGS.llmApiKey,
      llmModel: typeof parsed.llmModel === "string" ? parsed.llmModel : DEFAULT_SETTINGS.llmModel,
      llmTimeoutSeconds:
        typeof parsed.llmTimeoutSeconds === "number" && Number.isFinite(parsed.llmTimeoutSeconds)
          ? Math.max(5, Math.min(300, parsed.llmTimeoutSeconds))
          : DEFAULT_SETTINGS.llmTimeoutSeconds,
      promptSystem:
        typeof parsed.promptSystem === "string" ? parsed.promptSystem : DEFAULT_SETTINGS.promptSystem,
      promptUserTemplate:
        typeof parsed.promptUserTemplate === "string"
          ? parsed.promptUserTemplate
          : DEFAULT_SETTINGS.promptUserTemplate,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(next) {
  const filePath = getSettingsPath();
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf-8");
}

async function isAutostartEnabled() {
  if (process.platform === "linux") {
    return linuxAutostartFallback;
  }

  try {
    return await autoLauncher.isEnabled();
  } catch {
    return false;
  }
}

async function setAutostartEnabled(enabled) {
  if (process.platform === "linux") {
    linuxAutostartFallback = enabled;
    return linuxAutostartFallback;
  }

  try {
    const current = await autoLauncher.isEnabled();
    if (enabled && !current) {
      await autoLauncher.enable();
    }
    if (!enabled && current) {
      await autoLauncher.disable();
    }
    return await autoLauncher.isEnabled();
  } catch {
    return false;
  }
}

function broadcastRuntimeState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  Promise.resolve(isAutostartEnabled()).then((autostartEnabled) => {
    mainWindow.webContents.send("runtime-state", {
      alwaysOnTop: mainWindow.isAlwaysOnTop(),
      autostartEnabled,
    });
  });
}

async function buildTrayMenu() {
  const isVisible = !!mainWindow && mainWindow.isVisible();
  const alwaysOnTop = !!mainWindow && mainWindow.isAlwaysOnTop();
  const autostartEnabled = await isAutostartEnabled();

  const template = [
    {
      label: isVisible ? "??" : "??",
      click: () => {
        if (!mainWindow) {
          return;
        }
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "????",
      type: "checkbox",
      checked: alwaysOnTop,
      click: (item) => {
        if (!mainWindow) {
          return;
        }
        mainWindow.setAlwaysOnTop(!!item.checked);
        broadcastRuntimeState();
        void buildTrayMenu();
      },
    },
    {
      label: "??????",
      type: "checkbox",
      checked: autostartEnabled,
      click: async (item) => {
        await setAutostartEnabled(!!item.checked);
        broadcastRuntimeState();
        await buildTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "??",
      click: () => app.quit(),
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WwX6j8AAAAASUVORK5CYII="
  );
  tray = new Tray(icon);
  tray.setToolTip(metaConfig.appName);
  tray.on("double-click", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  void buildTrayMenu();
}

function registerGlobalShortcut(shortcut) {
  globalShortcut.unregisterAll();
  const normalized = (shortcut || "").trim();
  if (!normalized) {
    return false;
  }

  try {
    return globalShortcut.register(normalized, () => {
      if (!mainWindow) {
        return;
      }
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
      void buildTrayMenu();
    });
  } catch {
    return false;
  }
}

function createWindow() {
  const applyMainWindowTitle = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setTitle(metaConfig.mainWindowTitle);
  };

  mainWindow = new BrowserWindow({
    width: metaConfig.mainWindowWidth,
    height: metaConfig.mainWindowHeight,
    minWidth: metaConfig.mainWindowMinWidth,
    minHeight: metaConfig.mainWindowMinHeight,
    resizable: true,
    title: metaConfig.mainWindowTitle,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.log(`[renderer] did-fail-load code=${code} desc=${desc} url=${url}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.log(`[renderer] render-process-gone reason=${details?.reason || "unknown"}`);
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer-console] level=${level} ${sourceId || ""}:${line} ${message}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    applyMainWindowTitle();
    // Keep renderer document.title aligned with window title from config.
    const safeTitle = JSON.stringify(String(metaConfig.mainWindowTitle || ""));
    mainWindow.webContents
      .executeJavaScript(`document.title = ${safeTitle};`, true)
      .catch(() => undefined);
  });

  // Keep native window title stable from config.json instead of renderer document.title.
  mainWindow.on("page-title-updated", (event) => {
    event.preventDefault();
    applyMainWindowTitle();
  });

  mainWindow.on("ready-to-show", applyMainWindowTitle);
  mainWindow.on("show", applyMainWindowTitle);
  mainWindow.on("focus", applyMainWindowTitle);
  mainWindow.on("show", () => void buildTrayMenu());
  mainWindow.on("hide", () => void buildTrayMenu());
  mainWindow.on("always-on-top-changed", () => {
    broadcastRuntimeState();
    void buildTrayMenu();
  });
}

function ensureSuggestionBubbleWindow() {
  if (suggestionBubbleWindow && !suggestionBubbleWindow.isDestroyed()) {
    return suggestionBubbleWindow;
  }
  const pos = resolveSuggestionBubblePosition();
  suggestionBubbleWindow = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: pos.width,
    height: pos.height,
    resizable: true,
    minimizable: false,
    maximizable: false,
    closable: true,
    title: metaConfig.suggestionBubbleTitle,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    hasShadow: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  suggestionBubbleWindow.loadFile(path.join(__dirname, "suggestion-bubble.html"));
  suggestionBubbleWindow.on("closed", () => {
    suggestionBubbleWindow = null;
  });
  suggestionBubbleWindow.hide();
  return suggestionBubbleWindow;
}

function updateSuggestionBubble(payload) {
  const suggestions = Array.isArray(payload?.suggestions)
    ? payload.suggestions.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!suggestions.length) {
    if (suggestionBubbleWindow && !suggestionBubbleWindow.isDestroyed()) {
      suggestionBubbleWindow.hide();
    }
    return false;
  }
  const win = ensureSuggestionBubbleWindow();
  const title = typeof payload?.title === "string" && payload.title.trim() ? payload.title.trim() : "最新会话";
  const data = { title, suggestions: suggestions.slice(0, 3) };
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", () => {
      if (!win.isDestroyed()) {
        win.webContents.send("suggestion-bubble:update", data);
      }
    });
  } else {
    win.webContents.send("suggestion-bubble:update", data);
  }
  win.showInactive();
  return true;
}

ipcMain.handle("settings:get", () => {
  return currentSettings;
});

ipcMain.handle("meta:get", () => {
  return { ...metaConfig };
});

ipcMain.handle("settings:save", async (_event, nextSettings) => {
  const merged = {
    wsUrl:
      typeof nextSettings?.wsUrl === "string" && nextSettings.wsUrl.trim()
        ? nextSettings.wsUrl
        : DEFAULT_SETTINGS.wsUrl,
    notifyOnNew:
      typeof nextSettings?.notifyOnNew === "boolean"
        ? nextSettings.notifyOnNew
        : DEFAULT_SETTINGS.notifyOnNew,
    focusOnNew:
      typeof nextSettings?.focusOnNew === "boolean"
        ? nextSettings.focusOnNew
        : DEFAULT_SETTINGS.focusOnNew,
    shortcut:
      typeof nextSettings?.shortcut === "string" && nextSettings.shortcut.trim()
        ? nextSettings.shortcut
        : DEFAULT_SETTINGS.shortcut,
    onebotHttpUrl:
      typeof nextSettings?.onebotHttpUrl === "string" && nextSettings.onebotHttpUrl.trim()
        ? nextSettings.onebotHttpUrl
        : DEFAULT_SETTINGS.onebotHttpUrl,
    onebotAccessToken:
      typeof nextSettings?.onebotAccessToken === "string"
        ? nextSettings.onebotAccessToken
        : DEFAULT_SETTINGS.onebotAccessToken,
    appMaxHistory:
      typeof nextSettings?.appMaxHistory === "number" && Number.isFinite(nextSettings.appMaxHistory)
        ? Math.max(5, Math.min(500, Math.floor(nextSettings.appMaxHistory)))
        : DEFAULT_SETTINGS.appMaxHistory,
    llmProvider:
      typeof nextSettings?.llmProvider === "string" && nextSettings.llmProvider.trim()
        ? nextSettings.llmProvider
        : DEFAULT_SETTINGS.llmProvider,
    llmApiBase:
      typeof nextSettings?.llmApiBase === "string" ? nextSettings.llmApiBase : DEFAULT_SETTINGS.llmApiBase,
    llmApiKey:
      typeof nextSettings?.llmApiKey === "string" ? nextSettings.llmApiKey : DEFAULT_SETTINGS.llmApiKey,
    llmModel:
      typeof nextSettings?.llmModel === "string" ? nextSettings.llmModel : DEFAULT_SETTINGS.llmModel,
    llmTimeoutSeconds:
      typeof nextSettings?.llmTimeoutSeconds === "number" && Number.isFinite(nextSettings.llmTimeoutSeconds)
        ? Math.max(5, Math.min(300, nextSettings.llmTimeoutSeconds))
        : DEFAULT_SETTINGS.llmTimeoutSeconds,
    promptSystem:
      typeof nextSettings?.promptSystem === "string" ? nextSettings.promptSystem : DEFAULT_SETTINGS.promptSystem,
    promptUserTemplate:
      typeof nextSettings?.promptUserTemplate === "string"
        ? nextSettings.promptUserTemplate
        : DEFAULT_SETTINGS.promptUserTemplate,
  };

  currentSettings = merged;
  writeSettings(currentSettings);
  registerGlobalShortcut(currentSettings.shortcut);
  await buildTrayMenu();
  return currentSettings;
});

function normalizeApiUrl(baseUrl, action) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  const cleanAction = String(action || "").trim().replace(/^\/+/, "");
  return `${trimmed}/${cleanAction}`;
}

function backendBaseFromWsUrl(wsUrl) {
  const raw = String(wsUrl || "").trim();
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
  } catch (_error) {
    // ignore invalid URL
  }
  return "";
}

function buildRuntimePayloadFromSettings(source) {
  const src = source || {};
  return {
    app_max_history:
      typeof src.appMaxHistory === "number" && Number.isFinite(src.appMaxHistory)
        ? Math.max(5, Math.min(500, Math.floor(src.appMaxHistory)))
        : currentSettings.appMaxHistory,
    llm_provider: typeof src.llmProvider === "string" ? src.llmProvider : currentSettings.llmProvider,
    llm_api_base: typeof src.llmApiBase === "string" ? src.llmApiBase : currentSettings.llmApiBase,
    llm_api_key: typeof src.llmApiKey === "string" ? src.llmApiKey : currentSettings.llmApiKey,
    llm_model: typeof src.llmModel === "string" ? src.llmModel : currentSettings.llmModel,
    llm_timeout_seconds:
      typeof src.llmTimeoutSeconds === "number" && Number.isFinite(src.llmTimeoutSeconds)
        ? Math.max(5, Math.min(300, src.llmTimeoutSeconds))
        : currentSettings.llmTimeoutSeconds,
    prompt_system: typeof src.promptSystem === "string" ? src.promptSystem : currentSettings.promptSystem,
    prompt_user_template:
      typeof src.promptUserTemplate === "string" ? src.promptUserTemplate : currentSettings.promptUserTemplate,
  };
}

async function testLLMConnectionViaBackend(candidateSettings) {
  const effectiveWsUrl =
    typeof candidateSettings?.wsUrl === "string" && candidateSettings.wsUrl.trim()
      ? candidateSettings.wsUrl
      : currentSettings.wsUrl;
  const backendBase = backendBaseFromWsUrl(effectiveWsUrl);
  if (!backendBase) {
    return { ok: false, message: "无法解析后端地址（wsUrl无效）" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(normalizeApiUrl(backendBase, "settings/runtime/test_llm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRuntimePayloadFromSettings(candidateSettings)),
      signal: controller.signal,
    });

    const text = await response.text().catch(() => "");
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.detail) {
          message = String(parsed.detail);
        } else if (text) {
          message = `${message} ${text.slice(0, 300)}`;
        }
      } catch {
        if (text) {
          message = `${message} ${text.slice(0, 300)}`;
        }
      }
      return { ok: false, message: `测试失败：${message}` };
    }

    try {
      const parsed = text ? JSON.parse(text) : {};
      const preview = typeof parsed?.preview === "string" ? parsed.preview : "";
      const msg = typeof parsed?.message === "string" ? parsed.message : "LLM连接成功";
      return { ok: true, message: preview ? `${msg}（返回：${preview}）` : msg };
    } catch {
      return { ok: true, message: "LLM连接成功" };
    }
  } catch (error) {
    if (error && typeof error === "object" && error.name === "AbortError") {
      return { ok: false, message: "测试失败：请求超时（25s）" };
    }
    return { ok: false, message: `测试失败：${String(error)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaBackendRelay({ sessionType, peerId, message, mode, filePath, faceId, imageBase64 }) {
  const backendBase = backendBaseFromWsUrl(currentSettings.wsUrl);
  if (!backendBase) {
    return { ok: false, message: "Backend relay unavailable (invalid wsUrl)" };
  }

  const rawMode = String(mode || "text").trim().toLowerCase();
  const normalizedFilePath = String(filePath || "").trim();
  const sendMode = rawMode === "text" && normalizedFilePath ? "file" : rawMode;
  let relayTimeoutMs = 22000;
  if (sendMode === "face") {
    relayTimeoutMs = 25000;
  } else if (sendMode === "image" || sendMode === "video" || sendMode === "file") {
    relayTimeoutMs = 32000;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), relayTimeoutMs);
  try {
    const response = await fetch(normalizeApiUrl(backendBase, "onebot/send_message"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_type: String(sessionType || "private"),
        peer_id: Number(peerId),
        message: String(message || ""),
        mode: sendMode,
        file_path: normalizedFilePath,
        face_id: Number(faceId),
        image_base64: String(imageBase64 || ""),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let detailMessage = "";
      try {
        const parsed = JSON.parse(text);
        const detail = parsed && typeof parsed === "object" ? parsed.detail : null;
        if (detail && typeof detail === "object") {
          const status = typeof detail.status === "string" ? detail.status : "";
          const retcode = typeof detail.retcode === "number" ? detail.retcode : null;
          const wording = typeof detail.wording === "string" ? detail.wording : "";
          const msg = typeof detail.message === "string" ? detail.message : "";
          detailMessage = [status, retcode !== null ? `retcode=${retcode}` : "", wording || msg]
            .filter(Boolean)
            .join(" | ");
        } else if (typeof detail === "string") {
          detailMessage = detail;
        }
      } catch {
        // ignore json parse error and fallback to plain text
      }
      return {
        ok: false,
        message: `relay HTTP ${response.status}${
          detailMessage ? `: ${detailMessage}` : text ? `: ${text.slice(0, 300)}` : ""
        }`,
      };
    }
    return { ok: true, message: "sent via backend relay" };
  } catch (error) {
    if (error && typeof error === "object" && error.name === "AbortError") {
      return { ok: false, message: `relay timeout (${sendMode}, ${Math.round(relayTimeoutMs / 1000)}s)` };
    }
    return { ok: false, message: `relay failed: ${String(error)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function sendOneBotMessage({ sessionType, peerId, message, mode, filePath, faceId, imageBase64 }) {
  const baseUrl = String(currentSettings.onebotHttpUrl || "").trim();
  const token = String(currentSettings.onebotAccessToken || "").trim();
  const rawMode = String(mode || "text").trim().toLowerCase();
  const normalizedFilePath = String(filePath || "").trim();
  const sendMode = rawMode === "text" && normalizedFilePath ? "file" : rawMode;
  const rawMessage = String(message || "").trim();
  let content = rawMessage;
  const numericPeerId = Number(peerId);

  if (sendMode === "image") {
    const fp = normalizedFilePath;
    const b64 = String(imageBase64 || "").trim();
    if (b64) {
      content = `[CQ:image,file=base64://${b64}]`;
    } else if (fp) {
      content = `[CQ:image,file=${pathToFileURL(fp).toString()}]`;
    } else {
      return { ok: false, message: "image source is empty" };
    }
  } else if (sendMode === "video") {
    const fp = normalizedFilePath;
    if (!fp) {
      return { ok: false, message: "video file path is empty" };
    }
    content = `[CQ:video,file=${pathToFileURL(fp).toString()}]`;
  } else if (sendMode === "face") {
    const numericFaceId = Number(faceId);
    if (!Number.isInteger(numericFaceId) || numericFaceId < 0) {
      return { ok: false, message: "invalid face id" };
    }
    content = `[CQ:face,id=${numericFaceId}]`;
  }

  if (sendMode === "text" && !content) {
    return { ok: false, message: "message is empty" };
  }
  if (!Number.isFinite(numericPeerId) || numericPeerId < 0) {
    return { ok: false, message: "invalid peer_id/group_id" };
  }

  // Non-text payloads are more reliable through backend relay, which sends
  // structured OneBot segments instead of CQ strings.
  if (sendMode !== "text") {
    return sendViaBackendRelay({
      sessionType,
      peerId: numericPeerId,
      // IMPORTANT: backend uses mode/filePath/faceId/imageBase64 to build media payload.
      // Pass raw text only, otherwise CQ media string may be interpreted as extra content.
      message: rawMessage,
      mode: sendMode,
      filePath,
      faceId,
      imageBase64,
    });
  }

  if (!baseUrl) {
    return sendViaBackendRelay({
      sessionType,
      peerId: numericPeerId,
      message: content,
      mode: sendMode,
      filePath,
      faceId,
      imageBase64,
    });
  }

  const isGroup = String(sessionType) === "group";
  const action = isGroup ? "send_group_msg" : "send_private_msg";
  const requestBody = isGroup
    ? { group_id: numericPeerId, message: content }
    : { user_id: numericPeerId, message: content };

  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(normalizeApiUrl(baseUrl, action), {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      return sendViaBackendRelay({
        sessionType,
        peerId: numericPeerId,
        message: content,
        mode: sendMode,
        filePath,
        faceId,
        imageBase64,
      });
    }

    const data = await response.json().catch(() => ({}));
    const status = typeof data?.status === "string" ? data.status : "";
    const retcode = typeof data?.retcode === "number" ? data.retcode : 0;
    if (status && status !== "ok") {
      return sendViaBackendRelay({
        sessionType,
        peerId: numericPeerId,
        message: content,
        mode: sendMode,
        filePath,
        faceId,
        imageBase64,
      });
    }
    return { ok: true, message: `sent via onebot http retcode=${retcode}` };
  } catch (_error) {
    return sendViaBackendRelay({
      sessionType,
      peerId: numericPeerId,
      message: content,
      mode: sendMode,
      filePath,
      faceId,
      imageBase64,
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildSendDedupeKey(payload) {
  const src = payload || {};
  const imageBase64 = String(src.imageBase64 || "");
  const imageHash = imageBase64 ? crypto.createHash("sha1").update(imageBase64).digest("hex") : "";
  const body = JSON.stringify({
    sessionType: String(src.sessionType || ""),
    peerId: Number(src.peerId),
    message: String(src.message || ""),
    mode: String(src.mode || "text"),
    filePath: String(src.filePath || ""),
    faceId: Number(src.faceId),
    imageHash,
  });
  return crypto.createHash("sha1").update(body).digest("hex");
}

ipcMain.handle("onebot:sendMessage", async (_event, payload) => {
  const safePayload = payload || {};
  const key = buildSendDedupeKey(safePayload);
  const now = Date.now();
  const recent = recentSendResults.get(key);
  if (recent && now - recent.ts <= 2500) {
    return { ...recent.result, deduped: true };
  }

  if (inflightSends.has(key)) {
    try {
      const merged = await inflightSends.get(key);
      return { ...merged, deduped: true };
    } catch (error) {
      return { ok: false, message: `coalesced send failed: ${String(error)}` };
    }
  }

  const task = (async () => {
    const result = await sendOneBotMessage(safePayload);
    if (result && result.ok) {
      recentSendResults.set(key, { ts: Date.now(), result });
    }
    return result;
  })();

  inflightSends.set(key, task);
  try {
    return await task;
  } finally {
    inflightSends.delete(key);
  }
});

ipcMain.handle("llm:testConnection", async (_event, candidateSettings) => {
  return testLLMConnectionViaBackend(candidateSettings || {});
});

ipcMain.handle("suggestion:bubble:update", (_event, payload) => {
  return updateSuggestionBubble(payload || {});
});

ipcMain.handle("suggestion:bubble:hide", () => {
  if (suggestionBubbleWindow && !suggestionBubbleWindow.isDestroyed()) {
    suggestionBubbleWindow.hide();
  }
  return true;
});

ipcMain.handle("suggestion:bubble:apply", (_event, text) => {
  const value = String(text || "").trim();
  if (!value) {
    return false;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("suggestion:apply", value);
  }
  return true;
});

ipcMain.handle("media:pickFile", async (_event, kind) => {
  const target = String(kind || "").toLowerCase();
  const filters =
    target === "video"
      ? [{ name: "Videos", extensions: ["mp4", "mov", "mkv", "webm", "avi"] }]
      : target === "file"
        ? []
        : [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }];

  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    ...(filters.length ? { filters } : {}),
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("media:saveClipboardTemp", async (_event, payload) => {
  try {
    const src = payload || {};
    const base64 = String(src.base64 || "").trim();
    const kind = String(src.kind || "").toLowerCase();
    const mimeType = String(src.mimeType || "").toLowerCase();
    const rawName = String(src.name || "").trim();
    if (!base64) {
      return null;
    }

    const extFromMime = (() => {
      if (mimeType.includes("mp4")) return ".mp4";
      if (mimeType.includes("quicktime")) return ".mov";
      if (mimeType.includes("webm")) return ".webm";
      if (mimeType.includes("x-matroska") || mimeType.includes("mkv")) return ".mkv";
      if (mimeType.includes("x-msvideo") || mimeType.includes("avi")) return ".avi";
      if (mimeType.includes("png")) return ".png";
      if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
      if (mimeType.includes("gif")) return ".gif";
      if (mimeType.includes("webp")) return ".webp";
      return "";
    })();

    const extFromName = (() => {
      const ext = path.extname(rawName || "").trim();
      return ext && ext.length <= 10 ? ext : "";
    })();

    const fallbackExt = kind === "video" ? ".mp4" : ".png";
    const ext = extFromMime || extFromName || fallbackExt;
    const dir = path.join(app.getPath("temp"), "reply-suggester-media");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `clip-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    return filePath;
  } catch {
    return null;
  }
});

ipcMain.handle("runtime:get", async () => {
  return {
    alwaysOnTop: !!mainWindow && mainWindow.isAlwaysOnTop(),
    autostartEnabled: await isAutostartEnabled(),
  };
});

ipcMain.handle("window:setAlwaysOnTop", async (_event, enabled) => {
  if (!mainWindow) {
    return false;
  }
  mainWindow.setAlwaysOnTop(!!enabled);
  broadcastRuntimeState();
  await buildTrayMenu();
  return mainWindow.isAlwaysOnTop();
});

ipcMain.handle("window:showAndFocus", () => {
  if (!mainWindow) {
    return false;
  }
  mainWindow.show();
  mainWindow.focus();
  void buildTrayMenu();
  return true;
});

ipcMain.handle("window:hide", () => {
  if (!mainWindow) {
    return false;
  }
  mainWindow.hide();
  void buildTrayMenu();
  return true;
});

ipcMain.handle("window:toggle", () => {
  if (!mainWindow) {
    return false;
  }
  const visible = mainWindow.isVisible();
  if (visible) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
  void buildTrayMenu();
  return !visible;
});

ipcMain.handle("autostart:set", async (_event, enabled) => {
  const value = await setAutostartEnabled(!!enabled);
  broadcastRuntimeState();
  await buildTrayMenu();
  return value;
});

ipcMain.handle("clipboard:writeText", (_event, value) => {
  clipboard.writeText(String(value || ""));
  return true;
});

ipcMain.handle("notify", (_event, title, body) => {
  try {
    if (Notification.isSupported()) {
      new Notification({ title: String(title), body: String(body || "") }).show();
      return true;
    }
  } catch {
    // no-op
  }
  return false;
});

app.whenReady().then(async () => {
  metaConfig = readMetaConfig();
  app.setName(metaConfig.appName);
  autoLauncher = new AutoLaunch({
    name: metaConfig.appName,
    path: process.execPath,
    isHidden: true,
  });

  currentSettings = readSettings();
  createWindow();
  createTray();
  registerGlobalShortcut(currentSettings.shortcut);
  broadcastRuntimeState();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // keep running in tray on non-macOS
  }
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  if (suggestionBubbleWindow && !suggestionBubbleWindow.isDestroyed()) {
    suggestionBubbleWindow.destroy();
  }
});





