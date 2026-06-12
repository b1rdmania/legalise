"""Phase 1 security-fix tests for the Reviewer P1 findings that
guard live code.

Covers:

- P1#1 advice_boundary role derivation: HTTP endpoint derives role
  from User.is_superuser, not from request body. Client cannot
  impersonate a higher role by submitting actor_role.

- P1#3 matter-context schema registration admin gate: non-superuser
  cannot register schemas.

The P1#2 state-machine IDOR tests moved to
``tests/dormant/test_state_machine_api_security.py`` when the
state-machine primitive was parked in ``backend/contrib/``
(2026-06-12, test-slim order Phase 2 / fluff-cut order Phase D).

These tests exercise the HTTP layer because that's where the trust
boundary lives. The runtime/programmatic APIs accept richer inputs by
design — internal callers that have already verified role/ownership
keep that flexibility.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from app.api.advice_boundary import _derive_actor_role
from app.core.admin_check import require_admin
from app.models import User


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
