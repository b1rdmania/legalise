"""Server-key fallback invariant — production refuses even with flag true.

Pins the auth invariant:
> `LEGALISE_ALLOW_SERVER_KEY_FALLBACK=true` is honoured only when
> ENVIRONMENT in {development, dev, local}. In production the env var
> is read as `false` regardless of value.

Three cases pinned:
1. ENVIRONMENT=demo + flag=true → ProviderKeyMissing raised
2. ENVIRONMENT=development + flag=true + no user key → fallback honoured
3. ENVIRONMENT=development + flag=false + no user key → ProviderKeyMissing

The test uses a stand-in keyed provider so we don't pull a real
Anthropic SDK call into a unit test.
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest

from app.core import model_gateway as gw_module
from app.core.model_gateway import ModelGateway, ModelProvider, PrivilegePosture
from app.core.user_keys import ProviderKeyMissing


class _AnthropicStub:
    """Stand-in with name='anthropic' so the gateway's KEYED_PROVIDERS
    check fires. Records the kwargs it was called with."""

    name = "anthropic"
    default_model = "claude-default-model"

    def __init__(self) -> None:
        self.last_api_key: str | None = None
        self.last_kwargs: dict = {}

    async def call(self, prompt: str, *, system=None, **kwargs):
        self.last_api_key = kwargs.get("api_key")
        self.last_kwargs = dict(kwargs)
        return ("ok", 3, 2)


class _FakeUserKeyRow:
    """Mimic the (ciphertext, nonce) tuple returned by get_user_provider_key
    when we want to assert "no user key" vs "user has key" paths.
    """


@pytest.fixture
def actor_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def gateway() -> tuple[ModelGateway, _AnthropicStub]:
    stub = _AnthropicStub()
    g = ModelGateway()
    g.register(stub)
    return g, stub


class _StubSession:
    """Async session stand-in. The gateway uses it for:
    - select(Matter.privilege_posture).where(Matter.id == matter_id).scalar()
    - get_user_provider_key(session, user_id, provider)
    - mark_user_key_used(session, ...)
    - session.add(AuditEntry(...))

    We bypass all of that with matter_id=None and patch user-key lookup.

    `bind = None` so the R3 `audit_failure` helper sees an unbound
    session and no-ops (these tests don't assert audit-row writes).
    """

    bind = None

    async def scalar(self, *args, **kwargs):
        return None

    async def execute(self, *args, **kwargs):
        class _Row:
            def first(self):
                return None
        return _Row()

    def add(self, *args, **kwargs):
        pass


@pytest.mark.asyncio
@patch.object(gw_module, "get_user_provider_key", return_value=None)
async def test_production_refuses_fallback_even_with_flag_true(
    _mock_lookup, gateway, actor_id
):
    g, _stub = gateway

    with patch.object(gw_module.settings, "environment", "demo"), \
         patch.object(gw_module.settings, "allow_server_key_fallback", True):
        with pytest.raises(ProviderKeyMissing) as excinfo:
            await g.call(
                session=_StubSession(),
                matter_id=None,
                actor_id=actor_id,
                prompt="hi",
                model="claude-opus-4-7",
                posture=PrivilegePosture.B_MIXED,
            )
    assert excinfo.value.provider == "anthropic"


@pytest.mark.asyncio
@patch.object(gw_module, "mark_user_key_used")
@patch.object(gw_module, "get_user_provider_key", return_value=None)
async def test_dev_honours_fallback_when_flag_true(
    _mock_lookup, _mock_mark, gateway, actor_id
):
    g, stub = gateway

    with patch.object(gw_module.settings, "environment", "development"), \
         patch.object(gw_module.settings, "allow_server_key_fallback", True):
        result = await g.call(
            session=_StubSession(),
            matter_id=None,
            actor_id=actor_id,
            prompt="hi",
            model="claude-opus-4-7",
            posture=PrivilegePosture.B_MIXED,
        )
    assert result.text == "ok"
    # Fallback path passes no api_key kwarg — provider uses its
    # construct-time fallback (which is None in this test, but the
    # assertion here is that the gateway took the fallback branch).
    assert stub.last_api_key is None


@pytest.mark.asyncio
@patch.object(gw_module, "get_user_provider_key", return_value=None)
async def test_dev_refuses_when_flag_false(_mock_lookup, gateway, actor_id):
    g, _stub = gateway

    with patch.object(gw_module.settings, "environment", "development"), \
         patch.object(gw_module.settings, "allow_server_key_fallback", False):
        with pytest.raises(ProviderKeyMissing):
            await g.call(
                session=_StubSession(),
                matter_id=None,
                actor_id=actor_id,
                prompt="hi",
                model="claude-opus-4-7",
                posture=PrivilegePosture.B_MIXED,
            )


@pytest.mark.asyncio
@patch.object(gw_module, "mark_user_key_used")
@patch.object(gw_module, "get_user_provider_key", return_value="sk-user-key")
async def test_user_key_passed_through_when_present(
    _mock_lookup, _mock_mark, gateway, actor_id
):
    g, stub = gateway

    # Production environment, no fallback — still works because the user
    # has a key.
    with patch.object(gw_module.settings, "environment", "demo"), \
         patch.object(gw_module.settings, "allow_server_key_fallback", False):
        await g.call(
            session=_StubSession(),
            matter_id=None,
            actor_id=actor_id,
            prompt="hi",
            model="claude-opus-4-7",
            posture=PrivilegePosture.B_MIXED,
        )
    assert stub.last_api_key == "sk-user-key"


@pytest.mark.asyncio
@patch.object(gw_module, "mark_user_key_used")
@patch.object(gw_module, "get_user_provider_key", return_value="sk-user-key")
async def test_token_split_carried_on_model_result(
    _mock_lookup, _mock_mark, gateway, actor_id
):
    g, _stub = gateway

    with patch.object(gw_module.settings, "environment", "demo"), \
         patch.object(gw_module.settings, "allow_server_key_fallback", False):
        result = await g.call(
            session=_StubSession(),
            matter_id=None,
            actor_id=actor_id,
            prompt="hi",
            model="claude-opus-4-7",
            posture=PrivilegePosture.B_MIXED,
        )
    assert result.tokens_in == 3
    assert result.tokens_out == 2
    assert result.token_count == 5


# ---------------------------------------------------------------------------
# Model passthrough + max_tokens — the picked model must actually run
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch.object(gw_module, "mark_user_key_used")
@patch.object(gw_module, "get_user_provider_key", return_value="sk-user-key")
async def test_requested_model_is_forwarded_to_keyed_provider(
    _mock_lookup, _mock_mark, gateway, actor_id
):
    """The user-picked model id reaches the provider AND is what the
    result records — not the provider's construct-time default."""
    g, stub = gateway

    result = await g.call(
        session=_StubSession(),
        matter_id=None,
        actor_id=actor_id,
        prompt="hi",
        model="claude-haiku-4-5",
        posture=PrivilegePosture.A_CLEARED,
    )
    assert stub.last_kwargs.get("model") == "claude-haiku-4-5"
    assert result.model_used == "claude-haiku-4-5"
    assert result.provider == "anthropic"


@pytest.mark.asyncio
@patch.object(gw_module, "mark_user_key_used")
@patch.object(gw_module, "get_user_provider_key", return_value="sk-user-key")
async def test_bare_provider_name_falls_back_to_provider_default(
    _mock_lookup, _mock_mark, gateway, actor_id
):
    """`model="anthropic"` (test passthrough) sends no model kwarg; the
    result records the provider's default model as the one actually run."""
    g, stub = gateway

    result = await g.call(
        session=_StubSession(),
        matter_id=None,
        actor_id=actor_id,
        prompt="hi",
        model="anthropic",
        posture=PrivilegePosture.A_CLEARED,
    )
    assert "model" not in stub.last_kwargs
    assert result.model_used == "claude-default-model"
    assert result.provider == "anthropic"


@pytest.mark.asyncio
@patch.object(gw_module, "mark_user_key_used")
@patch.object(gw_module, "get_user_provider_key", return_value="sk-user-key")
async def test_max_tokens_forwarded_when_set(
    _mock_lookup, _mock_mark, gateway, actor_id
):
    g, stub = gateway

    await g.call(
        session=_StubSession(),
        matter_id=None,
        actor_id=actor_id,
        prompt="hi",
        model="claude-haiku-4-5",
        posture=PrivilegePosture.A_CLEARED,
        max_tokens=8192,
    )
    assert stub.last_kwargs.get("max_tokens") == 8192

    await g.call(
        session=_StubSession(),
        matter_id=None,
        actor_id=actor_id,
        prompt="hi",
        model="claude-haiku-4-5",
        posture=PrivilegePosture.A_CLEARED,
    )
    assert "max_tokens" not in stub.last_kwargs  # provider default applies
