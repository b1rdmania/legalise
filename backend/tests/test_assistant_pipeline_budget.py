"""Matter token budget (spend guard) + rolling-summary memory.

Split out of test_assistant_pipeline.py (TEST_SLIM_ORDER_2026-06-12 plan,
repo history) into behaviour-area files. Shared stubs live in
``tests/_assistant_pipeline_helpers.py``.
"""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import patch

import pytest

from app.models import AuditEntry
from app.modules.assistant import pipeline as assistant_pipeline
from app.modules.assistant.pipeline import run_assistant_turn
from app.modules.assistant.schemas import AssistantPostRequest
from tests._assistant_pipeline_helpers import (
    _AssistantFakeGateway,
    _AssistantSession,
    _KeylessFakeGateway,
    _make_document,
    _make_document_body,
    _make_matter,
)


class TestMatterTokenBudget:
    """Per-matter token budget (spend guard) refuses turns once exceeded."""

    @pytest.mark.asyncio
    async def test_budget_zero_never_refuses(self) -> None:
        """The default (budget = 0) means no limit: a normal keyed turn runs."""
        matter = _make_matter()
        session = _AssistantSession(matter)
        gateway = _AssistantFakeGateway()

        with patch.object(
            assistant_pipeline.settings, "matter_token_budget", 0
        ):
            _, assistant_row = await run_assistant_turn(
                session=session,
                matter=matter,
                actor_id=uuid.uuid4(),
                thread_id=uuid.uuid4(),
                request=AssistantPostRequest(content="What is the dismissal date?"),
                gateway=gateway,
            )

        assert len(gateway.calls) == 1  # the model was called
        assert assistant_row.model_used != "budget-guard"

    @pytest.mark.asyncio
    async def test_matter_over_budget_refuses_without_calling_model(self) -> None:
        """Budget set + matter already over it: refuse, do NOT call the model,
        record the user turn, and write an assistant.budget.exceeded audit row.
        """
        matter = _make_matter()
        session = _AssistantSession(matter)
        gateway = _AssistantFakeGateway()

        async def _usage(_session, _matter_id):
            return 5000  # already over the 1000 budget below

        with (
            patch.object(assistant_pipeline.settings, "matter_token_budget", 1000),
            patch.object(assistant_pipeline, "_matter_token_usage", _usage),
        ):
            user_row, assistant_row = await run_assistant_turn(
                session=session,
                matter=matter,
                actor_id=uuid.uuid4(),
                thread_id=uuid.uuid4(),
                request=AssistantPostRequest(content="Draft a long letter"),
                gateway=gateway,
            )

        # The model was never called.
        assert gateway.calls == []
        # Both the user turn and the refusal were recorded.
        assert user_row.content == "Draft a long letter"
        assert assistant_row.model_used == "budget-guard"
        assert assistant_row.token_count == 0
        assert "configured token budget" in assistant_row.content
        assert "5000 tokens used of 1000" in assistant_row.content
        # The spend-guard audit row is present with used + budget.
        audit_rows = [
            o
            for o in session.added
            if isinstance(o, AuditEntry) and o.module == "assistant"
        ]
        budget_audit = next(
            row for row in audit_rows if row.action == "assistant.budget.exceeded"
        )
        assert budget_audit.payload["used"] == 5000
        assert budget_audit.payload["budget"] == 1000


class TestRollingSummary:
    """Rolling-summary memory replaces the silent drop of older turns."""

    def test_assembled_context_includes_rolling_summary(self) -> None:
        """A thread past the recent window carries its summary into context."""
        from app.modules.assistant.pipeline import _assemble_prompt

        matter = _make_matter()
        summary = "EARLIER-CONVERSATION-SUMMARY: Khan was dismissed; NDA reviewed."

        prompt = _assemble_prompt(
            matter=matter,
            history=[],
            events=[],
            chronology_total=0,
            document_index=[],
            document_total=0,
            outputs=[],
            snippets=[],
            retrieval_used=False,
            tools=[],
            user_content="What did we establish earlier?",
            token_budget=4000,
            rolling_summary=summary,
        )

        assert "## Summary of earlier conversation" in prompt
        assert summary in prompt

    @pytest.mark.asyncio
    async def test_keyless_turn_attempts_no_summarisation(self) -> None:
        """A keyless turn returns from the fallback path before the summary
        refresh — no extra gateway call, no crash."""
        matter = _make_matter()
        document = _make_document(matter.id)
        document.filename = "khan-dismissal-letter.pdf"
        body = _make_document_body(document.id)
        session = _AssistantSession(
            matter,
            documents=[document],
            bodies={document.id: body},
        )
        gateway = _KeylessFakeGateway()

        async def _fake_search_documents(*_args: Any, **_kwargs: Any):
            return [
                assistant_pipeline.RetrievalHit(
                    document_id=document.id,
                    chunk_index=0,
                    text=body.extracted_text or "",
                    char_start=0,
                    char_end=len(body.extracted_text or ""),
                    score=1.0,
                )
            ]

        with patch.object(
            assistant_pipeline.retrieval,
            "search_documents",
            _fake_search_documents,
        ):
            _, assistant_row = await run_assistant_turn(
                session=session,
                matter=matter,
                actor_id=uuid.uuid4(),
                thread_id=uuid.uuid4(),
                request=AssistantPostRequest(content="What was the reason given?"),
                gateway=gateway,
            )

        # Exactly one gateway call (the keyless attempt) — summarisation never
        # ran, and the turn still produced a reply.
        assert len(gateway.calls) == 1
        assert assistant_row.model_used == "deterministic-summary"
