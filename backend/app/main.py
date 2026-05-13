"""Legalise backend entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.audit import AuditMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks. Real init code lands in Week 1 Day 1."""
    yield


app = FastAPI(
    title="Legalise",
    version="0.1.0a0",
    description="UK legal AI workspace — backend.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuditMiddleware)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": app.version}


# Module routers wire in here during build week.
# from app.modules.matter.router import router as matter_router
# from app.modules.pre_motion.router import router as pre_motion_router
# from app.modules.chronology.router import router as chronology_router
# from app.modules.contract_review.router import router as contract_review_router
# from app.modules.letters.router import router as letters_router
#
# app.include_router(matter_router, prefix="/api/matters", tags=["matters"])
# app.include_router(pre_motion_router, prefix="/api/pre-motion", tags=["pre-motion"])
# app.include_router(chronology_router, prefix="/api/chronology", tags=["chronology"])
# app.include_router(contract_review_router, prefix="/api/contract-review", tags=["contract-review"])
# app.include_router(letters_router, prefix="/api/letters", tags=["letters"])
