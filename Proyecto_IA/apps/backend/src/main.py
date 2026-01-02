from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api import concepts as concepts_router
from api import datasets as datasets_router
from api import health as health_router
from api import images as images_router
from api import jobs as jobs_router
from api import logs as logs_router
from core.config import get_settings
from core.database import Base, engine
from core.logging_config import configure_backend_logging
from core.models import Concept
from inference.sam3_runner import SAM3Runner
from jobs.manager import JobManager

settings = get_settings()
configure_backend_logging(settings.logs_dir)
app = FastAPI(title="Proyecto IA Backend")


@app.on_event("startup")
def startup_event():
    Base.metadata.create_all(bind=engine)
    _seed_concepts()
    manager = JobManager(lambda weights_path: SAM3Runner(weights_path))
    jobs_router.set_job_manager(manager)


FRONTEND_DIST = Path(__file__).resolve().parents[3] / "frontend" / "dist"


def _seed_concepts():
    from core.database import SessionLocal

    defaults = [
        {"name": "facade", "family": "FACADE", "color_hex": "#ff9800", "level": 1},
        {"name": "roof", "family": "ROOF", "color_hex": "#4caf50", "level": 1},
        {"name": "window", "family": "OPENING", "color_hex": "#2196f3", "level": 1},
    ]
    session = SessionLocal()
    try:
        for item in defaults:
            concept = session.query(Concept).filter(Concept.name == item["name"]).first()
            if not concept:
                session.add(Concept(**item))
        session.commit()
    finally:
        session.close()


app.include_router(health_router.router)
app.include_router(datasets_router.router)
app.include_router(concepts_router.router)
app.include_router(jobs_router.router)
app.include_router(images_router.router)
app.include_router(logs_router.router)


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    index_file = FRONTEND_DIST / "index.html"
    if FRONTEND_DIST.exists() and index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Not Found")
