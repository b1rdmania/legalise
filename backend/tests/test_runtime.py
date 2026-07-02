"""Runtime tests — dispatcher, provider adapter, and capability
enforcement inside a running module.

Merged from test_phase10_runtime.py + test_phase6_r2_fixes.py
(test-slim Phase 3). Coverage:

Dispatcher + adapter (Phase 10):
1. Entrypoint resolution succeeds for a well-formed manifest
2. Missing python_module → EntrypointResolutionError
3. Missing entry attribute → EntrypointResolutionError
4. Adapter populates all seven ProviderResponse fields
5. Adapter passes the real gateway kwargs (Phase 10 v3 redline)
6. **Adapter does NOT trip the gateway's legacy workspace-scope
   model.invoke check** — the load-bearing v3 regression

Module-level governance (Phase 6 R2/R3 reviewer regressions):
- P1 #1: write_artifact must not overwrite an existing WORM artifact
- P1 #2: per-user grants enforced at the read + write boundaries
- P1 #3: module cannot self-assert (smuggle) an elevated actor_role
- P2: prompt embeds the document's extracted text, never a placeholder
- R3: grants are matter-scoped; cross-matter grants deny before the
  provider call; workspace vs matter scope checks are strict; legacy
  NULL-snapshot grants never satisfy a matter-scoped check

Dedup notes: the adapter's ProviderKeyMissing / ProviderUpstreamError
propagation tests were dropped — the same failure modes are asserted
end-to-end through the adapter by the HTTP error-translation tests in
test_invocations_api.py (422 provider_key_missing / 502
provider_upstream_error).
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

import pytest
from sqlalchemy import select

from app.core.capabilities import CapabilityDenied
from app.core.matter_artifacts import write_artifact
from app.core.model_gateway import ModelResult
from app.core.runtime import (
    EntrypointResolutionError,
    InvocationContext,
    ProviderResponse,
    _find_capability_declaration,
    dispatch_capability,
    make_provider_call,
)
from app.models import (
    Document,
    DocumentBody,
    InstalledModule,
    Matter,
    MatterArtifact,
    PRIVILEGE_CLEARED,
    STATUS_OPEN,
    User,
    WorkspaceSkillCapabilityGrant,
)


# ---------------------------------------------------------------------------
# Shared fixtures/helpers
# ---------------------------------------------------------------------------


async def _make_user(db_session, *, role: str = "qualified_solicitor") -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"runtime-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
        role=role,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_matter(db_session, user) -> Matter:
    # Governance tests here target grant/role mechanics, NOT posture.
    # A_cleared makes the Phase 8 posture gate pass regardless of role
    # so each test's actual concern (missing grant, wrong matter,
    # smuggled role) fires. Posture-specific behaviour is covered by
    # test_posture_gate.py.
    matter = Matter(
        id=uuid.uuid4(),
        slug=f"runtime-{uuid.uuid4().hex[:8]}",
        title="Runtime Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_CLEARED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(matter)
    await db_session.flush()
    return matter


async def _make_document(db_session, matter, *, text: str = "") -> Document:
    doc = Document(
        id=uuid.uuid4(),
        matter_id=matter.id,
        filename="test.pdf",
        mime_type="application/pdf",
        size_bytes=len(text) or 1,
        sha256="0" * 64,
        storage_uri="local://test",
        tag=None,
        from_disclosure=False,
        uploaded_by_id=matter.created_by_id,
    )
    db_session.add(doc)
    await db_session.flush()
    if text:
        body = DocumentBody(
            document_id=doc.id,
            kind="extracted",
            extracted_text=text,
            extraction_method="passthrough",
            char_count=len(text),
        )
        db_session.add(body)
        await db_session.flush()
    return doc


@dataclass
class _StubResponse:
    text: str
    model_id: str = "stub-model"
    provider: str = "stub"
    tokens_in: int = 10
    tokens_out: int = 5
    cost_micros: int = 1_000
    currency: str = "GBP"


async def _stub_provider(prompt, *, system):
    # Return a deterministic empty-findings payload — keeps the test
    # focused on the governance contract, not the parser.
    return _StubResponse(text=json.dumps({"findings": []}))


# ---------------------------------------------------------------------------
# Entrypoint resolution
# ---------------------------------------------------------------------------


def _stub_installed(
    *,
    module_id: str = "examples.contract-review",
    python_module: str = "examples.modules.contract_review",
    entry: str = "ContractReviewModule",
    capabilities: list | None = None,
) -> InstalledModule:
    """Build an InstalledModule shell with a manifest snapshot for
    unit tests. Not saved to DB."""
    caps = capabilities if capabilities is not None else [
        {"id": "review", "kind": "skill", "scope": "matter"}
    ]
    return InstalledModule(
        id=uuid.uuid4(),
        module_id=module_id,
        version="1.0.0",
        publisher="legalise",
        visibility="example",
        signature_status="structure_verified",
        signed_by="legalise",
        install_path="<inline>",
        manifest_snapshot={
            "id": module_id,
            "entrypoint": {
                "python_module": python_module,
                "entry": entry,
            },
            "capabilities": caps,
        },
        permissions_snapshot={},
        installed_by_user_id=uuid.uuid4(),
        enabled=True,
    )


def test_find_capability_declaration_returns_matching_capability() -> None:
    installed = _stub_installed()
    cap = _find_capability_declaration(
        installed.manifest_snapshot, "review"
    )
    assert cap is not None
    assert cap["id"] == "review"


def test_find_capability_declaration_returns_none_for_unknown() -> None:
    installed = _stub_installed()
    assert (
        _find_capability_declaration(installed.manifest_snapshot, "ghost")
        is None
    )


@pytest.mark.asyncio
async def test_dispatch_resolves_entrypoint(db_session) -> None:
    """Real reference module resolves cleanly. Exercises the import +
    instantiate + invoke wiring without asserting on the result (the
    capability would itself need posture+grants set up; the unit
    test isolates the dispatcher concern)."""
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    installed = _stub_installed()

    # We're testing entrypoint resolution; the real review_contract
    # would need posture+grants. So we monkey the entry class to a
    # stub via the manifest entry name. Use Pre-Motion's class which
    # accepts the same invoke signature; bypass-test by checking the
    # ValueError it raises for an unknown capability id.
    installed.manifest_snapshot["entrypoint"]["entry"] = "PreMotionModule"
    installed.manifest_snapshot["entrypoint"]["python_module"] = (
        "examples.modules.pre_motion"
    )
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=uuid.uuid4(),
    )

    async def _noop(prompt, *, system=None):
        return ProviderResponse(
            text="{}",
            model_id="m",
            provider="p",
            tokens_in=0,
            tokens_out=0,
            cost_micros=None,
            currency=None,
        )

    # Pre-Motion exposes draft_motion only — asking for "review"
    # makes the module raise ValueError. That confirms dispatch
    # imported the module and called invoke().
    with pytest.raises(ValueError, match="unknown capability"):
        await dispatch_capability(
            db_session,
            installed_module=installed,
            capability_declaration={
                "id": "review",
                "kind": "skill",
                "scope": "matter",
            },
            matter=matter,
            context=context,
            args={},
            provider_call=_noop,
        )


@pytest.mark.asyncio
async def test_dispatch_missing_python_module_raises(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    installed = _stub_installed(python_module="not.a.real.module")
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=uuid.uuid4(),
    )

    async def _noop(prompt, *, system=None):
        ...

    with pytest.raises(EntrypointResolutionError, match="cannot import"):
        await dispatch_capability(
            db_session,
            installed_module=installed,
            capability_declaration={"id": "review", "kind": "skill", "scope": "matter"},
            matter=matter,
            context=context,
            args={},
            provider_call=_noop,
        )


@pytest.mark.asyncio
async def test_dispatch_missing_entry_attribute_raises(db_session) -> None:
    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    installed = _stub_installed(entry="NoSuchClass")
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=uuid.uuid4(),
    )

    async def _noop(prompt, *, system=None):
        ...

    with pytest.raises(EntrypointResolutionError, match="no attribute"):
        await dispatch_capability(
            db_session,
            installed_module=installed,
            capability_declaration={"id": "review", "kind": "skill", "scope": "matter"},
            matter=matter,
            context=context,
            args={},
            provider_call=_noop,
        )


# ---------------------------------------------------------------------------
# Provider adapter — make_provider_call
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_adapter_maps_all_seven_provider_response_fields(
    db_session, monkeypatch
) -> None:
    """The load-bearing adapter test: the seven ProviderResponse
    fields are populated from the gateway's ModelResult per the
    Decision #4 v3 mapping table."""
    from app.core.api import model_gateway as gateway_singleton

    captured: dict = {}

    async def _stub_call(**kwargs):
        captured.update(kwargs)
        return ModelResult(
            text="MODEL TEXT",
            model_used="claude-opus-4-7",
            prompt_hash="h" * 64,
            response_hash="r" * 64,
            token_count=4321,
            latency_ms=100,
            provider="anthropic",
        )

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    invocation_id = uuid.uuid4()

    call = make_provider_call(
        session=db_session,
        matter=matter,
        actor_user_id=user.id,
        module_id="examples.contract-review",
        capability_id="review",
        invocation_id=invocation_id,
    )

    response = await call("test prompt", system="test system")

    assert isinstance(response, ProviderResponse)
    assert response.text == "MODEL TEXT"
    assert response.model_id == matter.default_model_id  # "claude-opus-4-7"
    assert response.provider == "anthropic"
    assert response.tokens_in == 4321
    # Sentinel — keeps audit token_count = tokens_in + tokens_out
    # equal to the gateway's combined count.
    assert response.tokens_out == 0
    # Gateway doesn't price; paired None.
    assert response.cost_micros is None
    assert response.currency is None


