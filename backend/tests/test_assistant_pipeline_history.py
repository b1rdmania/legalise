"""Assistant thread history — two threads in one matter stay separate.

Split out of test_assistant_pipeline.py (TEST_SLIM_ORDER_2026-06-12 plan,
repo history) into behaviour-area files. Shared stubs live in
``tests/_assistant_pipeline_helpers.py``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from tests._assistant_pipeline_helpers import (
    _ThreadScopedSession,
    _make_thread_message,
)


class TestAssistantThreadHistory:
    """Two threads in one matter must keep entirely separate history."""

    @pytest.mark.asyncio
    async def test_threads_keep_separate_history(self) -> None:
        from app.modules.assistant.pipeline import _load_history

        thread_a = uuid.uuid4()
        thread_b = uuid.uuid4()
        base = datetime.now(UTC)
        messages = [
            _make_thread_message(thread_a, "A first", when=base),
            _make_thread_message(thread_b, "B only", when=base),
            _make_thread_message(thread_a, "A second", when=base),
        ]
        session = _ThreadScopedSession(messages)

        history_a = await _load_history(session, thread_a, 20)
        history_b = await _load_history(session, thread_b, 20)

        a_contents = {m.content for m in history_a}
        b_contents = {m.content for m in history_b}
        assert a_contents == {"A first", "A second"}
        assert b_contents == {"B only"}
        # B's message never leaks into A's history and vice versa.
        assert "B only" not in a_contents
        assert "A first" not in b_contents

    def test_derive_thread_title_first_six_words(self) -> None:
        from app.modules.assistant.pipeline import derive_thread_title

        title = derive_thread_title(
            "  Stress-test the   dismissal claim against Acme Ltd please "
        )
        assert title == "Stress-test the dismissal claim against Acme"
        assert derive_thread_title("   ") == "New chat"
