"""Matter context item store.

Item writes:
- Capability-checked via ``check_or_block`` against
  ``matter.context.<namespace>.write``.
- Validated against the resolved schema version (latest by default,
  explicit version overrides).
- Audit-emitted on every code path (created, blocked, schema violation).

Item reads:
- Capability-checked via ``check_or_block`` against
  ``matter.context.<namespace>.read``.
- Audited per ``MATTER_CONTEXT_STORE.md`` §109 ("Read events may be
  sampled or aggregated later, but V1 should audit module reads that
  feed model calls"). One audit row per read call.

Supersession:
- ``supersede_item`` writes a new item and sets ``superseded_by_id``
  on the older row. Both rows survive; the older row is filtered out
  of the default read.
"""

from __future__ import annotations

import uuid
from typing import Any

from jsonschema import Draft202012Validator, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.phase1_runtime import (
    BlockedPayload,
    BlockedReason,
    Phase1Blocked,
    audit_phase1,
    check_or_block,
)
from app.core.matter_context.registry import (
    SchemaNotFoundError,
    latest_version_for_namespace,
    load_schema,
)
from app.models import MatterContextItem, MatterContextSchema


class ItemNotFoundError(LookupError):
    """Raised when an item id does not resolve, scoped to its matter."""


def _capability_read(namespace: str) -> str:
    return f"matter.context.{namespace}.read"


def _capability_write(namespace: str) -> str:
    return f"matter.context.{namespace}.write"


async def write_item(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID,
    namespace: str,
    payload: dict,
    user_id: uuid.UUID,
    schema_version: str | None = None,
    source_type: str | None = None,
    source_id: str | None = None,
    created_by_module_id: str | None = None,
) -> MatterContextItem:
    """Write a new item under ``(matter_id, namespace)``.

    ``schema_version`` resolution:

    - If omitted, the runtime resolves to the latest registered schema
      version for ``namespace`` at write time. Both ``schema_id`` and
      ``schema_version`` are stored on the item.
    - If supplied, the runtime loads that exact schema version. Both
      identifiers are stored.

    Validation: the payload is validated against the resolved schema
    using ``jsonschema.Draft202012Validator``. On validation failure a
    blocked audit row is emitted and ``Phase1Blocked`` is raised with
    ``BlockedReason.SCHEMA_VIOLATION``.

    Capability check uses ``matter.context.<namespace>.write``. On
    denial the dual-audit pattern fires (legacy
    ``module.capability.denied`` +
    ``matter_context.write.blocked``) and ``Phase1Blocked`` is raised
    with ``BlockedReason.CAPABILITY_DENIED``.
    """
    capability = _capability_write(namespace)
    await check_or_block(
        session,
        user_id=user_id,
        capability=capability,
        primitive="matter_context",
        block_action="matter_context.write.blocked",
        actor_id=user_id,
        matter_id=matter_id,
        resource_type="matter_context_item",
    )

    # Resolve schema.
    try:
        if schema_version is not None:
            schema = await load_schema(
                session, namespace=namespace, version=schema_version
            )
        else:
            resolved_version = await latest_version_for_namespace(
                session, namespace=namespace
            )
            if resolved_version is None:
                # No schema registered — block with SCHEMA_VIOLATION.
                blocked = BlockedPayload(
                    blocked_reason=BlockedReason.SCHEMA_VIOLATION,
                    gate_state={
                        "namespace": namespace,
                        "error": "no_schema_registered",
                    },
                )
                await audit_phase1(
                    session,
                    action="matter_context.write.blocked",
                    primitive="matter_context",
                    actor_id=user_id,
                    matter_id=matter_id,
                    module_id=created_by_module_id,
                    capability_id=capability,
                    resource_type="matter_context_item",
                    payload={"namespace": namespace},
                    blocked=blocked,
                )
                raise Phase1Blocked(blocked)
            schema = await load_schema(
                session, namespace=namespace, version=resolved_version
            )
    except SchemaNotFoundError:
        blocked = BlockedPayload(
            blocked_reason=BlockedReason.SCHEMA_VIOLATION,
            gate_state={
                "namespace": namespace,
                "schema_version": schema_version,
                "error": "schema_not_found",
            },
        )
        await audit_phase1(
            session,
            action="matter_context.write.blocked",
            primitive="matter_context",
            actor_id=user_id,
            matter_id=matter_id,
            module_id=created_by_module_id,
            capability_id=capability,
            resource_type="matter_context_item",
            payload={"namespace": namespace, "schema_version": schema_version},
            blocked=blocked,
        )
        raise Phase1Blocked(blocked)

    # Validate payload against the schema.
    validator = Draft202012Validator(schema.json_schema)
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.path))
    if errors:
        blocked = BlockedPayload(
            blocked_reason=BlockedReason.SCHEMA_VIOLATION,
            gate_state={
                "namespace": namespace,
                "schema_id": str(schema.id),
                "schema_version": schema.version,
                "errors": [
                    {
                        "message": e.message,
                        "path": list(e.path),
                        "validator": e.validator,
                    }
                    for e in errors
                ],
            },
        )
        await audit_phase1(
            session,
            action="matter_context.write.blocked",
            primitive="matter_context",
            actor_id=user_id,
            matter_id=matter_id,
            module_id=created_by_module_id,
            capability_id=capability,
            resource_type="matter_context_item",
            payload={"namespace": namespace, "schema_version": schema.version},
            blocked=blocked,
        )
        raise Phase1Blocked(blocked)

    # All checks passed — write the item.
    item = MatterContextItem(
        id=uuid.uuid4(),
        matter_id=matter_id,
        namespace=namespace,
        schema_id=schema.id,
        schema_version=schema.version,
        payload=payload,
        source_type=source_type,
        source_id=source_id,
        created_by_user_id=user_id,
        created_by_module_id=created_by_module_id,
    )
    session.add(item)
    await session.flush()

    await audit_phase1(
        session,
        action="matter_context.item.created",
        primitive="matter_context",
        actor_id=user_id,
        matter_id=matter_id,
        module_id=created_by_module_id,
        capability_id=capability,
        resource_type="matter_context_item",
        resource_id=str(item.id),
        payload={
            "namespace": namespace,
            "schema_id": str(schema.id),
            "schema_version": schema.version,
            "source_type": source_type,
            "source_id": source_id,
        },
    )
    return item


