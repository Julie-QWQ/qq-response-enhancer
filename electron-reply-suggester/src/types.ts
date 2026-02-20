export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";
export type Sentiment = "positive" | "neutral" | "negative" | "urgent";
export type SessionType = "private" | "group" | "unknown";
export type MessageSender = "self" | "peer" | "assistant" | "system";
export type MessageSegmentKind = "text" | "emoji" | "image" | "video" | "file" | "mention" | "reply";
export type OutboundMessageMode = "text" | "image" | "video" | "file" | "face";

export interface Suggestion {
  text: string;
  tone: string;
  intent: string;
  notes: string;
}

export interface ReplyPayload {
  peer_id: number;
  session_type: "private" | "group";
  sentiment: Sentiment;
  suggestions: Suggestion[];
}

export interface HistoryItem {
  id: string;
  receivedAt: number;
  payload: ReplyPayload;
}

export interface AppSettings {
  wsUrl: string;
  notifyOnNew: boolean;
  focusOnNew: boolean;
  shortcut: string;
  onebotHttpUrl: string;
  onebotAccessToken: string;
  appMaxHistory: number;
  llmProvider: string;
  llmApiBase: string;
  llmApiKey: string;
  llmModel: string;
  llmTimeoutSeconds: number;
  promptSystem: string;
  promptUserTemplate: string;
}

export interface RuntimeState {
  alwaysOnTop: boolean;
  autostartEnabled: boolean;
}

export interface ChatMessageSegment {
  kind: MessageSegmentKind;
  text?: string;
  url?: string;
  emojiId?: string;
  mentionId?: string;
  replyMessageId?: string;
}

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  senderName?: string;
  senderId?: number;
  timestamp: number;
  segments: ChatMessageSegment[];
  suggestions?: string[];
  suggestionSelectable?: boolean;
  suggestionBatchId?: string;
}

export interface ChatSession {
  id: string;
  peerId: number;
  title: string;
  type: SessionType;
  unread: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface SendMessageRequest {
  sessionType: SessionType;
  peerId: number;
  message?: string;
  mode?: OutboundMessageMode;
  filePath?: string;
  faceId?: number;
  imageBase64?: string;
}

export interface SendMessageResult {
  ok: boolean;
  message: string;
}

export interface LLMTestResult {
  ok: boolean;
  message: string;
}

export interface MetaConfig {
  appName: string;
  mainWindowTitle: string;
  mainWindowWidth: number;
  mainWindowHeight: number;
  mainWindowMinWidth: number;
  mainWindowMinHeight: number;
  suggestionBubbleTitle: string;
  suggestionBubbleWidth: number;
  suggestionBubbleHeight: number;
}