@pytest.mark.asyncio
async def test_adapter_payload_does_not_trip_legacy_model_invoke_check(
    db_session, monkeypatch
) -> None:
    """Reviewer Phase 10 v3 load-bearing regression. At
    model_gateway.py:364-378 the gateway runs a workspace-scope
    require_capability('model.invoke') check when ``payload`` carries
    BOTH 'plugin' and 'skill'. Phase 7's grant lifecycle never
    creates such a workspace grant — so the adapter MUST NOT put
    'plugin' or 'skill' in payload, or both reference modules
    would fail immediately.

    Assert by capturing the exact payload the adapter forwards.
    """
    from app.core.api import model_gateway as gateway_singleton

    captured_payload: dict = {}

    async def _stub_call(**kwargs):
        nonlocal captured_payload
        captured_payload = kwargs.get("payload") or {}
        return ModelResult(
            text="x",
            model_used="anthropic",
            prompt_hash="x" * 64,
            response_hash="x" * 64,
            token_count=10,
            latency_ms=1,
        )

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    invocation_id = uuid.uuid4()

    call = make_provider_call(
        session=db_session,
        matter=matter,
        actor_user_id=user.id,
        module_id="examples.contract-review",
        capability_id="review",
        invocation_id=invocation_id,
    )
    await call("p", system="s")

    # The two keys the gateway looks at must NOT be present.
    assert "plugin" not in captured_payload, (
        "adapter forwarded 'plugin' in payload — trips the legacy "
        "workspace-scope model.invoke check"
    )
    assert "skill" not in captured_payload, (
        "adapter forwarded 'skill' in payload — trips the legacy "
        "workspace-scope model.invoke check"
    )
    # The keys Phase 10 explicitly intends ARE present.
    assert captured_payload.get("capability_id") == "review"
    assert captured_payload.get("invocation_id") == str(invocation_id)


