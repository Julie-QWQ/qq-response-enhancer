from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import mimetypes
import sqlite3
import time
from collections import deque
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response
from pydantic import ValidationError

from context import ContextStore
from llm import LLMClient
from models import EventResponse, IncomingMessage, OneBotEvent
from settings import LLMSettings, load_settings

settings = load_settings()
app = FastAPI(title=settings.app_title)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_runtime_settings_path = Path("runtime_settings.json")
DEFAULT_APP_MAX_HISTORY = 30
DEFAULT_LLM_API_BASE = ""
DEFAULT_LLM_API_KEY = ""
DEFAULT_LLM_MODEL = ""
DEFAULT_LLM_TIMEOUT_SECONDS = 30.0


def _sanitize_runtime_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    max_history_raw = src.get("app_max_history")
    if isinstance(max_history_raw, int):
        app_max_history = max_history_raw
    elif isinstance(max_history_raw, float):
        app_max_history = int(max_history_raw)
    else:
        app_max_history = DEFAULT_APP_MAX_HISTORY
    app_max_history = max(5, min(500, app_max_history))

    timeout_raw = src.get("llm_timeout_seconds")
    if isinstance(timeout_raw, (int, float)):
        timeout = float(timeout_raw)
    else:
        timeout = DEFAULT_LLM_TIMEOUT_SECONDS
    timeout = max(5.0, min(timeout, 300.0))

    def _txt(key: str, default: str = "") -> str:
        value = src.get(key)
        return str(value).strip() if isinstance(value, str) else default

    return {
        "app_max_history": app_max_history,
        "llm_provider": _txt("llm_provider", "custom"),
        "llm_api_base": _txt("llm_api_base", DEFAULT_LLM_API_BASE),
        "llm_api_key": _txt("llm_api_key", DEFAULT_LLM_API_KEY),
        "llm_model": _txt("llm_model", DEFAULT_LLM_MODEL),
        "llm_timeout_seconds": timeout,
        "prompt_system": _txt("prompt_system"),
        "prompt_user_template": _txt("prompt_user_template"),
    }


def _load_runtime_settings() -> dict[str, Any]:
    if not _runtime_settings_path.exists():
        data = _sanitize_runtime_settings({})
        _runtime_settings_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return data
    try:
        raw = json.loads(_runtime_settings_path.read_text(encoding="utf-8"))
    except Exception:
        raw = {}
    data = _sanitize_runtime_settings(raw if isinstance(raw, dict) else {})
    _runtime_settings_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return data


def _save_runtime_settings(data: dict[str, Any]) -> None:
    _runtime_settings_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _build_system_prompt(runtime_cfg: dict[str, Any]) -> str:
    return str(runtime_cfg.get("prompt_system") or "").strip()


def _render_user_prompt(
    runtime_cfg: dict[str, Any],
    *,
    session_type: str,
    context_messages: list[IncomingMessage],
    latest_message: str,
) -> str:
    template = str(runtime_cfg.get("prompt_user_template") or "")
    history_lines: list[str] = []
    for msg in context_messages:
        role_label = "user" if msg.role == "user" else "assistant"
        history_lines.append(f"{role_label}: {msg.text}")
    history_text = "\n".join(history_lines)
    if template.strip():
        try:
            return template.format(
                session_type=session_type,
                history_text=history_text,
                latest_message=latest_message,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"用户提示词模板格式无效: {exc}") from exc
    return latest_message


def _build_llm_client(runtime_cfg: dict[str, Any]) -> LLMClient:
    llm_cfg = LLMSettings(
        api_base=str(runtime_cfg.get("llm_api_base") or DEFAULT_LLM_API_BASE).strip(),
        api_key=str(runtime_cfg.get("llm_api_key") or DEFAULT_LLM_API_KEY).strip(),
        model=str(runtime_cfg.get("llm_model") or DEFAULT_LLM_MODEL).strip(),
        timeout_seconds=float(runtime_cfg.get("llm_timeout_seconds") or DEFAULT_LLM_TIMEOUT_SECONDS),
    )
    return LLMClient(llm_cfg)


runtime_settings = _load_runtime_settings()


def _setup_file_logger() -> logging.Logger:
    logger = logging.getLogger("smart_reply")
    if logger.handlers:
        return logger

    log_dir = Path("logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "smart-reply.log"

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = TimedRotatingFileHandler(
        filename=str(log_file),
        when="midnight",
        interval=1,
        backupCount=14,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(formatter)

    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.INFO)
    stream_handler.setFormatter(formatter)

    logger.setLevel(logging.INFO)
    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)
    logger.propagate = False
    return logger


logger = _setup_file_logger()


def _current_max_history() -> int:
    raw = runtime_settings.get("app_max_history")
    if isinstance(raw, int):
        return max(5, min(500, raw))
    if isinstance(raw, float):
        return max(5, min(500, int(raw)))
    return DEFAULT_APP_MAX_HISTORY


def _format_exception_detail(exc: Exception) -> str:
    text = str(exc).strip()
    if text:
        return text
    return f"{exc.__class__.__name__}（无详细信息）"


context_store = ContextStore(max_history=_current_max_history())


class WebSocketManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        dead_clients: list[WebSocket] = []
        for ws in self._clients:
            try:
                await ws.send_json(payload)
            except Exception:
                dead_clients.append(ws)
        for ws in dead_clients:
            self.disconnect(ws)


ws_manager = WebSocketManager()
onebot_upstreams: set[WebSocket] = set()
pending_actions: dict[str, asyncio.Future[dict[str, Any]]] = {}
_recent_event_keys: deque[str] = deque(maxlen=1024)
_recent_event_key_set: set[str] = set()
_inflight_send_actions: dict[str, asyncio.Future[dict[str, Any]]] = {}
_recent_send_success: dict[str, tuple[float, dict[str, Any]]] = {}
_send_tasks: dict[str, dict[str, Any]] = {}
_chat_sessions: dict[str, dict[str, Any]] = {}
_chat_messages: dict[str, deque[dict[str, Any]]] = {}
_max_chat_messages_per_session = 400
_chat_db_path = Path("chat_history.db")
_history_import_lock = asyncio.Lock()


