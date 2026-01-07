from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Optional

from PIL import Image, ImageOps


def load_image(path: Path) -> Image.Image:
    with Image.open(path) as img:
        corrected = ImageOps.exif_transpose(img)
        return corrected.convert("RGB")


def serialize_bbox(bbox: Iterable[float]) -> str:
    return json.dumps(list(bbox))


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def resolve_safe_path(candidate: Path, allowed_roots: Iterable[Path]) -> Optional[Path]:
    resolved = candidate.expanduser().resolve(strict=False)
    for root in allowed_roots:
        root_resolved = root.expanduser().resolve(strict=False)
        if resolved == root_resolved or root_resolved in resolved.parents:
            return resolved
    return None
