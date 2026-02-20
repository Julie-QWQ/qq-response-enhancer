# Smart Reply Backend

QQ 智能回复后端，技术栈为 `FastAPI + OneBot + SQLite + 可配置 LLM`。

## 1. 作用

- 接收 NapCat 推送的 OneBot 事件（推荐 `反向 WebSocket`）
- 持久化消息历史并提供会话/历史查询
- 向 Electron 前端实时广播新消息
- 提供发消息、撤回、图片代理、异步视频发送
- 基于上下文调用 LLM 生成回复建议

## 2. 目录结构

```text
smart-reply/
  main.py
  run.py
  settings.py
  llm.py
  context.py
  models.py
  config.toml
  runtime_settings.json
  chat_history.db
  logs/smart-reply.log
```

- `config.toml`：基础启动配置（服务地址等）
- `runtime_settings.json`：运行时配置（由前端设置页写入）
- `chat_history.db`：聊天历史数据库
- `logs/smart-reply.log`：后端日志（含 LLM 调用日志）

## 3. 安装与启动

```bash
cd smart-reply
uv sync
uv run python run.py
```

`config.toml` 中常用项：

- `app.title`
- `server.host`（默认 `127.0.0.1`）
- `server.port`（默认 `8000`）
- `server.reload`（开发调试可开）

## 4. 与 NapCat / 前端连接

NapCat 配置：

- 反向 WS 地址：`ws://127.0.0.1:8000/onebot/event`

Electron 前端配置：

- WebSocket URL：`ws://127.0.0.1:8000/ws`
- OneBot HTTP URL：通常 `http://127.0.0.1:3000`
- OneBot Access Token：按 NapCat 配置填写（未启用可留空）

## 5. 主要接口

系统：

- `GET /health` 健康检查

设置：

- `GET /settings/runtime` 获取运行时配置
- `POST /settings/runtime` 更新运行时配置
- `POST /settings/runtime/test_llm` 测试 LLM 可用性

会话与历史：

- `GET /chat/sessions` 获取会话列表
- `GET /chat/history` 获取会话历史（支持分页）
- `POST /chat/import_onebot_history` 主动从 OneBot 拉历史并入库

建议生成：

- `POST /suggest/reply` 生成 1~3 条建议
- `POST /suggest/reply_one` 生成 1 条建议（前端 slot 模式）

OneBot 相关：

- `POST /onebot/event` HTTP 事件入口（兼容）
- `WS /onebot/event` 反向 OneBot 入口（推荐）
- `WS /ws` 推送给前端
- `POST /onebot/send_message` 发送消息
- `POST /onebot/recall_message` 撤回消息
- `POST /onebot/send_message_async` 异步发送（视频等耗时任务）
- `GET /onebot/send_task_status` 查询异步任务状态/进度
- `GET /onebot/image_proxy` 图片代理

## 6. 运行时配置字段（`runtime_settings.json`）

- `app_max_history`
- `llm_provider`
- `llm_api_base`
- `llm_api_key`
- `llm_model`
- `llm_timeout_seconds`
- `prompt_system`
- `prompt_user_template`

提示：建议只通过前端设置页维护该文件。

## 7. 日志与排障

日志文件：`smart-reply/logs/smart-reply.log`

- 每天滚动，保留 14 天
- 记录服务关键流程、异常、LLM 调用前 prompt

常见错误：

- `403 Forbidden`（OneBot WS）：
  - 通常是 NapCat 连接地址或鉴权不匹配
  - 核对反向 WS 地址是否为 `ws://<backend>/onebot/event`
- `502/504`（发送消息）：
  - 通常是 OneBot 侧超时/失败
  - 视频建议走 `send_message_async` + `send_task_status`
- `LLM不可用`：
  - 检查 `api_base`、`api_key`、`model`、超时配置
  - 可先用 `/settings/runtime/test_llm` 诊断

## 8. 隐私与安全

- 日志中的 prompt 可能包含聊天内容，请在生产环境谨慎保存/分发日志
- `runtime_settings.json` 含密钥字段，建议加入 `.gitignore`
