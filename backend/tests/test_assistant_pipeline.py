"""Assistant pipeline — the golden loop's engine, tested in isolation.

Extracted from test_smoke_evals.py (Phase 0 of the 2026-06-12 test-slim
order, docs/handovers/TEST_SLIM_ORDER_2026-06-12.md). Covers: persistence
+ audit of a turn, suggested-action round-trip, keyless deterministic
fallback, keyed routing, prompt assembly (matter/chronology/tools), the
tool loop (run-once, progress events, SSE boundary), posture 409,
owner-only read, context-budget survival — plus the failure modes:
parse-failure fallback, tool-error path, empty tool registry.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime
from typing import Any
from unittest.mock import patch

import pytest

from app.core.model_gateway import (
    ModelResult,
    PrivilegePaused,
)
from app.models import AuditEntry, Document, DocumentBody, Event, InstalledModule, Matter
from app.models.assistant import AssistantMessage as AssistantMessageRow
from app.modules.assistant import pipeline as assistant_pipeline
from app.modules.assistant.pipeline import run_assistant_turn
from app.modules.assistant.schemas import AssistantPostRequest


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
        resource_type=None,
        resource_id=None,
        payload=None,
        caller_module=None,
    ) -> ModelResult:
        self.calls.append(
            {
                "prompt": prompt,
                "system": system,
                "model": model,
                "posture": posture,
                "payload": payload or {},
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
        raise PrivilegePaused("Matter privilege posture is C_paused — LLM calls are blocked.")


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
        installed_modules: list[InstalledModule] | None = None,
    ) -> None:
        self.matter = matter
        self.history = history or []
        self.events = events or []
        self.documents = documents or []
        self.bodies = bodies or {}
        self.installed_modules = installed_modules or []
        self.added: list[Any] = []

    def add(self, obj: Any) -> None:
        if isinstance(obj, AssistantMessageRow) and obj.id is None:
            obj.id = uuid.uuid4()
        if isinstance(obj, AssistantMessageRow) and obj.created_at is None:
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


class TestAssistantPipeline:
    """Assistant turn persists, audits, round-trips actions, gates posture."""

    @pytest.mark.asyncio
    async def test_message_persists_and_audits(self) -> None:
        matter = _make_matter()
        event = _make_event(matter.id)
        session = _AssistantSession(matter, events=[event])
        gateway = _AssistantFakeGateway()

        user_row, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            request=AssistantPostRequest(content="What is the dismissal date?"),
            gateway=gateway,
        )

        assistant_rows = [
            o for o in session.added if isinstance(o, AssistantMessageRow)
        ]
        assert len(assistant_rows) == 2
        assert {r.role for r in assistant_rows} == {"user", "assistant"}
        assert user_row.content == "What is the dismissal date?"
        assert assistant_row.role == "assistant"
        audit_rows = [
            o
            for o in session.added
            if isinstance(o, AuditEntry) and o.module == "assistant"
        ]
        assert len(audit_rows) == 1
        assert audit_rows[0].action == "module.assistant.message"

    @pytest.mark.asyncio
    async def test_suggested_actions_round_trip(self) -> None:
        matter = _make_matter()
        session = _AssistantSession(matter)
        gateway = _AssistantFakeGateway(
            _canned_assistant_envelope("anonymise_document")
        )

        _, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            request=AssistantPostRequest(content="Should I file a pre-motion?"),
            gateway=gateway,
        )

        assert isinstance(assistant_row.suggested_actions, list)
        assert len(assistant_row.suggested_actions) == 1
        action = assistant_row.suggested_actions[0]
        assert action["type"] == "anonymise_document"
        assert action["label"] == "Run a pre-motion premortem"

    @pytest.mark.asyncio
    async def test_keyless_summary_falls_back_to_deterministic(self) -> None:
        """No provider key: a summary-shaped request still answers with an
        honestly-labelled extract instead of a 422. The gateway IS tried
        first — deterministic is the fallback, not an override."""
        matter = _make_matter()
        document = _make_document(matter.id)
        body = _make_document_body(document.id)
        session = _AssistantSession(
            matter,
            documents=[document],
            bodies={document.id: body},
        )
        gateway = _KeylessFakeGateway()

        _, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            request=AssistantPostRequest(
                content="Summarise this document",
                selected_document_ids=[document.id],
            ),
            gateway=gateway,
        )

        assert len(gateway.calls) == 1  # model attempted first
        assert "Summary of dismissal-letter.txt" in assistant_row.content
        assert f"[doc:{document.id}]" in assistant_row.content
        assert "without a model" in assistant_row.content  # honest label
        assert assistant_row.model_used == "deterministic-summary"
        assert assistant_row.token_count == 0
        assert assistant_row.suggested_actions[0]["type"] == "view_document"
        audit_rows = [
            o
            for o in session.added
            if isinstance(o, AuditEntry) and o.module == "assistant"
        ]
        assert audit_rows[0].payload["deterministic"] == "document_summary"

    @pytest.mark.asyncio
    async def test_keyed_summary_goes_to_the_model(self) -> None:
        """With a working provider, summary requests reach the model —
        the deterministic extract must NOT hijack keyed turns."""
        matter = _make_matter()
        document = _make_document(matter.id)
        body = _make_document_body(document.id)
        session = _AssistantSession(
            matter,
            documents=[document],
            bodies={document.id: body},
        )
        gateway = _AssistantFakeGateway()

        _, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            request=AssistantPostRequest(content="Summarise this document"),
            gateway=gateway,
        )

        assert len(gateway.calls) == 1
        assert assistant_row.model_used != "deterministic-summary"

    @pytest.mark.asyncio
    async def test_keyless_summary_matches_the_named_document(self) -> None:
        """\"Summarise the dismissal letter\" with several documents on the
        matter must summarise the dismissal letter, not snippets[0]."""
        matter = _make_matter()
        nda = _make_document(matter.id)
        nda.filename = "synthetic-mutual-nda.docx"
        nda_body = _make_document_body(nda.id)
        dismissal = _make_document(matter.id)
        dismissal.filename = "khan-dismissal-letter.pdf"
        dismissal_body = _make_document_body(dismissal.id)
        session = _AssistantSession(
            matter,
            documents=[nda, dismissal],
            bodies={nda.id: nda_body, dismissal.id: dismissal_body},
        )
        gateway = _KeylessFakeGateway()

        _, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            request=AssistantPostRequest(content="Summarise the dismissal letter"),
            gateway=gateway,
        )

        assert "Summary of khan-dismissal-letter.pdf" in assistant_row.content
        assert f"[doc:{dismissal.id}]" in assistant_row.content

    @pytest.mark.asyncio
    async def test_prompt_includes_matter_and_chronology(self) -> None:
        matter = _make_matter()
        event = _make_event(matter.id)
        session = _AssistantSession(matter, events=[event])
        gateway = _AssistantFakeGateway()

        await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            request=AssistantPostRequest(content="Summarise the matter."),
            gateway=gateway,
        )

        assert len(gateway.calls) == 1
        prompt = gateway.calls[0]["prompt"]
        assert matter.title in prompt
        assert "Khan dismissed without notice" in prompt

    @pytest.mark.asyncio
    async def test_prompt_includes_provider_agnostic_tool_registry(self) -> None:
        matter = _make_matter()
        session = _AssistantSession(matter)
        gateway = _AssistantFakeGateway()
        installed = InstalledModule(
            id=uuid.uuid4(),
            module_id="legalise.contract_review",
            version="1.0.0",
            publisher="legalise",
            visibility="first_party",
            signature_status="structure_verified",
            signed_by="legalise",
            install_path="<inline>",
            manifest_snapshot={},
            permissions_snapshot={},
            installed_by_user_id=uuid.uuid4(),
            enabled=True,
        )
        tool = assistant_pipeline.AssistantToolSpec(
            module_id="legalise.contract_review",
            capability_id="review",
            label="Review contract",
            description="Review an uploaded contract.",
            args_schema={
                "type": "object",
                "properties": {"document_ids": {"type": "array"}},
            },
            declaration={
                "id": "review",
                "kind": "skill",
                "scope": "matter",
                "reads": ["document.body.read"],
                "writes": ["matter.artifact.write"],
            },
            installed_module=installed,
        )

        with patch.object(
            assistant_pipeline, "_load_assistant_tools", return_value=[tool]
        ):
            await run_assistant_turn(
                session=session,
                matter=matter,
                actor_id=uuid.uuid4(),
                request=AssistantPostRequest(content="Review the contract"),
                gateway=gateway,
            )

        prompt = gateway.calls[0]["prompt"]
        assert "## Tools" in prompt
        assert "module_id: legalise.contract_review" in prompt
        assert "capability_id: review" in prompt
        assert "args_schema" in prompt

    @pytest.mark.asyncio
    async def test_assistant_tool_registry_loads_latest_matter_tools(self) -> None:
        """Registry is real InstalledModule state, not hard-coded chips.

        Chat may only expose latest enabled matter-scope skill/tool/workflow
        capabilities. Workspace/global capabilities and disabled older module
        installs must not appear in the model-visible tool menu.
        """
        matter = _make_matter()
        module_id = "legalise.contract_review"
        old_install = InstalledModule(
            id=uuid.uuid4(),
            module_id=module_id,
            version="0.9.0",
            publisher="legalise",
            visibility="first_party",
            signature_status="structure_verified",
            signed_by="legalise",
            install_path="<inline>",
            manifest_snapshot={
                "name": "Old Contract Review",
                "description": "Old description",
                "capabilities": [
                    {
                        "id": "old-review",
                        "kind": "skill",
                        "scope": "matter",
                    }
                ],
            },
            permissions_snapshot={},
            installed_by_user_id=uuid.uuid4(),
            enabled=False,
        )
        latest_install = InstalledModule(
            id=uuid.uuid4(),
            module_id=module_id,
            version="1.0.0",
            publisher="legalise",
            visibility="first_party",
            signature_status="structure_verified",
            signed_by="legalise",
            install_path="<inline>",
            manifest_snapshot={
                "name": "Contract Review",
                "description": "Review contracts",
                "capabilities": [
                    {
                        "id": "review",
                        "kind": "skill",
                        "scope": "matter",
                        "reads": ["document.body.read"],
                        "writes": ["matter.artifact.write"],
                        "args_schema": {
                            "type": "object",
                            "properties": {
                                "document_ids": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                }
                            },
                        },
                        "ui": {
                            "label": "Review contract",
                            "description": "Review an uploaded contract.",
                        },
                    },
                    {
                        "id": "admin-only",
                        "kind": "tool",
                        "scope": "workspace",
                    },
                ],
            },
            permissions_snapshot={},
            installed_by_user_id=uuid.uuid4(),
            enabled=True,
        )
        session = _AssistantSession(
            matter,
            installed_modules=[old_install, latest_install],
        )

        tools = await assistant_pipeline._load_assistant_tools(session)

        assert [(t.module_id, t.capability_id) for t in tools] == [
            (module_id, "review")
        ]
        assert tools[0].label == "Review contract"
        assert tools[0].description == "Review an uploaded contract."
        assert tools[0].args_schema["properties"]["document_ids"]["type"] == "array"

    @pytest.mark.asyncio
    async def test_tool_call_runs_once_and_finalises_reply(self) -> None:
        matter = _make_matter()
        session = _AssistantSession(matter)
        invocation_id = uuid.uuid4()
        gateway = _AssistantFakeGateway(
            envelopes=[
                {
                    "content": "I'll run the contract review.",
                    "suggested_actions": [],
                    "tool_calls": [
                        {
                            "module_id": "legalise.contract_review",
                            "capability_id": "review",
                            "args": {"input": "Review the attached NDA"},
                        }
                    ],
                },
                {
                    "content": "Contract review completed. Open the Record for the run.",
                    "suggested_actions": [
                        {
                            "type": "view_audit",
                            "label": "Open Record",
                            "params": {"invocation_id": str(invocation_id)},
                        }
                    ],
                    "tool_calls": [],
                },
            ]
        )
        installed = InstalledModule(
            id=uuid.uuid4(),
            module_id="legalise.contract_review",
            version="1.0.0",
            publisher="legalise",
            visibility="first_party",
            signature_status="structure_verified",
            signed_by="legalise",
            install_path="<inline>",
            manifest_snapshot={},
            permissions_snapshot={},
            installed_by_user_id=uuid.uuid4(),
            enabled=True,
        )
        tool = assistant_pipeline.AssistantToolSpec(
            module_id="legalise.contract_review",
            capability_id="review",
            label="Review contract",
            description="Review an uploaded contract.",
            args_schema={},
            declaration={"id": "review", "kind": "skill", "scope": "matter"},
            installed_module=installed,
        )

        async def _fake_dispatch(**kwargs):
            call = kwargs["call"]
            assert call.module_id == "legalise.contract_review"
            assert kwargs["actor_role"] == "qualified_solicitor"
            return {"artifact_id": "art-1", "output_chars": 120}, invocation_id

        with (
            patch.object(assistant_pipeline, "_load_assistant_tools", return_value=[tool]),
            patch.object(assistant_pipeline, "_dispatch_assistant_tool", _fake_dispatch),
        ):
            _, assistant_row = await run_assistant_turn(
                session=session,
                matter=matter,
                actor_id=uuid.uuid4(),
                actor_role="qualified_solicitor",
                request=AssistantPostRequest(content="Review the attached NDA"),
                gateway=gateway,
            )

        assert len(gateway.calls) == 2
        assert "## Tool result" in gateway.calls[1]["prompt"]
        assert assistant_row.content.startswith("Contract review completed")
        assert assistant_row.suggested_actions[0]["type"] == "view_audit"
        audit_rows = [
            o
            for o in session.added
            if isinstance(o, AuditEntry) and o.module == "assistant"
        ]
        assert audit_rows[0].payload["tool_call_count"] == 1
        assert audit_rows[0].payload["tool_invocation_id"] == str(invocation_id)

    @pytest.mark.asyncio
    async def test_tool_loop_emits_progress_events(self) -> None:
        matter = _make_matter()
        session = _AssistantSession(matter)
        invocation_id = uuid.uuid4()
        events: list[tuple[str, dict[str, Any]]] = []
        gateway = _AssistantFakeGateway(
            envelopes=[
                {
                    "content": "I'll run the tool.",
                    "suggested_actions": [],
                    "tool_calls": [
                        {
                            "module_id": "legalise.contract_review",
                            "capability_id": "review",
                            "args": {},
                        }
                    ],
                },
                {
                    "content": "Done.",
                    "suggested_actions": [],
                    "tool_calls": [],
                },
            ]
        )
        installed = InstalledModule(
            id=uuid.uuid4(),
            module_id="legalise.contract_review",
            version="1.0.0",
            publisher="legalise",
            visibility="first_party",
            signature_status="structure_verified",
            signed_by="legalise",
            install_path="<inline>",
            manifest_snapshot={},
            permissions_snapshot={},
            installed_by_user_id=uuid.uuid4(),
            enabled=True,
        )
        tool = assistant_pipeline.AssistantToolSpec(
            module_id="legalise.contract_review",
            capability_id="review",
            label="Review contract",
            description="Review an uploaded contract.",
            args_schema={},
            declaration={"id": "review", "kind": "skill", "scope": "matter"},
            installed_module=installed,
        )

        async def _fake_dispatch(**_kwargs):
            return {"artifact_id": "art-1"}, invocation_id

        async def _capture(name: str, payload: dict[str, Any]) -> None:
            events.append((name, payload))

        with (
            patch.object(assistant_pipeline, "_load_assistant_tools", return_value=[tool]),
            patch.object(assistant_pipeline, "_dispatch_assistant_tool", _fake_dispatch),
        ):
            await run_assistant_turn(
                session=session,
                matter=matter,
                actor_id=uuid.uuid4(),
                request=AssistantPostRequest(content="Review this contract"),
                gateway=gateway,
                on_event=_capture,
            )

        names = [name for name, _ in events]
        assert names == [
            "context.loaded",
            "turn.accepted",
            "model.start",
            "tool.start",
            "tool.end",
            "model.start",
            "turn.end",
        ]
        assert events[0][1]["tool_count"] == 1
        assert events[4][1]["invocation_id"] == str(invocation_id)
        assert events[5][1]["stage"] == "assistant.final"
        assert events[-1][1]["tool_failed"] is False

    def test_stream_route_emits_tool_progress_and_result(self) -> None:
        """The UI calls the SSE route, so prove the HTTP boundary carries
        tool progress frames through to the browser-facing stream.
        """
        from fastapi.testclient import TestClient

        from app.core.auth import current_user
        from app.main import app
        from app.modules.assistant import router as assistant_router

        matter = _make_matter()
        session = _AssistantSession(matter)
        user = _UserStub()
        user.id = matter.created_by_id
        invocation_id = uuid.uuid4()

        class _SessionFactory:
            def __call__(self):
                return self

            async def __aenter__(self):
                return session

            async def __aexit__(self, *_exc):
                return None

        async def _override_user():
            return user

        async def _fake_run_assistant_turn(
            *,
            session,
            matter,
            actor_id,
            actor_role,
            request,
            on_event=None,
        ):
            assert request.content == "Review this contract"
            assert actor_id == user.id
            assert actor_role == "owner"
            assert on_event is not None
            await on_event(
                "context.loaded",
                {"document_count": 1, "chronology_count": 0, "tool_count": 1},
            )
            await on_event(
                "tool.start",
                {
                    "module_id": "legalise.contract_review",
                    "capability_id": "review",
                },
            )
            await on_event(
                "tool.end",
                {
                    "module_id": "legalise.contract_review",
                    "capability_id": "review",
                    "invocation_id": str(invocation_id),
                },
            )
            user_row = AssistantMessageRow(
                id=uuid.uuid4(),
                matter_id=matter.id,
                actor_id=actor_id,
                role="user",
                content=request.content,
                suggested_actions=[],
                created_at=datetime.now(UTC),
            )
            assistant_row = AssistantMessageRow(
                id=uuid.uuid4(),
                matter_id=matter.id,
                actor_id=actor_id,
                role="assistant",
                content="Contract review completed.",
                suggested_actions=[
                    {
                        "type": "view_audit",
                        "label": "Open Record",
                        "params": {"invocation_id": str(invocation_id)},
                    }
                ],
                created_at=datetime.now(UTC),
            )
            return user_row, assistant_row

        had_previous_factory = hasattr(app.state, "session_factory")
        previous_factory = getattr(app.state, "session_factory", None)
        app.state.session_factory = _SessionFactory()
        app.dependency_overrides[current_user] = _override_user
        try:
            with patch.object(
                assistant_router, "run_assistant_turn", _fake_run_assistant_turn
            ):
                client = TestClient(app)
                with client.stream(
                    "POST",
                    f"/api/matters/{matter.slug}/assistant/messages/stream",
                    json={"content": "Review this contract"},
                ) as resp:
                    body = "".join(resp.iter_text())
        finally:
            app.dependency_overrides.clear()
            if had_previous_factory:
                app.state.session_factory = previous_factory
            else:
                try:
                    delattr(app.state, "session_factory")
                except AttributeError:
                    pass

        assert resp.status_code == 200
        assert "event: turn.start" in body
        assert "event: context.loaded" in body
        assert "event: tool.start" in body
        assert "event: tool.end" in body
        assert "event: result" in body
        assert "Contract review completed." in body
        assert str(invocation_id) in body

    @pytest.mark.asyncio
    async def test_c_paused_returns_409(self) -> None:
        from fastapi.testclient import TestClient

        from app.core.auth import current_user
        from app.core.db import get_session
        from app.main import app

        matter = _make_matter(posture="C_paused")
        session = _AssistantSession(matter)
        user = _UserStub()
        user.id = matter.created_by_id

        async def _override_session():
            yield session

        async def _override_user():
            return user

        app.dependency_overrides[current_user] = _override_user
        app.dependency_overrides[get_session] = _override_session

        paused_gateway = _PausedFakeGateway()
        try:
            with patch.object(
                assistant_pipeline, "model_gateway", paused_gateway
            ):
                client = TestClient(app)
                resp = client.post(
                    f"/api/matters/{matter.slug}/assistant/messages",
                    json={"content": "hello"},
                )
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 409
        detail = resp.json().get("detail", "")
        assert "paused" in detail.lower()

    @pytest.mark.asyncio
    async def test_only_owner_can_read(self) -> None:
        from fastapi.testclient import TestClient

        from app.core.auth import current_user
        from app.core.db import get_session
        from app.main import app

        matter = _make_matter()
        session = _AssistantSession(matter)
        # Different user — owner of the matter is matter.created_by_id, but
        # the request actor is fresh, so the slug lookup will miss.
        other_user = _UserStub()

        async def _override_session():
            yield session

        async def _override_user():
            return other_user

        # _AssistantSession.scalar returns the matter unconditionally for
        # `Matter` selects, so simulate ownership failure by switching to
        # a session that returns None for the matter lookup.
        class _NoMatterSession(_AssistantSession):
            async def scalar(self_inner, stmt, *a, **k):
                name = self_inner._entity_name(stmt)
                if name == "Matter":
                    return None
                return await super().scalar(stmt, *a, **k)

        no_matter_session = _NoMatterSession(matter)

        async def _override_no_matter_session():
            yield no_matter_session

        app.dependency_overrides[current_user] = _override_user
        app.dependency_overrides[get_session] = _override_no_matter_session

        try:
            client = TestClient(app)
            resp = client.get(
                f"/api/matters/{matter.slug}/assistant/messages",
            )
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_user_message_survives_tight_context_budget(self) -> None:
        """Reviewer P1 fix — `_assemble_prompt` truncates context first,
        appends the new user message AFTER, so the user's question is
        never lost to history/document overflow.
        """
        from app.modules.assistant.pipeline import _assemble_prompt

        matter = _make_matter()
        bulky_events: list[Event] = []
        for _ in range(5):
            event = _make_event(matter.id)
            event.description = "X" * 4000
            bulky_events.append(event)
        # Long fake history to push the context well past the budget.
        bulky_history = [
            AssistantMessageRow(
                id=uuid.uuid4(),
                matter_id=matter.id,
                actor_id=uuid.uuid4(),
                role="user",
                content="filler " * 500,
                suggested_actions=[],
            )
            for _ in range(8)
        ]
        user_msg = "DISTINCT-USER-QUESTION-ABOUT-DISMISSAL"

        prompt = _assemble_prompt(
            matter=matter,
            history=bulky_history,
            events=bulky_events,
            snippets=[],
            tools=[],
            user_content=user_msg,
            token_budget=200,
        )

        # The user's question and the JSON-shape instruction both live
        # outside the truncated context block.
        assert user_msg in prompt
        assert "Respond with JSON only" in prompt
        # The context overflowed and got truncated.
        assert "…" in prompt


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
        assert len(audit_rows) == 1
        assert audit_rows[0].payload["parse_failed"] is True
        assert audit_rows[0].payload["tool_call_count"] == 0

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
        assert len(audit_rows) == 1
        assert audit_rows[0].payload["tool_failed"] is True
        assert audit_rows[0].payload["tool_invocation_id"] is None

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
            request=AssistantPostRequest(content="What can you run?"),
            gateway=gateway,
        )

        assert len(gateway.calls) == 1
        prompt = gateway.calls[0]["prompt"]
        assert "(no installed Legalise tools are runnable from chat)" in prompt
