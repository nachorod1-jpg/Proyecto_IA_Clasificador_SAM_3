from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
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
        self.processor = None
        self.device = "cpu"
        self.box_threshold = 0.0
        self.mask_threshold = 0.5

    def load_model(self, prefer_cpu: bool = False) -> None:
        if not self.weights_path.exists():
            raise FileNotFoundError(f"SAM-3 weights not found at {self.weights_path}")
        if not torch:  # pragma: no cover - optional dependency
            raise RuntimeError("PyTorch is required for SAM-3 inference")

        try:  # pragma: no cover - external dependency
            from transformers import Sam3Model, Sam3Processor
        except Exception as exc:  # pragma: no cover - external dependency
            raise RuntimeError("transformers does not include SAM-3 support") from exc

        self.device = "cpu" if prefer_cpu else ("cuda" if torch.cuda.is_available() else "cpu")
        local_dir = self.weights_path if self.weights_path.is_dir() else self.weights_path.parent
        if not local_dir.exists():
            raise FileNotFoundError(f"SAM-3 weights not found at {local_dir}")

        try:  # pragma: no cover - external dependency
            self.model = Sam3Model.from_pretrained(local_dir.as_posix(), local_files_only=True).to(self.device)
            self.processor = Sam3Processor.from_pretrained(local_dir.as_posix(), local_files_only=True)
            self.model.eval()
        except Exception as exc:  # pragma: no cover - external dependency
            raise RuntimeError(f"Failed to load SAM-3 from {local_dir}: {exc}") from exc

    def is_loaded(self) -> bool:
        return self.model is not None

    def run_pcs(self, image: Image.Image, prompt_text: str, target_long_side: int) -> List[Detection]:
        if not self.model or not self.processor:
            raise RuntimeError("SAM-3 model not loaded")

        image_rgb = image.convert("RGB")
        orig_width, orig_height = image_rgb.size
        long_side = max(orig_width, orig_height)
        resized_image = image_rgb
        if target_long_side and long_side != target_long_side:
            scale = target_long_side / float(long_side)
            new_width = max(1, int(round(orig_width * scale)))
            new_height = max(1, int(round(orig_height * scale)))
            resized_image = image_rgb.resize((new_width, new_height))

        try:
            inputs = self.processor(images=resized_image, text=prompt_text, return_tensors="pt")
            if torch and self.device:
                inputs = {
                    key: value.to(self.device) if hasattr(value, "to") else value
                    for key, value in inputs.items()
                }
            target_sizes = [(orig_height, orig_width)]
            with torch.no_grad():
                outputs = self.model(**inputs)
            results = self.processor.post_process_instance_segmentation(
                outputs,
                threshold=self.box_threshold,
                mask_threshold=self.mask_threshold,
                target_sizes=target_sizes,
            )[0]
        except torch.cuda.OutOfMemoryError:  # pragma: no cover - requires GPU
            if torch and torch.cuda.is_available() and self.device == "cuda":
                torch.cuda.empty_cache()
                self.device = "cpu"
                self.model.to(self.device)
                return self.run_pcs(image, prompt_text, target_long_side)
            raise
        except Exception as exc:
            raise RuntimeError(f"SAM-3 inference failed: {exc}") from exc

        boxes = results.get("boxes") or []
        scores = results.get("scores") or []
        masks = results.get("masks")
        detections: List[Detection] = []
        for idx, (box, score) in enumerate(zip(boxes, scores)):
            x0, y0, x1, y1 = [float(v) for v in box]
            bbox = [x0, y0, max(0.0, x1 - x0), max(0.0, y1 - y0)]
            mask_path = None
            if masks is not None and len(masks) > idx:
                mask = masks[idx]
                if hasattr(mask, "cpu"):
                    mask = mask.cpu()
                mask_path = None  # Masks persistence can be added later
            detections.append(Detection(bbox=bbox, score=float(score), mask_path=mask_path))
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


@lru_cache(maxsize=2)
def validate_sam3_load(weights_path: str) -> tuple[bool, str]:
    path = Path(weights_path)
    runner = SAM3Runner(path)
    try:
        runner.load_model(prefer_cpu=True)
    except Exception as exc:  # pragma: no cover - external dependency
        return False, f"Model load failed: {exc}"
    finally:
        runner.model = None
        runner.processor = None
        if torch and torch.cuda.is_available():  # pragma: no cover - GPU specific
            torch.cuda.empty_cache()
    return True, "Model load ok"