@pytest.mark.asyncio
async def test_adapter_passes_correct_gateway_kwargs(
    db_session, monkeypatch
) -> None:
    """Pin to the actual ModelGateway.call signature (Phase 10 v3
    redline). The kwargs the adapter sends MUST be the names the
    gateway accepts: ``model``, ``caller_module``, ``payload``."""
    from app.core.api import model_gateway as gateway_singleton

    captured: dict = {}

    async def _stub_call(**kwargs):
        captured.update(kwargs)
        return ModelResult(
            text="x",
            model_used="anthropic",
            prompt_hash="x" * 64,
            response_hash="x" * 64,
            token_count=10,
            latency_ms=1,
        )

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)
    invocation_id = uuid.uuid4()

    call = make_provider_call(
        session=db_session,
        matter=matter,
        actor_user_id=user.id,
        module_id="examples.contract-review",
        capability_id="review",
        invocation_id=invocation_id,
    )
    await call("p", system="s")

    # Real gateway kwargs (model_gateway.py:320).
    assert captured["model"] == matter.default_model_id
    assert captured["caller_module"] == "examples.contract-review"
    assert captured["matter_id"] == matter.id
    assert captured["actor_id"] == user.id
    assert captured["prompt"] == "p"
    assert captured["system"] == "s"
    # NOT-EXIST kwargs that v1/v2 hallucinated.
    assert "requested_model" not in captured
    assert "module" not in captured


