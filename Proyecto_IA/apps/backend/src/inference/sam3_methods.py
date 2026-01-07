from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Iterable, Optional

import numpy as np
from PIL import Image

try:  # Optional torch import for GPU execution
    import torch
except Exception:  # pragma: no cover - optional dependency
    torch = None

logger = logging.getLogger(__name__)


@dataclass
class Sam3Region:
    bbox_xyxy: list[float]
    score: float
    mask: Optional[np.ndarray]


@dataclass
class Sam3Debug:
    used_threshold: float
    candidate_count: int
    filtered_count: int
    original_sizes: list[list[int]]
    max_pred_sigmoid: Optional[float] = None
    max_presence_sigmoid: Optional[float] = None


def _move_inputs(inputs: dict[str, Any], device: str) -> dict[str, Any]:
    if not torch:
        return inputs
    return {key: value.to(device) if hasattr(value, "to") else value for key, value in inputs.items()}


def _extract_debug(outputs: Any) -> dict[str, Optional[float]]:
    debug: dict[str, Optional[float]] = {"max_pred_sigmoid": None, "max_presence_sigmoid": None}
    if not torch:
        return debug
    if hasattr(outputs, "pred_logits"):
        try:
            debug["max_pred_sigmoid"] = float(torch.sigmoid(outputs.pred_logits).max().item())
        except Exception:
            debug["max_pred_sigmoid"] = None
    if hasattr(outputs, "presence_logits"):
        try:
            debug["max_presence_sigmoid"] = float(torch.sigmoid(outputs.presence_logits).max().item())
        except Exception:
            debug["max_presence_sigmoid"] = None
    return debug


def _post_process_instances(
    processor: Any,
    outputs: Any,
    inputs: dict[str, Any],
    threshold: float,
    mask_threshold: float,
) -> dict[str, Any]:
    return processor.post_process_instance_segmentation(
        outputs,
        threshold=threshold,
        mask_threshold=mask_threshold,
        target_sizes=inputs["original_sizes"].tolist(),
    )[0]


def _tensor_to_mask(mask: Any) -> np.ndarray:
    if hasattr(mask, "cpu"):
        mask = mask.cpu()
    if hasattr(mask, "numpy"):
        mask = mask.numpy()
    mask_array = np.asarray(mask)
    if mask_array.ndim > 2:
        mask_array = mask_array.squeeze()
    return mask_array


def _regions_from_results(
    results: dict[str, Any],
    confidence_threshold: float,
    min_area_pixels: int,
) -> list[Sam3Region]:
    boxes = results.get("boxes") or []
    scores = results.get("scores") or []
    masks = results.get("masks")
    regions: list[Sam3Region] = []
    for idx, (box, score) in enumerate(zip(boxes, scores)):
        score_val = float(score)
        if score_val < confidence_threshold:
            continue
        mask = None
        if masks is not None and len(masks) > idx:
            mask_array = _tensor_to_mask(masks[idx])
            mask = mask_array
            if min_area_pixels and int(mask_array.sum()) < min_area_pixels:
                continue
        bbox = [float(v) for v in box]
        regions.append(Sam3Region(bbox_xyxy=bbox, score=score_val, mask=mask))
    return regions


def run_pcs_text(
    *,
    image: Image.Image,
    text: str,
    processor: Any,
    model: Any,
    device: str,
    confidence_threshold: float,
    mask_threshold: float,
    min_area_pixels: int,
) -> tuple[list[Sam3Region], Sam3Debug]:
    image_rgb = image.convert("RGB")
    inputs = processor(images=image_rgb, text=text, return_tensors="pt")
    inputs = _move_inputs(inputs, device)
    with torch.inference_mode():
        outputs = model(**inputs)
    debug_info = _extract_debug(outputs)
    results = _post_process_instances(processor, outputs, inputs, confidence_threshold, mask_threshold)
    regions = _regions_from_results(results, confidence_threshold, min_area_pixels)
    used_threshold = confidence_threshold
    if not regions and confidence_threshold > 0.3:
        logger.info("SAM-3 PCS text fallback: retrying with threshold=0.3")
        results = _post_process_instances(processor, outputs, inputs, 0.3, mask_threshold)
        regions = _regions_from_results(results, 0.3, min_area_pixels)
        used_threshold = 0.3
    debug = Sam3Debug(
        used_threshold=used_threshold,
        candidate_count=len(results.get("boxes") or []),
        filtered_count=len(regions),
        original_sizes=inputs["original_sizes"].tolist(),
        max_pred_sigmoid=debug_info["max_pred_sigmoid"],
        max_presence_sigmoid=debug_info["max_presence_sigmoid"],
    )
    return regions, debug


