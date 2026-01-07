from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    root_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    images = relationship("Image", back_populates="dataset")


class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    rel_path = Column(String, nullable=False)
    abs_path = Column(String, nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    status = Column(String, default="ready")
    created_at = Column(DateTime, default=datetime.utcnow)

    dataset = relationship("Dataset", back_populates="images")
    regions = relationship("Region", back_populates="image")


class Concept(Base):
    __tablename__ = "concepts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    family = Column(String, nullable=False)
    color_hex = Column(String, nullable=False)
    level = Column(Integer, default=1)

    regions = relationship("Region", back_populates="concept")
    job_stats = relationship("JobStat", back_populates="concept")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_type = Column(String, nullable=False)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    params_json = Column(Text, nullable=False)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    processed_images = Column(Integer, default=0)
    total_images = Column(Integer, default=0)
    cursor_image_id = Column(Integer, nullable=True)

    dataset = relationship("Dataset")
    regions = relationship("Region", back_populates="job")
    stats = relationship("JobStat", back_populates="job")

    def params(self) -> dict:
        try:
            return json.loads(self.params_json)
        except json.JSONDecodeError:
            return {}


class Region(Base):
    __tablename__ = "regions"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    image_id = Column(Integer, ForeignKey("images.id"), nullable=False)
    concept_id = Column(Integer, ForeignKey("concepts.id"), nullable=True)
    bbox_json = Column(Text, nullable=False)
    score = Column(Float, nullable=False)
    mask_ref = Column(String, nullable=True)
    is_demo = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job", back_populates="regions")
    image = relationship("Image", back_populates="regions")
    concept = relationship("Concept", back_populates="regions")

    def bbox(self) -> list:
        try:
            return json.loads(self.bbox_json)
        except json.JSONDecodeError:
            return []


class JobStat(Base):
    __tablename__ = "job_stats"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    concept_id = Column(Integer, ForeignKey("concepts.id"), nullable=False)
    bucket_name = Column(String, nullable=False)
    count_images = Column(Integer, default=0)
    count_regions = Column(Integer, default=0)

    job = relationship("Job", back_populates="stats")
    concept = relationship("Concept", back_populates="job_stats")
