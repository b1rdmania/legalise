"""Legalise backend entrypoint."""

from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from pathlib import Path

from app.adapters.plugin_bridge import PluginBridge, set_bridge
from app.api import matters_router
from app.core.audit import AuditMiddleware
from app.core.config import settings
from app.core.model_gateway import gateway as model_gateway
from app.core.seed import seed_demo_matter
from app.modules.chronology.router import router as chronology_router
from app.modules.pre_motion.router import router as pre_motion_router
from app.providers import register_providers

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

    # Register every provider whose credentials/service is reachable.
    # stub-echo is always available as a fallback so the workspace runs
    # without keys. Ollama is probed before registration so a missing
    # `local-models` compose profile doesn't poison B_mixed routing.
    await register_providers(model_gateway)

    # Wire the plugin bridge with the gateway and the plugins root.
    plugins_root = Path(settings.plugins_root)
    set_bridge(PluginBridge(plugins_root=plugins_root, gateway=model_gateway))
    logger.info(
        "legalise.startup.plugin_bridge",
        plugins_root=str(plugins_root),
        exists=plugins_root.exists(),
    )

    # Seed the demo matter in development so the workspace is never empty.
    if settings.environment in {"development", "dev", "local"}:
        try:
            async with app.state.session_factory() as session:
                matter = await seed_demo_matter(session)
            logger.info("legalise.startup.seed_ok", slug=matter.slug)
        except Exception as exc:
            logger.warning("legalise.startup.seed_failed", error=str(exc))

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


app.include_router(matters_router, prefix="/api/matters", tags=["matters"])

# Chronology module nests its routes under /api/matters/{slug}/chronology
# (and .../chronology/gate) so the audit middleware's matter-path matcher
# picks them up without special-casing.
app.include_router(chronology_router, prefix="/api/matters", tags=["chronology"])
app.include_router(pre_motion_router, prefix="/api/matters", tags=["pre-motion"])

# Remaining module routers land later in the build window.
# from app.modules.letters.router import router as letters_router
# from app.modules.contract_review.router import router as contract_review_router
