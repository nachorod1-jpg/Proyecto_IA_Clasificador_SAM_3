from __future__ import annotations

import logging
import math
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

from PIL import Image, ImageDraw, UnidentifiedImageError
from sqlalchemy import delete
from sqlalchemy.orm import Session

from core.config import get_settings
from core.logging_config import configure_job_logger
from core.models import Concept, Image, Job, JobStat, Region
from core.utils import ensure_dir, load_image, serialize_bbox
from inference.sam3_methods import run_auto_mask, run_pcs_box, run_pcs_combined, run_pcs_text
from inference.sam3_runner import SAM3Runner
from stats.buckets import BucketDefinition, build_buckets, select_bucket

logger = logging.getLogger(__name__)

settings = get_settings()


def build_demo_boxes(width: int, height: int, count: int) -> List[List[float]]:
    if count <= 0 or width <= 0 or height <= 0:
        return []
    cols = min(3, max(1, count))
    rows = int(math.ceil(count / cols))
    margin_x = width * 0.06
    margin_y = height * 0.06
    cell_width = (width - 2 * margin_x) / cols
    cell_height = (height - 2 * margin_y) / rows
    box_width = cell_width * 0.65
    box_height = cell_height * 0.6
    boxes: List[List[float]] = []
    for idx in range(count):
        row = idx // cols
        col = idx % cols
        x0 = margin_x + col * cell_width + (cell_width - box_width) / 2
        y0 = margin_y + row * cell_height + (cell_height - box_height) / 2
        x1 = x0 + box_width
        y1 = y0 + box_height
        boxes.append([float(x0), float(y0), float(x1), float(y1)])
    return boxes


