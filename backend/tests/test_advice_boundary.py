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

import dataclasses
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
# Canonical scenarios 1-7 + initial-tier + invalid-vocabulary cases,
# collapsed into one table-driven test. Each row shares the same
# skeleton: make a user -> call check() -> assert result["allowed"] ->
# look up the AdviceBoundaryDecision row (when one is expected) ->
# assert .status -> assert specific gate_state keys -> (sometimes)
# assert an AuditEntry row exists for a specific action. Rows that
# don't produce a decision/audit row (role-denial-before-persist,
# initial-tier-any-authenticated) simply leave those fields unset.
# ---------------------------------------------------------------------------


@dataclasses.dataclass(frozen=True)
class _CanonicalScenario:
    id: str
    requested_tier: str
    from_tier: str | None
    actor_role: str | None
    expected_allowed: bool
    declared_tier_max: str | None = None
    # None => don't look up an AdviceBoundaryDecision row at all.
    expected_status: str | None = None
    # Subset of gate_state that must match exactly by key.
    gate_state_equals: dict = dataclasses.field(default_factory=dict)
    gate_state_required_contains: tuple[str, ...] = ()
    gate_state_required_not_contains: tuple[str, ...] = ()
    # Extra attribute checks on the decision row: attr name -> expected value.
    decision_extra: dict = dataclasses.field(default_factory=dict)
    # None => don't assert an AuditEntry row exists.
    audit_action: str | None = None
    audit_module: str = "core.advice_boundary"


