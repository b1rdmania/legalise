"""Advice boundary primitive — tier vocabulary + gate tests.

ENFORCED in v0.1 (verified 2026-06-12, test-slim order Phase 2). The
live call chain: chat tool calls (``modules/assistant/pipeline.py``)
and ``POST /api/invocations`` both dispatch through
``core.runtime.dispatch_capability``; prompt-runtime capabilities (the
only way skills arrive — Lawve catalogue / GitHub import) run
``core.prompt_runtime.run_prompt_capability``, which calls
``advice_boundary.check()`` per invocation and raises
``AdviceBoundaryDenied`` on denial — translated to a 403 by the
invocations endpoint and to a user-facing failure message by the
assistant pipeline. Tier vocabulary, transition rules, the
initial-tier cap, and declared_tier_max are enforced unconditionally;
the role requirement additionally gates on
``LEGALISE_FIRM_ROLE_GATES_ENABLED`` (the suite runs firm-mode via the
autouse conftest fixture).

Eight canonical scenarios from PHASE_1_BUILD_PLAN.md:

1. Valid transition (draft_advice -> supervised_legal_advice with solicitor)
2. Invalid transition (draft_advice -> approved_final_advice skipping supervised)
3. Downward transition (supervised_legal_advice -> draft_advice)
4. Role denial (draft -> supervised with non-solicitor actor)
5. Tier exceeds declared max
6. Null declared_tier_max (Phase 1 mode — accepted + logged)
7. Immutability of approved_final_advice (no transition out)
8. Audit emission verified across paths

Plus the matter-context composition test (formerly in
``test_phase1_integration.py``).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.advice_boundary import (
    ALLOWED_TRANSITIONS,
    ADVICE_TIER_APPROVED_FINAL_ADVICE,
    ADVICE_TIER_DRAFT_ADVICE,
    ADVICE_TIER_FACTUAL_EXTRACTION,
    ADVICE_TIER_LEGAL_INFORMATION,
    ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
    InvalidTierError,
    ROLE_REQUIREMENTS,
    check,
    is_terminal_tier,
)
from app.core.advice_boundary.tiers import (
    assert_tier,
    is_allowed_transition,
    role_satisfies,
    tier_rank,
)
from app.core.capabilities import grant
from app.core.matter_context import (
    register_schema,
    write_item,
)
from app.models import (
    AdviceBoundaryDecision,
    AuditEntry,
    DECISION_STATUS_BLOCKED,
    DECISION_STATUS_COMPLETED,
    DECISION_STATUS_DENIED,
    DECISION_STATUS_FAILED,
    Matter,
    PRIVILEGE_MIXED,
    STATUS_OPEN,
    User,
)


# ---------------------------------------------------------------------------
# Pure unit tests — no DB
# ---------------------------------------------------------------------------


def test_allowed_transitions_lock() -> None:
    """The allowed transition set is exactly the five rules in
    ADVICE_BOUNDARY.md. Drift would silently weaken the gate."""
    assert ALLOWED_TRANSITIONS == frozenset(
        {
            (ADVICE_TIER_FACTUAL_EXTRACTION, ADVICE_TIER_LEGAL_INFORMATION),
            (ADVICE_TIER_FACTUAL_EXTRACTION, ADVICE_TIER_DRAFT_ADVICE),
            (ADVICE_TIER_LEGAL_INFORMATION, ADVICE_TIER_DRAFT_ADVICE),
            (ADVICE_TIER_DRAFT_ADVICE, ADVICE_TIER_SUPERVISED_LEGAL_ADVICE),
            (
                ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
                ADVICE_TIER_APPROVED_FINAL_ADVICE,
            ),
        }
    )


def test_terminal_tier_approved_final() -> None:
    assert is_terminal_tier(ADVICE_TIER_APPROVED_FINAL_ADVICE) is True
    assert is_terminal_tier(ADVICE_TIER_DRAFT_ADVICE) is False


def test_tier_rank_ordering() -> None:
    assert tier_rank(ADVICE_TIER_FACTUAL_EXTRACTION) < tier_rank(
        ADVICE_TIER_LEGAL_INFORMATION
    )
    assert tier_rank(ADVICE_TIER_SUPERVISED_LEGAL_ADVICE) < tier_rank(
        ADVICE_TIER_APPROVED_FINAL_ADVICE
    )


def test_assert_tier_rejects_unknown() -> None:
    with pytest.raises(InvalidTierError):
        assert_tier("not_a_tier")


def test_is_allowed_transition() -> None:
    assert is_allowed_transition(
        ADVICE_TIER_DRAFT_ADVICE, ADVICE_TIER_SUPERVISED_LEGAL_ADVICE
    )
    # Downward: not allowed.
    assert not is_allowed_transition(
        ADVICE_TIER_SUPERVISED_LEGAL_ADVICE, ADVICE_TIER_DRAFT_ADVICE
    )
    # Skipping: not allowed.
    assert not is_allowed_transition(
        ADVICE_TIER_DRAFT_ADVICE, ADVICE_TIER_APPROVED_FINAL_ADVICE
    )


def test_role_satisfies_any_authenticated() -> None:
    assert role_satisfies(
        actor_role="any_role_string",
        requirement_set=frozenset({"any_authenticated"}),
    )
    # No role token at all — not satisfied even for any_authenticated.
    assert not role_satisfies(
        actor_role=None,
        requirement_set=frozenset({"any_authenticated"}),
    )


def test_role_satisfies_literal_membership() -> None:
    assert role_satisfies(
        actor_role="qualified_solicitor",
        requirement_set=frozenset({"qualified_solicitor", "workspace_admin"}),
    )
    assert not role_satisfies(
        actor_role="paralegal",
        requirement_set=frozenset({"qualified_solicitor", "workspace_admin"}),
    )


def test_role_requirements_for_supervised_transition_is_solicitor_only() -> None:
    """Reviewer P2 — admin override does NOT apply to the
    draft -> supervised step. Per ADVICE_BOUNDARY.md only a qualified
    solicitor's clinical review can promote draft advice to supervised
    state. Admin override is permitted only for the final approval
    step."""
    req = ROLE_REQUIREMENTS[
        (ADVICE_TIER_DRAFT_ADVICE, ADVICE_TIER_SUPERVISED_LEGAL_ADVICE)
    ]
    assert req == frozenset({"qualified_solicitor"})


def test_role_requirements_for_final_approval_includes_admin() -> None:
    """Final approval permits admin override per ADVICE_BOUNDARY.md."""
    req = ROLE_REQUIREMENTS[
        (
            ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
            ADVICE_TIER_APPROVED_FINAL_ADVICE,
        )
    ]
    assert "qualified_solicitor" in req
    assert "workspace_admin" in req


# ---------------------------------------------------------------------------
# DB-backed gate tests
# ---------------------------------------------------------------------------


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"ab-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


# ---------------------------------------------------------------------------
# Canonical scenario 1: valid transition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_valid_transition_with_solicitor(db_session) -> None:
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        from_tier=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=user.id,
        actor_role="qualified_solicitor",
    )
    assert result["allowed"] is True
    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.id == uuid.UUID(result["decision_id"])
        )
    )
    assert decision.status == DECISION_STATUS_COMPLETED
    assert decision.actor_role == "qualified_solicitor"

    audit_row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "advice_boundary.check.completed",
            AuditEntry.resource_id == str(decision.id),
        )
    )
    assert audit_row is not None
    assert audit_row.module == "core.advice_boundary"


# ---------------------------------------------------------------------------
# Canonical scenario 2: invalid transition (skipping supervised)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_invalid_transition_skipping_supervised(db_session) -> None:
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_APPROVED_FINAL_ADVICE,
        from_tier=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=user.id,
        actor_role="qualified_solicitor",
    )
    assert result["allowed"] is False
    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.id == uuid.UUID(result["decision_id"])
        )
    )
    assert decision.status == DECISION_STATUS_BLOCKED
    assert result["gate_state"]["blocked_reason"] == "invalid_transition"

    audit_row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "advice_boundary.check.blocked",
            AuditEntry.resource_id == str(decision.id),
        )
    )
    assert audit_row is not None


# ---------------------------------------------------------------------------
# Canonical scenario 3: downward transition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_downward_transition(db_session) -> None:
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_DRAFT_ADVICE,
        from_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        actor_user_id=user.id,
        actor_role="qualified_solicitor",
    )
    assert result["allowed"] is False
    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.id == uuid.UUID(result["decision_id"])
        )
    )
    assert decision.status == DECISION_STATUS_BLOCKED
    assert result["gate_state"]["blocked_reason"] == "invalid_transition"


# ---------------------------------------------------------------------------
# Reviewer P2: workspace_admin cannot promote draft -> supervised
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_workspace_admin_cannot_promote_draft_to_supervised(db_session) -> None:
    """Per ADVICE_BOUNDARY.md, admin override does not apply to the
    draft -> supervised promotion step. Only a qualified solicitor's
    clinical review can promote."""
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        from_tier=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=user.id,
        actor_role="workspace_admin",  # NOT solicitor
    )
    assert result["allowed"] is False
    assert result["gate_state"]["blocked_reason"] == "role_denied"
    assert "workspace_admin" not in result["gate_state"]["required"]
    assert "qualified_solicitor" in result["gate_state"]["required"]


# ---------------------------------------------------------------------------
# Canonical scenario 4: role denial
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_role_denied(db_session) -> None:
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        from_tier=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=user.id,
        actor_role="paralegal",  # not in the required set
    )
    assert result["allowed"] is False
    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.id == uuid.UUID(result["decision_id"])
        )
    )
    assert decision.status == DECISION_STATUS_DENIED
    assert result["gate_state"]["blocked_reason"] == "role_denied"
    assert result["gate_state"]["actor_role"] == "paralegal"
    assert "qualified_solicitor" in result["gate_state"]["required"]

    audit_row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "advice_boundary.check.denied",
            AuditEntry.resource_id == str(decision.id),
        )
    )
    assert audit_row is not None


# ---------------------------------------------------------------------------
# Canonical scenario 5: tier exceeds declared max
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_tier_exceeds_declared_max(db_session) -> None:
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    # Capability declared advice_tier_max = draft_advice but caller
    # requests supervised_legal_advice. Even with a qualified solicitor
    # role this is denied because the manifest forbids it.
    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        from_tier=ADVICE_TIER_DRAFT_ADVICE,
        declared_tier_max=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=user.id,
        actor_role="qualified_solicitor",
    )
    assert result["allowed"] is False
    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.id == uuid.UUID(result["decision_id"])
        )
    )
    assert decision.status == DECISION_STATUS_DENIED
    assert result["gate_state"]["blocked_reason"] == "tier_exceeded"


# ---------------------------------------------------------------------------
# Canonical scenario 6: null declared_tier_max (Phase 1 mode)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_null_declared_tier_max_allowed(db_session) -> None:
    """With declared_tier_max=None (Phase 1 mode), the tier-max check
    is skipped. The decision still records the null condition for
    Phase 5 audit reconstruction."""
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        from_tier=ADVICE_TIER_DRAFT_ADVICE,
        declared_tier_max=None,
        actor_user_id=user.id,
        actor_role="qualified_solicitor",
    )
    assert result["allowed"] is True
    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.id == uuid.UUID(result["decision_id"])
        )
    )
    assert decision.status == DECISION_STATUS_COMPLETED
    assert decision.declared_tier_max is None
    assert result["gate_state"]["declared_tier_max_supplied"] is False


# ---------------------------------------------------------------------------
# Canonical scenario 7: immutability of approved_final_advice
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canonical_no_transition_out_of_terminal(db_session) -> None:
    """Once an output reaches approved_final_advice it cannot transition
    out — even with workspace_admin role."""
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    # Try to demote from approved_final_advice back to supervised.
    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        from_tier=ADVICE_TIER_APPROVED_FINAL_ADVICE,
        actor_user_id=user.id,
        actor_role="workspace_admin",
    )
    assert result["allowed"] is False
    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.id == uuid.UUID(result["decision_id"])
        )
    )
    assert decision.status == DECISION_STATUS_BLOCKED
    assert result["gate_state"]["blocked_reason"] == "tier_disallowed"
    assert result["gate_state"]["reason"] == "from_tier_is_terminal"


# ---------------------------------------------------------------------------
# Initial-tier setting (no from_tier)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_initial_tier_creation_with_any_authenticated(db_session) -> None:
    """Creating an output at draft_advice (from_tier=None) succeeds
    for any authenticated actor — initial-tier rules use the
    INITIAL_TIER_ROLE_REQUIREMENTS table."""
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_DRAFT_ADVICE,
        from_tier=None,
        actor_user_id=user.id,
        actor_role="paralegal",
    )
    assert result["allowed"] is True


@pytest.mark.asyncio
async def test_initial_tier_supervised_is_not_permitted(db_session) -> None:
    """Reviewer P1#1 round 2: supervised_legal_advice cannot be set as
    initial tier (from_tier=None). It requires a transition path
    through prior tiers. Closes the supervision-bypass path where
    direct creation could yield a supervised output with no draft
    history."""
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    # Try as solicitor — still blocked because the tier itself is not
    # permitted as initial.
    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        from_tier=None,
        actor_user_id=user.id,
        actor_role="qualified_solicitor",
    )
    assert result["allowed"] is False
    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.id == uuid.UUID(result["decision_id"])
        )
    )
    assert decision.status == DECISION_STATUS_BLOCKED
    assert result["gate_state"]["blocked_reason"] == "invalid_transition"
    assert result["gate_state"]["reason"] == "tier_not_permitted_as_initial"


@pytest.mark.asyncio
async def test_initial_tier_approved_final_is_not_permitted(db_session) -> None:
    """Reviewer P1#1 round 2: approved_final_advice cannot be set as
    initial tier, even for workspace_admin. This closes the bypass
    where an admin could direct-create final advice with no supervised
    history."""
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_APPROVED_FINAL_ADVICE,
        from_tier=None,
        actor_user_id=user.id,
        actor_role="workspace_admin",
    )
    assert result["allowed"] is False
    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.id == uuid.UUID(result["decision_id"])
        )
    )
    assert decision.status == DECISION_STATUS_BLOCKED
    assert result["gate_state"]["blocked_reason"] == "invalid_transition"
    assert result["gate_state"]["reason"] == "tier_not_permitted_as_initial"


# ---------------------------------------------------------------------------
# Invalid tier vocabulary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_tier_string_is_failed(db_session) -> None:
    """Tier strings outside the canonical vocabulary produce a
    `failed` decision (system error), not blocked/denied."""
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    result = await check(
        db_session,
        output_id=output_id,
        requested_tier="not_a_tier",
        from_tier=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=user.id,
        actor_role="qualified_solicitor",
    )
    assert result["allowed"] is False
    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.id == uuid.UUID(result["decision_id"])
        )
    )
    assert decision.status == DECISION_STATUS_FAILED

    audit_row = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "advice_boundary.check.failed",
            AuditEntry.resource_id == str(decision.id),
        )
    )
    assert audit_row is not None


# ---------------------------------------------------------------------------
# Canonical scenario 8: audit emission across all paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_emission_across_paths(db_session) -> None:
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    # completed
    await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        from_tier=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=user.id,
        actor_role="qualified_solicitor",
    )
    # blocked (invalid transition)
    await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_APPROVED_FINAL_ADVICE,
        from_tier=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=user.id,
        actor_role="qualified_solicitor",
    )
    # denied (role)
    await check(
        db_session,
        output_id=output_id,
        requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        from_tier=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=user.id,
        actor_role="paralegal",
    )
    # failed (invalid tier)
    await check(
        db_session,
        output_id=output_id,
        requested_tier="bogus_tier",
        actor_user_id=user.id,
        actor_role="qualified_solicitor",
    )

    expected = {
        "advice_boundary.check.completed",
        "advice_boundary.check.blocked",
        "advice_boundary.check.denied",
        "advice_boundary.check.failed",
    }
    for action in expected:
        row = await db_session.scalar(
            select(AuditEntry).where(AuditEntry.action == action)
        )
        assert row is not None, f"missing audit row for {action}"
        assert row.module == "core.advice_boundary"


# ---------------------------------------------------------------------------
# Composition: matter-context write then advice-boundary check
# (moved from test_phase1_integration.py when the state-machine
# primitive was parked in contrib/, 2026-06-12)
# ---------------------------------------------------------------------------


async def _make_matter(db_session, user) -> Matter:
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"matter-{uuid.uuid4().hex[:8]}",
        title="Integration Matter",
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
async def test_matter_context_then_advice_boundary(db_session) -> None:
    """Write a matter-context item that describes a draft advice claim,
    then invoke the advice-boundary gate against the synthetic output
    identifier. Both audit chains exist under the canonical actions."""
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    namespace = "legalise_memory.draft_advice"
    await register_schema(
        db_session,
        namespace=namespace,
        module_id="legalise-matter-memory",
        version="1.0.0",
        json_schema={
            "type": "object",
            "required": ["text"],
            "properties": {
                "text": {"type": "string"},
                "advice_tier": {"type": "string"},
            },
            "additionalProperties": False,
        },
    )
    await grant(
        db_session,
        user_id=user.id,
        plugin="core",
        skill="matter_context",
        capability=f"matter.context.{namespace}.write",
    )
    await db_session.flush()

    item = await write_item(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        payload={
            "text": "First-pass advice on unfair dismissal liability.",
            "advice_tier": ADVICE_TIER_DRAFT_ADVICE,
        },
        user_id=user.id,
    )

    # Now invoke the advice-boundary gate as if promoting the item to
    # supervised review. Solicitor role allowed; transition succeeds.
    result = await check(
        db_session,
        output_id=str(item.id),
        requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
        from_tier=ADVICE_TIER_DRAFT_ADVICE,
        actor_user_id=user.id,
        actor_role="qualified_solicitor",
        module_id="legalise-matter-memory",
    )
    assert result["allowed"] is True

    # Both audit chains exist for this user.
    item_created = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "matter_context.item.created",
            AuditEntry.actor_id == user.id,
        )
    )
    assert item_created is not None
    assert item_created.module == "core.matter_context"

    advice_completed = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "advice_boundary.check.completed",
            AuditEntry.actor_id == user.id,
        )
    )
    assert advice_completed is not None
    assert advice_completed.module == "core.advice_boundary"
    assert advice_completed.payload["output_id"] == str(item.id)


# ---------------------------------------------------------------------------
# HTTP trust boundary — role derivation (Reviewer P1#1)
#
# Moved from test_phase1_security_fixes.py (test-slim Phase 3). The HTTP
# endpoint derives the actor role from User.is_superuser; the client can
# never assert a role in the request body. The runtime/programmatic API
# above accepts actor_role by design — internal callers have already
# verified it.
#
# The two require_admin unit tests that lived alongside these were
# dropped: the admin-403 failure mode (non-superuser blocked with
# `admin_required`) is covered at the endpoint level by the admin API
# tests (test_phase11_admin_role.py and friends); the unit asserted no
# distinct failure mode.
# ---------------------------------------------------------------------------


def test_http_actor_role_derived_from_is_superuser() -> None:
    """P1#1: superuser → workspace_admin, everyone else →
    any_authenticated. The role comes from the User row, never the
    request."""
    from app.api.advice_boundary import _derive_actor_role
    from app.models import User

    def _user(is_superuser: bool) -> User:
        return User(
            id=uuid.uuid4(),
            email="x@x",
            hashed_password="x" * 32,
            is_active=True,
            is_verified=True,
            is_superuser=is_superuser,
        )

    assert _derive_actor_role(_user(True)) == "workspace_admin"
    assert _derive_actor_role(_user(False)) == "any_authenticated"


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
