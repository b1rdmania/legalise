"""Phase 1 matter context store — registry + store tests.

Covers seven canonical scenarios from the build plan:

1. Valid path — register schema, write item, read it back, schema-version preserved
2. Denied capability (write) — blocked, dual audit
3. Schema violation — blocked, payload not validated against schema
4. Schema-version write policy — default latest, explicit override, cross-version reads
5. Read denied capability — blocked, audit
6. Supersede chain — old + new visible, default read excludes superseded
7. Audit emission across all paths

Plus: registry validation rejects malformed json_schema, idempotent register.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.capabilities import grant
from app.core.matter_context import (
    InvalidSchemaError,
    SchemaNotFoundError,
    latest_version_for_namespace,
    load_schema,
    read_items,
    register_schema,
    supersede_item,
    write_item,
)
from app.core.phase1_runtime import BlockedReason, Phase1Blocked
from app.models import (
    AuditEntry,
    Matter,
    MatterContextItem,
    MatterContextSchema,
    PRIVILEGE_MIXED,
    STATUS_OPEN,
    User,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"mc-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_matter(db_session, user) -> Matter:
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"matter-{uuid.uuid4().hex[:8]}",
        title="Test Matter",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


async def _grant_write(db_session, user, namespace):
    await grant(
        db_session,
        user_id=user.id,
        plugin="core",
        skill="matter_context",
        capability=f"matter.context.{namespace}.write",
    )


async def _grant_read(db_session, user, namespace):
    await grant(
        db_session,
        user_id=user.id,
        plugin="core",
        skill="matter_context",
        capability=f"matter.context.{namespace}.read",
    )


FACTS_SCHEMA_V1 = {
    "type": "object",
    "required": ["text"],
    "properties": {
        "text": {"type": "string"},
        "source": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "additionalProperties": False,
}

FACTS_SCHEMA_V2 = {
    "type": "object",
    "required": ["text", "source"],
    "properties": {
        "text": {"type": "string"},
        "source": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "additionalProperties": False,
}


# ---------------------------------------------------------------------------
# Registry tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_schema_rejects_malformed_json_schema(db_session) -> None:
    """A document that is not a valid JSON Schema is rejected at
    register time."""
    with pytest.raises(InvalidSchemaError, match="JSON Schema"):
        await register_schema(
            db_session,
            namespace="bad.namespace",
            module_id="test-module",
            version="1.0.0",
            json_schema={"type": "not-a-valid-jsonschema-type"},
        )


@pytest.mark.asyncio
async def test_register_schema_is_idempotent_on_namespace_version(
    db_session,
) -> None:
    s1 = await register_schema(
        db_session,
        namespace="ns.test",
        module_id="m",
        version="1.0.0",
        json_schema=FACTS_SCHEMA_V1,
    )
    s2 = await register_schema(
        db_session,
        namespace="ns.test",
        module_id="m",
        version="1.0.0",
        json_schema=FACTS_SCHEMA_V1,
    )
    assert s1.id == s2.id


@pytest.mark.asyncio
async def test_latest_version_for_namespace_returns_newest(db_session) -> None:
    await register_schema(
        db_session,
        namespace="ns.latest",
        module_id="m",
        version="1.0.0",
        json_schema=FACTS_SCHEMA_V1,
    )
    await register_schema(
        db_session,
        namespace="ns.latest",
        module_id="m",
        version="2.0.0",
        json_schema=FACTS_SCHEMA_V2,
    )
    got = await latest_version_for_namespace(db_session, namespace="ns.latest")
    # Latest by registered_at — second insert.
    assert got == "2.0.0"


@pytest.mark.asyncio
async def test_load_schema_by_namespace_resolves_latest(db_session) -> None:
    await register_schema(
        db_session,
        namespace="ns.resolve",
        module_id="m",
        version="1.0.0",
        json_schema=FACTS_SCHEMA_V1,
    )
    await register_schema(
        db_session,
        namespace="ns.resolve",
        module_id="m",
        version="2.0.0",
        json_schema=FACTS_SCHEMA_V2,
    )
    schema = await load_schema(db_session, namespace="ns.resolve")
    assert schema.version == "2.0.0"


@pytest.mark.asyncio
async def test_load_schema_not_found(db_session) -> None:
    with pytest.raises(SchemaNotFoundError):
        await load_schema(db_session, namespace="nowhere", version="1.0.0")


# ---------------------------------------------------------------------------
# Canonical scenario 1: valid path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_valid_write_and_read(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    namespace = "memory.facts"
    await register_schema(
        db_session,
        namespace=namespace,
        module_id="legalise-matter-memory",
        version="1.0.0",
        json_schema=FACTS_SCHEMA_V1,
    )
    await _grant_write(db_session, user, namespace)
    await _grant_read(db_session, user, namespace)
    await db_session.flush()

    item = await write_item(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        payload={"text": "claimant employed 2022-2024"},
        user_id=user.id,
    )
    assert item.schema_version == "1.0.0"
    assert item.payload["text"] == "claimant employed 2022-2024"

    items = await read_items(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        user_id=user.id,
    )
    assert len(items) == 1
    assert items[0].id == item.id

    # Audit: one item.created + one item.read.
    created = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "matter_context.item.created",
            AuditEntry.resource_id == str(item.id),
        )
    )
    assert created is not None
    assert created.module == "core.matter_context"
    assert created.payload["schema_version"] == "1.0.0"

    read_row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "matter_context.item.read",
            AuditEntry.matter_id == matter.id,
        )
    )
    assert read_row is not None
    assert read_row.payload["result_count"] == 1


# ---------------------------------------------------------------------------
# Canonical scenario 2: denied capability on write
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_write_denied_capability(
    db_session, db_connection, monkeypatch
) -> None:
    """Round-4 Reviewer fix: mock ``audit_failure`` so the Phase 1
    canonical *.blocked row writes via the request session instead of
    a fresh pool connection. Production behaviour writes independently
    and survives caller rollback; in the conftest SAVEPOINT pattern
    that independent commit FK-violates against the uncommitted test
    user. Mirrors test_provider_audit_completeness pattern.
    """
    async def _fake_audit_failure(request_session, action, **kwargs):
        from app.core.api import audit

        await audit.log(
            request_session,
            action,
            actor_id=kwargs.get("actor_id"),
            matter_id=kwargs.get("matter_id"),
            module=kwargs.get("module"),
            resource_type=kwargs.get("resource_type"),
            resource_id=kwargs.get("resource_id"),
            payload=kwargs.get("payload"),
        )

    monkeypatch.setattr(
        "app.core.phase1_runtime.capability_check.audit_failure",
        _fake_audit_failure,
    )

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    namespace = "memory.facts"
    await register_schema(
        db_session,
        namespace=namespace,
        module_id="legalise-matter-memory",
        version="1.0.0",
        json_schema=FACTS_SCHEMA_V1,
    )
    # Do NOT grant write.
    await db_session.flush()

    with pytest.raises(Phase1Blocked) as exc_info:
        await write_item(
            db_session,
            matter_id=matter.id,
            namespace=namespace,
            payload={"text": "should not land"},
            user_id=user.id,
        )
    err = exc_info.value
    assert err.payload.blocked_reason == BlockedReason.CAPABILITY_DENIED
    assert err.payload.denied_capability == f"matter.context.{namespace}.write"

    # No item exists.
    items = (
        await db_session.scalars(
            select(MatterContextItem).where(
                MatterContextItem.matter_id == matter.id,
            )
        )
    ).all()
    assert items == []

    # Dual audit rows on a verification session.
    factory = async_sessionmaker(
        bind=db_connection,
        class_=AsyncSession,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    async with factory() as verify:
        legacy = await verify.scalar(
            select(AuditEntry).where(
                AuditEntry.actor_id == user.id,
                AuditEntry.action == "module.capability.denied",
            )
        )
        assert legacy is not None

        phase1 = await verify.scalar(
            select(AuditEntry).where(
                AuditEntry.actor_id == user.id,
                AuditEntry.action == "matter_context.write.blocked",
            )
        )
        assert phase1 is not None
        assert phase1.payload["blocked_reason"] == "capability_denied"


# ---------------------------------------------------------------------------
# Canonical scenario 3: schema violation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_schema_violation_blocks_write(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    namespace = "memory.facts"
    await register_schema(
        db_session,
        namespace=namespace,
        module_id="legalise-matter-memory",
        version="1.0.0",
        json_schema=FACTS_SCHEMA_V1,
    )
    await _grant_write(db_session, user, namespace)
    await db_session.flush()

    # Missing required "text" field.
    with pytest.raises(Phase1Blocked) as exc_info:
        await write_item(
            db_session,
            matter_id=matter.id,
            namespace=namespace,
            payload={"confidence": 0.8},
            user_id=user.id,
        )
    err = exc_info.value
    assert err.payload.blocked_reason == BlockedReason.SCHEMA_VIOLATION
    assert "errors" in err.payload.gate_state
    assert len(err.payload.gate_state["errors"]) >= 1

    # No item exists.
    items = (
        await db_session.scalars(
            select(MatterContextItem).where(
                MatterContextItem.matter_id == matter.id,
            )
        )
    ).all()
    assert items == []

    # Audit row.
    blocked = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "matter_context.write.blocked",
            AuditEntry.matter_id == matter.id,
        )
    )
    assert blocked is not None
    assert blocked.payload["blocked_reason"] == "schema_violation"


@pytest.mark.asyncio
async def test_write_with_no_schema_registered_blocks(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    namespace = "never.registered"
    await _grant_write(db_session, user, namespace)
    await db_session.flush()

    with pytest.raises(Phase1Blocked) as exc_info:
        await write_item(
            db_session,
            matter_id=matter.id,
            namespace=namespace,
            payload={"anything": "here"},
            user_id=user.id,
        )
    assert exc_info.value.payload.blocked_reason == BlockedReason.SCHEMA_VIOLATION


# ---------------------------------------------------------------------------
# Canonical scenario 4: schema-version write policy
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_schema_version_write_policy(db_session) -> None:
    """Default latest, explicit version, cross-version reads."""
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    namespace = "memory.facts"
    await register_schema(
        db_session,
        namespace=namespace,
        module_id="legalise-matter-memory",
        version="1.0.0",
        json_schema=FACTS_SCHEMA_V1,
    )
    await _grant_write(db_session, user, namespace)
    await _grant_read(db_session, user, namespace)
    await db_session.flush()

    # Write under v1 (latest at time of write).
    v1_item = await write_item(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        payload={"text": "fact 1"},
        user_id=user.id,
    )
    assert v1_item.schema_version == "1.0.0"

    # Register v2 — now latest.
    await register_schema(
        db_session,
        namespace=namespace,
        module_id="legalise-matter-memory",
        version="2.0.0",
        json_schema=FACTS_SCHEMA_V2,
    )
    await db_session.flush()

    # Write without explicit version → resolves to v2.
    v2_item = await write_item(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        payload={"text": "fact 2", "source": "doc-123"},
        user_id=user.id,
    )
    assert v2_item.schema_version == "2.0.0"

    # Write explicitly pinning v1 — succeeds because v1 schema only
    # requires `text`.
    v1_pinned = await write_item(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        schema_version="1.0.0",
        payload={"text": "fact 3"},
        user_id=user.id,
    )
    assert v1_pinned.schema_version == "1.0.0"

    # Read all: three items at their original schema versions.
    items = await read_items(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        user_id=user.id,
    )
    versions = {i.schema_version for i in items}
    assert versions == {"1.0.0", "2.0.0"}

    # Read filtered by version.
    only_v1 = await read_items(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        user_id=user.id,
        schema_version="1.0.0",
    )
    assert len(only_v1) == 2
    assert all(i.schema_version == "1.0.0" for i in only_v1)


# ---------------------------------------------------------------------------
# Canonical scenario 5: read denied capability
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_read_denied_capability(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    namespace = "memory.facts"
    await register_schema(
        db_session,
        namespace=namespace,
        module_id="legalise-matter-memory",
        version="1.0.0",
        json_schema=FACTS_SCHEMA_V1,
    )
    # No read grant.
    await db_session.flush()

    with pytest.raises(Phase1Blocked) as exc_info:
        await read_items(
            db_session,
            matter_id=matter.id,
            namespace=namespace,
            user_id=user.id,
        )
    assert exc_info.value.payload.blocked_reason == BlockedReason.CAPABILITY_DENIED


# ---------------------------------------------------------------------------
# Canonical scenario 6: supersede chain
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_supersede_chain(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    namespace = "memory.facts"
    await register_schema(
        db_session,
        namespace=namespace,
        module_id="legalise-matter-memory",
        version="1.0.0",
        json_schema=FACTS_SCHEMA_V1,
    )
    await _grant_write(db_session, user, namespace)
    await _grant_read(db_session, user, namespace)
    await db_session.flush()

    original = await write_item(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        payload={"text": "original fact"},
        user_id=user.id,
    )
    old, new = await supersede_item(
        db_session,
        matter_id=matter.id,
        item_id=original.id,
        new_payload={"text": "amended fact"},
        user_id=user.id,
        reason="correction",
    )
    assert old.superseded_by_id == new.id
    assert old.id == original.id

    # Default read excludes superseded.
    items = await read_items(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        user_id=user.id,
    )
    assert len(items) == 1
    assert items[0].id == new.id

    # include_superseded=True shows both.
    all_items = await read_items(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        user_id=user.id,
        include_superseded=True,
    )
    assert len(all_items) == 2

    # Audit: original item.created + new item.created + item.superseded.
    superseded_row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "matter_context.item.superseded",
            AuditEntry.resource_id == str(original.id),
        )
    )
    assert superseded_row is not None
    assert superseded_row.payload["superseded_by_id"] == str(new.id)


# ---------------------------------------------------------------------------
# Canonical scenario 7: audit emission across all paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_emission_across_paths(db_session) -> None:
    """Every meaningful path emits the expected canonical event name."""
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    namespace = "audit.test"
    await register_schema(
        db_session,
        namespace=namespace,
        module_id="m",
        version="1.0.0",
        json_schema=FACTS_SCHEMA_V1,
    )
    await _grant_write(db_session, user, namespace)
    await _grant_read(db_session, user, namespace)
    await db_session.flush()

    # write success
    item = await write_item(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        payload={"text": "x"},
        user_id=user.id,
    )
    # read success
    await read_items(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        user_id=user.id,
    )
    # supersede
    await supersede_item(
        db_session,
        matter_id=matter.id,
        item_id=item.id,
        new_payload={"text": "y"},
        user_id=user.id,
    )
    # schema-violation write
    with pytest.raises(Phase1Blocked):
        await write_item(
            db_session,
            matter_id=matter.id,
            namespace=namespace,
            payload={"wrong": "shape"},
            user_id=user.id,
        )

    expected_actions = {
        "matter_context.item.created",
        "matter_context.item.read",
        "matter_context.item.superseded",
        "matter_context.write.blocked",
    }
    for action in expected_actions:
        row = await db_session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == action,
                AuditEntry.matter_id == matter.id,
            )
        )
        assert row is not None, f"missing audit row for action={action}"
        assert row.module == "core.matter_context"
