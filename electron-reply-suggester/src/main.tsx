import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

if (!(window as any).electronAPI) {
  const noopUnsub = () => () => undefined;
  (window as any).electronAPI = {
    getMetaConfig: async () => ({
      appName: "Reply Suggester",
      mainWindowTitle: "Reply Suggester",
      mainWindowWidth: 1080,
      mainWindowHeight: 760,
      mainWindowMinWidth: 860,
      mainWindowMinHeight: 620,
      suggestionBubbleTitle: "回复建议",
      suggestionBubbleWidth: 320,
      suggestionBubbleHeight: 420,
    }),
    getSettings: async () => ({
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
    }),
    saveSettings: async (settings: unknown) => settings,
    getRuntimeState: async () => ({ alwaysOnTop: false, autostartEnabled: false }),
    setAlwaysOnTop: async () => false,
    showAndFocus: async () => true,
    hideWindow: async () => true,
    toggleWindow: async () => true,
    setAutostart: async () => false,
    copyText: async () => true,
    sendMessage: async () => ({ ok: false, message: "electronAPI 未注入（preload异常）" }),
    testLLMConnection: async () => ({ ok: false, message: "electronAPI 未注入（preload异常）" }),
    updateSuggestionBubble: async () => false,
    hideSuggestionBubble: async () => false,
    applySuggestionFromBubble: async () => false,
    pickMediaFile: async () => null,
    saveClipboardTemp: async () => null,
    notify: async () => false,
    onRuntimeState: noopUnsub,
    onSuggestionApply: noopUnsub,
    onSuggestionBubbleUpdate: noopUnsub,
  };
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
