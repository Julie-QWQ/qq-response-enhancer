import type { AppSettings, LLMTestResult, RuntimeState, SendMessageRequest, SendMessageResult } from "./types";

interface ElectronAPI {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  getRuntimeState: () => Promise<RuntimeState>;
  setAlwaysOnTop: (enabled: boolean) => Promise<boolean>;
  showAndFocus: () => Promise<boolean>;
  hideWindow: () => Promise<boolean>;
  toggleWindow: () => Promise<boolean>;
  setAutostart: (enabled: boolean) => Promise<boolean>;
  copyText: (text: string) => Promise<boolean>;
  sendMessage: (payload: SendMessageRequest) => Promise<SendMessageResult>;
  testLLMConnection: (settings: AppSettings) => Promise<LLMTestResult>;
  updateSuggestionBubble: (payload: { title?: string; suggestions: string[] }) => Promise<boolean>;
  hideSuggestionBubble: () => Promise<boolean>;
  applySuggestionFromBubble: (text: string) => Promise<boolean>;
  pickMediaFile: (kind: "image" | "video") => Promise<string | null>;
  saveClipboardTemp: (payload: { kind: "image" | "video"; base64: string; mimeType?: string; name?: string }) => Promise<string | null>;
  notify: (title: string, body: string) => Promise<boolean>;
  onRuntimeState: (handler: (state: RuntimeState) => void) => () => void;
  onSuggestionApply: (handler: (text: string) => void) => () => void;
  onSuggestionBubbleUpdate: (handler: (payload: { title?: string; suggestions: string[] }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
