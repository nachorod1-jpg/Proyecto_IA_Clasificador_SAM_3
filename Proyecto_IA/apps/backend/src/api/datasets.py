from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.models import Dataset, Image
from core.schemas import DatasetCreate, DatasetOut
from datasets.service import index_dataset

router = APIRouter(prefix="/api/v1", tags=["datasets"])


@router.post("/datasets", response_model=DatasetOut)
def create_dataset(payload: DatasetCreate, db: Session = Depends(get_db)):
    root_path = Path(payload.root_path)
    if not root_path.exists():
        raise HTTPException(status_code=400, detail="root_path does not exist")
    dataset = Dataset(name=payload.name, root_path=str(root_path.resolve()))
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    index_dataset(db, dataset)
    return dataset


@router.get("/datasets/{dataset_id}", response_model=DatasetOut)
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset
