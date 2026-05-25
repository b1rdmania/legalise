"""Phase 1 security-fix tests for the three Reviewer P1 findings.

Covers:

- P1#1 advice_boundary role derivation: HTTP endpoint derives role
  from User.is_superuser, not from request body. Client cannot
  impersonate a higher role by submitting actor_role.

- P1#2 state-machine IDOR: ownership check fires on read and
  transition. Cross-user UUID access returns 404 (codebase
  convention to avoid leaking existence).

- P1#3 matter-context schema registration admin gate: non-superuser
  cannot register schemas.

These tests exercise the HTTP layer because that's where the trust
boundary lives. The runtime/programmatic APIs accept richer inputs by
design — internal callers (workflows, reference modules) that have
already verified role/ownership keep that flexibility.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from fastapi import HTTPException

from app.api.advice_boundary import _derive_actor_role
from app.api.state_machine import (
    _OWNER_SCOPE_MATTER,
    _OWNER_SCOPE_WORKSPACE,
    _assert_instance_access,
    _resolve_owner_for_create,
)
from app.core.admin_check import require_admin
from app.core.state_machine import (
    create_instance,
    register_definition,
)
from app.models import (
    Matter,
    PRIVILEGE_MIXED,
    STATUS_ARCHIVED,
    STATUS_OPEN,
    StateMachineInstance,
    User,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_user(db_session, *, is_superuser: bool = False) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"sec-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=is_superuser,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_matter(db_session, user, *, archived: bool = False) -> Matter:
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"matter-{uuid.uuid4().hex[:8]}",
        title="Sec Matter",
        matter_type="employment_tribunal",
        status=STATUS_ARCHIVED if archived else STATUS_OPEN,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


# ---------------------------------------------------------------------------
# P1#1 — advice_boundary role derivation (pure unit on the helper)
# ---------------------------------------------------------------------------


def test_derive_actor_role_for_superuser_returns_workspace_admin() -> None:
    user = User(
        id=uuid.uuid4(),
        email="x@x",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=True,
    )
    assert _derive_actor_role(user) == "workspace_admin"


def test_derive_actor_role_for_regular_user_returns_any_authenticated() -> None:
    user = User(
        id=uuid.uuid4(),
        email="x@x",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    assert _derive_actor_role(user) == "any_authenticated"


def test_check_request_drops_actor_role_field() -> None:
    """Reviewer P1#1: the CheckRequest model no longer has actor_role.
    Pydantic by default ignores extra fields, so even if a client
    sends actor_role in the body, it never reaches the gate."""
    from app.api.advice_boundary import CheckRequest

    body = CheckRequest(
        output_id="o",
        requested_tier="draft_advice",
    )
    # No actor_role attribute on the model.
    assert not hasattr(body, "actor_role")

    # Extra fields supplied by client are ignored — model still
    # parses without raising.
    body_with_extra = CheckRequest.model_validate(
        {
            "output_id": "o",
            "requested_tier": "draft_advice",
            "actor_role": "qualified_solicitor",  # client-supplied
        }
    )
    assert not hasattr(body_with_extra, "actor_role")


# ---------------------------------------------------------------------------
# P1#2 — state-machine ownership enforcement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_owner_for_create_workspace_forces_user_id(
    db_session,
) -> None:
    """workspace scope: owner_ref is ignored; server returns user.id.
    Reviewer P1#2 — a caller cannot bind a workspace-scoped instance
    to another user's id."""
    user = await _make_user(db_session)
    other_user = await _make_user(db_session)

    # Even if the caller supplies someone else's id as owner_ref, the
    # server forces user.id.
    owner_id = await _resolve_owner_for_create(
        db_session,
        user=user,
        owner_scope=_OWNER_SCOPE_WORKSPACE,
        owner_ref=str(other_user.id),
    )
    assert owner_id == str(user.id)


@pytest.mark.asyncio
async def test_resolve_owner_for_create_matter_requires_owned_slug(
    db_session,
) -> None:
    """matter scope: owner_ref must be a slug for a live matter owned
    by the caller. Resolves to the matter's UUID string."""
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)

    owner_id = await _resolve_owner_for_create(
        db_session,
        user=user,
        owner_scope=_OWNER_SCOPE_MATTER,
        owner_ref=matter.slug,
    )
    assert owner_id == str(matter.id)