# ---------------------------------------------------------------------------
# P1 #1 — artifact write does not overwrite (Phase 6 R2)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_duplicate_write_does_not_alter_original_file(db_session) -> None:
    """Reviewer R2 P1 #1: a second write with the same
    (invocation_id, kind) MUST NOT overwrite the original file
    before the DB UNIQUE constraint rejects it."""
    user = await _make_user(db_session, role="solicitor")
    matter = await _make_matter(db_session, user)
    invocation_id = uuid.uuid4()

    # First write: original content.
    original = {"findings": [{"clause": "first", "severity": "high"}]}
    artifact1 = await write_artifact(
        db_session,
        matter=matter,
        capability_id="review",
        module_id="examples.contract-review",
        invocation_id=invocation_id,
        kind="findings_pack",
        payload=original,
        actor_user_id=user.id,
    )
    # Pull values into locals BEFORE the commit so we hold no lazy
    # attributes that the post-rollback session can't materialise.
    original_path = artifact1.storage_path
    original_id = artifact1.id
    await db_session.commit()

    from app.core.storage import get_storage_backend
    storage = get_storage_backend()
    original_bytes = storage.get_bytes(original_path)

    # Second write: same (invocation_id, kind), different payload.
    duplicate = {"findings": [{"clause": "tampered", "severity": "high"}]}
    with pytest.raises(Exception):
        await write_artifact(
            db_session,
            matter=matter,
            capability_id="review",
            module_id="examples.contract-review",
            invocation_id=invocation_id,
            kind="findings_pack",
            payload=duplicate,
            actor_user_id=user.id,
        )
        await db_session.commit()
    await db_session.rollback()

    # Original object UNTOUCHED (LMF-1: artifacts in object storage;
    # artifact_key is keyed per artifact_id so the duplicate write never
    # overwrites the original object before the DB UNIQUE rejects it).
    assert storage.get_bytes(original_path) == original_bytes
    # And only one row exists.
    rows = (
        await db_session.scalars(
            select(MatterArtifact).where(
                MatterArtifact.invocation_id == invocation_id,
                MatterArtifact.kind == "findings_pack",
            )
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].id == original_id


# ---------------------------------------------------------------------------
# P1 #2 — grants are enforced at runtime (Phase 6 R2)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_read_grant_blocks_with_no_artifact(db_session) -> None:
    """Reviewer R2 P1 #2: without the matter.document.read grant,
    review_contract must fail via CapabilityDenied BEFORE any
    artifact is written, model invoked, or gate evaluated."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )

    user = await _make_user(db_session, role="solicitor")
    matter = await _make_matter(db_session, user)
    doc = await _make_document(db_session, matter, text="some NDA text")
    # NB: NO grants inserted.
    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )

    with pytest.raises(CapabilityDenied):
        await review_contract(
            session=db_session,
            matter=matter,
            context=context,
            document_id=doc.id,
            provider_call=_stub_provider,
        )

    # No artifact landed.
    artifact = await db_session.scalar(
        select(MatterArtifact).where(
            MatterArtifact.invocation_id == invocation_id
        )
    )
    assert artifact is None


@pytest.mark.asyncio
async def test_missing_write_grant_blocks_after_read(db_session) -> None:
    """Reviewer R2 P1 #2: even with the read grant, missing
    matter.artifact.write must block — and no artifact must land."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )

    user = await _make_user(db_session, role="solicitor")
    matter = await _make_matter(db_session, user)
    doc = await _make_document(db_session, matter, text="some NDA text")
    # Grant ONLY the read — scoped to this matter (Phase 6 R3).
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.contract-review",
            skill="review",
            capability="matter.document.read",
            capability_version="2.0.0",
            granted_at_module_version="1.0.0",
            granted_permissions_snapshot={"matter_id": str(matter.id)},
            scope_type="matter",
            scope_id=matter.id,
        )
    )
    await db_session.flush()

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )

    with pytest.raises(CapabilityDenied):
        await review_contract(
            session=db_session,
            matter=matter,
            context=context,
            document_id=doc.id,
            provider_call=_stub_provider,
        )

    artifact = await db_session.scalar(
        select(MatterArtifact).where(
            MatterArtifact.invocation_id == invocation_id
        )
    )
    assert artifact is None


