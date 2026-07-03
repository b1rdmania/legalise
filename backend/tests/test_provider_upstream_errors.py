"""Gateway translates SDK exceptions into structured ProviderUpstreamError.

Pins the upstream-error contract:

  401 / 403 -> provider_invalid_key
  429       -> provider_rate_limited
  503 / 529 -> provider_overloaded
  other     -> provider_error

And the audit-on-failure invariant: every failed call writes an
`AuditEntry` row (action="model.call.error") BEFORE the exception
re-raises so a 502 in production is just as traceable as a 200.

DB-free: we use the same in-memory provider + stub-session pattern as
`test_gateway_fallback.py`, and assert the `session.add(...)` capture
contains an `AuditEntry` with the right action / payload.
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest

from app.core import model_gateway as gw_module
from app.core.model_gateway import ModelGateway, PrivilegePosture
from app.core.user_keys import ProviderUpstreamError
from app.models import AuditEntry


class _RaisingProvider:
    """Stand-in provider with name='anthropic' that raises whatever the
    test wires up. The gateway's KEYED_PROVIDERS check fires for
    name='anthropic', exercising the user-key resolution path."""

    name = "anthropic"

    def __init__(self, exc: Exception) -> None:
        self._exc = exc

    async def call(self, prompt: str, *, system=None, **kwargs):  # noqa: ANN001
        raise self._exc


class _CapturingSession:
    """Async session stand-in.

    `bind = None` so `audit_failure` (R3) can read the attribute. The
    `add` capture is retained for legacy assertions but the
    failure-row tests now go through `_CapturingAuditFailure` patched
    into `app.core.api`."""

    def __init__(self) -> None:
        self.added: list[object] = []
        self.bind = None

    async def scalar(self, *args, **kwargs):  # noqa: ANN001, ANN002
        return None

    async def execute(self, *args, **kwargs):  # noqa: ANN001, ANN002
        class _Row:
            def first(self):
                return None
        return _Row()

    def add(self, obj) -> None:
        self.added.append(obj)


class _CapturingAuditFailure:
    """Drop-in replacement for `audit_failure` that records the calls
    rather than opening a DB session. Per R3 review: failure-path
    audit rows go through `audit_failure` (separate committed session)
    rather than `session.add` so they survive the route's rollback."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def __call__(self, request_session, action: str, **kwargs) -> None:
        self.calls.append({"action": action, **kwargs})


def _make_status_error(status: int) -> Exception:
    """Build a duck-typed APIStatusError. The gateway catches the
    `ProviderUpstreamError` the provider raises, so the SDK exception
    class itself never leaves the provider, we don't need the real
    `anthropic.APIStatusError` here. We instead raise the gateway-level
    exception directly from the stub provider, mirroring what the
    wrapped Anthropic SDK call would produce."""
    code_map = {
        401: "provider_invalid_key",
        403: "provider_invalid_key",
        429: "provider_rate_limited",
        503: "provider_overloaded",
        529: "provider_overloaded",
    }
    code = code_map.get(status, "provider_error")
    return ProviderUpstreamError(
        provider="anthropic",
        code=code,
        upstream_status=status,
        message=f"anthropic: upstream {status}: simulated",
    )


@pytest.fixture
def actor_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.mark.asyncio
@patch.object(gw_module, "mark_user_key_used")
@patch.object(gw_module, "get_user_provider_key", return_value="sk-user-key")
@pytest.mark.parametrize(
    "status,expected_code",
    [
        (401, "provider_invalid_key"),
        (403, "provider_invalid_key"),
        (429, "provider_rate_limited"),
        (503, "provider_overloaded"),
        (529, "provider_overloaded"),
        (500, "provider_error"),
        (418, "provider_error"),
    ],
)
async def test_gateway_translates_status_to_structured_error(
    _mock_lookup, _mock_mark, actor_id, status, expected_code
):
    """For each upstream status, the gateway raises ProviderUpstreamError
    with the contract code AND calls audit_failure first (R3 review:
    failure-path audit rows go via a separate committed session)."""
    import app.core.api as api_module

    provider = _RaisingProvider(_make_status_error(status))
    g = ModelGateway()
    g.register(provider)
    session = _CapturingSession()
    fake_audit = _CapturingAuditFailure()

    with patch.object(gw_module.settings, "environment", "development"), \
         patch.object(gw_module.settings, "allow_server_key_fallback", False), \
         patch.object(api_module, "audit_failure", fake_audit):
        with pytest.raises(ProviderUpstreamError) as excinfo:
            await g.call(
                session=session,
                matter_id=None,
                actor_id=actor_id,
                prompt="hi",
                model="claude-opus-4-7",
                posture=PrivilegePosture.B_MIXED,
            )

    assert excinfo.value.code == expected_code
    assert excinfo.value.provider == "anthropic"
    assert excinfo.value.upstream_status == status

    # Audit provenance via audit_failure (committed in separate session
    # so it survives any subsequent rollback by the caller).
    rows = [c for c in fake_audit.calls if c["action"] == "model.call.error"]
    assert len(rows) == 1, "expected one audit_failure call on failure"
    row = rows[0]
    # model_used records the model actually attempted; the provider name
    # lives in the payload.
    assert row["model_used"] == "claude-opus-4-7"
    assert row["payload"]["provider"] == "anthropic"
    assert row["prompt_hash"] is not None
    err = row["payload"].get("error")
    assert isinstance(err, dict)
    assert err.get("code") == expected_code
    assert err.get("provider") == "anthropic"
    assert err.get("upstream_status") == status


