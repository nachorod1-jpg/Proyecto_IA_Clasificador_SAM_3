from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class DatasetCreate(BaseModel):
    name: str
    root_path: str


class DatasetOut(BaseModel):
    id: int
    name: str
    root_path: str
    created_at: datetime

    class Config:
        from_attributes = True


class ConceptCreate(BaseModel):
    name: str
    family: str
    color_hex: str
    level: int = 1


class ConceptOut(BaseModel):
    id: int
    name: str
    family: str
    color_hex: str
    level: int

    class Config:
        from_attributes = True


class ConceptPrompt(BaseModel):
    concept_id: int
    prompt_text: str


class JobLevel1Request(BaseModel):
    dataset_id: int
    concepts: List[ConceptPrompt]
    user_confidence: float = Field(0.5, ge=0.0, le=1.0)
    batch_size: int = 1
    target_long_side: int = 768
    max_images: Optional[int] = None


class JobResponse(BaseModel):
    id: int
    status: str
    job_type: str
    dataset_id: int
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    error_message: Optional[str]
    processed_images: int
    total_images: int
    stats: Optional[dict] = None


class CancelResponse(BaseModel):
    job_id: int
    status: str


class SampleRegion(BaseModel):
    bbox: list
    score: float
    color_hex: str
    concept_name: str
    mask_ref: Optional[str]


class SampleImage(BaseModel):
    image_id: int
    rel_path: str
    abs_path: str
    regions: List[SampleRegion]


class HealthStatus(BaseModel):
    gpu_available: bool
    gpu_name: Optional[str] = None
    vram_mb: Optional[int] = None
    sam3_weights_ready: bool
    sam3_message: str
