"""Phase E W2 (#10a) — four existing-surface smoke evals.

Eval 1: audit-row contract — every documented action string is callable
through `audit.log` with the documented module namespace and produces a
well-shaped `AuditEntry` row.

Eval 2: posture-routing — A_cleared/B_mixed/C_paused → expected provider
selection or PrivilegePaused.

Eval 3: redline anchor resolution — `apply_anchor_substitution` returns
the right span when anchored uniquely, and signals `skipped_no_anchor`
when the context does not match base text.

Eval 4: NDA-clause parse — the Khan-NDA seed body pipes through
`ParserAgent.run` (model gateway mocked) and `parse_model_json` yields a
`ParsedContract` with ≥1 clause; `RedlinerAgent.run` yields ≥1 redline.
"""

from __future__ import annotations

import json
import uuid
from typing import Any
from unittest.mock import patch

import pytest

from app.core import model_gateway as gw_module
from app.core.api import audit as audit_api
from app.core.model_gateway import (
    ModelGateway,
    ModelResult,
    PrivilegePaused,
    PrivilegePosture,
    StubProvider,
)
from app.core.seed import KHAN_NDA_BODY
from app.adapters.plugin_bridge import PluginBridge, SkillDisabled
from app.models import AuditEntry
from app.models.document_edit import DocumentEdit
from app.modules.contract_review import agents as cr_agents
from app.modules.contract_review.agents import AgentCall, ParserAgent, RedlinerAgent
from app.modules.contract_review.schemas import ParsedContract
from app.modules.document_edit.resolver import apply_anchor_substitution


# ---------------------------------------------------------------------------
# Shared fakes
# ---------------------------------------------------------------------------


class _CapturingSession:
    """Async-session stand-in that records `session.add()` payloads."""

    def __init__(self) -> None:
        self.added: list[Any] = []

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def scalar(self, *args: Any, **kwargs: Any):
        return None

    async def execute(self, *args: Any, **kwargs: Any):
        class _Row:
            def first(self_inner):
                return None

        return _Row()

    async def commit(self) -> None:
        return None

    async def flush(self) -> None:
        return None


# Canonical module namespace set used across the workspace. Lifted from
# the audit-row callsites in app/modules/*/{router,pipeline}.py.
_CANONICAL_MODULES = {
    "letters",
    "pre_motion",
    "contract_review",
    "anonymisation",
    "case_law",
    "chronology",
    "document_edit",
    "tabular_review",
    "module_lifecycle",
    "plugin",
    "assistant",
}


# Documented action strings (one per canonical module surface). Each must
# round-trip through `audit_api.log` and produce a row with the matching
# module namespace.
_ACTIONS_BY_MODULE = {
    "letters": "module.letters.docx.exported",
    "pre_motion": "module.pre_motion.run.complete",
    "contract_review": "module.contract_review.run.start",
    "anonymisation": "module.anonymisation.run",
    "case_law": "module.case_law.search",
    "chronology": "chronology.gate.confirmed",
    "document_edit": "document.edit.accepted",
    "tabular_review": "module.tabular_review.run.completed",
    "module_lifecycle": "module.lifecycle.enabled",
    "plugin": "plugin.invoked",
    "assistant": "module.assistant.message",
}


# ---------------------------------------------------------------------------
# Eval 1 — audit-row contract
# ---------------------------------------------------------------------------