# ---------------------------------------------------------------------------
# P1 #3 — module cannot self-assert role (Phase 6 R2)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_module_cannot_smuggle_actor_role(db_session) -> None:
    """Reviewer R2 P1 #3: the module receives actor_role via the
    InvocationContext; it cannot override the caller's claim
    inside the function. We assert the contract by verifying that
    the gate's recorded actor_role matches what the host (test)
    handed in — even when that role is the bare default 'solicitor'
    rather than 'qualified_solicitor'."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )

    user = await _make_user(db_session, role="solicitor")
    matter = await _make_matter(db_session, user)
    doc = await _make_document(db_session, matter, text="contract text")
    # Both grants — matter-scoped (Phase 6 R3).
    for cap in ("matter.document.read", "matter.artifact.write"):
        db_session.add(
            WorkspaceSkillCapabilityGrant(
                id=uuid.uuid4(),
                user_id=user.id,
                plugin="examples.contract-review",
                skill="review",
                capability=cap,
                capability_version="2.0.0",
                granted_at_module_version="1.0.0",
                granted_permissions_snapshot={"matter_id": str(matter.id)},
                scope_type="matter",
                scope_id=matter.id,
            )
        )
    await db_session.flush()

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,  # "solicitor", NOT "qualified_solicitor"
        invocation_id=invocation_id,
    )
    await review_contract(
        session=db_session,
        matter=matter,
        context=context,
        document_id=doc.id,
        provider_call=_stub_provider,
    )
    await db_session.commit()

    # The advice-boundary decision row records the actual role used,
    # which must be the one the host supplied, not "qualified_solicitor".
    from app.models import AdviceBoundaryDecision

    decision = await db_session.scalar(
        select(AdviceBoundaryDecision).where(
            AdviceBoundaryDecision.output_id == str(invocation_id)
        )
    )
    assert decision is not None
    assert decision.actor_role == "solicitor", (
        f"module appears to have smuggled an elevated role: "
        f"{decision.actor_role!r}"
    )


# ---------------------------------------------------------------------------
# P2 — document text is actually in the prompt (Phase 6 R2)
# ---------------------------------------------------------------------------


def test_prompt_contains_document_text() -> None:
    """Reviewer R2 P2: the prompt now embeds the document's
    extracted text rather than a placeholder."""
    from examples.modules.contract_review.capability import _build_prompt

    @dataclass
    class _D:
        filename: str

    doc = _D(filename="nda.pdf")
    prompt = _build_prompt(doc, "REAL CONTRACT TEXT GOES HERE")
    assert "REAL CONTRACT TEXT GOES HERE" in prompt
    # Old placeholder must not appear.
    assert "document text omitted" not in prompt


def test_prompt_handles_missing_extraction() -> None:
    """If the document has no extracted body, the prompt explicitly
    says so — never claims to have reviewed text that wasn't there."""
    from examples.modules.contract_review.capability import _build_prompt

    @dataclass
    class _D:
        filename: str

    doc = _D(filename="empty.pdf")
    prompt = _build_prompt(doc, "")
    assert "no extracted text" in prompt


# ---------------------------------------------------------------------------
# R3 — grants must be matter-scoped (Phase 6 R3)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cross_matter_grant_does_not_authorize_other_matter(
    db_session,
) -> None:
    """Reviewer Phase 6 R3 P1: a grant for matter A must NOT authorise
    matter B. The denial must land BEFORE document resolution, BEFORE
    the provider call, and produce no artifact."""
    from examples.modules.contract_review.capability import (
        InvocationContext,
        review_contract,
    )
    from app.models import AuditEntry

    user = await _make_user(db_session, role="solicitor")
    matter_a = await _make_matter(db_session, user)
    matter_b = await _make_matter(db_session, user)
    # Document lives on matter B (the target the test will try to invoke against).
    doc_b = await _make_document(db_session, matter_b, text="text on matter B")

    # Grants scoped to matter A ONLY. The user owns BOTH matters,
    # so the only thing keeping them out of matter B's capabilities
    # is the snapshot scope.
    for cap in ("matter.document.read", "matter.artifact.write"):
        db_session.add(
            WorkspaceSkillCapabilityGrant(
                id=uuid.uuid4(),
                user_id=user.id,
                plugin="examples.contract-review",
                skill="review",
                capability=cap,
                capability_version="2.0.0",
                granted_at_module_version="1.0.0",
                granted_permissions_snapshot={"matter_id": str(matter_a.id)},
                scope_type="matter",
                scope_id=matter_a.id,
            )
        )
    await db_session.flush()

    # Instrument the provider so the test can prove the model was never called.
    call_log: list[str] = []

    async def _watching_provider(prompt, *, system):
        call_log.append(prompt)
        return _StubResponse(text=json.dumps({"findings": []}))

    invocation_id = uuid.uuid4()
    context = InvocationContext(
        actor_user_id=user.id,
        actor_role=user.role,
        invocation_id=invocation_id,
    )

    with pytest.raises(CapabilityDenied):
        await review_contract(
            session=db_session,
            matter=matter_b,
            context=context,
            document_id=doc_b.id,
            provider_call=_watching_provider,
        )

    # Provider was never called — denial landed before the model invoke step.
    assert call_log == [], (
        "model was invoked despite cross-matter grant; the denial must "
        "fire BEFORE the provider call"
    )

    # No artifact landed.
    artifact = await db_session.scalar(
        select(MatterArtifact).where(
            MatterArtifact.invocation_id == invocation_id
        )
    )
    assert artifact is None

    # The denial audit row references matter B (the requested scope)
    # not matter A (where the grant exists). Provenance must record
    # what was requested, not what the user happens to hold.
    denial = await db_session.scalar(
        select(AuditEntry).where(
            AuditEntry.action == "module.capability.denied",
            AuditEntry.actor_id == user.id,
            AuditEntry.matter_id == matter_b.id,
        )
    )
    assert denial is not None
    assert denial.payload["matter_id"] == str(matter_b.id)
    assert denial.payload["scope"] == "matter"


