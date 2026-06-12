"""Legalise backend entrypoint."""

import asyncio
from contextlib import asynccontextmanager
from typing import Any

import structlog
from alembic.config import Config as AlembicConfig
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from pathlib import Path

from app.api import matters_router
from app.api.account import router as account_router
from app.api.auth import router as auth_router
from app.api.documents import router as documents_router
from app.api.exports import router as exports_router
from app.api.jobs import router as jobs_router
from app.api.admin_users import router as admin_users_router
from app.api.artifacts import router as artifacts_router
from app.api.audit import router as audit_router, admin_router as audit_admin_router
from app.api.grants import router as grants_router
from app.api.reviews import router as reviews_router
from app.api.signoffs import router as signoffs_router
from app.api.invocations import router as invocations_router
from app.api.modules import router as modules_router
from app.api.lawve_import import router as lawve_import_router
from app.api.demo import router as demo_router
from app.api.system import router as system_router
from app.api.settings import router as settings_router
from app.api.usage import router as usage_router
from app.api.workspace import router as workspace_router
from app.api.matter_context import (
    schema_router as matter_context_schema_router,
    items_router as matter_context_items_router,
)
from app.api.advice_boundary import router as advice_boundary_router
from app.api.agent_evals import router as agent_evals_router
from app.core.audit import AuditMiddleware
from app.core.capabilities import CapabilityDenied
from app.core.config import settings
from app.core.observability import init_observability
from app.core.encryption import assert_auth_secrets_present, assert_master_key_present
from app.core.model_gateway import gateway as model_gateway
from app.core.seed import seed_demo_matter
from app.core.tools import register_phase_a_tools
from app.modules.assistant.router import router as assistant_router
from app.modules.chronology.router import router as chronology_router
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

    # Unit 8 — observability: configure structlog + global exception handler.
    # Must run before any log emission so the processor chain is in place.
    init_observability(app)

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

    # Unit 3 — migration discipline: check that the DB schema matches the
    # code's head revision. In production, a schema mismatch is fatal: the
    # app refuses to serve traffic rather than silently misbehaving on stale
    # schema. In dev/local environments, the mismatch is logged but boot
    # continues (the next entrypoint.sh run will migrate, or the developer
    # can run `alembic upgrade head` manually).
    _DEV_ENVIRONMENTS = {"development", "dev", "local"}
    _is_dev_env = settings.environment in _DEV_ENVIRONMENTS
    try:
        alembic_cfg = AlembicConfig("alembic.ini")
        script = ScriptDirectory.from_config(alembic_cfg)
        head_revision = script.get_current_head()

        # Inspect DB revision synchronously via a raw sync connection to keep
        # this out of the async engine (MigrationContext uses sync DBAPI).
        # Use psycopg v3 as the sync driver — stripping the driver hint
        # back to plain `postgresql://` would default SQLAlchemy to
        # psycopg2, which isn't installed.
        from sqlalchemy import create_engine as _sync_engine
        _sync_dsn = settings.postgres_dsn.replace("+asyncpg", "+psycopg")
        _sync_eng = _sync_engine(_sync_dsn, echo=False)
        try:
            with _sync_eng.connect() as _sync_conn:
                ctx = MigrationContext.configure(_sync_conn)
                current_revision = ctx.get_current_revision()
        finally:
            _sync_eng.dispose()

        if current_revision != head_revision:
            msg = (
                f"DB schema is behind code — run `alembic upgrade head` via "
                f"deploy release step before serving traffic. "
                f"(current={current_revision!r}, head={head_revision!r})"
            )
            if _is_dev_env:
                logger.warning("legalise.startup.schema_behind", current=current_revision, head=head_revision)
            else:
                logger.error("legalise.startup.schema_behind_fatal", current=current_revision, head=head_revision)
                raise RuntimeError(msg)
        else:
            logger.info("legalise.startup.schema_ok", revision=current_revision)
    except RuntimeError:
        raise
    except Exception as exc:
        # If alembic.ini is missing (e.g. tests), log and continue rather than
        # crashing. Fatal schema check only applies when alembic is reachable.
        logger.warning("legalise.startup.schema_check_skipped", error=str(exc))

    # Register every provider whose credentials/service is reachable.
    # stub-echo is always available as a fallback so the workspace runs
    # without keys. Ollama is probed before registration so a missing
    # `local-models` compose profile doesn't poison B_mixed routing.
    await register_providers(model_gateway)

    # Register model-callable tools (generate_docx, edit_document,
    # replicate_document). Each goes through the same posture/audit rails
    # as `gateway.call()`. Pydantic input/output models per tool; JSON Schema
    # derived on demand via `model_json_schema()`.
    register_phase_a_tools(model_gateway)

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


