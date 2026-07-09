"""Shared stubs/helpers for the assistant-pipeline test split.

Extracted verbatim from the former ``test_assistant_pipeline.py`` (see
TEST_SLIM_ORDER_2026-06-12 plan, repo history) when that 1648-line file was
split by behaviour area into:

- ``test_assistant_pipeline_history.py``
- ``test_assistant_pipeline_turn.py``
- ``test_assistant_pipeline_budget.py``
- ``test_assistant_pipeline_failures.py``

This module carries no tests itself (leading underscore keeps it out of
pytest collection) — just the fakes/factories those files share.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime
from typing import Any

from app.core.model_gateway import ModelResult, PrivilegePaused
from app.models import Document, DocumentBody, Event, Matter
from app.models.assistant import AssistantMessage as AssistantMessageRow
from app.models.assistant import AssistantThread as AssistantThreadRow


class _UserStub:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.email = "test@example.com"
        self.is_active = True
        self.is_verified = True
        self.is_superuser = False


def _canned_assistant_envelope(action_type: str = "anonymise_document") -> dict[str, Any]:
    return {
        "content": "The NDA mutually obliges both parties to keep "
        "[doc:Mutual NDA — Khan & Acme] confidential.",
        "suggested_actions": [
            {
                "type": action_type,
                "label": "Run a pre-motion premortem",
                "params": {},
            }
        ],
    }


class _AssistantFakeGateway:
    """Records the prompt + system passed in, returns a canned envelope."""

    def __init__(
        self,
        envelope: dict[str, Any] | None = None,
        *,
        envelopes: list[dict[str, Any]] | None = None,
    ) -> None:
        self.envelope = envelope or _canned_assistant_envelope()
        self.envelopes = list(envelopes or [])
        self.calls: list[dict[str, Any]] = []

    async def call(
        self,
        *,
        session,
        matter_id,
        actor_id,
        prompt,
        model=None,
        posture=None,
        system=None,
        max_tokens=None,
        resource_type=None,
        resource_id=None,
        payload=None,
        caller_module=None,
        on_delta=None,
    ) -> ModelResult:
        self.calls.append(
            {
                "prompt": prompt,
                "system": system,
                "model": model,
                "posture": posture,
                "max_tokens": max_tokens,
                "payload": payload or {},
                "on_delta": on_delta,
            }
        )
        envelope = self.envelopes.pop(0) if self.envelopes else self.envelope
        return ModelResult(
            text=json.dumps(envelope),
            model_used="stub-echo",
            prompt_hash="ph",
            response_hash="rh",
            token_count=42,
            latency_ms=5,
        )


class _KeylessFakeGateway:
    """Simulates a keyed provider with no user key: every call raises."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def call(self, **kwargs):
        from app.core.model_gateway import ProviderKeyMissing

        self.calls.append(kwargs)
        raise ProviderKeyMissing("anthropic")


class _PausedFakeGateway:
    async def call(self, **_kw) -> ModelResult:
        raise PrivilegePaused(
            "AI is paused on this matter. "
            "Resume AI from the matter's Overview to continue."
        )


class _Scalars:
    def __init__(self, items: list[Any]) -> None:
        self._items = items

    def all(self) -> list[Any]:
        return list(self._items)


class _AssistantSession:
    """Async-session stub that routes scalar/scalars by entity name."""

    def __init__(
        self,
        matter: Matter,
        *,
        history: list[AssistantMessageRow] | None = None,
        events: list[Event] | None = None,
        documents: list[Any] | None = None,
        bodies: dict[uuid.UUID, Any] | None = None,
        installed_modules: list[Any] | None = None,
    ) -> None:
        self.matter = matter
        self.history = history or []
        self.events = events or []
        self.documents = documents or []
        self.bodies = bodies or {}
        self.installed_modules = installed_modules or []
        self.added: list[Any] = []
        self.bind = None

    def add(self, obj: Any) -> None:
        if isinstance(obj, (AssistantMessageRow, AssistantThreadRow)) and obj.id is None:
            obj.id = uuid.uuid4()
        if isinstance(obj, (AssistantMessageRow, AssistantThreadRow)) and obj.created_at is None:
            obj.created_at = datetime.now(UTC)
        self.added.append(obj)

    def _entity_name(self, stmt: Any) -> str | None:
        try:
            return stmt.column_descriptions[0]["name"]
        except Exception:
            return None

    async def scalar(self, stmt: Any, *args: Any, **kwargs: Any):
        name = self._entity_name(stmt)
        if name == "Matter":
            return self.matter
        if name == "privilege_posture":
            return self.matter.privilege_posture
        if name == "DocumentBody":
            for doc in self.documents:
                if str(doc.id) in str(stmt):
                    return self.bodies.get(doc.id)
            for doc_id, body in self.bodies.items():
                return body
            return None
        return None

    async def scalars(self, stmt: Any, *args: Any, **kwargs: Any):
        name = self._entity_name(stmt)
        if name == "AssistantMessage":
            return _Scalars(self.history)
        if name == "Event":
            return _Scalars(self.events)
        if name == "Document":
            return _Scalars(self.documents)
        if name == "InstalledModule":
            return _Scalars([m for m in self.installed_modules if m.enabled])
        if name == "WorkspaceDisabledSkill":
            return _Scalars([])
        return _Scalars([])

    async def execute(self, *args: Any, **kwargs: Any):
        class _Row:
            def first(self_inner):
                return None

            def all(self_inner):
                return []

        return _Row()

    async def commit(self) -> None:
        return None

    async def flush(self) -> None:
        for obj in self.added:
            if isinstance(obj, AssistantMessageRow):
                if obj.id is None:
                    obj.id = uuid.uuid4()
                if obj.created_at is None:
                    obj.created_at = datetime.now(UTC)
                if obj.suggested_actions is None:
                    obj.suggested_actions = []

    async def refresh(self, obj: Any) -> None:
        return None


