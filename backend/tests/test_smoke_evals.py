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
"""

from __future__ import annotations

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
from app.models import AuditEntry
from app.models.document_edit import DocumentEdit
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
    "anonymisation",
    "chronology",
    "document_edit",
    "module_lifecycle",
    "plugin",
    "assistant",
}


# Documented action strings (one per canonical module surface). Each must
# round-trip through `audit_api.log` and produce a row with the matching
# module namespace.
_ACTIONS_BY_MODULE = {
    "anonymisation": "module.anonymisation.run",
    "chronology": "chronology.gate.confirmed",
    "document_edit": "document.edit.accepted",
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


class _UserStub:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.email = "test@example.com"
        self.is_active = True
        self.is_verified = True
        self.is_superuser = False


# ---------------------------------------------------------------------------
# Eval 6 — Assistant pipeline + router
# ---------------------------------------------------------------------------
