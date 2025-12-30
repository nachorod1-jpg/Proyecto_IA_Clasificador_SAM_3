from __future__ import annotations

import gc
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from PIL import Image

try:  # Optional torch import for GPU detection
    import torch
except Exception:  # pragma: no cover - optional dependency
    torch = None

logger = logging.getLogger(__name__)


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
        self.safe_mode = True
        self.device_preference = "auto"

    def load_model(
        self,
        safe_mode: bool = True,
        device_preference: str = "auto",
        box_threshold: float = 0.5,
        mask_threshold: float = 0.5,
    ) -> None:
        if not self.weights_path.exists():
            raise FileNotFoundError(f"SAM-3 weights not found at {self.weights_path}")
        if not torch:  # pragma: no cover - optional dependency
            raise RuntimeError("PyTorch is required for SAM-3 inference")

        try:  # pragma: no cover - external dependency
            from transformers import Sam3Model, Sam3Processor
        except Exception as exc:  # pragma: no cover - external dependency
            raise RuntimeError("transformers does not include SAM-3 support") from exc

        device_preference = (device_preference or "auto").lower()
        self.safe_mode = safe_mode
        self.device_preference = device_preference
        self.box_threshold = box_threshold
        self.mask_threshold = mask_threshold

        if safe_mode:
            use_cuda = device_preference == "cuda" and torch.cuda.is_available()
            self.device = "cuda" if use_cuda else "cpu"
        else:
            if device_preference == "cpu":
                self.device = "cpu"
            elif device_preference == "cuda" and torch.cuda.is_available():
                self.device = "cuda"
            else:
                self.device = "cuda" if torch.cuda.is_available() else "cpu"
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

    def run_pcs(
        self,
        image: Image.Image,
        prompt_text: str,
        target_long_side: int,
        box_threshold: float,
        max_detections: int,
    ) -> List[Detection]:
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

        attempts = 0
        last_exc: Exception | None = None
        while attempts < 2:
            inputs = outputs = results = boxes = scores = masks = None
            try:
                inputs = self.processor(images=resized_image, text=prompt_text, return_tensors="pt")
                if torch and self.device:
                    inputs = {
                        key: value.to(self.device) if hasattr(value, "to") else value
                        for key, value in inputs.items()
                    }
                target_sizes = [(orig_height, orig_width)]
                with torch.inference_mode():
                    outputs = self.model(**inputs)
                results = self.processor.post_process_instance_segmentation(
                    outputs,
                    threshold=0.0,
                    mask_threshold=self.mask_threshold,
                    target_sizes=target_sizes,
                )[0]

                boxes = results.get("boxes") or []
                scores = results.get("scores") or []
                masks = results.get("masks")
                filtered = [
                    (idx, box, float(score))
                    for idx, (box, score) in enumerate(zip(boxes, scores))
                    if float(score) >= box_threshold
                ]
                filtered.sort(key=lambda item: item[2], reverse=True)
                if max_detections:
                    filtered = filtered[:max_detections]

                detections: List[Detection] = []
                for idx, box, score in filtered:
                    x0, y0, x1, y1 = [float(v) for v in box]
                    bbox = [x0, y0, max(0.0, x1 - x0), max(0.0, y1 - y0)]
                    mask_path = None
                    if masks is not None and len(masks) > idx:
                        mask = masks[idx]
                        if hasattr(mask, "cpu"):
                            mask = mask.cpu()
                        mask_path = None  # Masks persistence can be added later
                    detections.append(Detection(bbox=bbox, score=score, mask_path=mask_path))
                return detections
            except torch.cuda.OutOfMemoryError as exc:  # pragma: no cover - requires GPU
                last_exc = exc
                logger.warning("CUDA OOM detected. Retrying on CPU if possible.")
                if torch and torch.cuda.is_available():
                    torch.cuda.empty_cache()
                if self.device == "cuda":
                    self.device = "cpu"
                    if self.model is not None:
                        self.model.to(self.device)
                    attempts += 1
                    continue
                raise RuntimeError("SAM-3 inference failed after CPU retry") from exc
            except Exception as exc:
                last_exc = exc
                raise RuntimeError(f"SAM-3 inference failed: {exc}") from exc
            finally:
                inputs = None
                outputs = None
                results = None
                boxes = None
                scores = None
                masks = None
                gc.collect()
                if torch and self.device == "cuda":
                    torch.cuda.empty_cache()
        raise RuntimeError(f"SAM-3 inference failed: {last_exc}")


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
        runner.load_model(safe_mode=True, device_preference="cpu")
    except Exception as exc:  # pragma: no cover - external dependency
        return False, f"Model load failed: {exc}"
    finally:
        runner.model = None
        runner.processor = None
        gc.collect()
        if torch and torch.cuda.is_available():  # pragma: no cover - GPU specific
            torch.cuda.empty_cache()
    return True, "Model load ok"