async def read_items(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID,
    namespace: str,
    user_id: uuid.UUID,
    schema_version: str | None = None,
    source_type: str | None = None,
    include_superseded: bool = False,
    limit: int = 200,
) -> list[MatterContextItem]:
    """Read items under ``(matter_id, namespace)``.

    Capability-checked via ``matter.context.<namespace>.read``. Audits
    ``matter_context.item.read`` on success.

    Filters:
    - ``schema_version``: return only items bound to that version
    - ``source_type``: return only items with the given source type
    - ``include_superseded``: include rows whose ``superseded_by_id``
      is non-null (default False)
    """
    capability = _capability_read(namespace)
    await check_or_block(
        session,
        user_id=user_id,
        capability=capability,
        primitive="matter_context",
        block_action="matter_context.read.blocked",
        actor_id=user_id,
        matter_id=matter_id,
        resource_type="matter_context_item",
    )

    stmt = (
        select(MatterContextItem)
        .where(
            MatterContextItem.matter_id == matter_id,
            MatterContextItem.namespace == namespace,
        )
        .order_by(MatterContextItem.created_at.desc())
        .limit(limit)
    )
    if not include_superseded:
        stmt = stmt.where(MatterContextItem.superseded_by_id.is_(None))
    if schema_version is not None:
        stmt = stmt.where(MatterContextItem.schema_version == schema_version)
    if source_type is not None:
        stmt = stmt.where(MatterContextItem.source_type == source_type)

    rows = await session.scalars(stmt)
    items = list(rows.all())

    await audit_phase1(
        session,
        action="matter_context.item.read",
        primitive="matter_context",
        actor_id=user_id,
        matter_id=matter_id,
        capability_id=capability,
        resource_type="matter_context_item",
        payload={
            "namespace": namespace,
            "filters": {
                "schema_version": schema_version,
                "source_type": source_type,
                "include_superseded": include_superseded,
            },
            "result_count": len(items),
        },
    )
    return items


async def load_item(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID,
    item_id: uuid.UUID,
) -> MatterContextItem:
    """Load a single item by id, scoped to its matter. Raises
    ``ItemNotFoundError`` if the item does not exist or does not belong
    to the named matter."""
    row = await session.scalar(
        select(MatterContextItem).where(
            MatterContextItem.id == item_id,
            MatterContextItem.matter_id == matter_id,
        )
    )
    if row is None:
        raise ItemNotFoundError(
            f"item {item_id} not found under matter {matter_id}"
        )
    return row


async def supersede_item(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID,
    item_id: uuid.UUID,
    new_payload: dict,
    user_id: uuid.UUID,
    reason: str | None = None,
    schema_version: str | None = None,
    source_type: str | None = None,
    source_id: str | None = None,
    superseded_by_module_id: str | None = None,
) -> tuple[MatterContextItem, MatterContextItem]:
    """Supersede an existing item with a new one.

    Writes the new item via ``write_item`` (full capability +
    schema-validation path), then sets ``superseded_by_id`` on the old
    row to point at the new row. Returns ``(old_row, new_row)``.

    Raises ``ItemNotFoundError`` if the old item doesn't exist or
    belongs to a different matter.
    """
    old = await load_item(session, matter_id=matter_id, item_id=item_id)
    new = await write_item(
        session,
        matter_id=matter_id,
        namespace=old.namespace,
        payload=new_payload,
        user_id=user_id,
        schema_version=schema_version or old.schema_version,
        source_type=source_type,
        source_id=source_id,
        created_by_module_id=superseded_by_module_id,
    )
    old.superseded_by_id = new.id
    session.add(old)
    await session.flush()

    await audit_phase1(
        session,
        action="matter_context.item.superseded",
        primitive="matter_context",
        actor_id=user_id,
        matter_id=matter_id,
        module_id=superseded_by_module_id,
        resource_type="matter_context_item",
        resource_id=str(old.id),
        payload={
            "namespace": old.namespace,
            "superseded_by_id": str(new.id),
            "reason": reason,
        },
    )
    return old, new
