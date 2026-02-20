from __future__ import annotations

import uvicorn

from settings import load_settings


if __name__ == "__main__":
    cfg = load_settings()
    uvicorn.run(
        "main:app",
        host=cfg.server.host,
        port=cfg.server.port,
        reload=cfg.server.reload,
    )
