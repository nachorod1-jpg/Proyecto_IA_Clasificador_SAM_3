from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass
class BucketDefinition:
    name: str
    min_score: float
    max_score: float


@dataclass
class BucketStats:
    bucket_name: str
    count_images: int
    count_regions: int


BUCKET_MAX = 0.9


def build_buckets(user_confidence: float) -> List[BucketDefinition]:
    diff = BUCKET_MAX - user_confidence
    step = diff / 3 if diff > 0 else 0
    b1 = BUCKET_MAX - step
    b2 = BUCKET_MAX - 2 * step
    return [
        BucketDefinition(name="max", min_score=BUCKET_MAX, max_score=1.0),
        BucketDefinition(name="b1", min_score=b1, max_score=BUCKET_MAX),
        BucketDefinition(name="b2", min_score=b2, max_score=b1),
        BucketDefinition(name="min", min_score=user_confidence, max_score=b2),
    ]


def select_bucket(score: float, buckets: List[BucketDefinition]) -> str | None:
    for bucket in buckets:
        if bucket.min_score <= score <= bucket.max_score:
            return bucket.name
    return None
