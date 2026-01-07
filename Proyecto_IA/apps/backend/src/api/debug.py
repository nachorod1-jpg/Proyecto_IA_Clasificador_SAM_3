from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.config import get_settings
from core.database import get_db
from core.models import Image
from core.utils import load_image
from inference.sam3_methods import run_pcs_text
from inference.sam3_runner import SAM3Runner

router = APIRouter(prefix="/api/v1/debug", tags=["debug"])


@router.get("/sam3_smoketest")
def sam3_smoketest(
    dataset_id: int | None = Query(None),
    prompt: str = Query("person"),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    weights_path = settings.sam3_checkpoint_path or settings.sam3_weights_dir
    if not weights_path:
        raise HTTPException(status_code=400, detail="SAM-3 weights not configured")
    weights_path = Path(weights_path)
    if not weights_path.exists():
        raise HTTPException(status_code=404, detail="SAM-3 weights not found")

    query = db.query(Image)
    if dataset_id:
        query = query.filter(Image.dataset_id == dataset_id)
    image = query.order_by(Image.id).first()
    if not image:
        raise HTTPException(status_code=404, detail="No images available for smoketest")

    runner = SAM3Runner(weights_path)
    runner.load_model(safe_mode=True, device_preference="auto", box_threshold=0.5, mask_threshold=0.5)
    pil_img = load_image(Path(image.abs_path))
    detections, debug = run_pcs_text(
        image=pil_img,
        text=prompt,
        processor=runner.processor,
        model=runner.model,
        device=runner.device,
        confidence_threshold=0.5,
        mask_threshold=0.5,
        min_area_pixels=0,
    )
    return {
        "image_id": image.id,
        "prompt": prompt,
        "detections": len(detections),
        "debug": debug.__dict__,
    }