@pytest.mark.asyncio
async def test_workspace_broad_and_matter_scoped_checks_are_strict(
    db_session,
) -> None:
    """Phase 7 v2 (Andy's note #3): workspace-broad and matter-scoped
    checks are strict and mutually exclusive. A workspace-broad call
    (``matter_id=None``) accepts ONLY scope_type='workspace' grants;
    a matter-scoped call accepts ONLY scope_type='matter' grants
    matching that matter_id. Same (plugin, skill, capability) can
    coexist at workspace + matter scope because the uniqueness key
    now includes scope."""
    from app.core.capabilities import require_capability

    user = await _make_user(db_session, role="solicitor")
    matter = await _make_matter(db_session, user)

    # One workspace-scope grant and one matter-scope grant for the
    # SAME (plugin, skill, capability).
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.test",
            skill="t",
            capability="matter.thing.do",
            scope_type="workspace",
            scope_id=None,
        )
    )
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.test",
            skill="t",
            capability="matter.thing.do",
            scope_type="matter",
            scope_id=matter.id,
            granted_permissions_snapshot={"matter_id": str(matter.id)},
        )
    )
    await db_session.flush()

    # Workspace-broad check matches the workspace grant.
    await require_capability(
        db_session,
        user_id=user.id,
        plugin="examples.test",
        skill="t",
        capability="matter.thing.do",
    )

    # Matter-scoped check matches the matter grant.
    await require_capability(
        db_session,
        user_id=user.id,
        plugin="examples.test",
        skill="t",
        capability="matter.thing.do",
        matter_id=matter.id,
    )

    # Matter-scoped check for a DIFFERENT matter denies — workspace
    # grant does not satisfy a matter-scoped check (strict semantics).
    other_matter = await _make_matter(db_session, user)
    with pytest.raises(CapabilityDenied):
        await require_capability(
            db_session,
            user_id=user.id,
            plugin="examples.test",
            skill="t",
            capability="matter.thing.do",
            matter_id=other_matter.id,
        )


@pytest.mark.asyncio
async def test_legacy_grant_does_not_satisfy_matter_scoped_check(
    db_session,
) -> None:
    """A v1 grant with NULL granted_permissions_snapshot cannot
    satisfy a matter-scoped require_capability call. Legacy grants
    are workspace-broad; they survive matter archive cascade
    precisely because they were never scoped. The R3 fix honours
    that: NULL snapshot != matching matter_id."""
    from app.core.capabilities import require_capability

    user = await _make_user(db_session, role="solicitor")
    matter = await _make_matter(db_session, user)
    db_session.add(
        WorkspaceSkillCapabilityGrant(
            id=uuid.uuid4(),
            user_id=user.id,
            plugin="examples.legacy",
            skill="legacy",
            capability="matter.thing.do",
            # No snapshot.
        )
    )
    await db_session.flush()

    with pytest.raises(CapabilityDenied):
        await require_capability(
            db_session,
            user_id=user.id,
            plugin="examples.legacy",
            skill="legacy",
            capability="matter.thing.do",
            matter_id=matter.id,
        )
