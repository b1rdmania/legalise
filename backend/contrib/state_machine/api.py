"""State machine HTTP API.

Five endpoints per the HANDOVER_PHASE_1_START plan (repo history) and
``docs/architecture/STATE_MACHINE_PRIMITIVE.md``:

    POST   /api/state-machine/definitions
    GET    /api/state-machine/definitions/{module_id}/{definition_key}/versions/{version}
    POST   /api/state-machine/instances
    GET    /api/state-machine/instances/{instance_id}
    POST   /api/state-machine/instances/{instance_id}/transitions

All endpoints require authentication. Capability enforcement happens
per-transition via ``check_or_block`` inside the runtime; the
``Phase1Blocked`` exception is translated to a 403 with the canonical
``BlockedPayload`` payload. ``InvalidDefinitionError`` and
``DefinitionNotFoundError`` translate to 422 and 404 respectively.
``Phase1Failed`` becomes 500.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_check import require_admin
from app.core.auth import current_user
from app.core.db import get_session
from app.core.matter_access import resolve_owned_open_matter
from app.core.phase1_runtime import Phase1Blocked, Phase1Failed
from contrib.state_machine import (
    DefinitionNotFoundError,
    InstanceNotFoundError,
    InvalidDefinitionError,
    create_instance,
    list_definitions,
    load_definition,
    read_instance,
    register_definition,
    request_transition,
)
from app.models import STATUS_ARCHIVED, Matter, User
from sqlalchemy import select


# Server-side owner-scope vocabulary. Reviewer P1#2 fix — the HTTP layer
# enforces a closed set; substrate runtime still accepts any string for
# internal callers, but the HTTP API restricts to known scopes.
_OWNER_SCOPE_MATTER = "matter"
_OWNER_SCOPE_WORKSPACE = "workspace"
_ALLOWED_OWNER_SCOPES = frozenset({_OWNER_SCOPE_MATTER, _OWNER_SCOPE_WORKSPACE})


router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class TransitionDef(BaseModel):
    from_state: str = Field(..., alias="from")
    to_state: str = Field(..., alias="to")
    gates: list[str] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)

    class Config:
        populate_by_name = True


class RegisterDefinitionRequest(BaseModel):
    module_id: str
    definition_key: str
    version: str
    states: list[str]
    initial_state: str
    terminal_states: list[str] = Field(default_factory=list)
    transitions: list[dict[str, Any]] = Field(default_factory=list)


class DefinitionResponse(BaseModel):
    id: uuid.UUID
    module_id: str
    definition_key: str
    version: str
    states: list[str]
    initial_state: str
    terminal_states: list[str]
    transitions: list[dict[str, Any]]


class CreateInstanceRequest(BaseModel):
    """Create-instance request.

    ``owner_scope`` must be one of the HTTP-allowed scopes (``matter``
    or ``workspace``).

    ``owner_ref`` semantics:
      - ``owner_scope="matter"`` — required; must be a matter slug
        owned by the authenticated user.
      - ``owner_scope="workspace"`` — ignored; the server forces
        ``owner_id`` to the authenticated user's id.

    Reviewer P1#2 fix: the runtime accepts any ``(owner_scope, owner_id)``
    pair, so without this HTTP-layer enforcement an authenticated user
    could mint instances bound to arbitrary matters or users.
    """

    definition_id: uuid.UUID | None = None
    module_id: str | None = None
    definition_key: str | None = None
    version: str | None = None
    owner_scope: str
    owner_ref: str | None = None


class InstanceResponse(BaseModel):
    id: uuid.UUID
    definition_id: uuid.UUID
    definition_version: str
    owner_scope: str
    owner_id: str
    current_state: str


class InstanceDetailResponse(BaseModel):
    instance: InstanceResponse
    definition: DefinitionResponse
    available_transitions: list[dict[str, Any]]
    history: list[dict[str, Any]]


class TransitionRequest(BaseModel):
    to_state: str
    reason: str | None = None
    extra_metadata: dict[str, Any] | None = None


class TransitionResponse(BaseModel):
    transition_id: uuid.UUID
    instance_id: uuid.UUID
    from_state: str
    to_state: str
    status: str
    gate_state: dict[str, Any]
    current_state: str


# ---------------------------------------------------------------------------
# Access control helpers (Reviewer P1#2 fix)
# ---------------------------------------------------------------------------


async def _resolve_owner_for_create(
    session: AsyncSession,
    *,
    user: User,
    owner_scope: str,
    owner_ref: str | None,
) -> str:
    """Resolve the storable ``owner_id`` for a new instance.

    Returns the string to persist on the instance's ``owner_id`` column.

    Raises ``HTTPException(404)`` to match the codebase convention for
    cross-user / archived / missing matter access (avoid leaking
    existence). Raises 422 for malformed input that is the caller's
    fault (unknown scope, missing owner_ref for matter scope).
    """
    if owner_scope not in _ALLOWED_OWNER_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "invalid_owner_scope",
                "message": (
                    f"owner_scope={owner_scope!r} not in "
                    f"{sorted(_ALLOWED_OWNER_SCOPES)}"
                ),
            },
        )

    if owner_scope == _OWNER_SCOPE_MATTER:
        if not owner_ref:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": "missing_owner_ref",
                    "message": "owner_ref (matter slug) is required for "
                    "owner_scope='matter'",
                },
            )
        # resolve_owned_open_matter raises 404 if matter is missing/
        # archived/cross-user — same shape as the rest of the codebase.
        matter = await resolve_owned_open_matter(session, owner_ref, user.id)
        return str(matter.id)

    # workspace scope — owner_ref ignored; server forces user.id.
    return str(user.id)


async def _assert_instance_access(
    session: AsyncSession,
    *,
    user: User,
    instance,
) -> None:
    """Verify ``user`` is allowed to read/operate on ``instance``.

    Raises ``HTTPException(404)`` if not — same shape as
    ``resolve_owned_open_matter`` so leaked instance UUIDs don't reveal
    ownership state.
    """
    if instance.owner_scope == _OWNER_SCOPE_WORKSPACE:
        if instance.owner_id != str(user.id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "instance_not_found",
                    "message": f"instance {instance.id} not found",
                },
            )
        return

    if instance.owner_scope == _OWNER_SCOPE_MATTER:
        try:
            matter_uuid = uuid.UUID(instance.owner_id)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "instance_not_found",
                    "message": f"instance {instance.id} not found",
                },
            )
        matter = await session.scalar(
            select(Matter).where(
                Matter.id == matter_uuid,
                Matter.created_by_id == user.id,
                Matter.status != STATUS_ARCHIVED,
            )
        )
        if matter is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "instance_not_found",
                    "message": f"instance {instance.id} not found",
                },
            )
        return

    # Unknown scope on an existing instance: deny by default.
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "error": "instance_not_found",
            "message": f"instance {instance.id} not found",
        },
    )


async def _load_and_authorize_instance(
    session: AsyncSession,
    *,
    user: User,
    instance_id: uuid.UUID,
):
    """Load an instance, raising 404 if missing OR if the caller does
    not own it under its declared scope. Single entry point for the
    read + transition endpoints."""
    from app.models import StateMachineInstance

    instance = await session.scalar(
        select(StateMachineInstance).where(
            StateMachineInstance.id == instance_id
        )
    )
    if instance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "instance_not_found",
                "message": f"instance {instance_id} not found",
            },
        )
    await _assert_instance_access(session, user=user, instance=instance)
    return instance


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _definition_to_response(definition) -> DefinitionResponse:
    return DefinitionResponse(
        id=definition.id,
        module_id=definition.module_id,
        definition_key=definition.definition_key,
        version=definition.version,
        states=definition.states,
        initial_state=definition.initial_state,
        terminal_states=definition.terminal_states,
        transitions=definition.transitions,
    )


def _instance_to_response(instance) -> InstanceResponse:
    return InstanceResponse(
        id=instance.id,
        definition_id=instance.definition_id,
        definition_version=instance.definition_version,
        owner_scope=instance.owner_scope,
        owner_id=instance.owner_id,
        current_state=instance.current_state,
    )


def _history_row(row) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "instance_id": str(row.instance_id),
        "from_state": row.from_state,
        "to_state": row.to_state,
        "actor_id": str(row.actor_id) if row.actor_id else None,
        "module_id": row.module_id,
        "capability_id": row.capability_id,
        "reason": row.reason,
        "extra_metadata": row.extra_metadata,
        "gate_state": row.gate_state,
        "status": row.status,
        "occurred_at": row.occurred_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/definitions",
    response_model=DefinitionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_definition_endpoint(
    body: RegisterDefinitionRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DefinitionResponse:
    """Register a new state-machine definition version.

    Idempotent on ``(module_id, definition_key, version)`` — re-posting
    the same triple returns the existing row unchanged. To ship a new
    shape, bump the ``version`` field.

    Reviewer P1#2 round 2: registration is workspace-admin only —
    matches the matter-context schema gate. End users cannot publish
    definitions under first-party or firm-private module IDs and so
    cannot squat on the module supply-chain registry.
    """
    require_admin(user, action_label="state-machine definition registration")
    try:
        definition = await register_definition(
            session,
            module_id=body.module_id,
            definition_key=body.definition_key,
            version=body.version,
            states=body.states,
            initial_state=body.initial_state,
            terminal_states=body.terminal_states,
            transitions=body.transitions,
        )
    except InvalidDefinitionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": "invalid_definition", "message": str(exc)},
        )
    await session.commit()
    return _definition_to_response(definition)


@router.get(
    "/definitions/{module_id}/{definition_key}/versions/{version}",
    response_model=DefinitionResponse,
)
async def get_definition_endpoint(
    module_id: str,
    definition_key: str,
    version: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> DefinitionResponse:
    """Read one definition by its ``(module_id, definition_key, version)``
    tuple."""
    try:
        definition = await load_definition(
            session,
            module_id=module_id,
            definition_key=definition_key,
            version=version,
        )
    except DefinitionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "definition_not_found", "message": str(exc)},
        )
    return _definition_to_response(definition)


@router.get(
    "/definitions",
    response_model=list[DefinitionResponse],
)
async def list_definitions_endpoint(
    module_id: str | None = None,
    definition_key: str | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[DefinitionResponse]:
    """List definitions, optionally filtered by ``module_id`` and/or
    ``definition_key``."""
    rows = await list_definitions(
        session, module_id=module_id, definition_key=definition_key
    )
    return [_definition_to_response(d) for d in rows]


@router.post(
    "/instances",
    response_model=InstanceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_instance_endpoint(
    body: CreateInstanceRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> InstanceResponse:
    """Create a new state-machine instance against the named definition.

    Either ``definition_id`` OR the
    ``(module_id, definition_key, version)`` tuple must be supplied.
    """
    if body.definition_id is None and not (
        body.module_id and body.definition_key and body.version
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "missing_definition_reference",
                "message": (
                    "either definition_id or "
                    "(module_id, definition_key, version) must be provided"
                ),
            },
        )
    # Reviewer P1#2: resolve owner_id server-side. The caller cannot
    # supply arbitrary owner_id and bind the instance to another user
    # or matter.
    resolved_owner_id = await _resolve_owner_for_create(
        session,
        user=user,
        owner_scope=body.owner_scope,
        owner_ref=body.owner_ref,
    )
    try:
        instance = await create_instance(
            session,
            definition_id=body.definition_id,
            module_id=body.module_id,
            definition_key=body.definition_key,
            version=body.version,
            owner_scope=body.owner_scope,
            owner_id=resolved_owner_id,
            actor_id=user.id,
        )
    except DefinitionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "definition_not_found", "message": str(exc)},
        )
    await session.commit()
    return _instance_to_response(instance)


@router.get(
    "/instances/{instance_id}",
    response_model=InstanceDetailResponse,
)
async def get_instance_endpoint(
    instance_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> InstanceDetailResponse:
    """Read instance, definition, available next transitions, and
    recent history.

    Reviewer P1#2: ownership check via ``_load_and_authorize_instance``
    runs before any state is returned. Leaked instance UUIDs do not
    reveal ownership or history.
    """
    # Authorize first — raises 404 if the caller doesn't own the
    # instance's matter/workspace.
    await _load_and_authorize_instance(
        session, user=user, instance_id=instance_id
    )
    try:
        result = await read_instance(session, instance_id=instance_id)
    except InstanceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "instance_not_found", "message": str(exc)},
        )
    return InstanceDetailResponse(
        instance=_instance_to_response(result["instance"]),
        definition=_definition_to_response(result["definition"]),
        available_transitions=result["available_transitions"],
        history=[_history_row(r) for r in result["history"]],
    )


@router.post(
    "/instances/{instance_id}/transitions",
    response_model=TransitionResponse,
)
async def transition_endpoint(
    instance_id: uuid.UUID,
    body: TransitionRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> TransitionResponse:
    """Request a transition on the instance.

    On success, returns ``201`` with the transition + new current state.
    On a non-system block (invalid transition, capability denied, gate
    blocked), returns ``403`` with the canonical ``BlockedPayload``.
    On system failure, returns ``500`` with an error envelope.

    Reviewer P1#2: ownership check runs before the transition fires.
    A leaked instance UUID cannot be used to drive transitions on
    matters/workspaces the caller does not own.
    """
    await _load_and_authorize_instance(
        session, user=user, instance_id=instance_id
    )
    try:
        transition_row, instance = await request_transition(
            session,
            instance_id=instance_id,
            to_state=body.to_state,
            user_id=user.id,
            actor_id=user.id,
            reason=body.reason,
            extra_metadata=body.extra_metadata,
        )
    except InstanceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "instance_not_found", "message": str(exc)},
        )
    except Phase1Blocked as exc:
        # The runtime has already written the blocked transition row +
        # blocked audit row. Commit those so they survive even though the
        # 403 response is going out.
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "phase1_blocked",
                **exc.payload.to_dict(),
            },
        )
    except Phase1Failed as exc:
        # Failed row + failed audit already written.
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "phase1_failed", "message": str(exc)},
        )
    await session.commit()
    return TransitionResponse(
        transition_id=transition_row.id,
        instance_id=instance.id,
        from_state=transition_row.from_state,
        to_state=transition_row.to_state,
        status=transition_row.status,
        gate_state=transition_row.gate_state,
        current_state=instance.current_state,
    )