from fastapi.exceptions import RequestValidationError


@app.exception_handler(RequestValidationError)
async def _request_validation_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Default 422 response + ceremony-rejection audit emission.

    FastAPI's default RequestValidationError handler returns 422 with
    the field errors. We preserve that behaviour, but additionally
    emit a ``module.ceremony.rejected`` audit row when the path is a
    ceremony-advance endpoint and the validator rejected the
    ``action`` field. This catches the ``{"action":"banana"}`` path
    that ``InvalidCeremonyTransition`` does NOT cover (the value is
    rejected by Pydantic before reaching the route handler).
    """
    # Best-effort path match — guard against the audit emission ever
    # blowing up the 422 response.
    path = request.url.path
    if "/install/" in path and path.endswith("/advance"):
        try:
            await asyncio.wait_for(
                _audit_validation_rejected_ceremony(request, exc),
                timeout=2,
            )
        except Exception:
            # Never let audit emission break the 422 response.
            pass
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


async def _audit_validation_rejected_ceremony(
    request: Request, exc: RequestValidationError
) -> None:
    """Best-effort audit for invalid install-ceremony actions.

    This runs from FastAPI's validation-error path, before the route
    handler has a request-scoped DB session. Keep it isolated and bounded
    so a failure-provenance write can never stall the 422 response.
    """
    from app.core.api import audit_failure

    path = request.url.path
    parts = path.split("/")
    ceremony_id = parts[parts.index("install") + 1] if "install" in parts else None
    actor_id = getattr(request.state, "user_id", None)

    session_factory = request.app.state.session_factory
    async with session_factory() as audit_session:
        await audit_failure(
            audit_session,
            "module.ceremony.rejected",
            actor_id=actor_id,
            module="core.trust_ceremony",
            payload={
                "ceremony_id": ceremony_id,
                "reason": "schema_validation_failed",
                "errors": exc.errors(),
            },
        )


@app.exception_handler(CapabilityDenied)
async def _capability_denied_handler(request: Request, exc: CapabilityDenied) -> JSONResponse:
    """Return a structured 403 for any uncaught CapabilityDenied.

    Audit row is already written inside `require_capability`. Routers
    that prefer to translate to their own HTTP shape can still catch
    `CapabilityDenied` directly; anything that propagates lands here.
    """
    return JSONResponse(
        status_code=403,
        content={
            "error": "capability_denied",
            "plugin": exc.plugin,
            "skill": exc.skill,
            "capability": exc.capability,
            "message": (
                f"Module '{exc.plugin}/{exc.skill}' was not granted "
                f"'{exc.capability}'. Grant from the Modules page."
            ),
        },
    )


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


# `account_router` mounts under `/auth/users` so the entire user
# resource lives at one prefix. fastapi-users already owns
# `GET/PATCH /auth/users/me` and `DELETE /auth/users/{id}` (superuser-
# only). account_router MUST be registered BEFORE auth_router so its
# literal `DELETE /me` wins over the fastapi-users `DELETE /{id}`
# catch-all that would otherwise match `me` and return 403.
app.include_router(account_router, prefix="/auth/users", tags=["account"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(usage_router, prefix="/api", tags=["usage"])
app.include_router(matters_router, prefix="/api/matters", tags=["matters"])
# Audit reconstruction nested under /api/matters. Registered AFTER the
# broad matters router so the catch-all /{slug} route doesn't shadow this
# specific /{slug}/audit/reconstruction path. Registration order is the
# canonical tiebreaker — keep this line where it is.
app.include_router(audit_router, prefix="/api/matters", tags=["audit"])
app.include_router(
    audit_admin_router, prefix="/api/admin/audit", tags=["audit", "admin"],
)
# Grants endpoints — same nest-under-matters pattern. Registered AFTER
# the broad matters router so /{slug}/grants doesn't collide with the
# catch-all matter detail.
app.include_router(grants_router, prefix="/api/matters", tags=["grants"])
# Invoke endpoint. Same nest-under-matters pattern; registered after the
# broad matters router so /{slug}/invocations doesn't collide with the
# catch-all matter detail route.
app.include_router(
    invocations_router, prefix="/api/matters", tags=["invocations"]
)
# Artifact list/read. Same nest-under-matters pattern; registered AFTER
# the broad matters router so /{slug}/artifacts doesn't collide.
app.include_router(
    artifacts_router, prefix="/api/matters", tags=["artifacts"]
)
# Supervisor Review v1 — matter-scoped review/approval endpoints. Same
# nest-under-matters pattern; registered AFTER the broad matters router
# so /{slug}/reviews doesn't collide with the catch-all matter detail.
app.include_router(reviews_router, prefix="/api/matters", tags=["reviews"])
app.include_router(signoffs_router, prefix="/api/matters", tags=["signoffs"])
# Admin role endpoint. Future admin endpoints land alongside under
# /api/admin.
app.include_router(admin_users_router, prefix="/api/admin", tags=["admin"])
# Bootstrap-state endpoint. Open (no auth) — gate to the first-auth flow.
app.include_router(system_router, prefix="/api/system", tags=["system"])
app.include_router(jobs_router, prefix="/api/matters", tags=["jobs"])
app.include_router(exports_router, prefix="/api/matters", tags=["exports"])
app.include_router(documents_router, prefix="/api/documents", tags=["documents"])
app.include_router(modules_router, prefix="/api/modules", tags=["modules"])
# Lawve Skill Importer v1 — external-source browse/convert (read-only;
# no install). Nested under /api/modules so it sits with the module
# surfaces; registered after the broad modules router.
app.include_router(lawve_import_router, prefix="/api/modules", tags=["lawve-import"])
# Guided Demo Loop v1 — keyless end-to-end proof (own prefix, self-registered).
app.include_router(demo_router)
# agent-kit eval adapter — shared-secret gated; 503 until AGENT_KIT_SECRET is set.
app.include_router(agent_evals_router, prefix="/api/evals", tags=["evals"])
app.include_router(workspace_router, prefix="/api/workspace", tags=["workspace"])

# Substrate primitives (matter context; the state-machine primitive is
# dormant and parked in backend/contrib/state_machine/ — see its header).
app.include_router(
    matter_context_schema_router,
    prefix="/api/matter-context",
    tags=["matter-context"],
)
# Matter-scoped item endpoints sit under /api/matters/{slug}/context/...
# so AuditMiddleware picks them up via its /api/matters/* matcher.
app.include_router(
    matter_context_items_router,
    prefix="/api/matters",
    tags=["matter-context"],
)
app.include_router(
    advice_boundary_router,
    prefix="/api/advice-boundary",
    tags=["advice-boundary"],
)

# Chronology module nests its routes under /api/matters/{slug}/chronology
# (and .../chronology/gate) so the audit middleware's matter-path matcher
# picks them up without special-casing.
app.include_router(chronology_router, prefix="/api/matters", tags=["chronology"])
app.include_router(assistant_router, prefix="/api/matters", tags=["assistant"])

