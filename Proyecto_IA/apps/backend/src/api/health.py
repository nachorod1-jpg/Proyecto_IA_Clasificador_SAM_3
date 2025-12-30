from __future__ import annotations

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
    )
