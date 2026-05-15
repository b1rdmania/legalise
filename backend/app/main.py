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
from app.api.auth import router as auth_router
from app.api.documents import router as documents_router
from app.api.modules import router as modules_router
from app.api.settings import router as settings_router
from app.core.audit import AuditMiddleware
from app.core.config import settings
from app.core.encryption import assert_auth_secrets_present, assert_master_key_present
from app.core.model_gateway import gateway as model_gateway
from app.core.seed import seed_demo_matter
from app.core.tools import register_phase_a_tools
from app.modules.chronology.router import router as chronology_router
from app.modules.letters.router import router as letters_router
from app.modules.case_law.router import router as case_law_router
from app.modules.contract_review.router import router as contract_review_router
from app.modules.pre_motion.router import router as pre_motion_router
from app.modules.tabular_review.router import router as tabular_review_router
from app.providers import register_providers

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks. Verifies database connectivity at boot."""
    # Refuse to boot in production if the encryption master key is missing —
    # without it, every previously-stored user API key becomes unreadable
    # after a restart. Dev gets a process-lifetime random key.
    assert_master_key_present()
    assert_auth_secrets_present()

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

    # Register Phase A model-callable tools (generate_docx, edit_document,
    # replicate_document). Each goes through the same posture/audit rails
    # as `gateway.call()`. Pydantic input/output models per tool; JSON Schema
    # derived on demand via `model_json_schema()`.
    register_phase_a_tools(model_gateway)

    # Wire the plugin bridge with the gateway and the plugins root.
    plugins_root = Path(settings.plugins_root)
    set_bridge(PluginBridge(plugins_root=plugins_root, gateway=model_gateway))
    logger.info(
        "legalise.startup.plugin_bridge",
        plugins_root=str(plugins_root),
        exists=plugins_root.exists(),
    )

    # Seed the demo matter in any environment that wants the workspace to be
    # non-empty on boot. The seed function is idempotent — existing Khan is
    # returned unchanged — so re-runs are safe. `demo` is the prod-shaped
    # alias for the live demo at legalise.dev where we want the seeded matter
    # to exist without flipping ENVIRONMENT to "development" (which would
    # also enable uvicorn --reload via entrypoint.sh).
    if settings.environment in {"development", "dev", "local", "demo"}:
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


app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(matters_router, prefix="/api/matters", tags=["matters"])
app.include_router(documents_router, prefix="/api/documents", tags=["documents"])
app.include_router(modules_router, prefix="/api/modules", tags=["modules"])

# Chronology module nests its routes under /api/matters/{slug}/chronology
# (and .../chronology/gate) so the audit middleware's matter-path matcher
# picks them up without special-casing.
app.include_router(chronology_router, prefix="/api/matters", tags=["chronology"])
app.include_router(letters_router, prefix="/api/matters", tags=["letters"])
app.include_router(pre_motion_router, prefix="/api/matters", tags=["pre-motion"])
app.include_router(tabular_review_router, prefix="/api/matters", tags=["tabular-review"])
app.include_router(case_law_router, prefix="/api/matters", tags=["case-law"])
app.include_router(contract_review_router, prefix="/api/matters", tags=["contract-review"])

# Remaining module routers land later in the build window.
# from app.modules.contract_review.router import router as contract_review_router
