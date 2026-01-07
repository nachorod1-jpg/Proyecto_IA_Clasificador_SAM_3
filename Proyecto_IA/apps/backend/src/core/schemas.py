from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field
from typing_extensions import Literal


class DatasetCreate(BaseModel):
    name: str
    root_path: str


class DatasetOut(BaseModel):
    id: int
    name: str
    root_path: str
    created_at: datetime
    num_images: Optional[int] = None

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


InferenceMethod = Literal[
    "PCS_TEXT",
    "PCS_BOX",
    "PCS_COMBINED",
    "AUTO_MASK",
    "TRACKER_POINT",
    "TRACKER_BOX",
]


class PromptPayload(BaseModel):
    text: Optional[str] = None
    language: Optional[Literal["en", "es"]] = None
    input_boxes: Optional[List[List[float]]] = None
    input_boxes_labels: Optional[List[int]] = None
    input_points: Optional[List[List[float]]] = None
    input_labels: Optional[List[int]] = None
    points_per_batch: Optional[int] = None


class ThresholdsPayload(BaseModel):
    confidence_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    mask_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    min_area_pixels: Optional[int] = Field(None, ge=0)


class OutputControlsPayload(BaseModel):
    return_masks: Optional[bool] = True
    return_boxes: Optional[bool] = True
    return_polygons: Optional[bool] = False


class JobLevel1Request(BaseModel):
    dataset_id: int
    concepts: List[ConceptPrompt]
    user_confidence: float = Field(0.5, ge=0.0, le=1.0)
    batch_size: int = 1
    safe_mode: bool = True
    device_preference: Literal["auto", "cpu", "cuda"] = "auto"
    target_long_side: Optional[int] = None
    box_threshold: Optional[float] = None
    max_detections_per_image: Optional[int] = None
    sleep_ms_between_images: Optional[int] = None
    max_images: Optional[int] = None
    inference_method: Optional[InferenceMethod] = None
    prompt_payload: Optional[PromptPayload] = None
    thresholds: Optional[ThresholdsPayload] = None
    output_controls: Optional[OutputControlsPayload] = None


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
    inference_method: Optional[InferenceMethod] = None


class CancelResponse(BaseModel):
    job_id: int
    status: str


class SampleRegion(BaseModel):
    bbox: list
    score: float
    color_hex: str
    concept_name: str
    concept_id: Optional[int] = None
    region_id: Optional[int] = None
    mask_ref: Optional[str]
    mask_url: Optional[str] = None
    bbox_xyxy: Optional[list] = None


class SampleImage(BaseModel):
    image_id: int
    rel_path: str
    abs_path: str
    regions: List[SampleRegion]


class JobImage(BaseModel):
    image_id: int
    rel_path: str
    abs_path: str


class HealthStatus(BaseModel):
    gpu_available: bool
    gpu_name: Optional[str] = None
    vram_mb: Optional[int] = None
    sam3_weights_ready: bool
    sam3_message: str
    sam3_import_ok: bool
    sam3_import_error: Optional[str] = None
    sam3_import_traceback: Optional[str] = None
    python_executable: str
    transformers_version: Optional[str] = None
    transformers_file: Optional[str] = None
    sam3_symbols: list[str] = Field(default_factory=list)
