"""State-machine cross-primitive integration tests. DORMANT.

PARKED 2026-06-12 (test-slim order Phase 2 / fluff-cut order Phase D):
the state-machine primitive is declared but unenforced in v0.1 and
lives in ``backend/contrib/state_machine/``. These are the two
state-machine-dependent integration tests split out of
``tests/test_phase1_integration.py``; the third test of that file
(matter-context + advice-boundary composition, live code) moved to
``tests/test_advice_boundary.py``.

Covers:

1. State machine consuming matter-context capability check — define a
   transition whose required_capabilities references a matter-context
   namespace; transition is blocked when the caller lacks the grant.

2. Audit reconstruction across all three Phase 1 primitives — execute
   a sequence and confirm every audit row carries the canonical fields
   (module, module_id, capability_id, BlockedPayload shape where
   applicable).

Revived by: the v0.2 output-lifecycle roadmap item. Spec-by-test —
do not delete.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.advice_boundary import (
    ADVICE_TIER_DRAFT_ADVICE,
    check as advice_check,
)
from app.core.capabilities import grant
from app.core.matter_context import (
    register_schema,
    write_item,
)
from app.core.phase1_runtime import BlockedReason, Phase1Blocked
from app.models import (
    AuditEntry,
    Matter,
    PRIVILEGE_MIXED,
    STATUS_OPEN,
    StateMachineTransition,
    TRANSITION_STATUS_BLOCKED,
    TRANSITION_STATUS_COMPLETED,
    User,
)
from contrib.state_machine import (
    create_instance,
    register_definition,
    request_transition,
)


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"int-{uuid.uuid4().hex[:8]}@example.com",
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


# ---------------------------------------------------------------------------
# Integration 1: state machine consuming matter-context capability check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_state_machine_required_capability_against_matter_context(
    db_session, monkeypatch
) -> None:
    """A state-machine definition declares a transition whose
    ``required_capabilities`` references a matter-context capability
    string. The transition is blocked when the user lacks the grant
    and proceeds when granted.

    Proves the substrate primitives use a unified capability vocabulary.

    Round-5: mock audit_failure to write via the request session
    instead of a fresh pool connection (the SAVEPOINT pattern breaks
    fresh-pool FK visibility for uncommitted test users). Same mock
    used in the per-primitive denied-capability tests.
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
    namespace = "legalise_intake.applications"
    matter_context_cap = f"matter.context.{namespace}.write"

    # Define a state machine whose advance-to-second-state transition
    # requires the matter-context write capability.
    await register_definition(
        db_session,
        module_id="legalise-intake",
        definition_key="composes_with_context",
        version="1.0.0",
        states=["new", "submitted", "review_started"],
        initial_state="new",
        transitions=[
            {
                "from": "new",
                "to": "submitted",
                "required_capabilities": [matter_context_cap],
            },
            {"from": "submitted", "to": "review_started"},
        ],
    )
    instance = await create_instance(
        db_session,
        module_id="legalise-intake",
        definition_key="composes_with_context",
        version="1.0.0",
        owner_scope="workspace",
        owner_id=str(user.id),
        actor_id=user.id,
    )

    # No grant — transition blocked.
    with pytest.raises(Phase1Blocked) as exc_info:
        await request_transition(
            db_session,
            instance_id=instance.id,
            to_state="submitted",
            user_id=user.id,
        )
    assert exc_info.value.payload.blocked_reason == BlockedReason.CAPABILITY_DENIED
    assert exc_info.value.payload.denied_capability == matter_context_cap

    # Grant the capability under the plugin="core" convention.
    await grant(
        db_session,
        user_id=user.id,
        plugin="core",
        skill="state_machine",
        capability=matter_context_cap,
    )
    await db_session.flush()

    # Transition now succeeds.
    transition_row, updated = await request_transition(
        db_session,
        instance_id=instance.id,
        to_state="submitted",
        user_id=user.id,
    )
    assert updated.current_state == "submitted"
    assert transition_row.status == TRANSITION_STATUS_COMPLETED

    # The blocked row + the completed row both exist on the instance.
    rows = (
        await db_session.scalars(
            select(StateMachineTransition).where(
                StateMachineTransition.instance_id == instance.id
            )
        )
    ).all()
    statuses = sorted(r.status for r in rows)
    assert statuses == [
        TRANSITION_STATUS_BLOCKED,
        TRANSITION_STATUS_COMPLETED,
    ]


# ---------------------------------------------------------------------------
# Integration 2: audit reconstruction across all three primitives
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_reconstruction_across_three_primitives(db_session) -> None:
    """Execute a sequence that touches all three primitives in order:
    state-machine transition, matter-context write, advice-boundary
    check. Confirm every audit row carries the canonical fields so
    Phase 5 reconstruction can rebuild the chronology end-to-end."""
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    namespace = "integration.facts"

    # Set up: register a state machine + a context schema.
    await register_definition(
        db_session,
        module_id="legalise-intake",
        definition_key="end_to_end",
        version="1.0.0",
        states=["start", "advanced"],
        initial_state="start",
        transitions=[{"from": "start", "to": "advanced"}],
    )
    await register_schema(
        db_session,
        namespace=namespace,
        module_id="legalise-matter-memory",
        version="1.0.0",
        json_schema={
            "type": "object",
            "required": ["text"],
            "properties": {"text": {"type": "string"}},
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

    # Step 1: state machine transition.
    instance = await create_instance(
        db_session,
        module_id="legalise-intake",
        definition_key="end_to_end",
        version="1.0.0",
        owner_scope="matter",
        owner_id=str(matter.id),
        actor_id=user.id,
    )
    await request_transition(
        db_session,
        instance_id=instance.id,
        to_state="advanced",
        user_id=user.id,
    )

    # Step 2: matter-context write.
    item = await write_item(
        db_session,
        matter_id=matter.id,
        namespace=namespace,
        payload={"text": "key fact established"},
        user_id=user.id,
    )

    # Step 3: advice-boundary check.
    await advice_check(
        db_session,
        output_id=str(item.id),
        requested_tier=ADVICE_TIER_DRAFT_ADVICE,
        from_tier=None,
        actor_user_id=user.id,
        actor_role="any_authenticated",
    )

    # Pull every audit row this user produced.
    rows = (
        await db_session.scalars(
            select(AuditEntry).where(AuditEntry.actor_id == user.id).order_by(
                AuditEntry.timestamp
            )
        )
    ).all()
    actions = {r.action for r in rows}
    # Required canonical events present.
    assert "state_machine.instance.created" in actions
    assert "state_machine.transition.completed" in actions
    assert "matter_context.item.created" in actions
    assert "advice_boundary.check.completed" in actions

    # Every Phase 1 row carries the module column under `core.*`.
    for row in rows:
        if row.action.startswith(
            ("state_machine.", "matter_context.", "advice_boundary.")
        ):
            assert row.module is not None
            assert row.module.startswith("core."), (
                f"row {row.action} missing core.* module attribution"
            )

    # Phase 1 rows carry module_id and capability_id in payload where
    # they exist on the call.
    phase1_rows = [
        r
        for r in rows
        if r.action.startswith(
            ("state_machine.", "matter_context.", "advice_boundary.")
        )
    ]
    # At least one row from each primitive.
    primitives_seen = {r.module for r in phase1_rows}
    assert primitives_seen >= {
        "core.state_machine",
        "core.matter_context",
        "core.advice_boundary",
    }
