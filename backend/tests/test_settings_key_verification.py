"""Verify a provider key at save time, not on first chat use.

`upsert_key` (POST /api/settings/keys) probes the candidate key with a
one-token call before persisting. These tests pin the three outcomes
without any real network call:

  - valid key -> persisted
  - auth failure (upstream 401/403) -> HTTPException(400), NOT persisted
  - transient failure (429 / 5xx / connection) -> persisted unverified

DB-free: we drive `upsert_key` directly with a fake session and patch the
persistence helper + audit log, and monkeypatch the provider `call` so the
verification probe never touches the network.
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest

from app.api import settings as settings_module
from app.api.settings import UserApiKeyUpsert, upsert_key
from app.core.user_keys import ProviderUpstreamError


class _FakeUser:
    def __init__(self) -> None:
        self.id = uuid.uuid4()


class _FakeRow:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.provider = "anthropic"


class _FakeSession:
    """Minimal AsyncSession stand-in. `scalar` returns None so the route
    treats every save as a fresh insert."""

    def __init__(self) -> None:
        self.committed = False

    async def scalar(self, *args, **kwargs):  # noqa: ANN001, ANN002
        return None

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, _obj) -> None:  # noqa: ANN001
        pass


def _body(api_key: str = "sk-ant-candidate-key") -> UserApiKeyUpsert:
    return UserApiKeyUpsert(provider="anthropic", api_key=api_key)


@pytest.fixture
def persisted():
    """Patch the persistence helper + audit; record whether a key was
    persisted. Yields the recorder dict."""
    state: dict = {"persisted": False}
    fake_row = _FakeRow()

    async def _fake_upsert(session, user_id, provider, plaintext):  # noqa: ANN001
        state["persisted"] = True
        return fake_row

    class _FakeAudit:
        async def log(self, *args, **kwargs):  # noqa: ANN001, ANN002
            return None

    with patch.object(settings_module, "upsert_user_provider_key", _fake_upsert), \
         patch("app.core.api.audit", _FakeAudit()):
        yield state


@pytest.mark.asyncio
async def test_valid_key_persists(persisted):
    async def _ok_call(self, prompt, *, system=None, **kwargs):  # noqa: ANN001
        return ("pong", 1)

    with patch("app.providers.anthropic_provider.AnthropicProvider.call", _ok_call):
        row = await upsert_key(_body(), session=_FakeSession(), user=_FakeUser())

    assert persisted["persisted"] is True
    assert row.provider == "anthropic"


@pytest.mark.asyncio
async def test_auth_failure_rejects_and_does_not_persist(persisted):
    async def _auth_fail(self, prompt, *, system=None, **kwargs):  # noqa: ANN001
        raise ProviderUpstreamError(
            provider="anthropic",
            code="provider_invalid_key",
            upstream_status=401,
            message="anthropic: upstream 401: simulated",
        )

    from fastapi import HTTPException

    with patch("app.providers.anthropic_provider.AnthropicProvider.call", _auth_fail):
        with pytest.raises(HTTPException) as excinfo:
            await upsert_key(_body(), session=_FakeSession(), user=_FakeUser())

    assert excinfo.value.status_code == 400
    assert "rejected" in excinfo.value.detail
    assert persisted["persisted"] is False


def _openrouter_body(api_key: str = "sk-or-candidate-key") -> UserApiKeyUpsert:
    return UserApiKeyUpsert(provider="openrouter", api_key=api_key)


def _fake_httpx_client(status_code: int | None = 200, raise_exc: Exception | None = None):
    """Async-context-manager httpx.AsyncClient stand-in whose `get` either
    returns a response with `status_code` or raises `raise_exc`."""
    import httpx  # noqa: F401 - mirrors the lazy import in the route

    class _Resp:
        def __init__(self, code: int) -> None:
            self.status_code = code

    class _Client:
        def __init__(self, *args, **kwargs) -> None:  # noqa: ANN002, ANN003
            self.last_url: str | None = None
            self.last_headers: dict | None = None

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc) -> None:  # noqa: ANN002
            return None

        async def get(self, url, headers=None):  # noqa: ANN001
            self.last_url = url
            self.last_headers = headers
            if raise_exc is not None:
                raise raise_exc
            return _Resp(status_code)

    return _Client


@pytest.mark.asyncio
async def test_openrouter_valid_key_persists(persisted):
    """The OpenRouter probe is a token-free GET /key; a 200 persists."""
    with patch("httpx.AsyncClient", _fake_httpx_client(status_code=200)):
        row = await upsert_key(
            _openrouter_body(), session=_FakeSession(), user=_FakeUser()
        )
    assert persisted["persisted"] is True
    assert row is not None


@pytest.mark.asyncio
async def test_openrouter_auth_failure_rejects_and_does_not_persist(persisted):
    from fastapi import HTTPException

    with patch("httpx.AsyncClient", _fake_httpx_client(status_code=401)):
        with pytest.raises(HTTPException) as excinfo:
            await upsert_key(
                _openrouter_body(), session=_FakeSession(), user=_FakeUser()
            )

    assert excinfo.value.status_code == 400
    assert "rejected" in excinfo.value.detail
    assert persisted["persisted"] is False


@pytest.mark.asyncio
async def test_openrouter_transient_failure_still_persists(persisted):
    import httpx

    with patch(
        "httpx.AsyncClient",
        _fake_httpx_client(raise_exc=httpx.ConnectError("unreachable")),
    ):
        row = await upsert_key(
            _openrouter_body(), session=_FakeSession(), user=_FakeUser()
        )
    assert persisted["persisted"] is True
    assert row is not None


@pytest.mark.asyncio
async def test_transient_failure_still_persists(persisted):
    async def _transient(self, prompt, *, system=None, **kwargs):  # noqa: ANN001
        raise ProviderUpstreamError(
            provider="anthropic",
            code="provider_rate_limited",
            upstream_status=429,
            message="anthropic: upstream 429: simulated",
        )

    with patch("app.providers.anthropic_provider.AnthropicProvider.call", _transient):
        row = await upsert_key(_body(), session=_FakeSession(), user=_FakeUser())

    assert persisted["persisted"] is True
    assert row.provider == "anthropic"