def run_pcs_box(
    *,
    image: Image.Image,
    boxes: Iterable[Iterable[float]],
    labels: Optional[Iterable[int]],
    processor: Any,
    model: Any,
    device: str,
    confidence_threshold: float,
    mask_threshold: float,
    min_area_pixels: int,
) -> tuple[list[Sam3Region], Sam3Debug]:
    image_rgb = image.convert("RGB")
    input_boxes = [list(map(float, box)) for box in boxes]
    inputs = processor(
        images=image_rgb,
        input_boxes=[input_boxes],
        input_boxes_labels=[list(labels)] if labels is not None else None,
        return_tensors="pt",
    )
    inputs = _move_inputs(inputs, device)
    with torch.inference_mode():
        outputs = model(**inputs)
    debug_info = _extract_debug(outputs)
    results = _post_process_instances(processor, outputs, inputs, confidence_threshold, mask_threshold)
    regions = _regions_from_results(results, confidence_threshold, min_area_pixels)
    used_threshold = confidence_threshold
    if not regions and confidence_threshold > 0.3:
        logger.info("SAM-3 PCS box fallback: retrying with threshold=0.3")
        results = _post_process_instances(processor, outputs, inputs, 0.3, mask_threshold)
        regions = _regions_from_results(results, 0.3, min_area_pixels)
        used_threshold = 0.3
    debug = Sam3Debug(
        used_threshold=used_threshold,
        candidate_count=len(results.get("boxes") or []),
        filtered_count=len(regions),
        original_sizes=inputs["original_sizes"].tolist(),
        max_pred_sigmoid=debug_info["max_pred_sigmoid"],
        max_presence_sigmoid=debug_info["max_presence_sigmoid"],
    )
    return regions, debug


def run_pcs_combined(
    *,
    image: Image.Image,
    text: str,
    boxes: Iterable[Iterable[float]],
    labels: Optional[Iterable[int]],
    processor: Any,
    model: Any,
    device: str,
    confidence_threshold: float,
    mask_threshold: float,
    min_area_pixels: int,
) -> tuple[list[Sam3Region], Sam3Debug]:
    image_rgb = image.convert("RGB")
    input_boxes = [list(map(float, box)) for box in boxes]
    inputs = processor(
        images=image_rgb,
        text=text,
        input_boxes=[input_boxes],
        input_boxes_labels=[list(labels)] if labels is not None else None,
        return_tensors="pt",
    )
    inputs = _move_inputs(inputs, device)
    with torch.inference_mode():
        outputs = model(**inputs)
    debug_info = _extract_debug(outputs)
    results = _post_process_instances(processor, outputs, inputs, confidence_threshold, mask_threshold)
    regions = _regions_from_results(results, confidence_threshold, min_area_pixels)
    used_threshold = confidence_threshold
    if not regions and confidence_threshold > 0.3:
        logger.info("SAM-3 PCS combined fallback: retrying with threshold=0.3")
        results = _post_process_instances(processor, outputs, inputs, 0.3, mask_threshold)
        regions = _regions_from_results(results, 0.3, min_area_pixels)
        used_threshold = 0.3
    debug = Sam3Debug(
        used_threshold=used_threshold,
        candidate_count=len(results.get("boxes") or []),
        filtered_count=len(regions),
        original_sizes=inputs["original_sizes"].tolist(),
        max_pred_sigmoid=debug_info["max_pred_sigmoid"],
        max_presence_sigmoid=debug_info["max_presence_sigmoid"],
    )
    return regions, debug


def _mask_from_pipeline(result: Any) -> Optional[np.ndarray]:
    mask = result.get("mask") or result.get("segmentation")
    if mask is None:
        return None
    if isinstance(mask, Image.Image):
        mask = np.asarray(mask)
    mask_array = np.asarray(mask)
    if mask_array.ndim > 2:
        mask_array = mask_array.squeeze()
    return mask_array


def run_auto_mask(
    *,
    image: Image.Image,
    points_per_batch: Optional[int],
    confidence_threshold: float,
    min_area_pixels: int,
) -> tuple[list[Sam3Region], Sam3Debug]:
    try:  # pragma: no cover - optional dependency
        from transformers import pipeline
    except Exception as exc:
        raise RuntimeError("Transformers pipeline is required for AUTO_MASK") from exc

    pipe = pipeline("mask-generation", model="facebook/sam3")
    kwargs: dict[str, Any] = {}
    if points_per_batch:
        kwargs["points_per_batch"] = points_per_batch
    results = pipe(image, **kwargs)
    regions: list[Sam3Region] = []
    for item in results or []:
        score = float(item.get("score", 1.0))
        if score < confidence_threshold:
            continue
        mask_array = _mask_from_pipeline(item)
        if mask_array is None:
            continue
        if min_area_pixels and int(mask_array.sum()) < min_area_pixels:
            continue
        ys, xs = np.where(mask_array > 0)
        if ys.size == 0 or xs.size == 0:
            continue
        bbox = [float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())]
        regions.append(Sam3Region(bbox_xyxy=bbox, score=score, mask=mask_array))

    debug = Sam3Debug(
        used_threshold=confidence_threshold,
        candidate_count=len(results or []),
        filtered_count=len(regions),
        original_sizes=[[image.height, image.width]],
    )
    return regions, debug
