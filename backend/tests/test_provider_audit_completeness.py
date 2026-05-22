"""Provider-key failure audit completeness (Issue #8).

Verifies that every error path through `ModelGateway.call` writes an
`AuditEntry` row BEFORE raising, so forensic timelines never have
invisible failures.

Error paths covered:

1. `ProviderKeyMissing` — raised when a keyed provider (anthropic/openai)
   has no user key and the dev-fallback is not permitted.  A row with
   action `module.<caller_module>.model.key_missing` must be written.

2. `ProviderUpstreamError` with each of the four structured subcodes
   (`provider_invalid_key`, `provider_rate_limited`, `provider_overloaded`,
   `provider_error`) — raised when the upstream call fails.  A row with
   action `model.call.error` and the subcode in `payload.error.code` must
   be written.

3. `PrivilegePaused` — raised before any provider call when the matter
   posture is C_paused.  The middleware `http.*` row is the canonical
   provenance for this path (the gateway has no session-level audit hook
   here, by design).  This test documents that no gateway-level audit row
   is written for C_paused and confirms the raise is clean.

All tests use mocked providers and an in-memory capturing session — no DB
or network required.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.core import model_gateway as gw_module
from app.core.model_gateway import ModelGateway, PrivilegePaused, PrivilegePosture
from app.core.user_keys import ProviderKeyMissing, ProviderUpstreamError
from app.models import AuditEntry


# ---------------------------------------------------------------------------
# Shared test helpers
# ---------------------------------------------------------------------------


class _CapturingSession:
    """Minimal async session stand-in that records `session.add(...)` calls."""

    def __init__(self) -> None:
        self.added: list[object] = []

    async def scalar(self, *args, **kwargs):
        return None

    async def execute(self, *args, **kwargs):
        class _Row:
            def first(self):
                return None

        return _Row()

    def add(self, obj) -> None:
        self.added.append(obj)


class _SucceedingProvider:
    name = "anthropic"

    async def call(self, prompt: str, *, system=None, **kwargs):
        return "ok", 10


class _RaisingProvider:
    """Provider that raises whatever exception is given at construction."""

    name = "anthropic"

    def __init__(self, exc: Exception) -> None:
        self._exc = exc

    async def call(self, prompt: str, *, system=None, **kwargs):
        raise self._exc


def _upstream_error(code: str, status: int | None = None) -> ProviderUpstreamError:
    return ProviderUpstreamError(
        provider="anthropic",
        code=code,
        upstream_status=status,
        message=f"anthropic: simulated {code}",
    )


@pytest.fixture
def actor_id() -> uuid.UUID:
    return uuid.uuid4()


# ---------------------------------------------------------------------------
# 1. ProviderKeyMissing — audit row before raise
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch.object(gw_module, "get_user_provider_key", return_value=None)
async def test_key_missing_writes_audit_row(_mock_lookup, actor_id):
    """Gateway writes a `module.<module>.model.key_missing` audit row
    before raising ProviderKeyMissing, so the failure is visible in the
    forensic timeline."""
    g = ModelGateway()
    g.register(_SucceedingProvider())
    session = _CapturingSession()

    with (
        patch.object(gw_module.settings, "environment", "production"),
        patch.object(gw_module.settings, "allow_server_key_fallback", False),
    ):
        with pytest.raises(ProviderKeyMissing) as excinfo:
            await g.call(
                session=session,
                matter_id=None,
                actor_id=actor_id,
                prompt="test prompt",
                model="claude-opus-4-7",
                posture=PrivilegePosture.A_CLEARED,
                caller_module="contract_review",
            )

    assert excinfo.value.provider == "anthropic"

    audit_rows = [a for a in session.added if isinstance(a, AuditEntry)]
    assert len(audit_rows) == 1, "expected exactly one audit row for ProviderKeyMissing"
    row = audit_rows[0]
    assert row.action == "module.contract_review.model.key_missing"
    assert row.module == "contract_review"
    assert row.model_used == "anthropic"
    assert isinstance(row.payload, dict)
    err = row.payload.get("error")
    assert isinstance(err, dict)
    assert err.get("code") == "key_missing"
    assert err.get("provider") == "anthropic"
    # No prompt body in the audit row.
    assert "prompt" not in row.payload


@pytest.mark.asyncio
@patch.object(gw_module, "get_user_provider_key", return_value=None)
async def test_key_missing_module_unknown_when_no_caller_module(_mock_lookup, actor_id):
    """When `caller_module` is omitted, action uses 'unknown' as the
    module segment so the row is still written (never silently dropped)."""
    g = ModelGateway()
    g.register(_SucceedingProvider())
    session = _CapturingSession()

    with (
        patch.object(gw_module.settings, "environment", "production"),
        patch.object(gw_module.settings, "allow_server_key_fallback", False),
    ):
        with pytest.raises(ProviderKeyMissing):
            await g.call(
                session=session,
                matter_id=None,
                actor_id=actor_id,
                prompt="test prompt",
                model="claude-opus-4-7",
                posture=PrivilegePosture.A_CLEARED,
                # caller_module intentionally omitted
            )

    audit_rows = [a for a in session.added if isinstance(a, AuditEntry)]
    assert len(audit_rows) == 1
    row = audit_rows[0]
    assert row.action == "module.unknown.model.key_missing"
    assert row.module == "unknown"


@pytest.mark.asyncio
@patch.object(gw_module, "get_user_provider_key", return_value=None)
async def test_key_missing_payload_has_no_prompt_body(_mock_lookup, actor_id):
    """Audit payload must not contain prompt or response bodies (PII risk)."""
    g = ModelGateway()
    g.register(_SucceedingProvider())
    session = _CapturingSession()

    secret_prompt = "SUPER SECRET LEGAL CONTENT"
    with (
        patch.object(gw_module.settings, "environment", "production"),
        patch.object(gw_module.settings, "allow_server_key_fallback", False),
    ):
        with pytest.raises(ProviderKeyMissing):
            await g.call(
                session=session,
                matter_id=None,
                actor_id=actor_id,
                prompt=secret_prompt,
                model="claude-opus-4-7",
                posture=PrivilegePosture.A_CLEARED,
                caller_module="pre_motion",
            )

    audit_rows = [a for a in session.added if isinstance(a, AuditEntry)]
    assert len(audit_rows) == 1
    row = audit_rows[0]
    # The raw prompt body must not appear anywhere in the serialised payload.
    payload_str = str(row.payload)
    assert secret_prompt not in payload_str


# ---------------------------------------------------------------------------
# 2. ProviderUpstreamError — all four subcodes audited with correct payload
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch.object(gw_module, "mark_user_key_used")
@patch.object(gw_module, "get_user_provider_key", return_value="sk-test-key")
@pytest.mark.parametrize(
    "code,upstream_status",
    [
        ("provider_invalid_key", 401),
        ("provider_invalid_key", 403),
        ("provider_rate_limited", 429),
        ("provider_overloaded", 503),
        ("provider_overloaded", 529),
        ("provider_error", 500),
        ("provider_error", 418),
    ],
)
async def test_upstream_error_all_subcodes_audited(
    _mock_lookup, _mock_mark, actor_id, code, upstream_status
):
    """All ProviderUpstreamError subcodes produce a `model.call.error`
    audit row that includes the structured error payload."""
    exc = _upstream_error(code, upstream_status)
    g = ModelGateway()
    g.register(_RaisingProvider(exc))
    session = _CapturingSession()

    with (
        patch.object(gw_module.settings, "environment", "development"),
        patch.object(gw_module.settings, "allow_server_key_fallback", False),
    ):
        with pytest.raises(ProviderUpstreamError) as excinfo:
            await g.call(
                session=session,
                matter_id=None,
                actor_id=actor_id,
                prompt="test prompt",
                model="claude-opus-4-7",
                posture=PrivilegePosture.B_MIXED,
                caller_module="assistant",
            )

    assert excinfo.value.code == code
    assert excinfo.value.upstream_status == upstream_status

    audit_rows = [a for a in session.added if isinstance(a, AuditEntry)]
    assert len(audit_rows) == 1, f"expected one audit row for {code}"
    row = audit_rows[0]
    assert row.action == "model.call.error"
    assert row.model_used == "anthropic"
    assert row.module == "assistant"
    assert row.prompt_hash is not None
    err = row.payload.get("error")
    assert isinstance(err, dict)
    assert err.get("code") == code
    assert err.get("provider") == "anthropic"
    assert err.get("upstream_status") == upstream_status


@pytest.mark.asyncio
@patch.object(gw_module, "mark_user_key_used")
@patch.object(gw_module, "get_user_provider_key", return_value="sk-test-key")
async def test_upstream_error_audit_written_before_raise(
    _mock_lookup, _mock_mark, actor_id
):
    """Even if the caller swallows the exception, the audit row must already
    be in session.added — audit-before-raise is the invariant."""
    exc = _upstream_error("provider_rate_limited", 429)
    g = ModelGateway()
    g.register(_RaisingProvider(exc))
    session = _CapturingSession()

    with (
        patch.object(gw_module.settings, "environment", "development"),
        patch.object(gw_module.settings, "allow_server_key_fallback", False),
    ):
        try:
            await g.call(
                session=session,
                matter_id=None,
                actor_id=actor_id,
                prompt="hi",
                model="claude-opus-4-7",
                posture=PrivilegePosture.B_MIXED,
                caller_module="pre_motion",
            )
        except ProviderUpstreamError:
            pass

    audit_rows = [a for a in session.added if isinstance(a, AuditEntry)]
    assert len(audit_rows) == 1
    # key-used marker must NOT run on failure paths
    _mock_mark.assert_not_called()


# ---------------------------------------------------------------------------
# 3. PrivilegePaused — no gateway-level audit row (middleware is canonical)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_privilege_paused_no_gateway_audit_row(actor_id):
    """C_paused raises PrivilegePaused before any provider call.
    The gateway does NOT write its own audit row — the middleware
    `http.*` row is the canonical provenance for this path."""
    g = ModelGateway()
    session = _CapturingSession()

    # Patch scalar to return C_paused posture for the matter lookup.
    session.scalar = AsyncMock(return_value="C_paused")  # type: ignore[method-assign]

    matter_id = uuid.uuid4()

    with pytest.raises(PrivilegePaused):
        await g.call(
            session=session,
            matter_id=matter_id,
            actor_id=actor_id,
            prompt="test prompt",
            model="claude-opus-4-7",
            caller_module="assistant",
        )

    audit_rows = [a for a in session.added if isinstance(a, AuditEntry)]
    # Document the design decision: no gateway audit row for C_paused.
    assert len(audit_rows) == 0, (
        "C_paused raises before any provider call; the middleware http.* "
        "row is the canonical provenance — no gateway audit row expected"
    )


# ---------------------------------------------------------------------------
# 4. caller_module kwarg propagates to model.call success audit row
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch.object(gw_module, "mark_user_key_used")
@patch.object(gw_module, "get_user_provider_key", return_value="sk-test-key")
async def test_caller_module_on_success_audit_row(_mock_lookup, _mock_mark, actor_id):
    """Successful calls include `module=caller_module` in the audit row."""
    g = ModelGateway()
    g.register(_SucceedingProvider())
    session = _CapturingSession()

    with (
        patch.object(gw_module.settings, "environment", "development"),
        patch.object(gw_module.settings, "allow_server_key_fallback", False),
    ):
        await g.call(
            session=session,
            matter_id=None,
            actor_id=actor_id,
            prompt="hello",
            model="claude-opus-4-7",
            posture=PrivilegePosture.A_CLEARED,
            caller_module="tabular_review",
        )

    audit_rows = [a for a in session.added if isinstance(a, AuditEntry)]
    assert len(audit_rows) == 1
    row = audit_rows[0]
    assert row.action == "model.call"
    assert row.module == "tabular_review"
