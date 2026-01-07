from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from core.config import get_settings
from core.database import get_db
from core.models import Concept, Image, Job, JobStat, Region
from core.schemas import CancelResponse, JobImage, JobLevel1Request, JobResponse, SampleImage
from core.utils import resolve_safe_path
from jobs.manager import JobManager
from stats.buckets import build_buckets, select_bucket

router = APIRouter(prefix="/api/v1", tags=["jobs"])
job_manager: Optional[JobManager] = None


def set_job_manager(manager: JobManager):
    global job_manager
    job_manager = manager


def _job_to_response(job: Job, stats: Optional[dict] = None) -> JobResponse:
    params = job.params()
    return JobResponse(
        id=job.id,
        status=job.status,
        job_type=job.job_type,
        dataset_id=job.dataset_id,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        error_message=job.error_message,
        processed_images=job.processed_images,
        total_images=job.total_images,
        stats=stats,
        inference_method=params.get("inference_method") or "PCS_TEXT",
    )


def _collect_stats(job: Job, db: Session) -> dict:
    stats = {}
    for row in db.query(JobStat).filter(JobStat.job_id == job.id).all():
        concept_entry = stats.setdefault(row.concept_id, {})
        concept_entry[row.bucket_name] = {
            "count_images": row.count_images,
            "count_regions": row.count_regions,
        }
    return stats


@router.post("/jobs/level1", response_model=JobResponse)
def create_job(payload: JobLevel1Request, db: Session = Depends(get_db)):
    if not job_manager:
        raise HTTPException(status_code=500, detail="Job manager not configured")

    dataset_images = db.query(Image).filter(Image.dataset_id == payload.dataset_id).count()
    if dataset_images == 0:
        raise HTTPException(status_code=400, detail="Dataset has no images or does not exist")

    for concept_prompt in payload.concepts:
        concept = db.get(Concept, concept_prompt.concept_id)
        if not concept:
            raise HTTPException(status_code=400, detail=f"Concept {concept_prompt.concept_id} not found")

    params = payload.model_dump()
    job = Job(
        job_type="level1",
        dataset_id=payload.dataset_id,
        params_json=json.dumps(params),
        status="pending",
        processed_images=0,
        total_images=dataset_images,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    job_manager.launch_job(job)
    return _job_to_response(job)


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    stats = _collect_stats(job, db)
    return _job_to_response(job, stats)


@router.post("/jobs/{job_id}/cancel", response_model=CancelResponse)
def cancel_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job_manager:
        raise HTTPException(status_code=500, detail="Job manager not configured")
    job_manager.cancel(job_id)
    job.status = "cancelled"
    db.commit()
    return CancelResponse(job_id=job_id, status=job.status)


@router.post("/jobs/{job_id}/resume", response_model=JobResponse)
def resume_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job_manager:
        raise HTTPException(status_code=500, detail="Job manager not configured")
    job.status = "pending"
    job.error_message = None
    db.commit()
    job_manager.resume(job_id)
    stats = _collect_stats(job, db)
    return _job_to_response(job, stats)


@router.get("/jobs/{job_id}/samples", response_model=list[SampleImage])
def get_samples(
    job_id: int,
    concept_id: Optional[int] = Query(None),
    bucket: Optional[str] = Query(None),
    limit: int = Query(10, gt=0, le=100),
    image_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    params = job.params()
    buckets = build_buckets(float(params.get("user_confidence", 0.5)))

    regions_query = db.query(Region, Image, Concept).join(Image, Region.image_id == Image.id).join(Concept)
    regions_query = regions_query.filter(Region.job_id == job_id)
    if concept_id:
        regions_query = regions_query.filter(Region.concept_id == concept_id)
    target_image = None
    if image_id is not None:
        target_image = db.get(Image, image_id)
        if not target_image or target_image.dataset_id != job.dataset_id:
            raise HTTPException(status_code=404, detail="Image not found for job")
        regions_query = regions_query.filter(Region.image_id == image_id)

    regions = regions_query.all()

    filtered = []
    for region, image, concept in regions:
        bucket_name = select_bucket(region.score, buckets)
        if bucket and bucket_name != bucket:
            continue
        filtered.append((region, image, concept))
    filtered = filtered[:limit]

    images_map = {}
    for region, image, concept in filtered:
        bbox = region.bbox()
        bbox_xyxy = None
        if len(bbox) == 4:
            bbox_xyxy = [bbox[0], bbox[1], bbox[0] + bbox[2], bbox[1] + bbox[3]]
        img_entry = images_map.setdefault(
            image.id,
            {
                "image_id": image.id,
                "rel_path": image.rel_path,
                "abs_path": image.abs_path,
                "regions": [],
            },
        )
        img_entry["regions"].append(
            {
                "bbox": bbox,
                "score": region.score,
                "color_hex": concept.color_hex,
                "concept_name": concept.name,
                "concept_id": concept.id,
                "region_id": region.id,
                "mask_ref": region.mask_ref,
                "mask_url": f"/api/v1/masks/{job_id}/{image.id}/{region.id}.png" if region.mask_ref else None,
                "bbox_xyxy": bbox_xyxy,
            }
        )

    samples = [SampleImage(**value) for value in images_map.values()][:limit]
    if image_id is not None and target_image and not samples:
        samples = [
            SampleImage(
                image_id=target_image.id,
                rel_path=target_image.rel_path,
                abs_path=target_image.abs_path,
                regions=[],
            )
        ]
    return samples


@router.get("/jobs/{job_id}/images", response_model=list[JobImage])
def get_job_images(
    job_id: int,
    limit: int = Query(50, gt=0, le=200),
    db: Session = Depends(get_db),
):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    query = db.query(Image).filter(Image.dataset_id == job.dataset_id).order_by(Image.id)
    if job.cursor_image_id:
        query = query.filter(Image.id < job.cursor_image_id)
    elif job.processed_images:
        query = query.limit(job.processed_images)
    images = query.limit(limit).all()
    return [JobImage(image_id=img.id, rel_path=img.rel_path, abs_path=img.abs_path) for img in images]


@router.get("/jobs/{job_id}/masks/{mask_ref:path}")
def get_job_mask(job_id: int, mask_ref: str, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    settings = get_settings()
    candidate = Path(mask_ref)
    if not candidate.is_absolute():
        candidate = settings.resolve_masks_dir() / candidate
    resolved = resolve_safe_path(candidate, [settings.resolve_masks_dir(), settings.output_dir])
    if not resolved or not resolved.exists():
        raise HTTPException(status_code=404, detail="Mask not found")
    return FileResponse(resolved)


@router.get("/masks/{job_id}/{image_id}/{region_id}.png")
def get_mask_by_region(job_id: int, image_id: int, region_id: int, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    region = db.get(Region, region_id)
    if not region or region.job_id != job_id or region.image_id != image_id:
        raise HTTPException(status_code=404, detail="Region not found")
    if not region.mask_ref:
        raise HTTPException(status_code=404, detail="Mask not available")
    settings = get_settings()
    candidate = settings.resolve_masks_dir() / region.mask_ref
    resolved = resolve_safe_path(candidate, [settings.resolve_masks_dir(), settings.output_dir])
    if not resolved or not resolved.exists():
        raise HTTPException(status_code=404, detail="Mask not found")
    return FileResponse(resolved)