@pytest.mark.asyncio
@patch.object(gw_module, "mark_user_key_used")
@patch.object(gw_module, "get_user_provider_key", return_value="sk-user-key")
async def test_gateway_audits_before_raising(_mock_lookup, _mock_mark, actor_id):
    """Even if the test framework swallows the exception, audit_failure
    must already have been invoked. R3 review: invoked via audit_failure
    so the row actually persists (separate committed session)."""
    import app.core.api as api_module

    provider = _RaisingProvider(_make_status_error(429))
    g = ModelGateway()
    g.register(provider)
    session = _CapturingSession()
    fake_audit = _CapturingAuditFailure()

    with patch.object(gw_module.settings, "environment", "development"), \
         patch.object(gw_module.settings, "allow_server_key_fallback", False), \
         patch.object(api_module, "audit_failure", fake_audit):
        try:
            await g.call(
                session=session,
                matter_id=None,
                actor_id=actor_id,
                prompt="hi",
                model="claude-opus-4-7",
                posture=PrivilegePosture.B_MIXED,
            )
        except ProviderUpstreamError:
            pass

    rows = [c for c in fake_audit.calls if c["action"] == "model.call.error"]
    assert len(rows) == 1
    # The user-key-used marker should NOT have run on the failure path.
    _mock_mark.assert_not_called()


# ---------------------------------------------------------------------------
# Route-level translation: ProviderUpstreamError -> 502 with structured body.
# Uses the assistant POST endpoint as a representative router and
# monkeypatches `run_assistant_turn` so we exercise the catch arm without
# needing real provider credentials. Requires the DB-backed `client`
# fixture; it auto-skips if Postgres isn't reachable (see conftest.py).
# ---------------------------------------------------------------------------


ROUTE_TEST_EMAIL = "upstream-502-e2e@example.com"
ROUTE_TEST_PASSWORD = "upstream-502-e2e-password-2026"
KHAN_SLUG = "khan-v-acme-trading-2026"


async def _signup_and_login(client) -> None:
    reg = await client.post(
        "/auth/register",
        json={"email": ROUTE_TEST_EMAIL, "password": ROUTE_TEST_PASSWORD},
    )
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/auth/login",
        data={"username": ROUTE_TEST_EMAIL, "password": ROUTE_TEST_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 204, login.text


@pytest.mark.asyncio
async def test_assistant_route_translates_provider_upstream_to_502(client, monkeypatch) -> None:
    """Router catch arm: ProviderUpstreamError -> 502 with
    `{error, provider, upstream_status, message}` shape the frontend
    pattern-matches on."""
    await _signup_and_login(client)

    from app.modules.assistant import router as assistant_router

    async def _raise_upstream(*args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        raise ProviderUpstreamError(
            provider="anthropic",
            code="provider_rate_limited",
            upstream_status=429,
            message="anthropic: upstream 429: simulated",
        )

    monkeypatch.setattr(assistant_router, "run_assistant_turn", _raise_upstream)

    resp = await client.post(
        f"/api/matters/{KHAN_SLUG}/assistant/messages",
        json={"content": "hello", "selected_document_ids": []},
    )
    assert resp.status_code == 502, resp.text
    body = resp.json()
    detail = body["detail"]
    assert detail["error"] == "provider_rate_limited"
    assert detail["provider"] == "anthropic"
    assert detail["upstream_status"] == 429
    assert "anthropic" in detail["message"]


# ---------------------------------------------------------------------------
# Anthropic provider — output-limit truncation surfaces as a structured error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_anthropic_truncation_raises_provider_truncated() -> None:
    """stop_reason == "max_tokens" means the reply is incomplete — the
    provider must raise (honest truncation message) rather than hand a
    half-written body downstream to fail its JSON parse."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock

    from app.providers.anthropic_provider import AnthropicProvider

    message = SimpleNamespace(
        stop_reason="max_tokens",
        content=[SimpleNamespace(type="text", text="truncated body…")],
        usage=SimpleNamespace(input_tokens=10, output_tokens=2048),
    )
    client = MagicMock()
    client.messages.create = AsyncMock(return_value=message)

    provider = AnthropicProvider(api_key="sk-test", default_model="claude-haiku-4-5")
    with patch(
        "app.providers.anthropic_provider.AsyncAnthropic", return_value=client
    ):
        with pytest.raises(ProviderUpstreamError) as excinfo:
            await provider.call("long question")

    assert excinfo.value.code == "provider_truncated"
    assert "cut off at the model's output limit" in str(excinfo.value)


@pytest.mark.asyncio
async def test_anthropic_normal_stop_returns_text() -> None:
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock

    from app.providers.anthropic_provider import AnthropicProvider

    message = SimpleNamespace(
        stop_reason="end_turn",
        content=[SimpleNamespace(type="text", text="complete body")],
        usage=SimpleNamespace(input_tokens=10, output_tokens=20),
    )
    client = MagicMock()
    client.messages.create = AsyncMock(return_value=message)

    provider = AnthropicProvider(api_key="sk-test", default_model="claude-haiku-4-5")
    with patch(
        "app.providers.anthropic_provider.AsyncAnthropic", return_value=client
    ):
        text, tokens = await provider.call("question", max_tokens=8192)

    assert text == "complete body"
    assert tokens == 30
    assert client.messages.create.call_args.kwargs["max_tokens"] == 8192
