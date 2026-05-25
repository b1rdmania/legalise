"""State machine HTTP API.

Five endpoints per ``docs/handovers/HANDOVER_PHASE_1_START.md`` and
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

from app.core.auth import current_user
from app.core.db import get_session
from app.core.phase1_runtime import Phase1Blocked, Phase1Failed
from app.core.state_machine import (
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
from app.models import User


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
    definition_id: uuid.UUID | None = None
    module_id: str | None = None
    definition_key: str | None = None
    version: str | None = None
    owner_scope: str
    owner_id: str


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
    """
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "missing_definition_reference",
                "message": (
                    "either definition_id or "
                    "(module_id, definition_key, version) must be provided"
                ),
            },
        )
    try:
        instance = await create_instance(
            session,
            definition_id=body.definition_id,
            module_id=body.module_id,
            definition_key=body.definition_key,
            version=body.version,
            owner_scope=body.owner_scope,
            owner_id=body.owner_id,
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
    recent history."""
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
    """
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
