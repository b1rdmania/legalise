"""Assistant pipeline failure modes: parse-failure fallback, tool-error
path, empty tool registry.

Split out of test_assistant_pipeline.py (TEST_SLIM_ORDER_2026-06-12 plan,
repo history) into behaviour-area files — the three branches the smoke
evals never covered (Phase 0 of that plan). Shared stubs live in
``tests/_assistant_pipeline_helpers.py``.
"""

from __future__ import annotations

import uuid

import pytest

from app.models import AuditEntry
from app.modules.assistant.pipeline import run_assistant_turn
from app.modules.assistant.schemas import AssistantPostRequest
from tests._assistant_pipeline_helpers import (
    _AssistantFakeGateway,
    _AssistantSession,
    _RawTextFakeGateway,
    _make_matter,
)


class TestAssistantFailureModes:
    """The three branches the smoke evals never covered (test-slim order,
    Phase 0): parse-failure fallback, tool-error path, empty tool registry."""

    @pytest.mark.asyncio
    async def test_parse_failure_falls_back_to_controlled_message(self) -> None:
        """A model reply that is not a JSON envelope must surface the
        controlled message — never raw model text — and the module audit
        row must be filterable via parse_failed: true."""
        matter = _make_matter()
        session = _AssistantSession(matter)
        gateway = _RawTextFakeGateway()

        _, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            thread_id=uuid.uuid4(),
            request=AssistantPostRequest(content="What is the dismissal date?"),
            gateway=gateway,
        )

        assert "couldn't structure that response" in assistant_row.content
        assert "sans envelope" not in assistant_row.content
        assert assistant_row.suggested_actions == []
        audit_rows = [
            o
            for o in session.added
            if isinstance(o, AuditEntry) and o.module == "assistant"
        ]
        message_audit = next(
            row for row in audit_rows if row.action == "module.assistant.message"
        )
        assert message_audit.payload["parse_failed"] is True
        assert message_audit.payload["tool_call_count"] == 0

    @pytest.mark.asyncio
    async def test_tool_error_reports_failure_and_audits_it(self) -> None:
        """A tool_call naming a tool that is not installed must fail
        closed: the reply says the skill could not run, offers the Record,
        and the audit payload carries tool_failed: true."""
        matter = _make_matter()
        session = _AssistantSession(matter)  # no installed modules
        gateway = _AssistantFakeGateway(
            {
                "content": "I'll run contract review.",
                "suggested_actions": [],
                "tool_calls": [
                    {
                        "module_id": "contract-review",
                        "capability_id": "review",
                        "args": {},
                    }
                ],
            }
        )

        _, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            thread_id=uuid.uuid4(),
            request=AssistantPostRequest(content="Run the contract review"),
            gateway=gateway,
        )

        assert assistant_row.content.startswith("I couldn't run that skill")
        actions = assistant_row.suggested_actions
        assert len(actions) == 1
        assert actions[0]["type"] == "view_audit"
        audit_rows = [
            o
            for o in session.added
            if isinstance(o, AuditEntry) and o.module == "assistant"
        ]
        message_audit = next(
            row for row in audit_rows if row.action == "module.assistant.message"
        )
        assert message_audit.payload["tool_failed"] is True
        assert message_audit.payload["tool_invocation_id"] is None

    @pytest.mark.asyncio
    async def test_empty_tool_registry_is_stated_in_the_prompt(self) -> None:
        """With no installed modules the prompt must say so explicitly, so
        the model is never invited to call tools that do not exist."""
        matter = _make_matter()
        session = _AssistantSession(matter)
        gateway = _AssistantFakeGateway()

        await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            thread_id=uuid.uuid4(),
            request=AssistantPostRequest(content="What can you run?"),
            gateway=gateway,
        )

        assert len(gateway.calls) == 1
        prompt = gateway.calls[0]["prompt"]
        assert "(no installed Legalise tools are runnable from chat)" in prompt
