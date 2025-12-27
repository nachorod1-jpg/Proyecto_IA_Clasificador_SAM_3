from __future__ import annotations

import threading
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

from PIL import UnidentifiedImageError
from sqlalchemy import delete
from sqlalchemy.orm import Session

from core.config import get_settings
from core.logging_config import configure_job_logger
from core.models import Concept, Image, Job, JobStat, Region
from core.utils import load_image, serialize_bbox
from inference.sam3_runner import SAM3Runner
from stats.buckets import BucketDefinition, build_buckets, select_bucket

settings = get_settings()


class JobManager:
    def __init__(self, runner_factory: Callable[[Path], SAM3Runner]):
        self.runner_factory = runner_factory
        self.active_jobs: Dict[int, threading.Event] = {}

    def _get_weights_path(self) -> Optional[Path]:
        if settings.sam3_checkpoint_path:
            return Path(settings.sam3_checkpoint_path)
        if settings.sam3_weights_dir:
            return Path(settings.sam3_weights_dir)
        return None

    def _run_job(self, job_id: int):
        from core.database import SessionLocal

        cancel_event = self.active_jobs.get(job_id)
        session = SessionLocal()
        job_logger = configure_job_logger(job_id, settings.logs_dir)
        job: Job | None = session.get(Job, job_id)
        if not job:
            return

        weights_path = self._get_weights_path()
        if not weights_path or not weights_path.exists():
            job.status = "failed"
            job.error_message = "SAM-3 weights not found. Set SAM3_WEIGHTS_DIR or SAM3_CHECKPOINT_PATH."
            job.finished_at = datetime.utcnow()
            session.commit()
            job_logger.error(job.error_message)
            return

        runner = self.runner_factory(weights_path)
        try:
            runner.load_model()
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

        params = job.params()
        batch_size = max(1, int(params.get("batch_size", settings.default_batch_size)))
        target_long_side = int(params.get("target_long_side", settings.default_target_long_side))
        user_confidence = float(params.get("user_confidence", 0.5))
        max_images = params.get("max_images")
        buckets = build_buckets(user_confidence)

        concept_prompts = {int(c["concept_id"]): c["prompt_text"] for c in params.get("concepts", [])}

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

            for concept_id, prompt in concept_prompts.items():
                detections = []
                try:
                    detections = runner.run_pcs(pil_img, prompt, target_long_side)
                except RuntimeError as exc:
                    if "out of memory" in str(exc).lower() and batch_size > 1:
                        batch_size = 1
                        job_logger.warning("OOM detected. Reducing batch_size to 1 and retrying")
                        try:
                            detections = runner.run_pcs(pil_img, prompt, target_long_side)
                        except Exception as retry_exc:
                            job_logger.error(f"OOM retry failed for image {img.id}: {retry_exc}")
                            continue
                    else:
                        job_logger.error(f"Error during inference: {exc}")
                        continue
                except Exception as exc:
                    job_logger.error(f"Error during inference: {exc}")
                    continue

                for det in detections:
                    region = Region(
                        job_id=job.id,
                        image_id=img.id,
                        concept_id=concept_id,
                        bbox_json=serialize_bbox(det.bbox),
                        score=float(det.score),
                        mask_ref=str(det.mask_path) if det.mask_path else None,
                    )
                    session.add(region)
                session.commit()

            job.processed_images += 1
            job.cursor_image_id = img.id + 1
            session.commit()
            job_logger.info(f"Processed image {img.id} ({job.processed_images}/{job.total_images})")

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
            .filter(Region.job_id == job.id)
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
