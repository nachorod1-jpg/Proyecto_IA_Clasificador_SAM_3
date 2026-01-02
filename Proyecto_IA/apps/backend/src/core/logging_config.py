from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional


DEFAULT_MAX_BYTES = 2 * 1024 * 1024
DEFAULT_BACKUP_COUNT = 3


def _ensure_handler(logger: logging.Logger, handler: logging.Handler) -> None:
    for existing in logger.handlers:
        if isinstance(existing, handler.__class__) and getattr(existing, "baseFilename", None) == getattr(
            handler, "baseFilename", None
        ):
            return
    logger.addHandler(handler)


def configure_backend_logging(log_dir: Path, level: int = logging.INFO) -> Path:
    """Configure root/uvicorn loggers to write to rotating backend.log."""

    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "backend.log"

    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(name)s - %(message)s")
    file_handler = RotatingFileHandler(log_path, maxBytes=DEFAULT_MAX_BYTES, backupCount=DEFAULT_BACKUP_COUNT, encoding="utf-8")
    file_handler.setFormatter(formatter)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    _ensure_handler(root_logger, file_handler)
    _ensure_handler(root_logger, console_handler)

    for logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        logger = logging.getLogger(logger_name)
        logger.setLevel(level)
        _ensure_handler(logger, file_handler)
        _ensure_handler(logger, console_handler)

    return log_path


def configure_job_logger(job_id: int, log_dir: Path) -> logging.Logger:
    logger = logging.getLogger(f"job-{job_id}")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not logger.handlers:
        log_dir.mkdir(parents=True, exist_ok=True)
        handler = logging.FileHandler(log_dir / f"job_{job_id}.log", encoding="utf-8")
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger


def get_app_logger(name: str = "app", log_dir: Optional[Path] = None) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        if log_dir:
            log_dir.mkdir(parents=True, exist_ok=True)
            file_handler = logging.FileHandler(log_dir / f"{name}.log", encoding="utf-8")
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
    return logger
