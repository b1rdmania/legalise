"""Assistant turn — persists, audits, round-trips actions, gates posture.

Split out of test_assistant_pipeline.py (TEST_SLIM_ORDER_2026-06-12 plan,
repo history) into behaviour-area files. Covers: message persistence +
audit, suggested-action round-trip, keyless deterministic fallback, keyed
routing, prompt assembly (matter/chronology/tools), the tool loop
(run-once, progress events, SSE boundary), posture 409, owner-only read,
context-budget survival. Shared stubs live in
``tests/_assistant_pipeline_helpers.py``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import patch

import pytest

from app.core.model_gateway import ModelResult
from app.models import AuditEntry, Event, InstalledModule
from app.models.assistant import AssistantMessage as AssistantMessageRow
from app.modules.assistant import pipeline as assistant_pipeline
from app.modules.assistant.pipeline import run_assistant_turn
from app.modules.assistant.schemas import AssistantPostRequest
from tests._assistant_pipeline_helpers import (
    _AssistantFakeGateway,
    _AssistantSession,
    _KeylessFakeGateway,
    _PausedFakeGateway,
    _UserStub,
    _canned_assistant_envelope,
    _make_document,
    _make_document_body,
    _make_event,
    _make_matter,
)


class TestAssistantPipeline:
    """Assistant turn persists, audits, round-trips actions, gates posture."""

    @pytest.mark.asyncio
    async def test_message_persists_and_audits(self) -> None:
        matter = _make_matter()
        event = _make_event(matter.id)
        session = _AssistantSession(matter, events=[event])
        gateway = _AssistantFakeGateway()

        async def _fake_audit_out_of_band(request_session, action, **kwargs):
            from app.core.api import audit

            await audit.log(request_session, action, **kwargs)

        with patch.object(
            assistant_pipeline,
            "audit_out_of_band",
            _fake_audit_out_of_band,
        ):
            user_row, assistant_row = await run_assistant_turn(
                session=session,
                matter=matter,
                actor_id=uuid.uuid4(),
                thread_id=uuid.uuid4(),
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
        assert {row.action for row in audit_rows} == {
            "module.assistant.message",
            "retrieval.search",
        }

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
            thread_id=uuid.uuid4(),
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
            thread_id=uuid.uuid4(),
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
            thread_id=uuid.uuid4(),
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

        async def _fake_search_documents(*_args: Any, **_kwargs: Any):
            return [
                assistant_pipeline.RetrievalHit(
                    document_id=dismissal.id,
                    chunk_index=0,
                    text=dismissal_body.extracted_text or "",
                    char_start=0,
                    char_end=len(dismissal_body.extracted_text or ""),
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
                request=AssistantPostRequest(content="Summarise the dismissal letter"),
                gateway=gateway,
            )

        assert "Summary of khan-dismissal-letter.pdf" in assistant_row.content
        assert f"[doc:{dismissal.id}]" in assistant_row.content

    @pytest.mark.asyncio
    async def test_keyless_general_question_falls_back_to_retrieval(self) -> None:
        """No key + a general (non-summary) question that retrieval can answer:
        rather than dead-end on the key-missing banner, show the retrieved
        passages, honestly labelled, with sources so the 'what the AI saw'
        panel still renders. A keyless fork must still demo itself."""
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
                request=AssistantPostRequest(
                    content="What was the stated reason for the dismissal?"
                ),
                gateway=gateway,
            )

        assert len(gateway.calls) == 1  # model attempted first
        assert "No model key is configured" in assistant_row.content
        assert assistant_row.model_used == "deterministic-summary"
        assert len(assistant_row.sources) >= 1  # sources still render
        assert str(document.id) in {s["document_id"] for s in assistant_row.sources}
        audit_rows = [
            o
            for o in session.added
            if isinstance(o, AuditEntry) and o.module == "assistant"
        ]
        assert audit_rows[0].payload["deterministic"] == "keyless_retrieval"

    @pytest.mark.asyncio
    async def test_keyless_question_with_no_retrieval_persists_no_model_reply(self) -> None:
        """No key AND retrieval found nothing to show: the turn must NOT
        raise (a 422 used to roll back the user's message and leave the
        pre-committed thread as an empty ghost). Both rows persist, with
        an honest 'no model' assistant reply."""
        matter = _make_matter()
        session = _AssistantSession(matter, documents=[], bodies={})
        gateway = _KeylessFakeGateway()

        async def _no_hits(*_args: Any, **_kwargs: Any):
            return []

        with patch.object(
            assistant_pipeline.retrieval, "search_documents", _no_hits
        ):
            user_row, assistant_row = await run_assistant_turn(
                session=session,
                matter=matter,
                actor_id=uuid.uuid4(),
                thread_id=uuid.uuid4(),
                request=AssistantPostRequest(content="Draft a wholly new letter"),
                gateway=gateway,
            )

        assert user_row.content == "Draft a wholly new letter"
        assert "No model key is configured" in assistant_row.content
        assert "Settings" in assistant_row.content
        assert assistant_row.model_used == "no-model"
        audit_rows = [
            o
            for o in session.added
            if isinstance(o, AuditEntry) and o.module == "assistant"
        ]
        assert audit_rows[0].payload["deterministic"] == "no_model"

    @pytest.mark.asyncio
    async def test_stub_echo_matter_wraps_raw_text_without_envelope(self) -> None:
        """A matter pinned to the demo model never gets a JSON envelope
        back, so the pipeline must wrap the raw echo as the reply (clearly
        labelled) instead of failing the parse every turn."""
        matter = _make_matter()
        matter.default_model_id = "stub-echo"
        session = _AssistantSession(matter)
        gateway = _AssistantFakeGateway()

        async def _raw_text_call(**kwargs):
            gateway.calls.append(kwargs)
            return ModelResult(
                text="[stub-echo] What does the NDA say?",
                model_used="stub-echo",
                prompt_hash="ph",
                response_hash="rh",
                token_count=7,
                latency_ms=1,
            )

        gateway.call = _raw_text_call

        _, assistant_row = await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            thread_id=uuid.uuid4(),
            request=AssistantPostRequest(content="What does the NDA say?"),
            gateway=gateway,
        )

        assert assistant_row.content.startswith("[stub-echo]")
        assert "Demo model" in assistant_row.content
        audit_rows = [
            o
            for o in session.added
            if isinstance(o, AuditEntry) and o.module == "assistant"
        ]
        assert audit_rows[-1].payload["parse_failed"] is False

    @pytest.mark.asyncio
    async def test_assistant_turn_passes_max_tokens(self) -> None:
        """The assistant turn raises the output cap above the provider
        default so long cited answers don't truncate mid-envelope."""
        matter = _make_matter()
        session = _AssistantSession(matter)
        gateway = _AssistantFakeGateway()

        await run_assistant_turn(
            session=session,
            matter=matter,
            actor_id=uuid.uuid4(),
            thread_id=uuid.uuid4(),
            request=AssistantPostRequest(content="Summarise the matter."),
            gateway=gateway,
        )

        assert gateway.calls[0]["max_tokens"] == assistant_pipeline._ASSISTANT_MAX_TOKENS

    def test_system_prompt_forbids_uncited_law(self) -> None:
        """The uncited-law rule ships in the system prompt."""
        from app.modules.assistant.pipeline import SYSTEM_PROMPT

        assert "Never invent citations" in SYSTEM_PROMPT
        assert (
            "Do not cite case law, statutes, or authorities from memory"
            in SYSTEM_PROMPT
        )

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
            thread_id=uuid.uuid4(),
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
                thread_id=uuid.uuid4(),
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
    async def test_tools_skip_unresolvable_native_entrypoints(self) -> None:
        """A native install whose entrypoint no longer exists on this
        image must not be advertised to the model — dispatching it can
        only fail (the app.adapters.plugin_bridge incident)."""
        matter = _make_matter()
        stale_install = InstalledModule(
            id=uuid.uuid4(),
            module_id="uk-litigation-legal.pre-motion",
            version="1.0.0-legacy",
            publisher="legacy",
            visibility="first_party",
            signature_status="unsigned",
            signed_by=None,
            install_path="<inline>",
            manifest_snapshot={
                "runtime": "native",
                "entrypoint": {
                    "python_module": "app.adapters.plugin_bridge",
                    "entry": "PluginBridge",
                },
                "capabilities": [
                    {"id": "run", "kind": "skill", "scope": "matter"}
                ],
            },
            permissions_snapshot={},
            installed_by_user_id=uuid.uuid4(),
            enabled=True,
        )
        prompt_install = InstalledModule(
            id=uuid.uuid4(),
            module_id="github.example.skill",
            version="0.0.0",
            publisher="example",
            visibility="community",
            signature_status="unsigned",
            signed_by=None,
            install_path="<inline>",
            manifest_snapshot={
                "runtime": "prompt",
                "entrypoint": {"prompt_source": "manifest"},
                "capabilities": [
                    {
                        "id": "run",
                        "kind": "skill",
                        "scope": "matter",
                        "ui": {"label": "Example skill"},
                    }
                ],
            },
            permissions_snapshot={},
            installed_by_user_id=uuid.uuid4(),
            enabled=True,
        )
        session = _AssistantSession(
            matter,
            installed_modules=[stale_install, prompt_install],
        )

        tools = await assistant_pipeline._load_assistant_tools(session)

        assert [(t.module_id, t.capability_id) for t in tools] == [
            ("github.example.skill", "run")
        ]

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
                thread_id=uuid.uuid4(),
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
        message_audit = next(
            row for row in audit_rows if row.action == "module.assistant.message"
        )
        assert message_audit.payload["tool_call_count"] == 1
        assert message_audit.payload["tool_invocation_id"] == str(invocation_id)

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
                thread_id=uuid.uuid4(),
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
            thread_id,
            actor_role,
            request,
            on_event=None,
        ):
            assert request.content == "Review this contract"
            assert actor_id == user.id
            assert thread_id is not None
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
                thread_id=uuid.uuid4(),
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
            chronology_total=len(bulky_events),
            document_index=[],
            document_total=0,
            outputs=[],
            snippets=[],
            retrieval_used=False,
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