def _make_matter(*, posture: str = "B_mixed") -> Matter:
    matter = Matter(
        id=uuid.uuid4(),
        slug="khan-v-acme",
        title="Khan v Acme",
        matter_type="employment_tribunal",
        status="open",
        privilege_posture=posture,
        default_model_id="claude-opus-4-7",
        facts={"counterparty": "Acme Ltd"},
        created_by_id=uuid.uuid4(),
    )
    matter.opened_at = datetime.now(UTC)
    return matter


def _make_event(matter_id: uuid.UUID) -> Event:
    event = Event(
        id=uuid.uuid4(),
        matter_id=matter_id,
        event_date=date(2025, 6, 1),
        description="Khan dismissed without notice",
        significance=5,
        source_doc_ids=[],
        priv_flag=False,
        created_by_id=uuid.uuid4(),
    )
    event.created_at = datetime.now(UTC)
    return event


def _make_document(matter_id: uuid.UUID) -> Document:
    return Document(
        id=uuid.uuid4(),
        matter_id=matter_id,
        filename="dismissal-letter.txt",
        mime_type="text/plain",
        size_bytes=256,
        sha256="a" * 64,
        tag="disclosure",
        from_disclosure=True,
        uploaded_by_id=uuid.uuid4(),
    )


def _make_document_body(document_id: uuid.UUID) -> DocumentBody:
    return DocumentBody(
        document_id=document_id,
        kind="extracted",
        extracted_text=(
            "Acme dismissed Jasmine Khan with immediate effect. "
            "The dismissal followed a disciplinary hearing on 10 March 2026. "
            "The stated reason was a personal Instagram post. "
            "The letter offered payment in lieu of notice."
        ),
        extraction_method="passthrough",
        char_count=210,
        page_count=1,
    )


class _ThreadScopedSession:
    """Async-session stub whose AssistantMessage reads honour ``thread_id``.

    Just enough of the session contract for ``_load_history``: it filters the
    in-memory messages by the ``thread_id`` bound into the SELECT, so a test
    can prove two threads in one matter keep separate history.
    """

    def __init__(self, messages: list[AssistantMessageRow]) -> None:
        self.messages = messages
        self.bind = None

    async def scalars(self, stmt: Any, *args: Any, **kwargs: Any):
        params = stmt.compile().params
        thread_id = next(
            (v for k, v in params.items() if k.startswith("thread_id")), None
        )
        rows = [m for m in self.messages if m.thread_id == thread_id]
        rows.sort(key=lambda m: m.created_at, reverse=True)
        return _Scalars(rows)


def _make_thread_message(
    thread_id: uuid.UUID, content: str, *, when: datetime
) -> AssistantMessageRow:
    return AssistantMessageRow(
        id=uuid.uuid4(),
        matter_id=uuid.uuid4(),
        thread_id=thread_id,
        actor_id=uuid.uuid4(),
        role="user",
        content=content,
        suggested_actions=[],
        created_at=when,
    )


class _RawTextFakeGateway:
    """Returns text that is not a JSON envelope — the parse-failure path."""

    def __init__(self, text: str = "Here is my answer, sans envelope.") -> None:
        self.text = text
        self.calls: list[dict[str, Any]] = []

    async def call(self, **kwargs) -> ModelResult:
        self.calls.append(kwargs)
        return ModelResult(
            text=self.text,
            model_used="stub-echo",
            prompt_hash="ph",
            response_hash="rh",
            token_count=7,
            latency_ms=3,
        )
