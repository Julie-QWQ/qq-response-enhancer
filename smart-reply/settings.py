from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import tomllib


@dataclass(frozen=True)
class ServerSettings:
    host: str
    port: int
    reload: bool


@dataclass(frozen=True)
class LLMSettings:
    api_base: str
    api_key: str
    model: str
    timeout_seconds: float


@dataclass(frozen=True)
class AppSettings:
    app_title: str
    server: ServerSettings


def _to_bool(value: object, default: bool) -> bool:
    return value if isinstance(value, bool) else default


def _to_int(value: object, default: int) -> int:
    return int(value) if isinstance(value, int) else default


def _to_str(value: object, default: str) -> str:
    return value.strip() if isinstance(value, str) and value.strip() else default


def _load_toml(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with path.open("rb") as f:
        data = tomllib.load(f)
    return data if isinstance(data, dict) else {}


def load_settings(config_path: str = "config.toml") -> AppSettings:
    raw = _load_toml(Path(config_path))
    app = raw.get("app", {}) if isinstance(raw.get("app"), dict) else {}
    server = raw.get("server", {}) if isinstance(raw.get("server"), dict) else {}

    return AppSettings(
        app_title=_to_str(app.get("title"), "Smart Reply Suggester"),
        server=ServerSettings(
            host=_to_str(server.get("host"), "127.0.0.1"),
            port=_to_int(server.get("port"), 8000),
            reload=_to_bool(server.get("reload"), True),
        ),
    )