class JobManager:
    def __init__(self, runner_factory: Callable[[Path], SAM3Runner]):
        self.runner_factory = runner_factory
        self.active_jobs: Dict[int, threading.Event] = {}
        self._runner: Optional[SAM3Runner] = None
        self._runner_weights_path: Optional[Path] = None
        self._runner_lock = threading.Lock()

    def _get_weights_path(self) -> Optional[Path]:
        if settings.sam3_checkpoint_path:
            return Path(settings.sam3_checkpoint_path)
        if settings.sam3_weights_dir:
            return Path(settings.sam3_weights_dir)
        return None

    def _get_runner(self, weights_path: Path) -> SAM3Runner:
        with self._runner_lock:
            if self._runner is None or self._runner_weights_path != weights_path:
                if self._runner is not None:
                    try:
                        self._runner.unload()
                        logger.info(
                            "Unloaded previous SAM-3 runner for %s before switching to %s",
                            self._runner_weights_path,
                            weights_path,
                        )
                    except Exception as exc:  # pragma: no cover - defensive logging
                        logger.warning("Failed to unload previous SAM-3 runner: %s", exc)
                self._runner = self.runner_factory(weights_path)
                self._runner_weights_path = weights_path
                logger.info("Created SAM-3 runner for weights at %s", weights_path)
            return self._runner

    def _run_job(self, job_id: int):
        from core.database import SessionLocal

        cancel_event = self.active_jobs.get(job_id)
        session = SessionLocal()
        job_logger = configure_job_logger(job_id, settings.logs_dir)
        job: Job | None = session.get(Job, job_id)
        if not job:
            return

        params = job.params()
        safe_mode = bool(params.get("safe_mode", True))
        safe_load = True if params.get("safe_load") is None else bool(params.get("safe_load"))
        device_preference_param = params.get("device_preference")
        device_preference = str(device_preference_param or "auto").lower()
        if device_preference_param is None:
            inferred_device = None
            if safe_mode:
                inferred_device = "cpu"
            else:
                try:  # pragma: no cover - optional dependency
                    import torch

                    inferred_device = "cuda" if torch.cuda.is_available() else "cpu"
                except Exception:
                    inferred_device = "cpu"
            device_preference = inferred_device
            job_logger.info(f"Legacy job detected: inferred device_preference={device_preference}")
        target_long_side_param = params.get("target_long_side")
        target_long_side = (
            int(target_long_side_param)
            if target_long_side_param is not None
            else (512 if safe_mode else settings.default_target_long_side)
        )

        box_threshold_param = params.get("box_threshold")
        box_threshold = (
            float(box_threshold_param)
            if box_threshold_param is not None
            else (0.5 if safe_mode else 0.3)
        )

        thresholds = params.get("thresholds") or {}
        confidence_threshold = float(thresholds.get("confidence_threshold", box_threshold))
        mask_threshold = float(thresholds.get("mask_threshold", 0.5))
        min_area_pixels = int(thresholds.get("min_area_pixels", 0))
        output_controls = params.get("output_controls") or {}
        return_masks = bool(output_controls.get("return_masks", True))
        return_boxes = bool(output_controls.get("return_boxes", True))

        max_detections_param = params.get("max_detections_per_image")
        max_detections = (
            int(max_detections_param)
            if max_detections_param is not None
            else (20 if safe_mode else 100)
        )

        sleep_param = params.get("sleep_ms_between_images")
        sleep_ms_between_images = (
            int(sleep_param)
            if sleep_param is not None
            else (200 if safe_mode else 0)
        )
        user_confidence = float(params.get("user_confidence", 0.5))
        max_images = params.get("max_images")
        buckets = build_buckets(user_confidence)

        concept_prompts = {int(c["concept_id"]): c.get("prompt_text") for c in params.get("concepts", [])}
        inference_method = params.get("inference_method") or "PCS_TEXT"
        prompt_payload = params.get("prompt_payload") or {}
        payload_text = prompt_payload.get("text")
        payload_text = payload_text.strip() if isinstance(payload_text, str) else None
        demo_mode = bool(params.get("demo_mode", False))
        demo_overlays = params.get("demo_overlays") or {}
        demo_overlays_enabled = bool(demo_overlays.get("enabled", False))
        demo_count_per_image = int(demo_overlays.get("count_per_image", 3) or 3)
        demo_include_masks = bool(demo_overlays.get("include_masks", True))
        if inference_method == "AUTO_MASK" and len(concept_prompts) > 1:
            first_concept_id = next(iter(concept_prompts))
            job_logger.info(
                "AUTO_MASK only supports a single concept. Using concept_id=%s",
                first_concept_id,
            )
            concept_prompts = {first_concept_id: concept_prompts[first_concept_id]}

        weights_path = self._get_weights_path()
        if not weights_path or not weights_path.exists():
            job.status = "failed"
            job.error_message = "SAM-3 weights not found. Set SAM3_WEIGHTS_DIR or SAM3_CHECKPOINT_PATH."
            job.finished_at = datetime.utcnow()
            session.commit()
            job_logger.error(job.error_message)
            return

        runner = self._get_runner(weights_path)
        try:
            runner.load_model(
                safe_mode=safe_mode,
                safe_load=safe_load,
                device_preference=device_preference,
                dtype_preference=params.get("dtype_preference", "auto"),
                box_threshold=confidence_threshold,
                mask_threshold=mask_threshold,
            )
        except Exception as exc:  # pragma: no cover - external dependency
            job.status = "failed"
            job.error_message = str(exc)
            job.finished_at = datetime.utcnow()
            session.commit()
            job_logger.error(job.error_message)
            return

        job_logger.info(f"Starting job {job_id} on device {runner.device}")
        job.status = "running"
        job.started_at = datetime.utcnow()
        session.commit()

        images_query = session.query(Image).filter(Image.dataset_id == job.dataset_id).order_by(Image.id)
        if job.cursor_image_id:
            images_query = images_query.filter(Image.id >= job.cursor_image_id)
        if max_images:
            images_query = images_query.limit(max_images)

        images = images_query.all()
        job.total_images = len(images)
        session.commit()

        for img in images:
            if cancel_event and cancel_event.is_set():
                job_logger.info("Cancellation requested")
                job.status = "cancelled"
                job.finished_at = datetime.utcnow()
                session.commit()
                return

            # idempotent: remove existing regions for this image and job
            session.execute(delete(Region).where(Region.job_id == job.id, Region.image_id == img.id))
            session.commit()

            try:
                pil_img = load_image(Path(img.abs_path))
            except (FileNotFoundError, UnidentifiedImageError, OSError) as exc:
                img.status = "error"
                session.commit()
                job_logger.error(f"Failed to load image {img.abs_path}: {exc}")
                continue

            image_real_detections = 0
            for concept_id, prompt in concept_prompts.items():
                try:
                    detections = []
                    debug = None
                    prompt_text = None
                    if inference_method == "PCS_TEXT":
                        prompt_text = payload_text or (str(prompt).strip() if prompt else None)
                        if not prompt_text:
                            raise RuntimeError("PCS_TEXT requires prompt_payload.text or concept prompt_text")
                        detections, debug = run_pcs_text(
                            image=pil_img,
                            text=prompt_text,
                            processor=runner.processor,
                            model=runner.model,
                            device=runner.device,
                            confidence_threshold=confidence_threshold,
                            mask_threshold=mask_threshold,
                            min_area_pixels=min_area_pixels,
                        )
                    elif inference_method == "PCS_BOX":
                        boxes = prompt_payload.get("input_boxes") or []
                        labels = prompt_payload.get("input_boxes_labels")
                        if not boxes:
                            raise RuntimeError("PCS_BOX requires input_boxes in prompt_payload")
                        detections, debug = run_pcs_box(
                            image=pil_img,
                            boxes=boxes,
                            labels=labels,
                            processor=runner.processor,
                            model=runner.model,
                            device=runner.device,
                            confidence_threshold=confidence_threshold,
                            mask_threshold=mask_threshold,
                            min_area_pixels=min_area_pixels,
                        )
                    elif inference_method == "PCS_COMBINED":
                        if not payload_text:
                            raise RuntimeError("PCS_COMBINED requires prompt_payload.text")
                        boxes = prompt_payload.get("input_boxes") or []
                        labels = prompt_payload.get("input_boxes_labels")
                        if not boxes:
                            raise RuntimeError("PCS_COMBINED requires input_boxes in prompt_payload")
                        detections, debug = run_pcs_combined(
                            image=pil_img,
                            text=payload_text,
                            boxes=boxes,
                            labels=labels,
                            processor=runner.processor,
                            model=runner.model,
                            device=runner.device,
                            confidence_threshold=confidence_threshold,
                            mask_threshold=mask_threshold,
                            min_area_pixels=min_area_pixels,
                        )
                    elif inference_method == "AUTO_MASK":
                        detections, debug = run_auto_mask(
                            image=pil_img,
                            points_per_batch=prompt_payload.get("points_per_batch"),
                            confidence_threshold=confidence_threshold,
                            min_area_pixels=min_area_pixels,
                        )
                    else:
                        raise RuntimeError(f"Inference method not supported: {inference_method}")

                    if debug:
                        job_logger.info(
                            "SAM3 debug: method=%s prompt=%s threshold=%.2f mask_threshold=%.2f min_area=%s original_sizes=%s "
                            "candidates=%s filtered=%s max_pred_sigmoid=%s max_presence_sigmoid=%s",
                            inference_method,
                            prompt_text or payload_text,
                            debug.used_threshold,
                            mask_threshold,
                            min_area_pixels,
                            debug.original_sizes,
                            debug.candidate_count,
                            debug.filtered_count,
                            debug.max_pred_sigmoid,
                            debug.max_presence_sigmoid,
                        )
                except Exception as exc:
                    job_logger.error(f"Error during inference: {exc}")
                    img.status = "error"
                    session.commit()
                    continue

                detections.sort(key=lambda det: det.score, reverse=True)
                if max_detections:
                    detections = detections[:max_detections]
                image_real_detections += len(detections)

                for det in detections:
                    bbox_xyxy = det.bbox_xyxy
                    if return_boxes:
                        x0, y0, x1, y1 = bbox_xyxy
                        bbox = [x0, y0, max(0.0, x1 - x0), max(0.0, y1 - y0)]
                    else:
                        bbox = [0.0, 0.0, 0.0, 0.0]
                    region = Region(
                        job_id=job.id,
                        image_id=img.id,
                        concept_id=concept_id,
                        bbox_json=serialize_bbox(bbox),
                        score=float(det.score),
                        mask_ref=None,
                    )
                    session.add(region)
                    session.flush()
                    if return_masks and det.mask is not None:
                        masks_dir = settings.resolve_masks_dir() / str(job.id) / str(img.id)
                        ensure_dir(masks_dir)
                        mask_path = masks_dir / f"{region.id}.png"
                        mask = (det.mask > 0).astype("uint8") * 255
                        Image.fromarray(mask).save(mask_path)
                        region.mask_ref = str(mask_path.relative_to(settings.resolve_masks_dir()))
                session.commit()

            if demo_mode and demo_overlays_enabled and image_real_detections == 0:
                demo_concept_id = next(iter(concept_prompts.keys()), None)
                demo_boxes = build_demo_boxes(pil_img.width, pil_img.height, demo_count_per_image)
                for demo_box in demo_boxes:
                    x0, y0, x1, y1 = demo_box
                    bbox = [x0, y0, max(0.0, x1 - x0), max(0.0, y1 - y0)]
                    region = Region(
                        job_id=job.id,
                        image_id=img.id,
                        concept_id=demo_concept_id,
                        bbox_json=serialize_bbox(bbox),
                        score=0.0,
                        mask_ref=None,
                        is_demo=True,
                    )
                    session.add(region)
                    session.flush()
                    if return_masks and demo_include_masks:
                        masks_dir = settings.resolve_masks_dir() / str(job.id) / str(img.id)
                        ensure_dir(masks_dir)
                        mask_path = masks_dir / f"{region.id}.png"
                        mask_image = Image.new("L", (pil_img.width, pil_img.height), 0)
                        draw = ImageDraw.Draw(mask_image)
                        draw.rectangle([x0, y0, x1, y1], fill=255)
                        mask_image.save(mask_path)
                        region.mask_ref = str(mask_path.relative_to(settings.resolve_masks_dir()))
                session.commit()

            job.processed_images += 1
            job.cursor_image_id = img.id + 1
            session.commit()
            job_logger.info(f"Processed image {img.id} ({job.processed_images}/{job.total_images})")

            if sleep_ms_between_images > 0:
                time.sleep(sleep_ms_between_images / 1000)

        self._calculate_stats(session, job, buckets)
        job.status = "completed"
        job.finished_at = datetime.utcnow()
        session.commit()
        job_logger.info("Job completed")

    def _calculate_stats(self, session: Session, job: Job, buckets: List[BucketDefinition]):
        session.query(JobStat).filter(JobStat.job_id == job.id).delete()
        session.commit()
        regions = (
            session.query(Region, Concept)
            .join(Concept, Region.concept_id == Concept.id)
            .filter(Region.job_id == job.id, Region.is_demo.is_(False))
            .all()
        )
        by_concept: Dict[int, Dict[str, List[int]]] = {}
        for region, concept in regions:
            bucket_name = select_bucket(region.score, buckets)
            if not bucket_name:
                continue
            concept_map = by_concept.setdefault(concept.id, {})
            bucket_map = concept_map.setdefault(bucket_name, [])
            bucket_map.append(region.image_id)

        for concept_id, bucket_data in by_concept.items():
            for bucket_name, image_ids in bucket_data.items():
                count_images = len(set(image_ids))
                count_regions = len(image_ids)
                session.add(
                    JobStat(
                        job_id=job.id,
                        concept_id=concept_id,
                        bucket_name=bucket_name,
                        count_images=count_images,
                        count_regions=count_regions,
                    )
                )
        session.commit()

    def launch_job(self, job: Job):
        cancel_event = threading.Event()
        self.active_jobs[job.id] = cancel_event
        thread = threading.Thread(target=self._run_job, args=(job.id,), daemon=True)
        thread.start()

    def cancel(self, job_id: int) -> bool:
        event = self.active_jobs.get(job_id)
        if event:
            event.set()
            return True
        return False

    def resume(self, job_id: int):
        cancel_event = self.active_jobs.get(job_id)
        if cancel_event and cancel_event.is_set():
            cancel_event.clear()
        thread = threading.Thread(target=self._run_job, args=(job_id,), daemon=True)
        thread.start()
        self.active_jobs[job_id] = cancel_event or threading.Event()