@pytest.mark.asyncio
async def test_resolve_owner_for_create_matter_rejects_other_users_slug(
    db_session,
) -> None:
    """Reviewer P1#2: caller cannot bind a matter-scoped instance to
    another user's matter. Returns 404 (codebase convention — no
    existence leak)."""
    owner_user = await _make_user(db_session)
    attacker = await _make_user(db_session)
    matter = await _make_matter(db_session, owner_user)

    with pytest.raises(HTTPException) as exc:
        await _resolve_owner_for_create(
            db_session,
            user=attacker,
            owner_scope=_OWNER_SCOPE_MATTER,
            owner_ref=matter.slug,
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_resolve_owner_for_create_matter_rejects_archived(
    db_session,
) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user, archived=True)

    with pytest.raises(HTTPException) as exc:
        await _resolve_owner_for_create(
            db_session,
            user=user,
            owner_scope=_OWNER_SCOPE_MATTER,
            owner_ref=matter.slug,
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_resolve_owner_for_create_unknown_scope_is_422(
    db_session,
) -> None:
    user = await _make_user(db_session)
    with pytest.raises(HTTPException) as exc:
        await _resolve_owner_for_create(
            db_session,
            user=user,
            owner_scope="prospect",
            owner_ref="anything",
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_resolve_owner_for_create_matter_without_ref_is_422(
    db_session,
) -> None:
    user = await _make_user(db_session)
    with pytest.raises(HTTPException) as exc:
        await _resolve_owner_for_create(
            db_session,
            user=user,
            owner_scope=_OWNER_SCOPE_MATTER,
            owner_ref=None,
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_assert_instance_access_workspace_scope_owner_passes(
    db_session,
) -> None:
    user = await _make_user(db_session)
    instance = StateMachineInstance(
        id=uuid.uuid4(),
        definition_id=uuid.uuid4(),
        definition_version="1.0.0",
        owner_scope=_OWNER_SCOPE_WORKSPACE,
        owner_id=str(user.id),
        current_state="x",
    )
    # No raise.
    await _assert_instance_access(db_session, user=user, instance=instance)


@pytest.mark.asyncio
async def test_assert_instance_access_workspace_scope_cross_user_404(
    db_session,
) -> None:
    user = await _make_user(db_session)
    attacker = await _make_user(db_session)
    instance = StateMachineInstance(
        id=uuid.uuid4(),
        definition_id=uuid.uuid4(),
        definition_version="1.0.0",
        owner_scope=_OWNER_SCOPE_WORKSPACE,
        owner_id=str(user.id),  # belongs to `user`
        current_state="x",
    )
    with pytest.raises(HTTPException) as exc:
        await _assert_instance_access(
            db_session, user=attacker, instance=instance
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_assert_instance_access_matter_scope_owner_passes(
    db_session,
) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    instance = StateMachineInstance(
        id=uuid.uuid4(),
        definition_id=uuid.uuid4(),
        definition_version="1.0.0",
        owner_scope=_OWNER_SCOPE_MATTER,
        owner_id=str(matter.id),
        current_state="x",
    )
    await _assert_instance_access(db_session, user=user, instance=instance)


@pytest.mark.asyncio
async def test_assert_instance_access_matter_scope_cross_user_404(
    db_session,
) -> None:
    user = await _make_user(db_session)
    attacker = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    instance = StateMachineInstance(
        id=uuid.uuid4(),
        definition_id=uuid.uuid4(),
        definition_version="1.0.0",
        owner_scope=_OWNER_SCOPE_MATTER,
        owner_id=str(matter.id),
        current_state="x",
    )
    with pytest.raises(HTTPException) as exc:
        await _assert_instance_access(
            db_session, user=attacker, instance=instance
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_assert_instance_access_matter_scope_archived_404(
    db_session,
) -> None:
    """Even the owning user gets 404 if the matter is archived —
    consistent with resolve_owned_open_matter behaviour."""
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user, archived=True)
    instance = StateMachineInstance(
        id=uuid.uuid4(),
        definition_id=uuid.uuid4(),
        definition_version="1.0.0",
        owner_scope=_OWNER_SCOPE_MATTER,
        owner_id=str(matter.id),
        current_state="x",
    )
    with pytest.raises(HTTPException) as exc:
        await _assert_instance_access(
            db_session, user=user, instance=instance
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_assert_instance_access_malformed_owner_id_404(
    db_session,
) -> None:
    """A matter-scoped instance with a non-UUID owner_id (corrupted
    or pre-fix data) returns 404 rather than 500."""
    user = await _make_user(db_session)
    instance = StateMachineInstance(
        id=uuid.uuid4(),
        definition_id=uuid.uuid4(),
        definition_version="1.0.0",
        owner_scope=_OWNER_SCOPE_MATTER,
        owner_id="not-a-uuid",
        current_state="x",
    )
    with pytest.raises(HTTPException) as exc:
        await _assert_instance_access(
            db_session, user=user, instance=instance
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_assert_instance_access_unknown_scope_404(db_session) -> None:
    """An instance with an unknown owner_scope (e.g. inserted directly
    by a runtime caller bypassing the HTTP enforcement) returns 404
    from the HTTP layer. Defense in depth."""
    user = await _make_user(db_session)
    instance = StateMachineInstance(
        id=uuid.uuid4(),
        definition_id=uuid.uuid4(),
        definition_version="1.0.0",
        owner_scope="prospect",
        owner_id="anything",
        current_state="x",
    )
    with pytest.raises(HTTPException) as exc:
        await _assert_instance_access(
            db_session, user=user, instance=instance
        )
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# P1#3 — matter-context schema registration admin gate
# ---------------------------------------------------------------------------


def test_require_admin_rejects_non_superuser() -> None:
    user = User(
        id=uuid.uuid4(),
        email="x@x",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    with pytest.raises(HTTPException) as exc:
        require_admin(user, action_label="matter-context schema registration")
    assert exc.value.status_code == 403
    assert exc.value.detail["error"] == "admin_required"
    assert (
        "matter-context schema registration" in exc.value.detail["message"]
    )


def test_require_admin_permits_superuser() -> None:
    user = User(
        id=uuid.uuid4(),
        email="x@x",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=True,
    )
    # No raise.
    require_admin(user, action_label="anything")


def test_require_admin_for_state_machine_definition_registration() -> None:
    """Reviewer P1#2 round 2: state-machine definition registration
    uses the same admin gate. The action_label interpolation surfaces
    a distinct message in the 403 envelope."""
    user = User(
        id=uuid.uuid4(),
        email="x@x",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    with pytest.raises(HTTPException) as exc:
        require_admin(
            user, action_label="state-machine definition registration"
        )
    assert exc.value.status_code == 403
    assert (
        "state-machine definition registration"
        in exc.value.detail["message"]
    )
