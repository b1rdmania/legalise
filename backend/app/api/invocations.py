"""HTTP invoke endpoint.

Single endpoint:

  POST /api/matters/{slug}/invocations

…body ``{module_id, capability_id, args}``, runs the capability
synchronously, returns its result. Closes the last fake step in the
demo sentence: install → grant → **run** → reconstruct, all via HTTP.

Endpoint flow:

1. Strict matter-access predicate (owner OR superuser; uniform 404)
2. Load InstalledModule → 404 module_not_installed; 409 module_disabled
3. Find capability declaration in manifest → 404 capability_not_declared
4. Scope check → 422 capability_scope_not_supported_here
5. Kind check → 422 capability_kind_not_invokable
6. Build provider_call adapter
7. Build InvocationContext from authenticated user + fresh invocation_id
8. dispatch_capability(...)
9. Translate exceptions to HTTP codes
10. Commit + return

Audit emission stays inside the capability — the endpoint adds no
audit row of its own. The capability's
``module.capability.invoked`` + ``model.invoked`` +
``module.capability.completed`` chain renders identically through
reconstruction regardless of who called it.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.advice_boundary import AdviceBoundaryDenied
from app.core.api import (
    PROVIDER_HTTP_EXCEPTIONS,
    http_error,
    provider_error_http_exception,
)
from app.core.auth import current_user
from app.core.capabilities import CapabilityDenied
from app.core.db import get_session
from app.core.grants_lifecycle import CapabilityScopeUnsupported
from app.core.limits import check_workflow_run
from app.core.phase1_runtime.exceptions import Phase1Blocked
from app.core.posture_gate import PostureBlocked
from app.core.runtime import (
    CapabilityNotDeclared,
    EntrypointResolutionError,
    InvocationContext,
    _find_capability_declaration,
    dispatch_capability,
    make_provider_call,
)
from app.models import InstalledModule, Matter, User
from app.models.matter import STATUS_ARCHIVED


router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class InvocationRequest(BaseModel):
    module_id: str
    capability_id: str
    args: dict[str, Any] = Field(default_factory=dict)


class InvocationResponse(BaseModel):
    invocation_id: str
    module_id: str
    capability_id: str
    matter_id: str
    result: dict[str, Any]


# ---------------------------------------------------------------------------
# Matter-access predicate — same shape as reconstruction + grants endpoints
# ---------------------------------------------------------------------------


async def _load_matter_or_404(
    session: AsyncSession, *, slug: str, user: User
) -> Matter:
    matter = await session.scalar(
        select(Matter).where(
            Matter.slug == slug, Matter.created_by_id == user.id
        )
    )
    if matter is None and user.is_superuser:
        matter = await session.scalar(
            select(Matter).where(Matter.slug == slug)
        )
    if matter is None or matter.status == STATUS_ARCHIVED:
        # Uniform 404 — never leak which matters exist for other users.
        raise HTTPException(status_code=404, detail=f"matter not found: {slug}")
    return matter


# ---------------------------------------------------------------------------
# POST /api/matters/{slug}/invocations
# ---------------------------------------------------------------------------


_INVOKABLE_KINDS: frozenset[str] = frozenset({"skill", "tool", "workflow"})


@router.post(
    "/{slug}/invocations",
    response_model=InvocationResponse,
)
async def invoke_capability_endpoint(
    slug: str,
    body: InvocationRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> InvocationResponse:
    matter = await _load_matter_or_404(session, slug=slug, user=user)

    # 0. Evaluation limit — capability runs are capped per day (counted
    #    from the module.capability.invoked audit rows dispatch writes).
    await check_workflow_run(user.id, session)

    # 1. Module must be installed AND enabled.
    installed = await session.scalar(
        select(InstalledModule)
        .where(InstalledModule.module_id == body.module_id)
        .order_by(InstalledModule.installed_at.desc())
    )
    if installed is None:
        raise http_error(404, "module_not_installed", module_id=body.module_id)
    if not installed.enabled:
        raise http_error(409, "module_disabled", module_id=body.module_id)

    # 2. Capability must be declared in the manifest.
    manifest = installed.manifest_snapshot or {}
    declaration = _find_capability_declaration(manifest, body.capability_id)
    if declaration is None:
        raise http_error(
            404,
            "capability_not_declared",
            module_id=body.module_id,
            capability_id=body.capability_id,
        )

    # 3. Decision #7 — scope must be matter (the matter URL only
    #    produces matter authority; workspace/global capabilities
    #    get a dedicated future endpoint).
    declared_scope = declaration.get("scope", "workspace")
    if declared_scope != "matter":
        raise http_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "capability_scope_not_supported_here",
            capability_id=body.capability_id,
            capability_scope=declared_scope,
            message=(
                "POST /api/matters/{slug}/invocations only invokes "
                "matter-scope capabilities."
            ),
        )

    # 4. Decision #7 — kind must be directly invokable.
    declared_kind = declaration.get("kind", "skill")
    if declared_kind not in _INVOKABLE_KINDS:
        raise http_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "capability_kind_not_invokable",
            capability_id=body.capability_id,
            capability_kind=declared_kind,
            message=(
                f"capability kind {declared_kind!r} is dispatched "
                f"by the substrate, not via direct invocation"
            ),
        )

    # 5. Build invocation context + provider adapter.
    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )
    provider_call = make_provider_call(
        session=session,
        matter=matter,
        actor_user_id=user.id,
        module_id=body.module_id,
        capability_id=body.capability_id,
        invocation_id=invocation_id,
    )

    # 6. Dispatch. Exception → HTTP translation per Decision #5 v2.
    try:
        result = await dispatch_capability(
            session,
            installed_module=installed,
            capability_declaration=declaration,
            matter=matter,
            context=context,
            args=body.args,
            provider_call=provider_call,
        )
    except PostureBlocked as exc:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "posture_gate_blocked",
                "posture": exc.result.posture,
                "required_role": exc.result.required_role,
                "actor_role": exc.result.actor_role,
                "reason": exc.result.reason,
            },
        )
    except CapabilityScopeUnsupported as exc:
        # Defence-in-depth — the endpoint already filters scope=matter
        # above. A module that internally enforces scope and re-raises
        # this signals a manifest/runtime mismatch.
        raise http_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "capability_scope_not_supported_here",
            capability_id=exc.capability_id,
            capability_scope=exc.capability_scope,
        )
    except CapabilityDenied as exc:
        raise http_error(
            403,
            "capability_denied",
            plugin=exc.plugin,
            skill=exc.skill,
            capability=exc.capability,
            matter_id=str(matter.id),
            scope="matter",
        )
    except Phase1Blocked as exc:
        raise http_error(
            403,
            "phase1_blocked",
            blocked_reason=exc.payload.blocked_reason.value,
            gate_state=exc.payload.gate_state,
        )
    except PROVIDER_HTTP_EXCEPTIONS as exc:
        raise provider_error_http_exception(
            exc,
            missing_key_message=(
                "User has not configured an API key for the selected provider."
            ),
            upstream_shape="generic",
        ) from exc
    except CapabilityNotDeclared as exc:
        # The dispatcher disagreed with the endpoint's pre-check
        # (e.g. the module-author's invoke() rejects the capability
        # name even though it's in the manifest). 404 — same shape.
        raise http_error(
            404,
            "capability_not_declared",
            module_id=exc.module_id,
            capability_id=exc.capability_id,
        )
    except EntrypointResolutionError as exc:
        # The manifest is installed but its entrypoint can't be
        # imported — install-side data problem. 500.
        raise http_error(
            500,
            "entrypoint_resolution_failed",
            message=str(exc),
        )
    except AdviceBoundaryDenied as exc:
        # Advice-boundary gate denial. Keep this typed so unrelated
        # PermissionError uses in future modules do not masquerade as
        # advice-boundary decisions.
        raise http_error(
            403,
            "advice_boundary_denied",
            decision_id=str(exc.decision_id) if exc.decision_id else None,
            gate_state=exc.gate_state,
            message=str(exc),
        )
    except ValueError as exc:
        # The capability raised on bad args (or unknown claim_type,
        # empty document_ids, etc.).
        raise http_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "invalid_args",
            message=str(exc),
        )

    await session.commit()

    return InvocationResponse(
        invocation_id=str(invocation_id),
        module_id=body.module_id,
        capability_id=body.capability_id,
        matter_id=str(matter.id),
        result=result,
    )
