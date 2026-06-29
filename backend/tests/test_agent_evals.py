"""agent-kit eval adapter — POST /api/evals/agent.

Stub-based (no DB): the adapter's three cases are exercised through
the real route with ``get_session`` overridden by a fake session.
``posture_refusal`` and ``deterministic_summary`` never touch the
session on the explicit-input paths; ``chain_intact`` stubs
``verify_audit_chain`` at the adapter import site.

Covers the secret gate (503 unset / 403 wrong / 200 right) and the
output shape of every case including negatives.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.audit_chain import AuditChainIssue, AuditChainVerification
from app.core.config import settings
from app.core.db import get_session
from app.main import app


SECRET = "test-agent-kit-secret"


class _FakeSession:
    """Returns queued values from ``scalar`` — enough for the slug lookup."""

    def __init__(self, scalar_results: list[Any] | None = None) -> None:
        self._scalar_results = list(scalar_results or [])

    async def scalar(self, _stmt: Any) -> Any:
        if self._scalar_results:
            return self._scalar_results.pop(0)
        return None


@pytest_asyncio.fixture
async def eval_client(monkeypatch):
    monkeypatch.setattr(settings, "agent_kit_secret", SECRET, raising=False)

    fake_session = _FakeSession()

    async def _override():
        yield fake_session

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        client.fake_session = fake_session
        yield client
    app.dependency_overrides.pop(get_session, None)


def _payload(case_input: dict[str, Any]) -> dict[str, Any]:
    return {
        "input": case_input,
        "trace_id": f"agent-kit-{uuid.uuid4()}",
        "metadata": {"record_id": "test", "source": "agent-kit-runner"},
    }


def _headers(secret: str | None = SECRET) -> dict[str, str]:
    return {"X-Agent-Kit-Secret": secret} if secret else {}


# ── secret gate ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_503_when_secret_unset(eval_client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "agent_kit_secret", None, raising=False)
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "posture_refusal", "posture": "C_paused"}),
        headers=_headers(),
    )
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_403_on_wrong_secret(eval_client) -> None:
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "posture_refusal", "posture": "C_paused"}),
        headers=_headers("wrong-secret"),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_403_on_missing_secret_header(eval_client) -> None:
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "chain_intact"}),
        headers={},
    )
    assert resp.status_code == 403


# ── contract shape ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unknown_case_returns_200_error_shape(eval_client) -> None:
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "no-such-case"}),
        headers=_headers(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "output" not in body
    assert "no-such-case" in body["error"]
    assert isinstance(body["metadata"]["duration_ms"], int)


# ── posture_refusal ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_posture_paused_refuses(eval_client) -> None:
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "posture_refusal", "posture": "C_paused"}),
        headers=_headers(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["output"] == {
        "refused": True,
        "reason": "posture",
        "posture": "C_paused",
    }
    assert isinstance(body["metadata"]["duration_ms"], int)


@pytest.mark.asyncio
async def test_posture_cleared_allows(eval_client) -> None:
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "posture_refusal", "posture": "A_cleared"}),
        headers=_headers(),
    )
    body = resp.json()
    assert body["output"]["refused"] is False
    assert body["output"]["reason"] is None


@pytest.mark.asyncio
async def test_posture_via_matter_slug_reads_live_posture(eval_client) -> None:
    class _FakeMatter:
        privilege_posture = "C_paused"

    eval_client.fake_session._scalar_results.append(_FakeMatter())
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "posture_refusal", "matter_slug": "khan-v-acme"}),
        headers=_headers(),
    )
    body = resp.json()
    assert body["output"]["refused"] is True
    assert body["output"]["reason"] == "posture"


@pytest.mark.asyncio
async def test_posture_unknown_matter_is_error(eval_client) -> None:
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "posture_refusal", "matter_slug": "missing"}),
        headers=_headers(),
    )
    body = resp.json()
    assert resp.status_code == 200
    assert "missing" in body["error"]


# ── deterministic_summary ────────────────────────────────────────────

_DOCS = [
    {"filename": "contract_acme_2026.pdf", "tag": "contract", "text": "x"},
    {"filename": "witness_statement_khan.docx", "tag": None, "text": "y"},
]


@pytest.mark.asyncio
async def test_summary_matches_named_document(eval_client) -> None:
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload(
            {
                "case": "deterministic_summary",
                "user_content": "summarise the witness statement",
                "documents": _DOCS,
            }
        ),
        headers=_headers(),
    )
    assert resp.json()["output"] == {
        "matched_document": "witness_statement_khan.docx"
    }


@pytest.mark.asyncio
async def test_summary_ambiguous_returns_null(eval_client) -> None:
    docs = [
        {"filename": "contract_v1.pdf", "text": "x"},
        {"filename": "contract_v2.pdf", "text": "y"},
    ]
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload(
            {
                "case": "deterministic_summary",
                "user_content": "summarise the contract",
                "documents": docs,
            }
        ),
        headers=_headers(),
    )
    assert resp.json()["output"] == {"matched_document": None}


@pytest.mark.asyncio
async def test_summary_missing_documents_is_error(eval_client) -> None:
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "deterministic_summary", "user_content": "hi"}),
        headers=_headers(),
    )
    assert "documents" in resp.json()["error"]


# ── chain_intact ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_chain_intact_verified(eval_client, monkeypatch) -> None:
    async def _fake_verify(session, *, matter_id=None):
        assert matter_id is None
        return AuditChainVerification(
            ok=True,
            audit_entry_count=11,
            chain_entry_count=11,
            scopes_verified=2,
        )

    monkeypatch.setattr(
        "app.api.agent_evals.verify_audit_chain", _fake_verify
    )
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "chain_intact"}),
        headers=_headers(),
    )
    body = resp.json()
    assert body["output"]["verified"] is True
    assert body["output"]["audit_entry_count"] == 11
    assert body["output"]["issues"] == []


@pytest.mark.asyncio
async def test_chain_intact_broken_chain(eval_client, monkeypatch) -> None:
    async def _fake_verify(session, *, matter_id=None):
        return AuditChainVerification(
            ok=False,
            audit_entry_count=11,
            chain_entry_count=10,
            scopes_verified=2,
            issues=[AuditChainIssue(code="count_mismatch", message="11 vs 10")],
        )

    monkeypatch.setattr(
        "app.api.agent_evals.verify_audit_chain", _fake_verify
    )
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "chain_intact"}),
        headers=_headers(),
    )
    body = resp.json()
    assert body["output"]["verified"] is False
    assert body["output"]["issues"] == ["count_mismatch"]


# ── retrieval_grounding ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_retrieval_grounding_shapes_real_hits(eval_client, monkeypatch) -> None:
    class _FakeMatter:
        id = uuid.uuid4()

    doc_a, doc_b = uuid.uuid4(), uuid.uuid4()

    async def _fake_search(session, matter_id, query, *, k=8):
        assert matter_id == _FakeMatter.id
        assert query == "why was Khan dismissed"
        return [
            SimpleNamespace(document_id=doc_a, char_start=0, char_end=120, score=0.5),
            SimpleNamespace(document_id=doc_a, char_start=120, char_end=240, score=0.4),
            SimpleNamespace(document_id=doc_b, char_start=0, char_end=80, score=0.3),
        ]

    eval_client.fake_session._scalar_results.append(_FakeMatter())
    monkeypatch.setattr("app.api.agent_evals.search_documents", _fake_search)
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload(
            {
                "case": "retrieval_grounding",
                "matter_slug": "khan-v-acme",
                "query": "why was Khan dismissed",
            }
        ),
        headers=_headers(),
    )
    out = resp.json()["output"]
    assert out["source_count"] == 3
    # Two distinct documents, deduped and order-preserved.
    assert out["document_ids"] == [str(doc_a), str(doc_b)]
    assert out["document_count"] == 2
    assert out["well_formed"] is True
    assert out["sources"][0]["char_end"] == 120


@pytest.mark.asyncio
async def test_retrieval_grounding_empty_when_no_hits(eval_client, monkeypatch) -> None:
    class _FakeMatter:
        id = uuid.uuid4()

    async def _fake_search(session, matter_id, query, *, k=8):
        return []

    eval_client.fake_session._scalar_results.append(_FakeMatter())
    monkeypatch.setattr("app.api.agent_evals.search_documents", _fake_search)
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload(
            {"case": "retrieval_grounding", "matter_slug": "khan-v-acme", "query": ""}
        ),
        headers=_headers(),
    )
    out = resp.json()["output"]
    assert out["source_count"] == 0
    assert out["sources"] == []
    assert out["document_ids"] == []
    # Vacuously well-formed — no hits to violate the contract.
    assert out["well_formed"] is True


@pytest.mark.asyncio
async def test_retrieval_grounding_unknown_matter_is_error(eval_client) -> None:
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload(
            {"case": "retrieval_grounding", "matter_slug": "missing", "query": "x"}
        ),
        headers=_headers(),
    )
    assert resp.status_code == 200
    assert "missing" in resp.json()["error"]


@pytest.mark.asyncio
async def test_retrieval_grounding_requires_slug(eval_client) -> None:
    resp = await eval_client.post(
        "/api/evals/agent",
        json=_payload({"case": "retrieval_grounding", "query": "x"}),
        headers=_headers(),
    )
    assert "matter_slug" in resp.json()["error"]