def init_chat_db() -> None:
    with sqlite3.connect(_chat_db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_type TEXT NOT NULL,
                peer_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                dedupe_key TEXT
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_session_time ON chat_messages(session_type, peer_id, updated_at)"
        )
        cols = {row[1] for row in conn.execute("PRAGMA table_info(chat_messages)").fetchall()}
        if "dedupe_key" not in cols:
            conn.execute("ALTER TABLE chat_messages ADD COLUMN dedupe_key TEXT")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_dedupe_key ON chat_messages(dedupe_key)")
        conn.commit()


def _db_insert_chat_event(session_meta: dict[str, Any], raw_payload: dict[str, Any]) -> None:
    payload_json = json.dumps(raw_payload, ensure_ascii=False, separators=(",", ":"))
    message_id = str(raw_payload.get("message_id") or "").strip()
    if message_id:
        dedupe_key = f"{session_meta.get('session_type')}:{session_meta.get('peer_id')}:{message_id}"
    else:
        dedupe_key = hashlib.sha1(
            f"{session_meta.get('session_type')}|{session_meta.get('peer_id')}|{payload_json}".encode("utf-8")
        ).hexdigest()
    with sqlite3.connect(_chat_db_path) as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO chat_messages (session_type, peer_id, title, updated_at, payload_json, dedupe_key)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(session_meta.get("session_type") or "private"),
                int(session_meta.get("peer_id") or 0),
                str(session_meta.get("title") or ""),
                int(session_meta.get("updated_at") or int(time.time())),
                payload_json,
                dedupe_key,
            ),
        )
        conn.commit()


def _db_list_sessions() -> list[dict[str, Any]]:
    with sqlite3.connect(_chat_db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT session_type, peer_id, title, updated_at
            FROM (
                SELECT
                    session_type,
                    peer_id,
                    title,
                    updated_at,
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY session_type, peer_id
                        ORDER BY updated_at DESC, id DESC
                    ) AS rn
                FROM chat_messages
            ) t
            WHERE rn = 1
            ORDER BY updated_at DESC, id DESC
            """
        ).fetchall()
    return [
        {
            "id": f"{row['session_type']}-{row['peer_id']}",
            "session_type": row["session_type"],
            "peer_id": row["peer_id"],
            "title": row["title"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def _db_get_history(session_type: str, peer_id: int, limit: int, offset: int = 0) -> list[dict[str, Any]]:
    with sqlite3.connect(_chat_db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT payload_json
            FROM chat_messages
            WHERE session_type = ? AND peer_id = ?
            ORDER BY updated_at DESC, id DESC
            LIMIT ?
            OFFSET ?
            """,
            (session_type, peer_id, limit, max(0, offset)),
        ).fetchall()

    parsed: list[dict[str, Any]] = []
    for row in reversed(rows):
        text = str(row["payload_json"] or "")
        if not text:
            continue
        try:
            raw = json.loads(text)
        except Exception:
            continue
        if isinstance(raw, dict):
            parsed.append(raw)
    return parsed


init_chat_db()


async def _process_onebot_event_background(event: OneBotEvent) -> None:
    try:
        await process_onebot_event(event)
    except Exception:
        # Keep background processing failures from breaking upstream WS loop.
        pass


def extract_text(event: OneBotEvent) -> str:
    if event.raw_message:
        return event.raw_message

    msg = event.message
    if isinstance(msg, str):
        return msg

    if isinstance(msg, list):
        parts: list[str] = []
        for segment in msg:
            if not isinstance(segment, dict):
                continue
            data = segment.get("data")
            if isinstance(data, dict):
                text = data.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts).strip()

    return ""


