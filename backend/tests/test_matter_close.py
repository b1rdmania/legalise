"""Phase 4 — matter close grant-revocation cascade tests."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import (
    AuditEntry,
    Matter,
    PRIVILEGE_MIXED,
    STATUS_ARCHIVED,
    STATUS_OPEN,
    User,
    WorkspaceSkillCapabilityGrant,
)


async def _make_user(db_session, *, email_prefix="p4-cascade") -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"{email_prefix}-{uuid.uuid4().hex[:8]}@example.com",
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
        title="Cascade Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


@pytest.mark.asyncio
async def test_grant_with_matter_id_in_snapshot_revoked_on_archive(
    client,
) -> None:
    """A matter-scoped grant gets cascaded when its matter archives."""
    # Set up: register user, create matter, install a grant scoped
    # to that matter via the snapshot.
    email = f"p4-cascade-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase4-cascade-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(
            select(User).where(User.email == email)
        )
        assert user is not None

        # Create matter using API to ensure slug + IDs are consistent.
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"cascade-{uuid.uuid4().hex[:8]}",
            title="Cascade Test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter)
        await session.flush()
        matter_id = matter.id

        # Insert a matter-scoped grant.
        grant_row = WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="some-module",
            skill="default",
            capability="matter.context.test.write",
            capability_version="2.0.0",
            granted_at_module_version="1.0.0",
            granted_permissions_snapshot={
                "matter_id": str(matter_id),
                "reads": [],
                "writes": ["matter.context.test.write"],
            },
            scope_type="matter",
            scope_id=matter_id,
        )
        session.add(grant_row)
        await session.commit()
        matter_slug = matter.slug

    # Archive the matter via DELETE /api/matters/{slug}.
    resp = await client.delete(f"/api/matters/{matter_slug}")
    assert resp.status_code == 204, resp.text

    # Verify the grant was revoked.
    async with factory() as verify:
        remaining = (
            await verify.scalars(
                select(WorkspaceSkillCapabilityGrant).where(
                    WorkspaceSkillCapabilityGrant.user_id == user.id,
                    WorkspaceSkillCapabilityGrant.plugin == "some-module",
                )
            )
        ).all()
        assert remaining == []

    # And matter is archived.
    async with factory() as verify:
        m = await verify.scalar(
            select(Matter).where(Matter.id == matter_id)
        )
        assert m.status == STATUS_ARCHIVED


@pytest.mark.asyncio
async def test_grant_without_snapshot_survives_archive(client) -> None:
    """v1 grants (granted_permissions_snapshot=NULL) are NOT cascaded
    — they're not matter-scoped under Phase 4 policy."""
    email = f"p4-legacy-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase4-cascade-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(
            select(User).where(User.email == email)
        )
        assert user is not None

        matter = Matter(
            id=uuid.uuid4(),
            slug=f"legacy-{uuid.uuid4().hex[:8]}",
            title="Legacy Test",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter)
        await session.flush()
        matter_slug = matter.slug
        # Legacy grant — snapshot is NULL.
        grant_row = WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="legacy-plugin",
            skill="default",
            capability="matter.read",
        )
        session.add(grant_row)
        await session.commit()

    resp = await client.delete(f"/api/matters/{matter_slug}")
    assert resp.status_code == 204

    # Legacy grant survives.
    async with factory() as verify:
        rows = (
            await verify.scalars(
                select(WorkspaceSkillCapabilityGrant).where(
                    WorkspaceSkillCapabilityGrant.user_id == user.id,
                    WorkspaceSkillCapabilityGrant.plugin == "legacy-plugin",
                )
            )
        ).all()
        assert len(rows) == 1


@pytest.mark.asyncio
async def test_grant_for_other_matter_not_revoked(client) -> None:
    """A grant scoped to matter A must not be revoked when matter B
    archives."""
    email = f"p4-othermatter-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase4-cascade-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(
            select(User).where(User.email == email)
        )
        matter_a = Matter(
            id=uuid.uuid4(),
            slug=f"a-{uuid.uuid4().hex[:8]}",
            title="A",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        matter_b = Matter(
            id=uuid.uuid4(),
            slug=f"b-{uuid.uuid4().hex[:8]}",
            title="B",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter_a)
        session.add(matter_b)
        await session.flush()
        # Grant scoped to A.
        session.add(
            WorkspaceSkillCapabilityGrant(
                id=uuid.uuid4(),
                user_id=user.id,
                plugin="module-a",
                skill="default",
                capability="matter.context.a.write",
                granted_permissions_snapshot={"matter_id": str(matter_a.id)},
                scope_type="matter",
                scope_id=matter_a.id,
            )
        )
        await session.commit()
        slug_b = matter_b.slug

    # Archive B.
    resp = await client.delete(f"/api/matters/{slug_b}")
    assert resp.status_code == 204

    # Grant on A survives.
    async with factory() as verify:
        rows = (
            await verify.scalars(
                select(WorkspaceSkillCapabilityGrant).where(
                    WorkspaceSkillCapabilityGrant.user_id == user.id,
                    WorkspaceSkillCapabilityGrant.plugin == "module-a",
                )
            )
        ).all()
        assert len(rows) == 1


@pytest.mark.asyncio
async def test_audit_row_emitted_on_cascade(client) -> None:
    """The cascade emits a module.grant.revoked audit row."""
    email = f"p4-audit-{uuid.uuid4().hex[:8]}@example.com"
    password = "phase4-cascade-2026"
    await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    from app.main import app

    factory = app.state.session_factory
    async with factory() as session:
        user = await session.scalar(
            select(User).where(User.email == email)
        )
        matter = Matter(
            id=uuid.uuid4(),
            slug=f"audit-{uuid.uuid4().hex[:8]}",
            title="Audit",
            matter_type="employment_tribunal",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_MIXED,
            default_model_id="claude-opus-4-7",
            created_by_id=user.id,
        )
        session.add(matter)
        await session.flush()
        session.add(
            WorkspaceSkillCapabilityGrant(
                id=uuid.uuid4(),
                user_id=user.id,
                plugin="audit-test",
                skill="default",
                capability="matter.context.audit.write",
                granted_permissions_snapshot={"matter_id": str(matter.id)},
                scope_type="matter",
                scope_id=matter.id,
            )
        )
        await session.commit()
        matter_id = matter.id
        slug = matter.slug

    resp = await client.delete(f"/api/matters/{slug}")
    assert resp.status_code == 204

    async with factory() as verify:
        rows = (
            await verify.scalars(
                select(AuditEntry).where(
                    AuditEntry.action == "module.grant.revoked",
                    AuditEntry.matter_id == matter_id,
                )
            )
        ).all()
        assert len(rows) >= 1
        # Payload should record the reason.
        assert any(
            r.payload.get("reason") == "matter_archived" for r in rows
        )