class TestAuditRowContract:
    """Every documented module emits an AuditEntry with the documented shape."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("module,action", list(_ACTIONS_BY_MODULE.items()))
    async def test_audit_row_shape(self, module: str, action: str) -> None:
        session = _CapturingSession()
        actor_id = uuid.uuid4()
        matter_id = uuid.uuid4()
        resource_id = str(uuid.uuid4())

        await audit_api.log(
            session,
            action,
            actor_id=actor_id,
            matter_id=matter_id,
            module=module,
            resource_type=f"{module}.resource",
            resource_id=resource_id,
            payload={"k": "v"},
        )

        assert len(session.added) == 1
        row = session.added[0]
        assert isinstance(row, AuditEntry)
        assert row.actor_id == actor_id
        assert row.matter_id == matter_id
        assert row.module == module
        assert row.module in _CANONICAL_MODULES
        assert row.action == action
        assert row.resource_type == f"{module}.resource"
        assert row.resource_id == resource_id
        assert row.payload == {"k": "v"}


# ---------------------------------------------------------------------------
# Eval 2 — posture-routing
# ---------------------------------------------------------------------------


class _KeyedProviderStub:
    def __init__(self, name: str) -> None:
        self.name = name

    async def call(self, prompt: str, *, system: str | None = None, **kwargs):
        return ("ok", 1)


class TestPostureRouting:
    """A_cleared/B_mixed/C_paused route to the expected provider or raise."""

    def _gateway_with_all_providers(self) -> ModelGateway:
        g = ModelGateway()
        g.register(_KeyedProviderStub("anthropic"))
        g.register(_KeyedProviderStub("openai"))
        g.register(StubProvider(name="ollama"))
        return g

    def test_a_cleared_routes_to_keyed_provider(self) -> None:
        g = self._gateway_with_all_providers()
        assert (
            g.select_provider_name("claude-opus-4-7", PrivilegePosture.A_CLEARED)
            == "anthropic"
        )
        assert (
            g.select_provider_name("gpt-5", PrivilegePosture.A_CLEARED) == "openai"
        )

    def test_b_mixed_prefers_local_for_frontier_models(self) -> None:
        g = self._gateway_with_all_providers()
        assert (
            g.select_provider_name("claude-opus-4-7", PrivilegePosture.B_MIXED)
            == "ollama"
        )
        assert (
            g.select_provider_name("gpt-5", PrivilegePosture.B_MIXED) == "ollama"
        )

    def test_b_mixed_without_local_falls_back_to_keyed(self) -> None:
        g = ModelGateway()
        g.register(_KeyedProviderStub("anthropic"))
        assert (
            g.select_provider_name("claude-opus-4-7", PrivilegePosture.B_MIXED)
            == "anthropic"
        )

    @pytest.mark.asyncio
    @patch.object(gw_module, "get_user_provider_key", return_value=None)
    async def test_c_paused_raises_privilege_paused(self, _mock_lookup) -> None:
        g = self._gateway_with_all_providers()
        session = _CapturingSession()
        with pytest.raises(PrivilegePaused):
            await g.call(
                session=session,
                matter_id=None,
                actor_id=uuid.uuid4(),
                prompt="hi",
                model="claude-opus-4-7",
                posture=PrivilegePosture.C_PAUSED,
            )


# ---------------------------------------------------------------------------
# Eval 3 — redline anchor resolution
# ---------------------------------------------------------------------------


class TestRedlineAnchorResolution:
    """Anchor substitution returns the right span; missing anchor signals skipped."""

    def _edit(
        self,
        *,
        deleted: str,
        inserted: str,
        before: str = "",
        after: str = "",
    ) -> DocumentEdit:
        e = DocumentEdit(
            id=uuid.uuid4(),
            document_version_id=uuid.uuid4(),
            change_id="c1",
            deleted_text=deleted,
            inserted_text=inserted,
            context_before=before,
            context_after=after,
            status="pending",
        )
        return e

    def test_unique_anchor_substitutes_correct_span(self) -> None:
        base = (
            "Clause 1. The Recipient shall keep Confidential Information secret. "
            "Clause 2. The Recipient shall not disclose secrets to third parties."
        )
        edit = self._edit(
            deleted="keep Confidential Information secret",
            inserted="hold Confidential Information in strict confidence",
            before="The Recipient shall ",
            after=". Clause 2.",
        )
        new_text, status = apply_anchor_substitution(base, edit)
        assert status == "applied"
        assert "hold Confidential Information in strict confidence" in new_text
        assert "keep Confidential Information secret" not in new_text
        # The unaltered second clause stays intact.
        assert "shall not disclose secrets" in new_text

    def test_missing_anchor_signals_skipped_no_anchor(self) -> None:
        base = "Clause A. Some unrelated text."
        edit = self._edit(
            deleted="this string does not appear in base",
            inserted="replacement",
            before="WRONG_CONTEXT_PREFIX",
            after="WRONG_CONTEXT_SUFFIX",
        )
        new_text, status = apply_anchor_substitution(base, edit)
        assert status == "skipped_no_anchor"
        assert new_text == base


# ---------------------------------------------------------------------------
# Eval 4 — NDA-clause parse
# ---------------------------------------------------------------------------


def _canned_parsed_envelope() -> dict[str, Any]:
    return {
        "title": "Mutual Non-Disclosure Agreement",
        "parties": ["Khan", "Acme Ltd"],
        "document_type": "nda",
        "governing_law_stated": "England and Wales",
        "clauses": [
            {
                "id": "c1",
                "section": "1",
                "title": "Definitions",
                "type": "definitions",
                "text": "Confidential Information means...",
                "defined_terms_used": ["Confidential Information"],
                "cross_references": [],
            },
            {
                "id": "c2",
                "section": "2",
                "title": "Obligations",
                "type": "confidentiality",
                "text": "Each party shall keep Confidential Information secret.",
                "defined_terms_used": ["Confidential Information"],
                "cross_references": [],
            },
        ],
    }


def _canned_redline_envelope() -> dict[str, Any]:
    return {
        "redlines": [
            {
                "clause_id": "c2",
                "original_text": "Each party shall keep Confidential Information secret.",
                "suggested_text": (
                    "Each party shall hold Confidential Information in strict "
                    "confidence and use it solely for the Purpose."
                ),
                "explanation": "Tighten confidentiality obligation per UK NDA norms.",
                "priority": "must",
            }
        ]
    }


class _FakeGateway:
    """Mocks `ModelGateway.call` with canned responses keyed by stage."""

    def __init__(self, responses: dict[str, str]) -> None:
        self._responses = responses
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
        stage = (payload or {}).get("stage", "")
        text = self._responses.get(stage, "{}")
        self.calls.append({"stage": stage, "prompt": prompt})
        return ModelResult(
            text=text,
            model_used="stub-echo",
            prompt_hash="ph",
            response_hash="rh",
            token_count=42,
            latency_ms=10,
        )


class _MatterStub:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.default_model_id = "claude-opus-4-7"
        self.slug = "khan-nda"
        self.privilege_posture = "B_mixed"


class TestNdaClauseParse:
    """Khan-NDA fixture pipes through agents; envelopes parse cleanly."""

    @pytest.mark.asyncio
    async def test_parser_yields_at_least_one_clause(self) -> None:
        gateway = _FakeGateway(
            {"parser": json.dumps(_canned_parsed_envelope())}
        )
        matter = _MatterStub()
        session = _CapturingSession()

        call = await ParserAgent().run(
            session=session,
            gateway=gateway,
            matter=matter,
            actor_id=uuid.uuid4(),
            contract_body=KHAN_NDA_BODY,
            contract_type_hint="nda",
            posture="balanced",
            counterparty="Acme Ltd",
        )

        assert call.error is None
        assert call.parsed is not None
        parsed = ParsedContract(**call.parsed)
        assert len(parsed.clauses) >= 1
        assert parsed.document_type == "nda"
        # Khan-NDA seed body is the input the prompt actually carries.
        assert any(KHAN_NDA_BODY[:32] in c["prompt"] for c in gateway.calls)

    @pytest.mark.asyncio
    async def test_redliner_yields_at_least_one_redline(self) -> None:
        gateway = _FakeGateway(
            {"redliner": json.dumps(_canned_redline_envelope())}
        )
        matter = _MatterStub()
        session = _CapturingSession()

        call = await RedlinerAgent().run(
            session=session,
            gateway=gateway,
            matter=matter,
            actor_id=uuid.uuid4(),
            parsed_contract=_canned_parsed_envelope(),
            analyses=[],
            posture="balanced",
        )

        assert call.error is None
        assert call.parsed is not None
        redlines = call.parsed.get("redlines") or []
        assert len(redlines) >= 1
        assert redlines[0]["clause_id"] == "c2"


class TestSkillDisabledShortCircuit:
    """Disabled `(plugin, skill)` raises before the gateway is touched."""

    @pytest.mark.asyncio
    async def test_disable_row_blocks_invocation(self, tmp_path) -> None:
        skill_dir = tmp_path / "letters" / "skills" / "default-lba"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: default-lba\ndescription: stub\n---\nbody\n",
            encoding="utf-8",
        )

        gateway = _FakeGateway({})
        bridge = PluginBridge(plugins_root=tmp_path, gateway=gateway)

        class _DisabledSession(_CapturingSession):
            async def scalar(self, *args: Any, **kwargs: Any):
                return object()

        with pytest.raises(SkillDisabled) as info:
            await bridge.invoke(
                session=_DisabledSession(),
                matter_id=uuid.uuid4(),
                actor_id=uuid.uuid4(),
                plugin="letters",
                skill="default-lba",
                inputs={},
            )
        assert info.value.plugin == "letters"
        assert info.value.skill == "default-lba"
        assert gateway.calls == []


# ---------------------------------------------------------------------------
# Eval 5 — Contract Review orchestrator end-to-end through the HTTP surface
# ---------------------------------------------------------------------------


def _canned_analyst_envelope() -> dict[str, Any]:
    return {
        "clause_analyses": [
            {
                "clause_id": "c2",
                "risk_score": 4,
                "summary": "Confidentiality obligation is too loose.",
                "uk_issues": [
                    {
                        "category": "uk_gdpr_art28",
                        "statute_ref": "UK GDPR Art 28(3)",
                        "description": "Processor terms missing.",
                        "severity": "high",
                    }
                ],
                "posture_note": "balanced",
            }
        ]
    }


def _canned_summary_envelope() -> dict[str, Any]:
    return {
        "executive_summary": "Mutual NDA, balanced posture, one must-fix.",
        "key_terms": ["Confidential Information", "Purpose"],
        "risk_overview": "One high-severity UK GDPR gap.",
        "uk_specific_callouts": ["UK GDPR Art 28(3) processor obligations missing"],
        "recommendation": "Negotiate must-have redlines before signing.",
    }


class _DocumentStub:
    def __init__(self, matter_id: uuid.UUID) -> None:
        self.id = uuid.uuid4()
        self.matter_id = matter_id
        self.filename = "khan-nda.pdf"


class _DocumentBodyStub:
    def __init__(self, document_id: uuid.UUID) -> None:
        self.document_id = document_id
        self.kind = "extracted"
        self.extracted_text = KHAN_NDA_BODY
        self.extraction_method = "test"


class _RoutingSession:
    """Async-session stand-in that routes `scalar` by select entity name."""

    def __init__(self, matter: Any) -> None:
        self.added: list[Any] = []
        self.matter = matter
        self.document = _DocumentStub(matter.id)
        self.body = _DocumentBodyStub(self.document.id)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def scalar(self, stmt: Any, *args: Any, **kwargs: Any):
        try:
            name = stmt.column_descriptions[0]["name"]
        except Exception:
            return None
        if name == "Matter":
            return self.matter
        if name == "privilege_posture":
            return self.matter.privilege_posture
        if name == "Document":
            return self.document
        if name == "DocumentBody":
            return self.body
        return None

    async def execute(self, *args: Any, **kwargs: Any):
        class _Row:
            def first(self_inner):
                return None

        return _Row()

    async def commit(self) -> None:
        return None

    async def flush(self) -> None:
        return None


class _UserStub:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.email = "test@example.com"
        self.is_active = True
        self.is_verified = True
        self.is_superuser = False


def _agent_call(stage: str, parsed: dict[str, Any]) -> AgentCall:
    return AgentCall(
        stage=stage,
        raw_text=json.dumps(parsed),
        parsed=parsed,
        token_count=12,
        latency_ms=5,
        model_used="stub-echo",
        error=None,
    )


class TestContractReviewOrchestratorE2E:
    """`POST /api/matters/{slug}/contract-review/run` against canned agents."""

    def _build_client(self, matter: _MatterStub) -> tuple[Any, _RoutingSession, _UserStub]:
        from fastapi.testclient import TestClient

        from app.core.auth import current_user
        from app.core.db import get_session
        from app.main import app

        session = _RoutingSession(matter)
        user = _UserStub()

        async def _override_session():
            yield session

        async def _override_user():
            return user

        app.dependency_overrides[current_user] = _override_user
        app.dependency_overrides[get_session] = _override_session
        return TestClient(app), session, user

    def _clear_overrides(self) -> None:
        from app.main import app

        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_run_endpoint_returns_envelope_against_khan_nda(self) -> None:
        matter = _MatterStub()
        matter.slug = "khan-v-acme"
        matter.privilege_posture = "B_mixed"

        client, session, _user = self._build_client(matter)

        async def _parser_run(self_inner, **_kw):
            return _agent_call("parser", _canned_parsed_envelope())

        async def _analyst_run(self_inner, **_kw):
            return _agent_call("analyst", _canned_analyst_envelope())

        async def _redliner_run(self_inner, **_kw):
            return _agent_call("redliner", _canned_redline_envelope())

        async def _summariser_run(self_inner, **_kw):
            return _agent_call("summariser", _canned_summary_envelope())

        try:
            with patch.object(cr_agents.ParserAgent, "run", _parser_run), patch.object(
                cr_agents.AnalystAgent, "run", _analyst_run
            ), patch.object(
                cr_agents.RedlinerAgent, "run", _redliner_run
            ), patch.object(
                cr_agents.SummariserAgent, "run", _summariser_run
            ):
                resp = client.post(
                    "/api/matters/khan-v-acme/contract-review/run",
                    json={
                        "document_id": str(session.document.id),
                        "posture": "balanced",
                        "contract_type": "nda",
                        "counterparty_name": "Acme Ltd",
                    },
                )
        finally:
            self._clear_overrides()

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["matter_slug"] == "khan-v-acme"
        assert body["document_id"] == str(session.document.id)
        assert len(body["parsed"]["clauses"]) >= 1
        assert len(body["redlines"]) >= 1
        assert body["summary"]["executive_summary"].strip() != ""
        assert body["total_token_count"] >= 0
        assert any(
            isinstance(row, AuditEntry) and row.module == "contract_review"
            for row in session.added
        )

    @pytest.mark.asyncio
    async def test_run_endpoint_returns_409_on_c_paused(self) -> None:
        matter = _MatterStub()
        matter.slug = "khan-v-acme"
        matter.privilege_posture = "C_paused"

        client, _session, _user = self._build_client(matter)
        try:
            resp = client.post(
                "/api/matters/khan-v-acme/contract-review/run",
                json={
                    "document_id": str(uuid.uuid4()),
                    "posture": "balanced",
                    "contract_type": "nda",
                },
            )
        finally:
            self._clear_overrides()

        assert resp.status_code == 409
        detail = resp.json().get("detail", "")
        assert "C_paused" in detail or "paused" in detail.lower()


# ---------------------------------------------------------------------------
# Eval 6 — Assistant pipeline + router
# ---------------------------------------------------------------------------


from datetime import date, datetime, timezone

from app.models import Event, Matter
from app.models.assistant import AssistantMessage as AssistantMessageRow
from app.modules.assistant import pipeline as assistant_pipeline
from app.modules.assistant.pipeline import run_assistant_turn
from app.modules.assistant.schemas import AssistantPostRequest


def _canned_assistant_envelope(action_type: str = "run_pre_motion") -> dict[str, Any]:
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

    def __init__(self, envelope: dict[str, Any] | None = None) -> None:
        self.envelope = envelope or _canned_assistant_envelope()
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
        return ModelResult(
            text=json.dumps(self.envelope),
            model_used="stub-echo",
            prompt_hash="ph",
            response_hash="rh",
            token_count=42,
            latency_ms=5,
        )


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
    ) -> None:
        self.matter = matter
        self.history = history or []
        self.events = events or []
        self.documents = documents or []
        self.bodies = bodies or {}
        self.added: list[Any] = []

    def add(self, obj: Any) -> None:
        if isinstance(obj, AssistantMessageRow) and obj.id is None:
            obj.id = uuid.uuid4()
        if isinstance(obj, AssistantMessageRow) and obj.created_at is None:
            obj.created_at = datetime.now(timezone.utc)
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
                    obj.created_at = datetime.now(timezone.utc)
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
    matter.opened_at = datetime.now(timezone.utc)
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
    event.created_at = datetime.now(timezone.utc)
    return event


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
            _canned_assistant_envelope("run_pre_motion")
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
        assert action["type"] == "run_pre_motion"
        assert action["label"] == "Run a pre-motion premortem"

    @pytest.mark.asyncio
    async def test_prompt_includes_matter_chronology_and_modules(self) -> None:
        matter = _make_matter()
        event = _make_event(matter.id)
        session = _AssistantSession(matter, events=[event])
        gateway = _AssistantFakeGateway()

        installed = [
            ("letters", "default-lba", "Draft a letter before action"),
            ("pre_motion", "default", "Adversarial premortem of a pleading"),
        ]

        with patch.object(
            assistant_pipeline,
            "_load_installed_modules",
            return_value=installed,
        ):
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
        assert "letters/default-lba" in prompt or "pre_motion/default" in prompt

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
            modules=[],
            user_content=user_msg,
            token_budget=200,
        )

        # The user's question and the JSON-shape instruction both live
        # outside the truncated context block.
        assert user_msg in prompt
        assert "Respond with JSON only" in prompt
        # The context overflowed and got truncated.
        assert "…" in prompt
