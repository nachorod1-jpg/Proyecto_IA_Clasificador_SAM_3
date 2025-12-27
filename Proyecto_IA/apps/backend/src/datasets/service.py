from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

from PIL import UnidentifiedImageError
from sqlalchemy.orm import Session

from core.models import Dataset, Image
from core.utils import load_image

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def iter_images(root_path: Path) -> Iterable[Path]:
    for dirpath, _, filenames in os.walk(root_path):
        for filename in filenames:
            if Path(filename).suffix.lower() in SUPPORTED_EXTS:
                yield Path(dirpath) / filename


def index_dataset(db: Session, dataset: Dataset) -> None:
    for image_path in iter_images(Path(dataset.root_path)):
        rel_path = os.path.relpath(image_path, dataset.root_path)
        width = height = None
        status = "ready"
        try:
            img = load_image(image_path)
            width, height = img.size
        except (FileNotFoundError, UnidentifiedImageError, OSError):
            status = "error"

        img_record = Image(
            dataset_id=dataset.id,
            rel_path=rel_path,
            abs_path=str(image_path.resolve()),
            width=width,
            height=height,
            status=status,
        )
        db.add(img_record)
    db.commit()
