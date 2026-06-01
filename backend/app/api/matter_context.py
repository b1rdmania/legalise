"""Matter context HTTP API — two routers.

``schema_router`` (mounted at ``/api/matter-context``):
    POST /schemas
    GET  /schemas/{namespace}
    GET  /schemas

``items_router`` (mounted at ``/api/matters``; matter-scoped):
    POST  /{slug}/context/{namespace}
    GET   /{slug}/context/{namespace}
    PATCH /{slug}/context/items/{item_id}

Matter-scoped endpoints resolve via ``resolve_owned_open_matter`` so
unauthorised / archived / cross-user matter access returns 404 rather
than 403 (codebase convention to avoid leaking matter existence).
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
from app.core.matter_context import (
    InvalidSchemaError,
    ItemNotFoundError,
    SchemaNotFoundError,
    list_schemas,
    load_item,
    load_schema,
    read_items,
    register_schema,
    supersede_item,
    write_item,
)
from app.core.phase1_runtime import Phase1Blocked
from app.models import User


schema_router = APIRouter()
items_router = APIRouter()


# Admin gate now lives in ``app.core.admin_check`` so both
# matter-context schema registration and state-machine definition
# registration use the same envelope. See Reviewer P1#2 round 2 — the
# state-machine endpoint was missing this gate and has been brought
# under the same helper.


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class RegisterSchemaRequest(BaseModel):
    namespace: str
    module_id: str
    version: str
    json_schema: dict[str, Any]
    registered_by_module_id: str | None = None


class SchemaResponse(BaseModel):
    id: uuid.UUID
    namespace: str
    module_id: str
    version: str
    json_schema: dict[str, Any]


class WriteItemRequest(BaseModel):
    payload: dict[str, Any]
    schema_version: str | None = None
    source_type: str | None = None
    source_id: str | None = None
    created_by_module_id: str | None = None


class ItemResponse(BaseModel):
    id: uuid.UUID
    matter_id: uuid.UUID
    namespace: str
    schema_id: uuid.UUID
    schema_version: str
    payload: dict[str, Any]
    source_type: str | None
    source_id: str | None
    created_by_user_id: uuid.UUID | None
    created_by_module_id: str | None
    superseded_by_id: uuid.UUID | None


class PatchItemRequest(BaseModel):
    action: str = Field(..., description="'supersede' (only currently-supported action)")
    new_payload: dict[str, Any] | None = None
    schema_version: str | None = None
    source_type: str | None = None
    source_id: str | None = None
    reason: str | None = None
    superseded_by_module_id: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _schema_to_response(schema) -> SchemaResponse:
    return SchemaResponse(
        id=schema.id,
        namespace=schema.namespace,
        module_id=schema.module_id,
        version=schema.version,
        json_schema=schema.json_schema,
    )


def _item_to_response(item) -> ItemResponse:
    return ItemResponse(
        id=item.id,
        matter_id=item.matter_id,
        namespace=item.namespace,
        schema_id=item.schema_id,
        schema_version=item.schema_version,
        payload=item.payload,
        source_type=item.source_type,
        source_id=item.source_id,
        created_by_user_id=item.created_by_user_id,
        created_by_module_id=item.created_by_module_id,
        superseded_by_id=item.superseded_by_id,
    )


def _blocked_to_http(exc: Phase1Blocked) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"error": "phase1_blocked", **exc.payload.to_dict()},
    )


# ---------------------------------------------------------------------------
# Schema endpoints
# ---------------------------------------------------------------------------


@schema_router.post(
    "/schemas",
    response_model=SchemaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_schema_endpoint(
    body: RegisterSchemaRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> SchemaResponse:
    """Register a new schema under ``(namespace, version)``.

    Idempotent — re-posting the same triple returns the existing row.

    Reviewer P1#3: registration is workspace-admin only. End users
    cannot squat or poison namespaces used by first-party / reference
    modules.
    """
    require_admin(user, action_label="matter-context schema registration")
    try:
        schema = await register_schema(
            session,
            namespace=body.namespace,
            module_id=body.module_id,
            version=body.version,
            json_schema=body.json_schema,
            registered_by_module_id=body.registered_by_module_id,
        )
    except InvalidSchemaError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": "invalid_schema", "message": str(exc)},
        )
    await session.commit()
    return _schema_to_response(schema)


@schema_router.get(
    "/schemas/{namespace}",
    response_model=list[SchemaResponse],
)
async def list_namespace_schemas_endpoint(
    namespace: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[SchemaResponse]:
    """List all registered versions of a namespace's schema."""
    rows = await list_schemas(session, namespace=namespace)
    return [_schema_to_response(s) for s in rows]


