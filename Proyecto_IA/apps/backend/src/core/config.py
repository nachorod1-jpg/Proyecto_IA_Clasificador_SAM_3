from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_path: Path = Path("data/app.db")
    logs_dir: Path = Path("logs")
    output_dir: Path = Path("output")
    masks_dir: Optional[Path] = None
    thumbs_dir: Optional[Path] = None

    sam3_weights_dir: Optional[Path] = None
    sam3_checkpoint_path: Optional[Path] = None

    default_batch_size: int = 1
    default_target_long_side: int = 768

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def resolve_masks_dir(self) -> Path:
        return (self.masks_dir or (self.output_dir / "masks")).resolve()

    def resolve_thumbs_dir(self) -> Path:
        return (self.thumbs_dir or (self.output_dir / "thumbs")).resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.logs_dir.mkdir(parents=True, exist_ok=True)
    settings.output_dir.mkdir(parents=True, exist_ok=True)
    settings.resolve_masks_dir().mkdir(parents=True, exist_ok=True)
    settings.resolve_thumbs_dir().mkdir(parents=True, exist_ok=True)
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    return settings
