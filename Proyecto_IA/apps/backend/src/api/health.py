from __future__ import annotations

import sys
import traceback
from pathlib import Path

from fastapi import APIRouter

from core.config import get_settings
from core.schemas import HealthStatus
from inference.sam3_runner import get_torch_info, validate_sam3_load

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health", response_model=HealthStatus)
def health_check():
    settings = get_settings()
    gpu_available, gpu_name, vram = get_torch_info()
    message = "Model load ok"
    ready = True
    sam3_import_ok = False
    sam3_import_error = None
    sam3_import_traceback = None
    transformers_version = None
    transformers_file = None
    sam3_symbols: list[str] = []

    try:
        import transformers

        transformers_version = getattr(transformers, "__version__", None)
        transformers_file = getattr(transformers, "__file__", None)
        sam3_symbols = [symbol for symbol in dir(transformers) if symbol.startswith("Sam3")][:30]
    except Exception as exc:  # pragma: no cover - runtime diagnostic
        message = f"transformers import failed: {exc}"
        return HealthStatus(
            gpu_available=gpu_available,
            gpu_name=gpu_name,
            vram_mb=vram,
            sam3_weights_ready=False,
            sam3_message=message,
            sam3_import_ok=False,
            sam3_import_error=str(exc),
            sam3_import_traceback=traceback.format_exc(),
            python_executable=sys.executable,
            transformers_version=transformers_version,
            transformers_file=transformers_file,
            sam3_symbols=sam3_symbols,
        )

    try:
        from transformers import Sam3Model, Sam3Processor  # noqa: F401

        sam3_import_ok = True
    except Exception as exc:  # pragma: no cover - runtime diagnostic
        sam3_import_error = str(exc)
        sam3_import_traceback = traceback.format_exc()
        message = f"SAM-3 import failed: {exc}"
        return HealthStatus(
            gpu_available=gpu_available,
            gpu_name=gpu_name,
            vram_mb=vram,
            sam3_weights_ready=False,
            sam3_message=message,
            sam3_import_ok=False,
            sam3_import_error=sam3_import_error,
            sam3_import_traceback=sam3_import_traceback,
            python_executable=sys.executable,
            transformers_version=transformers_version,
            transformers_file=transformers_file,
            sam3_symbols=sam3_symbols,
        )
    weights_path = settings.sam3_checkpoint_path or settings.sam3_weights_dir
    if not weights_path:
        message = "SAM-3 weights path not configured"
        ready = False
    else:
        path = Path(weights_path)
        if not path.exists():
            message = f"Weights path not found: {path}"
            ready = False
        else:
            ready, message = validate_sam3_load(path.as_posix())
    return HealthStatus(
        gpu_available=gpu_available,
        gpu_name=gpu_name,
        vram_mb=vram,
        sam3_weights_ready=ready,
        sam3_message=message,
        sam3_import_ok=sam3_import_ok,
        sam3_import_error=sam3_import_error,
        sam3_import_traceback=sam3_import_traceback,
        python_executable=sys.executable,
        transformers_version=transformers_version,
        transformers_file=transformers_file,
        sam3_symbols=sam3_symbols,
    )
