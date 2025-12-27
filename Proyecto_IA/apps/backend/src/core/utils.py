from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageOps


def load_image(path: Path) -> Image.Image:
    with Image.open(path) as img:
        corrected = ImageOps.exif_transpose(img)
        return corrected.convert("RGB")


def serialize_bbox(bbox: Iterable[float]) -> str:
    return json.dumps(list(bbox))


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
