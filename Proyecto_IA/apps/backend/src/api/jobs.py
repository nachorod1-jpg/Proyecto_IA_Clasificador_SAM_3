from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.models import Concept, Image, Job, JobStat, Region
from core.schemas import CancelResponse, JobLevel1Request, JobResponse, SampleImage
from jobs.manager import JobManager
from stats.buckets import build_buckets, select_bucket

router = APIRouter(prefix="/api/v1", tags=["jobs"])
job_manager: Optional[JobManager] = None


def set_job_manager(manager: JobManager):
    global job_manager
    job_manager = manager


def _job_to_response(job: Job, stats: Optional[dict] = None) -> JobResponse:
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
                "bbox": region.bbox(),
                "score": region.score,
                "color_hex": concept.color_hex,
                "concept_name": concept.name,
                "mask_ref": region.mask_ref,
            }
        )

    return [SampleImage(**value) for value in images_map.values()][:limit]
