# Reply Suggester Desktop

Electron + React + TypeScript 桌面端。

## 1. 功能

- 会话列表与聊天区（群聊/私聊）
- 历史消息加载与手动刷新（可重建当前会话气泡）
- 发送文本、图片、视频、QQ 表情
- 富文本渲染：`reply`、`@`、图片、视频、头像
- 建议生成：点击“生成建议”后显示 3 个占位气泡并逐条回填
- 建议气泡整块可点击发送
- 右键菜单：
  - 右键消息气泡：回复；自己的消息支持撤回
  - 右键头像：@ 对方
- 视频异步发送与进度展示
- 深浅色主题切换
- 托盘、置顶、开机自启、全局快捷键

## 2. 安装与启动

```bash
cd electron-reply-suggester
npm install
npm run dev
```

生产模式：

```bash
npm run start
```

打包：

```bash
npm run dist
```

## 3. 设置项

网络设置：

- WebSocket URL（后端 `/ws`）
- OneBot HTTP URL
- OneBot Access Token

模型设置：

- LLM Provider
- API Base
- API Key
- Model
- Timeout
- 测试连接按钮（调用后端 `/settings/runtime/test_llm`）

Prompt 设置：

- 系统提示词
- 用户提示词模板（支持变量：`{session_type}` `{history_text}` `{target_message}`）

## 4. 输入规则

- 表情：`[/微笑]` -> `CQ:face`
- @：`[@123456]`（或右键头像）
- 回复：`[回复:消息ID]`（或右键消息）
- 粘贴：聊天框支持粘贴图片/视频

## 5. 关键交互说明

- 点击“生成建议”后，先出现 3 条“正在生成中...”占位
- 建议返回后替换占位文本；点击建议会立即发送并移除该批建议气泡
- 若当前在阅读旧消息，新消息不会强制把滚动条拉到底
- 点击刷新会清空当前会话气泡并从后端历史重建

## 6. 常见问题

- `window.electronAPI.xxx is not a function`：仅热更新了前端，未重启 Electron 主进程
- 图片显示失败：检查后端 `GET /onebot/image_proxy`
- 视频发送超时：请使用异步发送路径（前端已接入）
- 建议生成失败：查看后端 `smart-reply/logs/smart-reply.log` 中 LLM 请求/响应日志

## 7. 开发提示

- 主进程：`electron-reply-suggester/electron/main.cjs`
- 预加载：`electron-reply-suggester/electron/preload.cjs`
- 前端主页面：`electron-reply-suggester/src/App.tsx`

## 8. Electron 元配置

项目根目录提供 `config.json`（`electron-reply-suggester/config.json`），用于配置 Electron 元参数。

可配置字段：

- `appName`：应用名（托盘提示、自启动注册名）
- `mainWindowTitle`：主窗口标题
- `mainWindowWidth` / `mainWindowHeight`：主窗口默认尺寸
- `mainWindowMinWidth` / `mainWindowMinHeight`：主窗口最小尺寸
- `suggestionBubbleTitle`：建议气泡窗口标题
- `suggestionBubbleWidth` / `suggestionBubbleHeight`：建议气泡窗口尺寸

修改后需要重启 Electron 主进程生效。