@schema_router.get(
    "/schemas/{namespace}/versions/{version}",
    response_model=SchemaResponse,
)
async def get_schema_endpoint(
    namespace: str,
    version: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> SchemaResponse:
    try:
        schema = await load_schema(
            session, namespace=namespace, version=version
        )
    except SchemaNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "schema_not_found", "message": str(exc)},
        )
    return _schema_to_response(schema)


# ---------------------------------------------------------------------------
# Matter-scoped item endpoints
# ---------------------------------------------------------------------------


@items_router.post(
    "/{slug}/context/{namespace}",
    response_model=ItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def write_item_endpoint(
    slug: str,
    namespace: str,
    body: WriteItemRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ItemResponse:
    """Write a new item under ``(matter_slug, namespace)``."""
    matter = await resolve_owned_open_matter(session, slug, user.id)
    try:
        item = await write_item(
            session,
            matter_id=matter.id,
            namespace=namespace,
            payload=body.payload,
            user_id=user.id,
            schema_version=body.schema_version,
            source_type=body.source_type,
            source_id=body.source_id,
            created_by_module_id=body.created_by_module_id,
        )
    except Phase1Blocked as exc:
        await session.commit()
        raise _blocked_to_http(exc)
    await session.commit()
    return _item_to_response(item)


@items_router.get(
    "/{slug}/context/{namespace}",
    response_model=list[ItemResponse],
)
async def read_items_endpoint(
    slug: str,
    namespace: str,
    schema_version: str | None = None,
    source_type: str | None = None,
    include_superseded: bool = False,
    limit: int = 200,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[ItemResponse]:
    """Read items under ``(matter_slug, namespace)``. Capability-checked
    and audited."""
    matter = await resolve_owned_open_matter(session, slug, user.id)
    try:
        items = await read_items(
            session,
            matter_id=matter.id,
            namespace=namespace,
            user_id=user.id,
            schema_version=schema_version,
            source_type=source_type,
            include_superseded=include_superseded,
            limit=limit,
        )
    except Phase1Blocked as exc:
        await session.commit()
        raise _blocked_to_http(exc)
    await session.commit()
    return [_item_to_response(i) for i in items]


@items_router.patch(
    "/{slug}/context/items/{item_id}",
    response_model=ItemResponse,
)
async def patch_item_endpoint(
    slug: str,
    item_id: uuid.UUID,
    body: PatchItemRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> ItemResponse:
    """Supersede an existing item with a new one. Only ``action="supersede"``
    is supported today; ``action="withdraw"`` lands when the
    output-lifecycle reference module ships.

    Returns the new (superseding) item.
    """
    matter = await resolve_owned_open_matter(session, slug, user.id)
    if body.action == "supersede":
        if body.new_payload is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": "missing_input",
                    "message": "new_payload is required for action='supersede'",
                },
            )
        try:
            _old, new = await supersede_item(
                session,
                matter_id=matter.id,
                item_id=item_id,
                new_payload=body.new_payload,
                user_id=user.id,
                reason=body.reason,
                schema_version=body.schema_version,
                source_type=body.source_type,
                source_id=body.source_id,
                superseded_by_module_id=body.superseded_by_module_id,
            )
        except ItemNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "item_not_found", "message": str(exc)},
            )
        except Phase1Blocked as exc:
            await session.commit()
            raise _blocked_to_http(exc)
        await session.commit()
        return _item_to_response(new)
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={
            "error": "unsupported_action",
            "message": f"action={body.action!r} not supported; "
            "supported: 'supersede'",
        },
    )
