from __future__ import annotations

import random
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from PIL import Image

try:  # Optional torch import for GPU detection
    import torch
except Exception:  # pragma: no cover - optional dependency
    torch = None


@dataclass
class Detection:
    bbox: List[float]
    score: float
    mask_path: Optional[Path] = None


class SAM3Runner:
    def __init__(self, weights_path: Path):
        self.weights_path = weights_path
        self.model = None
        self.device = "cuda" if torch and torch.cuda.is_available() else "cpu"

    def load_model(self) -> None:
        if not self.weights_path.exists():
            raise FileNotFoundError(f"SAM-3 weights not found at {self.weights_path}")
        # Placeholder for actual SAM-3 loading logic
        self.model = "placeholder"

    def is_loaded(self) -> bool:
        return self.model is not None

    def run_pcs(self, image: Image.Image, prompt_text: str, target_long_side: int) -> List[Detection]:
        # Placeholder inference: generate deterministic pseudo-detections for demonstration
        width, height = image.size
        base = (abs(hash(prompt_text)) % 5)
        detections: List[Detection] = []
        for i in range(base):
            w = max(10, int(width * 0.1))
            h = max(10, int(height * 0.1))
            x0 = min(width - w, (i * w) % max(1, width - w))
            y0 = min(height - h, (i * h) % max(1, height - h))
            score = max(0.1, min(0.95, 0.5 + 0.1 * i))
            detections.append(Detection(bbox=[x0, y0, w, h], score=score))
        return detections


def get_torch_info():
    if not torch:
        return False, None, None
    try:
        gpu_available = torch.cuda.is_available()
        gpu_name = torch.cuda.get_device_name(0) if gpu_available else None
        vram = (
            int(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024))
            if gpu_available
            else None
        )
        return gpu_available, gpu_name, vram
    except Exception:
        return False, None, None
