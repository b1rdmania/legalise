"""Phase 3 — MCP host tests.

InMemoryTransport-backed tests cover the client + host registry +
tool proxy without launching real MCP processes. The dual-audit
pattern from Phase 1 is reused; tool_proxy applies the same mock
on audit_failure as the Phase 1 tests.
"""

from __future__ import annotations

import uuid

import pytest

from app.core.capabilities import grant
from app.core.mcp_host import (
    InMemoryTransport,
    MCPClient,
    MCPError,
    MCPHost,
    invoke_tool,
)
from app.core.mcp_host.tool_proxy import MCPCapabilityDenied
from app.core.mcp_host.transports import MCPTransportError
from app.models import User


async def _make_user(db_session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"p3-mcp-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 32,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


# ---------------------------------------------------------------------------
# Pure unit — InMemoryTransport
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_in_memory_transport_returns_registered_response() -> None:
    transport = InMemoryTransport()
    transport.register_response("tools/list", {"tools": [{"name": "t1"}]})
    client = MCPClient(module_id="m", transport=transport)
    result = await client.list_tools()
    assert result == [{"name": "t1"}]
    assert len(transport.calls) == 1
    assert transport.calls[0]["method"] == "tools/list"


@pytest.mark.asyncio
async def test_in_memory_transport_raises_on_unregistered_method() -> None:
    transport = InMemoryTransport()
    client = MCPClient(module_id="m", transport=transport)
    with pytest.raises(MCPError, match="MCP transport failure"):
        await client.list_tools()


@pytest.mark.asyncio
async def test_mcp_client_call_tool_forwards_arguments() -> None:
    transport = InMemoryTransport()
    transport.register_response("tools/call", {"content": [{"text": "ok"}]})
    client = MCPClient(module_id="m", transport=transport)
    result = await client.call_tool("do_thing", arguments={"x": 1})
    assert result["content"][0]["text"] == "ok"
    # Verify the params were forwarded.
    call = transport.calls[0]
    assert call["method"] == "tools/call"
    assert call["params"]["name"] == "do_thing"
    assert call["params"]["arguments"] == {"x": 1}


@pytest.mark.asyncio
async def test_mcp_client_serialises_concurrent_calls() -> None:
    """The lock means two concurrent send_requests don't interleave;
    the second one sees the first's response."""
    import asyncio

    transport = InMemoryTransport()
    transport.register_response("tools/list", {"tools": []})
    client = MCPClient(module_id="m", transport=transport)

    async def call():
        return await client.list_tools()

    await asyncio.gather(call(), call(), call())
    # All three calls completed without contention.
    assert len(transport.calls) == 3


@pytest.mark.asyncio
async def test_mcp_host_register_and_get() -> None:
    transport = InMemoryTransport()
    client = MCPClient(module_id="m1", transport=transport)
    host = MCPHost()
    host.register(client)
    assert host.get("m1") is client
    assert host.get("nope") is None


@pytest.mark.asyncio
async def test_mcp_host_shutdown_closes_clients() -> None:
    transport = InMemoryTransport()
    client = MCPClient(module_id="m1", transport=transport)
    host = MCPHost()
    host.register(client)
    await host.shutdown()
    assert host.get("m1") is None


@pytest.mark.asyncio
async def test_mcp_client_propagates_server_errors() -> None:
    """Response payloads with an 'error' key surface as MCPError."""
    transport = InMemoryTransport()

    # Manually short-circuit InMemoryTransport to return an error
    # payload — simulates the MCP server reporting an error.
    async def _send(payload):
        return {
            "jsonrpc": "2.0",
            "id": payload.get("id"),
            "error": {"code": -32000, "message": "tool failed"},
        }

    transport.send_request = _send  # type: ignore[method-assign]
    client = MCPClient(module_id="m", transport=transport)
    with pytest.raises(MCPError, match="tool failed"):
        await client.call_tool("broken")


# ---------------------------------------------------------------------------
# Tool proxy — capability enforcement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoke_tool_capability_denied_raises(
    db_session, monkeypatch
) -> None:
    """invoke_tool runs check_or_block for every reads/writes
    capability. With no grants, MCPCapabilityDenied raises."""

    async def _fake_audit_failure(request_session, action, **kwargs):
        from app.core.api import audit

        await audit.log(
            request_session,
            action,
            actor_id=kwargs.get("actor_id"),
            matter_id=kwargs.get("matter_id"),
            module=kwargs.get("module"),
            resource_type=kwargs.get("resource_type"),
            resource_id=kwargs.get("resource_id"),
            payload=kwargs.get("payload"),
        )

    monkeypatch.setattr(
        "app.core.phase1_runtime.capability_check.audit_failure",
        _fake_audit_failure,
    )

    user = await _make_user(db_session)
    transport = InMemoryTransport()
    transport.register_response("tools/call", {"content": []})
    client = MCPClient(module_id="test.m", transport=transport)

    with pytest.raises(MCPCapabilityDenied):
        await invoke_tool(
            db_session,
            client=client,
            tool_name="do_thing",
            arguments={},
            user_id=user.id,
            capability_id="cap-default",
            reads_required=["matter.documents.body.read"],
        )


@pytest.mark.asyncio
async def test_invoke_tool_passes_with_grant(db_session) -> None:
    user = await _make_user(db_session)
    cap = "matter.documents.body.read"
    await grant(
        db_session,
        user_id=user.id,
        plugin="core",
        skill="mcp_host",
        capability=cap,
    )
    await db_session.flush()

    transport = InMemoryTransport()
    transport.register_response(
        "tools/call", {"content": [{"text": "ok"}]}
    )
    client = MCPClient(module_id="test.m", transport=transport)
    result = await invoke_tool(
        db_session,
        client=client,
        tool_name="do_thing",
        arguments={"x": 1},
        user_id=user.id,
        capability_id="cap-default",
        reads_required=[cap],
    )
    assert result["content"][0]["text"] == "ok"
