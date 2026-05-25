"""Matter context schema registry.

Modules register typed schemas under namespaces. Schemas are versioned;
items written under a namespace bind to a specific schema version so
reads remain meaningful across schema evolution.

JSON Schema documents are themselves validated at register time using
the meta-schema (``jsonschema.Draft202012Validator.META_SCHEMA``) so a
malformed schema never reaches the item-write path.

Per docs/architecture/MATTER_CONTEXT_STORE.md.
"""

from __future__ import annotations

import uuid
from typing import Any

from jsonschema import Draft202012Validator, SchemaError
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MatterContextSchema


class InvalidSchemaError(ValueError):
    """Raised when a json_schema document is not itself a valid JSON
    Schema, or when other structural validation fails at register
    time."""


class SchemaNotFoundError(LookupError):
    """Raised when ``load_schema`` cannot find the requested schema."""


def _validate_json_schema(json_schema: Any) -> None:
    """Ensure ``json_schema`` is a valid JSON Schema document by
    checking it against the Draft 2020-12 meta-schema. Raises
    ``InvalidSchemaError`` on failure."""
    if not isinstance(json_schema, dict):
        raise InvalidSchemaError(
            f"json_schema must be a dict, got {type(json_schema).__name__}"
        )
    try:
        Draft202012Validator.check_schema(json_schema)
    except SchemaError as exc:
        raise InvalidSchemaError(f"json_schema is not a valid JSON Schema: {exc}")


async def register_schema(
    session: AsyncSession,
    *,
    namespace: str,
    module_id: str,
    version: str,
    json_schema: dict,
    registered_by_module_id: str | None = None,
) -> MatterContextSchema:
    """Register a schema under ``(namespace, version)``.

    Idempotent: if a row already exists with the same triple, that row
    is returned unchanged. Modules ship a new ``version`` when the
    shape changes.

    Raises ``InvalidSchemaError`` if ``json_schema`` is not a valid
    JSON Schema document.
    """
    _validate_json_schema(json_schema)

    existing = await session.scalar(
        select(MatterContextSchema).where(
            MatterContextSchema.namespace == namespace,
            MatterContextSchema.version == version,
        )
    )
    if existing is not None:
        return existing

    schema = MatterContextSchema(
        id=uuid.uuid4(),
        namespace=namespace,
        module_id=module_id,
        version=version,
        json_schema=json_schema,
        registered_by_module_id=registered_by_module_id or module_id,
    )
    session.add(schema)
    await session.flush()
    return schema


async def load_schema(
    session: AsyncSession,
    *,
    schema_id: uuid.UUID | None = None,
    namespace: str | None = None,
    version: str | None = None,
) -> MatterContextSchema:
    """Load a schema by id or by ``(namespace, version)``. Raises
    ``SchemaNotFoundError`` if absent.

    Exactly one of ``schema_id`` or ``(namespace, version)`` must be
    supplied. ``version`` may be omitted with ``namespace`` to load the
    latest version (use ``latest_version_for_namespace`` directly if
    you want the version string).
    """
    if schema_id is not None:
        row = await session.scalar(
            select(MatterContextSchema).where(
                MatterContextSchema.id == schema_id
            )
        )
        if row is None:
            raise SchemaNotFoundError(f"schema id={schema_id} not found")
        return row

    if not namespace:
        raise ValueError("either schema_id or namespace must be supplied")

    if version is None:
        version = await latest_version_for_namespace(session, namespace=namespace)
        if version is None:
            raise SchemaNotFoundError(
                f"no schema registered for namespace {namespace!r}"
            )

    row = await session.scalar(
        select(MatterContextSchema).where(
            MatterContextSchema.namespace == namespace,
            MatterContextSchema.version == version,
        )
    )
    if row is None:
        raise SchemaNotFoundError(
            f"schema {namespace}@{version} not found"
        )
    return row


async def latest_version_for_namespace(
    session: AsyncSession, *, namespace: str
) -> str | None:
    """Return the latest registered version string for the namespace,
    or None if no schema exists yet.

    "Latest" is the most recently registered row. Versions are semver
    strings but Phase 1 does not parse them — the registration order
    is the tie-breaker. Modules should register versions in monotonic
    order; if they don't, callers can specify the exact version they
    want on write.
    """
    row = await session.scalar(
        select(MatterContextSchema)
        .where(MatterContextSchema.namespace == namespace)
        .order_by(desc(MatterContextSchema.registered_at))
        .limit(1)
    )
    return row.version if row else None


async def list_schemas(
    session: AsyncSession,
    *,
    namespace: str | None = None,
    module_id: str | None = None,
) -> list[MatterContextSchema]:
    """List schemas, optionally filtered by namespace and/or module."""
    stmt = select(MatterContextSchema).order_by(
        MatterContextSchema.registered_at
    )
    if namespace is not None:
        stmt = stmt.where(MatterContextSchema.namespace == namespace)
    if module_id is not None:
        stmt = stmt.where(MatterContextSchema.module_id == module_id)
    rows = await session.scalars(stmt)
    return list(rows.all())