def is_duplicate_event(event: OneBotEvent) -> bool:
    # Deduplicate only when we have a stable message identifier.
    # This avoids dropping valid messages that share similar payloads.
    raw = event.model_dump(mode="json")
    if event.post_type != "message":
        return False

    message_id = raw.get("message_id")
    if message_id is None:
        return False

    key = json.dumps(
        {
            "post_type": raw.get("post_type"),
            "message_type": raw.get("message_type"),
            "user_id": raw.get("user_id"),
            "group_id": raw.get("group_id"),
            "self_id": raw.get("self_id"),
            "message_id": str(message_id),
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    if key in _recent_event_key_set:
        return True

    if len(_recent_event_keys) == _recent_event_keys.maxlen:
        oldest = _recent_event_keys.popleft()
        _recent_event_key_set.discard(oldest)

    _recent_event_keys.append(key)
    _recent_event_key_set.add(key)
    return False


def is_onebot_action_response(data: dict[str, Any]) -> bool:
    return "echo" in data and ("status" in data or "retcode" in data)


async def send_onebot_action(action: str, params: dict[str, Any], timeout_seconds: float | None = 10.0) -> dict[str, Any]:
    if not onebot_upstreams:
        raise RuntimeError("没有可用的反向 OneBot WebSocket 上游连接")

    last_error: Exception | None = None
    upstreams = list(onebot_upstreams)
    for ws in upstreams:
        echo = uuid4().hex
        fut: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        pending_actions[echo] = fut
        payload = {"action": action, "params": params, "echo": echo}
        try:
            await ws.send_json(payload)
        except Exception as exc:
            last_error = exc
            onebot_upstreams.discard(ws)
            continue

        try:
            # Important: after an action is successfully sent once, do not resend it to
            # another upstream on timeout; otherwise the same message may be delivered twice.
            if timeout_seconds is None:
                return await fut
            return await asyncio.wait_for(fut, timeout=timeout_seconds)
        except asyncio.TimeoutError:
            raise
        except Exception as exc:
            last_error = exc
            onebot_upstreams.discard(ws)
            continue
        finally:
            pending_actions.pop(echo, None)

    if isinstance(last_error, asyncio.TimeoutError):
        raise last_error
    if last_error is not None:
        raise RuntimeError(f"所有上游连接均失败: {last_error}") from last_error
    raise RuntimeError("所有上游连接均失败")


def normalize_onebot_file_ref(source: str) -> str:
    value = source.strip()
    if not value:
        return value
    if value.startswith(("http://", "https://", "base64://", "file://")):
        return value
    try:
        candidate = Path(value)
        if candidate.is_absolute() or candidate.exists():
            return candidate.resolve().as_uri()
    except Exception:
        pass
    return value


def _create_send_task(*, mode: str, session_type: str, peer_id: int, file_path: str, message: str) -> dict[str, Any]:
    task_id = f"send-{uuid4().hex}"
    now = time.time()
    item = {
        "task_id": task_id,
        "mode": mode,
        "session_type": session_type,
        "peer_id": peer_id,
        "file_path": file_path,
        "message": message,
        "status": "queued",
        "progress": 3,
        "created_at": now,
        "started_at": None,
        "updated_at": now,
        "result": None,
        "error": "",
    }
    _send_tasks[task_id] = item
    return item


def _calc_task_progress(item: dict[str, Any]) -> int:
    status = str(item.get("status") or "")
    if status == "queued":
        return 3
    if status == "sending":
        started = item.get("started_at")
        if not isinstance(started, (int, float)):
            return int(item.get("progress") or 10)
        elapsed = max(0.0, time.time() - float(started))
        # Heuristic curve: approach 95 while waiting for OneBot completion.
        estimated = min(95, int(10 + elapsed * 6))
        return max(int(item.get("progress") or 10), estimated)
    return 100


async def _run_video_send_task(
    *,
    task_id: str,
    session_type: str,
    peer_id: int,
    message: str,
    file_path: str,
) -> None:
    item = _send_tasks.get(task_id)
    if item is None:
        return
    item["status"] = "sending"
    item["started_at"] = time.time()
    item["updated_at"] = time.time()
    item["progress"] = 10

    source = file_path or message
    normalized = normalize_onebot_file_ref(source)
    head = f"[CQ:video,file={normalized}]"
    outbound_message = f"{head}{message}" if (message and source != message) else head
    if session_type == "group":
        action = "send_group_msg"
        params = {"group_id": peer_id, "message": outbound_message}
    else:
        action = "send_private_msg"
        params = {"user_id": peer_id, "message": outbound_message}

    try:
        result = await send_onebot_action(action=action, params=params, timeout_seconds=None)
        status = result.get("status")
        retcode = result.get("retcode")
        message_text = str(result.get("message") or "").strip()
        wording = str(result.get("wording") or "").strip()
        failed = (isinstance(status, str) and status != "ok") or (isinstance(retcode, int) and retcode != 0)
        if failed:
            item["status"] = "failed"
            item["error"] = f"发送失败: status={status} retcode={retcode} {wording or message_text}".strip()
            item["progress"] = 100
            item["updated_at"] = time.time()
            return

        item["status"] = "success"
        item["result"] = result
        item["progress"] = 100
        item["updated_at"] = time.time()
        _record_chat_event(
            _build_outbound_history_event(
                session_type=session_type,
                peer_id=peer_id,
                message=message,
                mode="video",
                file_path=file_path,
                image_base64="",
                face_id_raw=None,
            )
        )
    except Exception as exc:
        item["status"] = "failed"
        item["error"] = _format_exception_detail(exc)
        item["progress"] = 100
        item["updated_at"] = time.time()


def build_send_dedupe_key(
    *,
    session_type: str,
    mode: str,
    peer_id: int,
    message: str,
    file_path: str,
    image_base64: str,
    face_id_raw: Any,
) -> str:
    b64_hash = hashlib.sha1(image_base64.encode("utf-8")).hexdigest() if image_base64 else ""
    body = json.dumps(
        {
            "session_type": session_type,
            "mode": mode,
            "peer_id": peer_id,
            "message": message,
            "file_path": file_path,
            "image_b64_sha1": b64_hash,
            "face_id": str(face_id_raw) if face_id_raw is not None else "",
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha1(body.encode("utf-8")).hexdigest()


def _extract_session_info_from_raw_event(raw: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    if str(raw.get("post_type") or "") != "message":
        return None

    message_type = str(raw.get("message_type") or "").lower()
    if message_type not in {"private", "group"}:
        return None

    peer_raw = raw.get("group_id") if message_type == "group" else raw.get("user_id")
    try:
        peer_id = int(peer_raw)
    except Exception:
        return None

    sender = raw.get("sender")
    sender_obj = sender if isinstance(sender, dict) else {}
    title = (
        str(sender_obj.get("card") or "").strip()
        or str(sender_obj.get("nickname") or "").strip()
        or f"会话 {peer_id}"
    )

    ts_raw = raw.get("time")
    try:
        updated_at = int(ts_raw)
    except Exception:
        updated_at = int(time.time())

    session_id = f"{message_type}-{peer_id}"
    return session_id, {
        "id": session_id,
        "session_type": message_type,
        "peer_id": peer_id,
        "title": title,
        "updated_at": updated_at,
    }


def _record_chat_event(raw: dict[str, Any]) -> None:
    info = _extract_session_info_from_raw_event(raw)
    if info is None:
        return
    session_id, session_meta = info
    _db_insert_chat_event(session_meta, raw)

    # Keep in-memory cache for quick warm-path reads in current process.
    previous = _chat_sessions.get(session_id)
    if previous:
        previous.update(session_meta)
    else:
        _chat_sessions[session_id] = session_meta

    bucket = _chat_messages.get(session_id)
    if bucket is None:
        bucket = deque(maxlen=_max_chat_messages_per_session)
        _chat_messages[session_id] = bucket
    bucket.append(raw)


def _build_outbound_history_event(
    *,
    session_type: str,
    peer_id: int,
    message: str,
    mode: str,
    file_path: str,
    image_base64: str,
    face_id_raw: Any,
) -> dict[str, Any]:
    ts = int(time.time())
    sender = {"user_id": 0, "nickname": "我"}
    title = f"会话 {peer_id}"
    raw_message = message
    message_payload: Any = message

    if mode == "image":
        if image_base64:
            file_ref = f"base64://{image_base64}"
        else:
            file_ref = normalize_onebot_file_ref(file_path or message)
        segs: list[dict[str, Any]] = [{"type": "image", "data": {"file": file_ref}}]
        if message and not message.startswith("[CQ:image,"):
            segs.append({"type": "text", "data": {"text": message}})
        message_payload = segs
        raw_message = message if message and not message.startswith("[CQ:image,") else "[图片]"
    elif mode == "video":
        file_ref = normalize_onebot_file_ref(file_path or message)
        message_payload = [{"type": "video", "data": {"file": file_ref}}]
        raw_message = "[视频]"
    elif mode == "face":
        try:
            face_id = int(face_id_raw)
        except Exception:
            face_id = -1
        if face_id >= 0:
            message_payload = [{"type": "face", "data": {"id": face_id}}]
            raw_message = f"[/表情{face_id}]"

    event: dict[str, Any] = {
        "post_type": "message",
        "message_type": session_type,
        "time": ts,
        "self_id": 0,
        "sender": sender,
        "message": message_payload,
        "raw_message": raw_message,
    }
    if session_type == "group":
        event["group_id"] = peer_id
        event["user_id"] = 0
        title = f"群 {peer_id}"
    else:
        event["user_id"] = peer_id
    event["sender"]["nickname"] = title
    return event


def _normalize_imported_message(
    raw_message: dict[str, Any],
    *,
    session_type: str,
    peer_id: int,
    title: str,
    fallback_time: int,
) -> dict[str, Any]:
    event = dict(raw_message)
    event["post_type"] = "message"
    event["message_type"] = session_type
    if session_type == "group":
        event["group_id"] = int(peer_id)
        event["user_id"] = int(event.get("user_id") or 0)
    else:
        event["user_id"] = int(peer_id)
    if "time" not in event or not isinstance(event.get("time"), (int, float, str)):
        event["time"] = int(fallback_time)
    sender = event.get("sender")
    sender_obj = sender if isinstance(sender, dict) else {}
    if not sender_obj.get("nickname") and title:
        sender_obj["nickname"] = title
    event["sender"] = sender_obj
    return event


def _extract_text_from_raw_event(raw: dict[str, Any]) -> str:
    raw_message = raw.get("raw_message")
    if isinstance(raw_message, str) and raw_message.strip():
        return raw_message.strip()

    message = raw.get("message")
    if isinstance(message, str):
        return message.strip()
    if isinstance(message, list):
        parts: list[str] = []
        for segment in message:
            if not isinstance(segment, dict):
                continue
            data = segment.get("data")
            if isinstance(data, dict):
                text = data.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
        return " ".join(parts).strip()
    return ""


def _build_context_messages_from_history(
    *,
    session_type: str,
    history_rows: list[dict[str, Any]],
    max_items: int,
) -> list[IncomingMessage]:
    context: list[IncomingMessage] = []
    for row in history_rows[-max_items:]:
        text = _extract_text_from_raw_event(row)
        if not text:
            continue
        sender = row.get("sender")
        sender_obj = sender if isinstance(sender, dict) else {}
        sender_id_raw = sender_obj.get("user_id", row.get("user_id"))
        self_id_raw = row.get("self_id")
        try:
            sender_id = int(sender_id_raw) if sender_id_raw is not None else -1
        except Exception:
            sender_id = -1
        try:
            self_id = int(self_id_raw) if self_id_raw is not None else -2
        except Exception:
            self_id = -2
        is_self = sender_id >= 0 and self_id >= 0 and sender_id == self_id
        if is_self:
            context.append(IncomingMessage(role="assistant", text=text))
        else:
            if session_type == "group":
                sender_name = (
                    str(sender_obj.get("card") or "").strip()
                    or str(sender_obj.get("nickname") or "").strip()
                    or (f"用户{sender_id}" if sender_id >= 0 else "用户")
                )
                context.append(IncomingMessage(role="user", text=f"{sender_name}: {text}"))
            else:
                context.append(IncomingMessage(role="user", text=text))
    return context


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/settings/runtime")
async def get_runtime_settings() -> dict[str, Any]:
    return {"settings": runtime_settings}


@app.post("/settings/runtime")
async def set_runtime_settings(payload: dict[str, Any]) -> dict[str, Any]:
    global runtime_settings
    runtime_settings = _sanitize_runtime_settings(payload)
    context_store.set_max_history(_current_max_history())
    _save_runtime_settings(runtime_settings)
    return {"ok": True, "settings": runtime_settings}


@app.post("/settings/runtime/test_llm")
async def test_runtime_llm(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    effective = _sanitize_runtime_settings(payload if isinstance(payload, dict) else runtime_settings)
    client = _build_llm_client(effective)
    try:
        preview = await client.test_connection()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"LLM不可用: {_format_exception_detail(exc)}") from exc
    return {"ok": True, "message": "LLM连接成功", "preview": preview}


@app.get("/chat/sessions")
async def chat_sessions() -> dict[str, Any]:
    rows = _db_list_sessions()
    return {"sessions": rows}


@app.get("/chat/history")
async def chat_history(
    session_type: str = Query(..., pattern="^(private|group)$"),
    peer_id: int = Query(..., ge=0),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    session_id = f"{session_type}-{peer_id}"
    rows = _db_get_history(session_type=session_type, peer_id=peer_id, limit=limit, offset=offset)
    return {"session_id": session_id, "messages": rows, "offset": offset, "limit": limit, "count": len(rows)}


@app.post("/chat/import_onebot_history")
async def import_onebot_history(
    recent_count: int = Query(20, ge=1, le=100),
    per_session_count: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    if not onebot_upstreams:
        raise HTTPException(status_code=503, detail="没有可用的反向 OneBot WebSocket 上游连接")

    async with _history_import_lock:
        try:
            recent_result = await send_onebot_action(
                action="get_recent_contact",
                params={"count": int(recent_count)},
                timeout_seconds=20.0,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"获取最近联系人失败: {exc}") from exc

        recent_data = recent_result.get("data")
        contacts = recent_data if isinstance(recent_data, list) else []
        imported = 0
        sessions = 0
        skipped = 0
        errors: list[str] = []

        for item in contacts:
            if not isinstance(item, dict):
                skipped += 1
                continue
            try:
                chat_type = int(item.get("chatType") or 0)
                peer_uin = str(item.get("peerUin") or "").strip()
                if not peer_uin:
                    skipped += 1
                    continue
                peer_id = int(peer_uin)
            except Exception:
                skipped += 1
                continue

            session_type = "group" if chat_type == 2 else "private"
            title = (
                str(item.get("peerName") or "").strip()
                or str(item.get("remark") or "").strip()
                or f"会话 {peer_id}"
            )
            msg_time_raw = item.get("msgTime")
            try:
                fallback_time = int(msg_time_raw)
            except Exception:
                fallback_time = int(time.time())

            latest = item.get("lastestMsg")
            if isinstance(latest, dict):
                _record_chat_event(
                    _normalize_imported_message(
                        latest,
                        session_type=session_type,
                        peer_id=peer_id,
                        title=title,
                        fallback_time=fallback_time,
                    )
                )
                imported += 1

            action = "get_group_msg_history" if session_type == "group" else "get_friend_msg_history"
            params = {"group_id": str(peer_id), "count": int(per_session_count)} if session_type == "group" else {
                "user_id": str(peer_id),
                "count": int(per_session_count),
            }
            try:
                history_result = await send_onebot_action(action=action, params=params, timeout_seconds=25.0)
                data = history_result.get("data") if isinstance(history_result.get("data"), dict) else {}
                messages = data.get("messages") if isinstance(data.get("messages"), list) else []
                for msg in messages:
                    if not isinstance(msg, dict):
                        continue
                    _record_chat_event(
                        _normalize_imported_message(
                            msg,
                            session_type=session_type,
                            peer_id=peer_id,
                            title=title,
                            fallback_time=fallback_time,
                        )
                    )
                    imported += 1
                sessions += 1
            except Exception as exc:
                errors.append(f"{session_type}:{peer_id}:{exc}")
                continue

        return {
            "ok": True,
            "recent_contacts": len(contacts),
            "sessions_imported": sessions,
            "messages_imported": imported,
            "skipped": skipped,
            "errors": errors[:20],
        }


@app.post("/suggest/reply")
async def suggest_reply(payload: dict[str, Any]) -> dict[str, Any]:
    session_type = str(payload.get("session_type") or payload.get("sessionType") or "private").lower()
    if session_type not in {"private", "group"}:
        raise HTTPException(status_code=400, detail="会话类型无效")

    peer_id_raw = payload.get("peer_id", payload.get("peerId"))
    try:
        peer_id = int(peer_id_raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="会话对象ID无效") from exc

    latest_override = str(payload.get("latest_message") or payload.get("latestMessage") or "").strip()
    max_history = _current_max_history()
    history_rows = _db_get_history(session_type=session_type, peer_id=peer_id, limit=max(50, max_history))
    context_messages = _build_context_messages_from_history(
        session_type=session_type,
        history_rows=history_rows,
        max_items=max(10, max_history),
    )
    latest_message = latest_override
    if not latest_message:
        for row in reversed(history_rows):
            sender = row.get("sender")
            sender_obj = sender if isinstance(sender, dict) else {}
            text = _extract_text_from_raw_event(row)
            if not text:
                continue
            sender_id_raw = sender_obj.get("user_id", row.get("user_id"))
            self_id_raw = row.get("self_id")
            try:
                sender_id = int(sender_id_raw) if sender_id_raw is not None else -1
            except Exception:
                sender_id = -1
            try:
                self_id = int(self_id_raw) if self_id_raw is not None else -2
            except Exception:
                self_id = -2
            is_self = sender_id >= 0 and self_id >= 0 and sender_id == self_id
            if not is_self:
                if session_type == "group":
                    sender_name = (
                        str(sender_obj.get("card") or "").strip()
                        or str(sender_obj.get("nickname") or "").strip()
                        or (f"用户{sender_id}" if sender_id >= 0 else "用户")
                    )
                    latest_message = f"{sender_name}: {text}"
                else:
                    latest_message = text
                break

    if not latest_message:
        raise HTTPException(status_code=400, detail="缺少可用的消息上下文")

    client = _build_llm_client(runtime_settings)
    system_prompt = _build_system_prompt(runtime_settings)
    user_prompt = _render_user_prompt(
        runtime_settings,
        session_type=session_type,
        context_messages=context_messages,
        latest_message=latest_message,
    )
    logger.info(
        "[LLM Prompt] session=%s:%s system_prompt=%s user_prompt=%s",
        session_type,
        peer_id,
        system_prompt,
        user_prompt,
    )
    try:
        result = await client.generate(
            peer_id=peer_id,
            session_type=session_type,
            latest_message=latest_message,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"LLM不可用: {_format_exception_detail(exc)}") from exc

    return result.model_dump()


@app.post("/suggest/reply_one")
async def suggest_reply_one(payload: dict[str, Any]) -> dict[str, Any]:
    session_type = str(payload.get("session_type") or payload.get("sessionType") or "private").lower()
    if session_type not in {"private", "group"}:
        raise HTTPException(status_code=400, detail="会话类型无效")

    peer_id_raw = payload.get("peer_id", payload.get("peerId"))
    try:
        peer_id = int(peer_id_raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="会话对象ID无效") from exc

    slot_raw = payload.get("slot")
    try:
        slot = int(slot_raw) if slot_raw is not None else 0
    except Exception:
        slot = 0
    slot = max(0, min(2, slot))

    latest_override = str(payload.get("latest_message") or payload.get("latestMessage") or "").strip()
    max_history = _current_max_history()
    history_rows = _db_get_history(session_type=session_type, peer_id=peer_id, limit=max(50, max_history))
    context_messages = _build_context_messages_from_history(
        session_type=session_type,
        history_rows=history_rows,
        max_items=max(10, max_history),
    )
    latest_message = latest_override
    if not latest_message:
        for row in reversed(history_rows):
            sender = row.get("sender")
            sender_obj = sender if isinstance(sender, dict) else {}
            text = _extract_text_from_raw_event(row)
            if not text:
                continue
            sender_id_raw = sender_obj.get("user_id", row.get("user_id"))
            self_id_raw = row.get("self_id")
            try:
                sender_id = int(sender_id_raw) if sender_id_raw is not None else -1
            except Exception:
                sender_id = -1
            try:
                self_id = int(self_id_raw) if self_id_raw is not None else -2
            except Exception:
                self_id = -2
            is_self = sender_id >= 0 and self_id >= 0 and sender_id == self_id
            if not is_self:
                if session_type == "group":
                    sender_name = (
                        str(sender_obj.get("card") or "").strip()
                        or str(sender_obj.get("nickname") or "").strip()
                        or (f"用户{sender_id}" if sender_id >= 0 else "用户")
                    )
                    latest_message = f"{sender_name}: {text}"
                else:
                    latest_message = text
                break

    if not latest_message:
        raise HTTPException(status_code=400, detail="缺少可用的消息上下文")

    slot_hints = [
        "请输出 1 条简洁直接、可立即发送的回复，长度尽量控制在 20 字以内。",
        "请输出 1 条礼貌中性、信息完整的回复，长度尽量控制在 30 字以内。",
        "请输出 1 条带有明确下一步行动建议的回复，长度尽量控制在 35 字以内。",
    ]

    client = _build_llm_client(runtime_settings)
    system_prompt = _build_system_prompt(runtime_settings)
    user_prompt = _render_user_prompt(
        runtime_settings,
        session_type=session_type,
        context_messages=context_messages,
        latest_message=latest_message,
    )
    user_prompt = (
        f"{user_prompt}\n\n[本次生成要求]\n"
        "1) suggestions 必须只包含 1 条\n"
        f"2) {slot_hints[slot]}"
    )
    logger.info(
        "[LLM Prompt One] session=%s:%s slot=%s system_prompt=%s user_prompt=%s",
        session_type,
        peer_id,
        slot,
        system_prompt,
        user_prompt,
    )
    try:
        result = await client.generate(
            peer_id=peer_id,
            session_type=session_type,
            latest_message=latest_message,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"LLM不可用: {_format_exception_detail(exc)}") from exc

    if not result.suggestions:
        raise HTTPException(status_code=503, detail="LLM不可用: 未生成任何建议")

    suggestion = result.suggestions[0]
    return {
        "peer_id": result.peer_id,
        "session_type": result.session_type,
        "sentiment": result.sentiment,
        "slot": slot,
        "suggestion": suggestion.model_dump(),
    }


async def process_onebot_event(event: OneBotEvent) -> EventResponse:
    if is_duplicate_event(event):
        return EventResponse(status="ignored", processed=False, detail="重复事件")

    # Always forward raw message events to frontend so chat UI can render incoming QQ messages.
    if event.post_type == "message":
        raw_payload = event.model_dump(mode="json")
        _record_chat_event(raw_payload)
        await ws_manager.broadcast(raw_payload)

    if event.post_type != "message":
        return EventResponse(status="ignored", processed=False, detail="非消息事件")

    raw = event.model_dump(mode="json")
    message_type = str(raw.get("message_type") or "").lower()
    if message_type not in {"private", "group"}:
        return EventResponse(status="ignored", processed=False, detail="不支持的会话类型")

    if message_type == "group":
        peer_id_raw = raw.get("group_id")
    else:
        peer_id_raw = raw.get("user_id")
    try:
        peer_id = int(peer_id_raw)
    except Exception:
        return EventResponse(status="ignored", processed=False, detail="缺少会话对象ID")

    sender = raw.get("sender")
    sender_obj = sender if isinstance(sender, dict) else {}
    sender_id_raw = sender_obj.get("user_id", raw.get("user_id"))
    self_id_raw = raw.get("self_id")
    try:
        sender_id = int(sender_id_raw) if sender_id_raw is not None else -1
    except Exception:
        sender_id = -1
    try:
        self_id = int(self_id_raw) if self_id_raw is not None else -2
    except Exception:
        self_id = -2
    if sender_id >= 0 and self_id >= 0 and sender_id == self_id:
        return EventResponse(status="ignored", processed=False, detail="自身消息")

    incoming_text = extract_text(event)
    if not incoming_text:
        return EventResponse(status="ignored", processed=False, detail="空消息")

    sender_name = (
        str(sender_obj.get("card") or "").strip()
        or str(sender_obj.get("nickname") or "").strip()
        or (f"用户{sender_id}" if sender_id >= 0 else "用户")
    )
    contextual_text = incoming_text if message_type == "private" else f"{sender_name}: {incoming_text}"
    session_key = f"{message_type}:{peer_id}"
    context_store.append(session_key, IncomingMessage(role="user", text=contextual_text))

    # 不在收到消息时自动调用 LLM。仅在前端点击“生成建议”时通过 /suggest/reply 触发。
    return EventResponse(status="ok", processed=True, detail="消息已转发，未自动生成建议")


@app.post("/onebot/event", response_model=EventResponse)
async def onebot_event(event: OneBotEvent) -> EventResponse:
    return await process_onebot_event(event)


@app.post("/onebot/send_message")
async def onebot_send_message(payload: dict[str, Any]) -> dict[str, Any]:
    session_type = str(payload.get("session_type") or payload.get("sessionType") or "private").lower()
    mode = str(payload.get("mode") or "text").lower().strip()
    message = str(payload.get("message") or "").strip()
    file_path = str(payload.get("file_path") or payload.get("filePath") or "").strip()
    image_base64 = str(payload.get("image_base64") or payload.get("imageBase64") or "").strip()
    face_id_raw = payload.get("face_id", payload.get("faceId"))
    peer_id_raw = payload.get("peer_id", payload.get("peerId"))

    try:
        peer_id = int(peer_id_raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="会话对象ID无效") from exc

    send_key = build_send_dedupe_key(
        session_type=session_type,
        mode=mode,
        peer_id=peer_id,
        message=message,
        file_path=file_path,
        image_base64=image_base64,
        face_id_raw=face_id_raw,
    )
    now = time.monotonic()
    cached = _recent_send_success.get(send_key)
    if cached is not None:
        ts, result = cached
        if now - ts <= 2.0:
            return {"ok": True, "result": result, "deduped": True}
        _recent_send_success.pop(send_key, None)

    existing = _inflight_send_actions.get(send_key)
    if existing is not None and not existing.done():
        try:
            waited = await asyncio.wait_for(asyncio.shield(existing), timeout=35.0)
            return {"ok": True, "result": waited, "deduped": True}
        except asyncio.TimeoutError as exc:
            raise HTTPException(status_code=504, detail="发送合并等待超时") from exc
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"合并发送失败: {exc}") from exc

    send_future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
    _inflight_send_actions[send_key] = send_future

    try:
        outbound_message: Any
        if mode == "image":
            message_is_cq_image = message.startswith("[CQ:image,")
            if image_base64:
                head = f"[CQ:image,file=base64://{image_base64}]"
                outbound_message = f"{head}{message}" if (message and not message_is_cq_image) else head
            elif file_path:
                source = normalize_onebot_file_ref(file_path)
                head = f"[CQ:image,file={source}]"
                outbound_message = f"{head}{message}" if (message and not message_is_cq_image) else head
            elif message:
                source = normalize_onebot_file_ref(message)
                outbound_message = f"[CQ:image,file={source}]"
            else:
                raise HTTPException(status_code=400, detail="图片来源为空")
        elif mode == "video":
            source = file_path or message
            if not source:
                raise HTTPException(status_code=400, detail="视频来源为空")
            normalized = normalize_onebot_file_ref(source)
            head = f"[CQ:video,file={normalized}]"
            outbound_message = f"{head}{message}" if (message and source != message) else head
        elif mode == "face":
            try:
                face_id = int(face_id_raw)
            except Exception as exc:
                raise HTTPException(status_code=400, detail="表情ID无效") from exc
            if face_id < 0:
                raise HTTPException(status_code=400, detail="表情ID无效")
            head = f"[CQ:face,id={face_id}]"
            outbound_message = f"{head}{message}" if message else head
        else:
            if not message:
                raise HTTPException(status_code=400, detail="消息为空")
            outbound_message = message

        if session_type == "group":
            action = "send_group_msg"
            params = {"group_id": peer_id, "message": outbound_message}
        else:
            action = "send_private_msg"
            params = {"user_id": peer_id, "message": outbound_message}

        send_timeout = 15.0
        if mode in {"image", "video"}:
            send_timeout = 25.0
        elif mode == "face":
            send_timeout = 18.0

        try:
            result = await send_onebot_action(action=action, params=params, timeout_seconds=send_timeout)
        except asyncio.TimeoutError as exc:
            raise HTTPException(status_code=504, detail=f"发送超时（模式: {mode}）") from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        status = result.get("status")
        retcode = result.get("retcode")
        message_text = str(result.get("message") or "").strip()
        wording = str(result.get("wording") or "").strip()
        failed = (isinstance(status, str) and status != "ok") or (isinstance(retcode, int) and retcode != 0)
        if failed:
            raise HTTPException(
                status_code=502,
                detail={
                    "error": "onebot_send_failed",
                    "mode": mode,
                    "status": status,
                    "retcode": retcode,
                    "message": message_text,
                    "wording": wording,
                },
            )

        _recent_send_success[send_key] = (time.monotonic(), result)
        if not send_future.done():
            send_future.set_result(result)
        # Persist outbound messages too, so restart can restore full conversation timeline.
        _record_chat_event(
            _build_outbound_history_event(
                session_type=session_type,
                peer_id=peer_id,
                message=message,
                mode=mode,
                file_path=file_path,
                image_base64=image_base64,
                face_id_raw=face_id_raw,
            )
        )
        return {"ok": True, "result": result}
    except Exception as exc:
        if not send_future.done():
            send_future.cancel()
        raise
    finally:
        current = _inflight_send_actions.get(send_key)
        if current is send_future:
            _inflight_send_actions.pop(send_key, None)


@app.post("/onebot/recall_message")
async def onebot_recall_message(payload: dict[str, Any]) -> dict[str, Any]:
    raw_id = payload.get("message_id", payload.get("messageId"))
    if raw_id is None:
        raise HTTPException(status_code=400, detail="缺少 message_id")
    try:
        message_id = int(raw_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="message_id 无效") from exc

    try:
        result = await send_onebot_action(action="delete_msg", params={"message_id": message_id}, timeout_seconds=15.0)
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="撤回超时") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    status = result.get("status")
    retcode = result.get("retcode")
    message_text = str(result.get("message") or "").strip()
    wording = str(result.get("wording") or "").strip()
    failed = (isinstance(status, str) and status != "ok") or (isinstance(retcode, int) and retcode != 0)
    if failed:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "onebot_recall_failed",
                "status": status,
                "retcode": retcode,
                "message": message_text,
                "wording": wording,
            },
        )
    return {"ok": True, "result": result}


@app.post("/onebot/send_message_async")
async def onebot_send_message_async(payload: dict[str, Any]) -> dict[str, Any]:
    session_type = str(payload.get("session_type") or payload.get("sessionType") or "private").lower()
    mode = str(payload.get("mode") or "text").lower().strip()
    message = str(payload.get("message") or "").strip()
    file_path = str(payload.get("file_path") or payload.get("filePath") or "").strip()
    peer_id_raw = payload.get("peer_id", payload.get("peerId"))

    if mode != "video":
        raise HTTPException(status_code=400, detail="异步发送当前仅支持视频")
    if session_type not in {"private", "group"}:
        raise HTTPException(status_code=400, detail="会话类型无效")
    try:
        peer_id = int(peer_id_raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="会话对象ID无效") from exc
    if not (file_path or message):
        raise HTTPException(status_code=400, detail="视频来源为空")

    item = _create_send_task(
        mode=mode,
        session_type=session_type,
        peer_id=peer_id,
        file_path=file_path,
        message=message,
    )
    asyncio.create_task(
        _run_video_send_task(
            task_id=str(item["task_id"]),
            session_type=session_type,
            peer_id=peer_id,
            message=message,
            file_path=file_path,
        )
    )
    return {
        "ok": True,
        "task_id": item["task_id"],
        "status": item["status"],
        "progress": item["progress"],
    }


@app.get("/onebot/send_task_status")
async def onebot_send_task_status(task_id: str = Query(..., min_length=1)) -> dict[str, Any]:
    item = _send_tasks.get(task_id)
    if item is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    progress = _calc_task_progress(item)
    item["progress"] = progress
    item["updated_at"] = time.time()
    return {
        "ok": True,
        "task_id": item["task_id"],
        "mode": item["mode"],
        "status": item["status"],
        "progress": progress,
        "error": item["error"],
        "result": item["result"],
    }


@app.get("/onebot/image_proxy")
async def onebot_image_proxy(file: str = Query(..., min_length=1)) -> Response:
    # Fast path: if `file` itself is directly usable, do not depend on get_image.
    if file.startswith(("http://", "https://")):
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(
                    file,
                    headers={
                        "User-Agent": "Mozilla/5.0",
                        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                    },
                )
                if resp.is_success and resp.content:
                    media_type = resp.headers.get("content-type", "application/octet-stream")
                    return Response(content=resp.content, media_type=media_type)
        except Exception:
            # Last fallback: redirect to source URL.
            return RedirectResponse(url=file, status_code=307)
        return RedirectResponse(url=file, status_code=307)

    if file.startswith("file://"):
        direct_path = file.removeprefix("file://")
        candidate = Path(direct_path)
        if candidate.exists() and candidate.is_file():
            media_type = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
            return FileResponse(path=candidate, media_type=media_type)

    direct_candidate = Path(file)
    if direct_candidate.exists() and direct_candidate.is_file():
        media_type = mimetypes.guess_type(str(direct_candidate))[0] or "application/octet-stream"
        return FileResponse(path=direct_candidate, media_type=media_type)

    try:
        result = await send_onebot_action(action="get_image", params={"file": file}, timeout_seconds=10.0)
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="获取图片超时") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    data = result.get("data") if isinstance(result.get("data"), dict) else {}
    image_url = str(data.get("url") or "").strip()
    image_path = str(data.get("file") or data.get("path") or "").strip()

    if image_url.startswith(("http://", "https://")):
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(
                    image_url,
                    headers={
                        "User-Agent": "Mozilla/5.0",
                        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                    },
                )
                if resp.is_success and resp.content:
                    media_type = resp.headers.get("content-type", "application/octet-stream")
                    return Response(content=resp.content, media_type=media_type)
        except Exception:
            return RedirectResponse(url=image_url, status_code=307)
        return RedirectResponse(url=image_url, status_code=307)

    if image_url.startswith("file://"):
        image_path = image_url.removeprefix("file://")

    candidate = Path(image_path)
    if candidate.exists() and candidate.is_file():
        media_type = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
        return FileResponse(path=candidate, media_type=media_type)

    # Fallback: if provider returned a URL but not http/file, try fetching directly.
    if image_url:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(image_url)
                if resp.is_success:
                    media_type = resp.headers.get("content-type", "application/octet-stream")
                    return Response(content=resp.content, media_type=media_type)
        except Exception:
            pass

    raise HTTPException(status_code=404, detail="image not found")


@app.websocket("/onebot/event")
async def onebot_event_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    onebot_upstreams.add(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                if not isinstance(data, dict):
                    continue

                if is_onebot_action_response(data):
                    echo = data.get("echo")
                    if isinstance(echo, str):
                        fut = pending_actions.get(echo)
                        if fut is not None and not fut.done():
                            fut.set_result(data)
                    continue

                event = OneBotEvent.model_validate(data)
            except (json.JSONDecodeError, ValidationError):
                # Keep reverse WS alive even if upstream sends non-event payload.
                continue
            # Do not block reverse WS intake on LLM latency.
            asyncio.create_task(_process_onebot_event_background(event))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        onebot_upstreams.discard(websocket)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)
