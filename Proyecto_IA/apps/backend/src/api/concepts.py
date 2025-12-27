from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.models import Concept
from core.schemas import ConceptCreate, ConceptOut

router = APIRouter(prefix="/api/v1", tags=["concepts"])


@router.post("/concepts", response_model=ConceptOut)
def create_or_update_concept(payload: ConceptCreate, db: Session = Depends(get_db)):
    concept = db.query(Concept).filter(Concept.name == payload.name).first()
    if concept:
        concept.family = payload.family
        concept.color_hex = payload.color_hex
        concept.level = payload.level
    else:
        concept = Concept(
            name=payload.name,
            family=payload.family,
            color_hex=payload.color_hex,
            level=payload.level,
        )
        db.add(concept)
    db.commit()
    db.refresh(concept)
    return concept


@router.get("/concepts", response_model=list[ConceptOut])
def list_concepts(db: Session = Depends(get_db)):
    return db.query(Concept).all()
