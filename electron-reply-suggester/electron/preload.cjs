const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getMetaConfig: () => ipcRenderer.invoke("meta:get"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  getRuntimeState: () => ipcRenderer.invoke("runtime:get"),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("window:setAlwaysOnTop", enabled),
  showAndFocus: () => ipcRenderer.invoke("window:showAndFocus"),
  hideWindow: () => ipcRenderer.invoke("window:hide"),
  toggleWindow: () => ipcRenderer.invoke("window:toggle"),
  setAutostart: (enabled) => ipcRenderer.invoke("autostart:set", enabled),
  copyText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  sendMessage: (payload) => ipcRenderer.invoke("onebot:sendMessage", payload),
  testLLMConnection: (settings) => ipcRenderer.invoke("llm:testConnection", settings),
  updateSuggestionBubble: (payload) => ipcRenderer.invoke("suggestion:bubble:update", payload),
  hideSuggestionBubble: () => ipcRenderer.invoke("suggestion:bubble:hide"),
  applySuggestionFromBubble: (text) => ipcRenderer.invoke("suggestion:bubble:apply", text),
  pickMediaFile: (kind) => ipcRenderer.invoke("media:pickFile", kind),
  saveClipboardTemp: (payload) => ipcRenderer.invoke("media:saveClipboardTemp", payload),
  notify: (title, body) => ipcRenderer.invoke("notify", title, body),
  onRuntimeState: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("runtime-state", listener);
    return () => ipcRenderer.removeListener("runtime-state", listener);
  },
  onSuggestionApply: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("suggestion:apply", listener);
    return () => ipcRenderer.removeListener("suggestion:apply", listener);
  },
  onSuggestionBubbleUpdate: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("suggestion-bubble:update", listener);
    return () => ipcRenderer.removeListener("suggestion-bubble:update", listener);
  },
});