_CANONICAL_SCENARIOS = [
    pytest.param(
        _CanonicalScenario(
            id="valid-transition-with-solicitor",
            requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
            from_tier=ADVICE_TIER_DRAFT_ADVICE,
            actor_role="qualified_solicitor",
            expected_allowed=True,
            expected_status=DECISION_STATUS_COMPLETED,
            decision_extra={"actor_role": "qualified_solicitor"},
            audit_action="advice_boundary.check.completed",
        ),
        id="valid-transition-with-solicitor",
    ),
    pytest.param(
        _CanonicalScenario(
            id="invalid-transition-skipping-supervised",
            requested_tier=ADVICE_TIER_APPROVED_FINAL_ADVICE,
            from_tier=ADVICE_TIER_DRAFT_ADVICE,
            actor_role="qualified_solicitor",
            expected_allowed=False,
            expected_status=DECISION_STATUS_BLOCKED,
            gate_state_equals={"blocked_reason": "invalid_transition"},
            audit_action="advice_boundary.check.blocked",
        ),
        id="invalid-transition-skipping-supervised",
    ),
    pytest.param(
        _CanonicalScenario(
            id="downward-transition",
            requested_tier=ADVICE_TIER_DRAFT_ADVICE,
            from_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
            actor_role="qualified_solicitor",
            expected_allowed=False,
            expected_status=DECISION_STATUS_BLOCKED,
            gate_state_equals={"blocked_reason": "invalid_transition"},
        ),
        id="downward-transition",
    ),
    pytest.param(
        _CanonicalScenario(
            id="workspace-admin-cannot-promote-draft-to-supervised",
            requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
            from_tier=ADVICE_TIER_DRAFT_ADVICE,
            actor_role="workspace_admin",  # NOT solicitor
            expected_allowed=False,
            gate_state_equals={"blocked_reason": "role_denied"},
            gate_state_required_contains=("qualified_solicitor",),
            gate_state_required_not_contains=("workspace_admin",),
        ),
        id="workspace-admin-cannot-promote-draft-to-supervised",
    ),
    pytest.param(
        _CanonicalScenario(
            id="role-denied",
            requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
            from_tier=ADVICE_TIER_DRAFT_ADVICE,
            actor_role="paralegal",  # not in the required set
            expected_allowed=False,
            expected_status=DECISION_STATUS_DENIED,
            gate_state_equals={
                "blocked_reason": "role_denied",
                "actor_role": "paralegal",
            },
            gate_state_required_contains=("qualified_solicitor",),
            audit_action="advice_boundary.check.denied",
        ),
        id="role-denied",
    ),
    pytest.param(
        _CanonicalScenario(
            id="tier-exceeds-declared-max",
            requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
            from_tier=ADVICE_TIER_DRAFT_ADVICE,
            declared_tier_max=ADVICE_TIER_DRAFT_ADVICE,
            actor_role="qualified_solicitor",
            expected_allowed=False,
            expected_status=DECISION_STATUS_DENIED,
            gate_state_equals={"blocked_reason": "tier_exceeded"},
        ),
        id="tier-exceeds-declared-max",
    ),
    pytest.param(
        _CanonicalScenario(
            id="null-declared-tier-max-allowed",
            requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
            from_tier=ADVICE_TIER_DRAFT_ADVICE,
            declared_tier_max=None,
            actor_role="qualified_solicitor",
            expected_allowed=True,
            expected_status=DECISION_STATUS_COMPLETED,
            gate_state_equals={"declared_tier_max_supplied": False},
            decision_extra={"declared_tier_max": None},
        ),
        id="null-declared-tier-max-allowed",
    ),
    pytest.param(
        _CanonicalScenario(
            id="no-transition-out-of-terminal",
            requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
            from_tier=ADVICE_TIER_APPROVED_FINAL_ADVICE,
            actor_role="workspace_admin",
            expected_allowed=False,
            expected_status=DECISION_STATUS_BLOCKED,
            gate_state_equals={
                "blocked_reason": "tier_disallowed",
                "reason": "from_tier_is_terminal",
            },
        ),
        id="no-transition-out-of-terminal",
    ),
    pytest.param(
        _CanonicalScenario(
            id="initial-tier-creation-with-any-authenticated",
            requested_tier=ADVICE_TIER_DRAFT_ADVICE,
            from_tier=None,
            actor_role="paralegal",
            expected_allowed=True,
        ),
        id="initial-tier-creation-with-any-authenticated",
    ),
    pytest.param(
        _CanonicalScenario(
            id="initial-tier-supervised-is-not-permitted",
            requested_tier=ADVICE_TIER_SUPERVISED_LEGAL_ADVICE,
            from_tier=None,
            actor_role="qualified_solicitor",  # still blocked: tier itself is not a valid initial tier
            expected_allowed=False,
            expected_status=DECISION_STATUS_BLOCKED,
            gate_state_equals={
                "blocked_reason": "invalid_transition",
                "reason": "tier_not_permitted_as_initial",
            },
        ),
        id="initial-tier-supervised-is-not-permitted",
    ),
    pytest.param(
        _CanonicalScenario(
            id="initial-tier-approved-final-is-not-permitted",
            requested_tier=ADVICE_TIER_APPROVED_FINAL_ADVICE,
            from_tier=None,
            actor_role="workspace_admin",  # still blocked, even for admin
            expected_allowed=False,
            expected_status=DECISION_STATUS_BLOCKED,
            gate_state_equals={
                "blocked_reason": "invalid_transition",
                "reason": "tier_not_permitted_as_initial",
            },
        ),
        id="initial-tier-approved-final-is-not-permitted",
    ),
    pytest.param(
        _CanonicalScenario(
            id="invalid-tier-string-is-failed",
            requested_tier="not_a_tier",
            from_tier=ADVICE_TIER_DRAFT_ADVICE,
            actor_role="qualified_solicitor",
            expected_allowed=False,
            expected_status=DECISION_STATUS_FAILED,
            audit_action="advice_boundary.check.failed",
        ),
        id="invalid-tier-string-is-failed",
    ),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("scenario", _CANONICAL_SCENARIOS)
async def test_canonical_scenarios(db_session, scenario: _CanonicalScenario) -> None:
    user = await _make_user(db_session)
    output_id = f"output-{uuid.uuid4().hex[:8]}"

    result = await check(
        db_session,
        output_id=output_id,
        requested_tier=scenario.requested_tier,
        from_tier=scenario.from_tier,
        declared_tier_max=scenario.declared_tier_max,
        actor_user_id=user.id,
        actor_role=scenario.actor_role,
    )
    assert result["allowed"] is scenario.expected_allowed

    for key, expected_value in scenario.gate_state_equals.items():
        assert result["gate_state"][key] == expected_value

    for role in scenario.gate_state_required_contains:
        assert role in result["gate_state"]["required"]

    for role in scenario.gate_state_required_not_contains:
        assert role not in result["gate_state"]["required"]

    decision = None
    if scenario.expected_status is not None:
        decision = await db_session.scalar(
            select(AdviceBoundaryDecision).where(
                AdviceBoundaryDecision.id == uuid.UUID(result["decision_id"])
            )
        )
        assert decision.status == scenario.expected_status
        for attr, expected_value in scenario.decision_extra.items():
            assert getattr(decision, attr) == expected_value

    if scenario.audit_action is not None:
        assert decision is not None  # audit rows are always keyed off a decision
        audit_row = await db_session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == scenario.audit_action,
                AuditEntry.resource_id == str(decision.id),
            )
        )
        assert audit_row is not None
        assert audit_row.module == scenario.audit_module


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
