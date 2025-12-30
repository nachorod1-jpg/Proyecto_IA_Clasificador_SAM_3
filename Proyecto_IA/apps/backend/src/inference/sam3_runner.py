from __future__ import annotations

import gc
import importlib.util
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from PIL import Image
import psutil

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
        self.safe_load = True
        self._is_loaded = False
        self._loaded_device: str | None = None
        self._loaded_dtype: torch.dtype | None = None

    def unload(self) -> None:
        if self.model:
            self.model = None
        self.processor = None
        self._is_loaded = False
        self._loaded_device = None
        self._loaded_dtype = None
        gc.collect()
        if torch and torch.cuda.is_available():
            torch.cuda.empty_cache()

    def load_model(
        self,
        safe_mode: bool = True,
        safe_load: bool = True,
        device_preference: str = "auto",
        dtype_preference: str = "auto",
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
        dtype_preference = (dtype_preference or "auto").lower()
        self.safe_mode = safe_mode
        self.device_preference = device_preference
        self.safe_load = safe_load
        self.box_threshold = box_threshold
        self.mask_threshold = mask_threshold

        if device_preference == "cuda" and torch.cuda.is_available():
            self.device = "cuda"
        elif device_preference == "cpu":
            self.device = "cpu"
        else:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"

        if dtype_preference == "fp16" and self.device != "cuda":
            logger.warning("fp16 requested but CUDA not available; using fp32 on CPU")
        if dtype_preference == "fp32":
            target_dtype = torch.float32
        elif dtype_preference == "fp16":
            target_dtype = torch.float16 if self.device == "cuda" else torch.float32
        else:
            target_dtype = torch.float16 if self.device == "cuda" else torch.float32
        prefer_fp16 = self.device == "cuda" and dtype_preference != "fp32"

        if (
            self._is_loaded
            and self.model is not None
            and self.processor is not None
            and self._loaded_device == self.device
            and self._loaded_dtype == target_dtype
        ):
            return

        if self._is_loaded:
            self.unload()
        local_dir = self.weights_path if self.weights_path.is_dir() else self.weights_path.parent
        if not local_dir.exists():
            raise FileNotFoundError(f"SAM-3 weights not found at {local_dir}")

        accelerate_available = importlib.util.find_spec("accelerate") is not None
        device_map = "auto" if self.device == "cuda" and safe_load and accelerate_available else None

        def _log_memory(prefix: str) -> tuple[float, float]:
            process = psutil.Process()
            rss = process.memory_info().rss
            vram = torch.cuda.memory_allocated() if torch and torch.cuda.is_available() else 0
            logger.info(f"{prefix} RAM: {rss / (1024 ** 3):.2f} GB, VRAM: {vram / (1024 ** 3):.2f} GB")
            return rss, vram

        def _strategy_description(name: str, dtype: torch.dtype, map_value: str | None) -> str:
            return (
                f"strategy={name}, device={self.device}, dtype={dtype}, device_map={map_value}"
            )

        load_args = {
            "pretrained_model_name_or_path": local_dir.as_posix(),
            "local_files_only": True,
        }
        strategies = []
        if safe_load:
            load_args["low_cpu_mem_usage"] = True
            if device_map and prefer_fp16:
                strategies.append(("device_map_auto_fp16", device_map, torch.float16))
            if prefer_fp16:
                strategies.append(("manual_fp16", None, torch.float16))
            strategies.append(("manual_fp32", None, torch.float32))
        else:
            strategies.append(("standard", None, target_dtype))

        load_errors: list[str] = []
        for idx, (name, map_value, dtype) in enumerate(strategies, start=1):
            try:
                logger.info(
                    f"Loading SAM-3 ({idx}/{len(strategies)}) with {_strategy_description(name, dtype, map_value)}"
                )
                rss_before, vram_before = _log_memory("Before load")
                model_kwargs = dict(load_args)
                model_kwargs["torch_dtype"] = dtype
                if map_value:
                    model_kwargs["device_map"] = map_value
                try:
                    self.model = Sam3Model.from_pretrained(**model_kwargs)
                except TypeError as type_err:
                    if "device_map" in str(type_err) and map_value:
                        logger.warning(
                            "device_map parameter not supported by this Transformers version. "
                            f"Falling back to manual .to(device). Error: {type_err}"
                        )
                        model_kwargs.pop("device_map", None)
                        self.model = Sam3Model.from_pretrained(**model_kwargs)
                        self.model.to(self.device)
                    else:
                        raise
                if not map_value:
                    self.model.to(self.device)
                self.processor = Sam3Processor.from_pretrained(local_dir.as_posix(), local_files_only=True)
                self.model.eval()
                rss_after, vram_after = _log_memory("After load")
                logger.info(
                    "Memory load: RAM: %.2f -> %.2f GB (+%.2f), VRAM: %.2f -> %.2f GB (+%.2f), device=%s, dtype=%s, device_map=%s"
                    % (
                        rss_before / (1024 ** 3),
                        rss_after / (1024 ** 3),
                        (rss_after - rss_before) / (1024 ** 3),
                        vram_before / (1024 ** 3),
                        vram_after / (1024 ** 3),
                        (vram_after - vram_before) / (1024 ** 3),
                        self.device,
                        dtype,
                        map_value,
                    )
                )
                self._is_loaded = True
                self._loaded_device = self.device
                self._loaded_dtype = dtype
                return
            except Exception as exc:  # pragma: no cover - external dependency
                load_errors.append(str(exc))
                logger.warning(
                    f"SAM-3 load failed with {_strategy_description(name, dtype, map_value)}: {exc}."
                    f" Trying next strategy..." if idx < len(strategies) else ""
                )

        raise RuntimeError(
            "Failed to load SAM-3 from %s after strategies: %s" % (local_dir, "; ".join(load_errors))
        )

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

        inputs = outputs = results = boxes = scores = masks = None
        try:
            inputs = self.processor(images=resized_image, text=prompt_text, return_tensors="pt")
            if torch and self.device:
                inputs = {
                    key: value.to(self.device) if hasattr(value, "to") else value
                    for key, value in inputs.items()
                }
            target_sizes = [(resized_image.size[1], resized_image.size[0])]
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
        except Exception as exc:
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
    if not path.exists():
        return False, f"Weights path not found: {path}"
    try:
        from transformers import Sam3Model, Sam3Processor
    except Exception as exc:  # pragma: no cover - optional dependency
        return False, f"Transformers SAM-3 not available: {exc}"

    if path.is_dir():
        config_file = path / "config.json"
        if not config_file.exists():
            return False, f"Missing config.json in {path}"
    else:
        if not path.exists():
            return False, f"Checkpoint not found: {path}"

    try:
        Sam3Model.from_pretrained(path.as_posix(), local_files_only=True, device_map="meta")
        Sam3Processor.from_pretrained(path.as_posix(), local_files_only=True)
    except Exception as exc:  # pragma: no cover - external dependency
        return False, f"Model metadata validation failed: {exc}"
    gc.collect()
    return True, "Model load ok"
