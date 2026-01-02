from __future__ import annotations

import asyncio
import os
from collections import deque
from pathlib import Path
from typing import Deque

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, StreamingResponse

from core.config import get_settings

router = APIRouter(prefix="/api/v1/logs", tags=["logs"])


def _logs_enabled() -> bool:
    app_env = os.getenv("APP_ENV", "").lower()
    explicit = os.getenv("ENABLE_LOGS_ENDPOINT", "").lower() == "true"
    return app_env == "dev" or explicit


def _require_logs_enabled():
    if not _logs_enabled():
        raise HTTPException(status_code=403, detail="Logs endpoint disabled")


def _get_log_path() -> Path:
    settings = get_settings()
    log_path = settings.logs_dir / "backend.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.touch(exist_ok=True)
    return log_path


@router.get("/tail", response_class=PlainTextResponse)
async def tail_logs(lines: int = Query(200, ge=1, le=2000), _: None = Depends(_require_logs_enabled)):
    log_path = _get_log_path()
    buffer: Deque[str] = deque(maxlen=lines)
    with log_path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            buffer.append(line.rstrip("\n"))
    return "\n".join(buffer)


async def _stream_log_lines(poll_interval: float = 1.0):
    log_path = _get_log_path()
    with log_path.open("r", encoding="utf-8", errors="replace") as fh:
        fh.seek(0, os.SEEK_END)
        while True:
            line = fh.readline()
            if line:
                yield f"data: {line.rstrip()}\n\n"
            else:
                await asyncio.sleep(poll_interval)


@router.get("/stream")
async def stream_logs(_: None = Depends(_require_logs_enabled)):
    generator = _stream_log_lines()
    return StreamingResponse(generator, media_type="text/event-stream")
