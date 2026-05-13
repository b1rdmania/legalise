"""Legalise backend entrypoint."""

from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.audit import AuditMiddleware
from app.core.config import settings

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks. Verifies database connectivity at boot."""
    engine = create_async_engine(settings.postgres_dsn, echo=False)
    app.state.engine = engine
    app.state.session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("legalise.startup.db_ok", dsn_host=settings.postgres_dsn.split("@")[-1].split("/")[0])
    except Exception as exc:
        logger.error("legalise.startup.db_unreachable", error=str(exc))
        # Allow boot to continue so /health can report the state — useful in dev.

    yield

    await engine.dispose()
    logger.info("legalise.shutdown")


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
async def health() -> dict[str, Any]:
    """Liveness probe + DB connectivity check."""
    db_status = "unknown"
    try:
        engine = app.state.engine
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as exc:
        db_status = f"error: {type(exc).__name__}"

    return {
        "status": "ok",
        "version": app.version,
        "database": db_status,
        "environment": settings.environment,
    }


# Module routers wire in here during the v0.1 build window.
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
