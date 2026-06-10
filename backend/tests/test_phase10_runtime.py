"""Phase 10 — dispatcher + provider adapter unit tests.

Eight tests:

1. Entrypoint resolution succeeds for a well-formed manifest
2. Missing python_module → EntrypointResolutionError
3. Missing entry attribute → EntrypointResolutionError
4. dispatch_capability passes args through to the module
5. Adapter populates all seven ProviderResponse fields
6. Adapter pairs cost_micros + currency as None correctly
7. Adapter propagates ProviderKeyMissing + ProviderUpstreamError unchanged
8. **Adapter does NOT trip the gateway's legacy workspace-scope
   model.invoke check** — the load-bearing v3 regression
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import pytest
from sqlalchemy import select

from app.core.model_gateway import (
    ModelResult,
    ProviderKeyMissing,
    ProviderUpstreamError,
)
from app.core.runtime import (
    EntrypointResolutionError,
    InvocationContext,
    ProviderResponse,
    _find_capability_declaration,
    dispatch_capability,
    make_provider_call,
)
from app.models import (
    InstalledModule,
    Matter,
    PRIVILEGE_CLEARED,
    STATUS_OPEN,
    User,
)


async def _make_user(db_session) -> User:
    u = User(
        id=uuid.uuid4(),
        email=f"p10rt-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        role="qualified_solicitor",
    )
    db_session.add(u)
    await db_session.flush()
    return u


async def _make_matter(db_session, user) -> Matter:
    m = Matter(
        id=uuid.uuid4(),
        slug=f"p10rt-{uuid.uuid4().hex[:8]}",
        title="Phase 10 Runtime Test",
        matter_type="employment_tribunal",
        status=STATUS_OPEN,
        privilege_posture=PRIVILEGE_CLEARED,
        default_model_id="claude-opus-4-7",
        created_by_id=user.id,
    )
    db_session.add(m)
    await db_session.flush()
    return m


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
            model_used="anthropic",
            prompt_hash="h" * 64,
            response_hash="r" * 64,
            token_count=4321,
            latency_ms=100,
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


@pytest.mark.asyncio
async def test_adapter_propagates_provider_key_missing(
    db_session, monkeypatch
) -> None:
    from app.core.api import model_gateway as gateway_singleton

    async def _stub_call(**kwargs):
        raise ProviderKeyMissing("anthropic")

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)

    call = make_provider_call(
        session=db_session,
        matter=matter,
        actor_user_id=user.id,
        module_id="examples.contract-review",
        capability_id="review",
        invocation_id=uuid.uuid4(),
    )
    with pytest.raises(ProviderKeyMissing):
        await call("p", system="s")


@pytest.mark.asyncio
async def test_adapter_propagates_provider_upstream_error(
    db_session, monkeypatch
) -> None:
    from app.core.api import model_gateway as gateway_singleton

    async def _stub_call(**kwargs):
        raise ProviderUpstreamError(
            provider="anthropic",
            code="provider_rate_limited",
            upstream_status=429,
            message="upstream rate limited",
        )

    monkeypatch.setattr(gateway_singleton, "call", _stub_call)

    user = await _make_user(db_session)
    matter = await _make_matter(db_session, user)

    call = make_provider_call(
        session=db_session,
        matter=matter,
        actor_user_id=user.id,
        module_id="examples.contract-review",
        capability_id="review",
        invocation_id=uuid.uuid4(),
    )
    with pytest.raises(ProviderUpstreamError):
        await call("p", system="s")
