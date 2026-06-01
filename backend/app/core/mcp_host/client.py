"""MCP client wrapper + host lifecycle.

The ``MCPClient`` owns a single transport and a single MCP server's
session. The ``MCPHost`` is a registry of active clients keyed by
installed-module id.

Current implementation:
- request id auto-increment
- list_tools / list_resources / list_prompts wrappers around the
  transport's send_request
- explicit ``close`` to terminate the subprocess + drop from the host

No MCP capability negotiation (initialize handshake) yet — a
heartbeat / negotiation step may land when grant lifecycle wires in.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Any

import structlog

from app.core.mcp_host.transports import MCPTransport, MCPTransportError

logger = structlog.get_logger()


class MCPError(RuntimeError):
    """Generic MCP client error. Subclasses below specialise the
    failure shape so callers can branch on type."""


class MCPClient:
    """A single MCP session.

    Each installed module that runs as ``runtime: mcp`` has one
    ``MCPClient`` bound to its transport. The client is created at
    install time and reused across capability invocations.
    """

    def __init__(
        self,
        *,
        module_id: str,
        transport: MCPTransport,
    ) -> None:
        self.module_id = module_id
        self.transport = transport
        self._lock = asyncio.Lock()
        self._next_id = 1

    async def send_request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """Send a JSON-RPC request and return the parsed result.

        Serialised via ``self._lock`` to avoid interleaved I/O on a
        single transport (stdio in particular is single-stream).
        """
        async with self._lock:
            request_id = self._next_id
            self._next_id += 1
            payload = {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params or {},
            }
            try:
                response = await self.transport.send_request(payload)
            except MCPTransportError as exc:
                raise MCPError(
                    f"MCP transport failure on {method}: {exc}"
                ) from exc
            if "error" in response:
                err = response["error"]
                raise MCPError(
                    f"MCP server error on {method}: "
                    f"code={err.get('code')} message={err.get('message')}"
                )
            return response.get("result", {})

    async def list_tools(self) -> list[dict[str, Any]]:
        """Return the MCP server's tool list."""
        result = await self.send_request("tools/list")
        return list(result.get("tools", []))

    async def list_resources(self) -> list[dict[str, Any]]:
        """Return the MCP server's resource list."""
        result = await self.send_request("resources/list")
        return list(result.get("resources", []))

    async def list_prompts(self) -> list[dict[str, Any]]:
        """Return the MCP server's prompt list."""
        result = await self.send_request("prompts/list")
        return list(result.get("prompts", []))

    async def call_tool(
        self,
        name: str,
        *,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Invoke an MCP tool. Returns the tool's result payload."""
        return await self.send_request(
            "tools/call",
            params={"name": name, "arguments": arguments or {}},
        )

    async def close(self) -> None:
        """Tear down the transport."""
        await self.transport.close()


@dataclass
class MCPHost:
    """Registry of active MCP clients keyed by installed-module id.

    Ships as an in-process dict. May move to a more durable
    structure when modules survive across worker restarts.
    """

    clients: dict[str, MCPClient] = field(default_factory=dict)

    def register(self, client: MCPClient) -> None:
        """Add a client to the registry. Replaces any existing entry
        for the same module_id."""
        existing = self.clients.get(client.module_id)
        if existing is not None:
            logger.warning(
                "mcp_host.client.replace",
                module_id=client.module_id,
            )
        self.clients[client.module_id] = client

    def get(self, module_id: str) -> MCPClient | None:
        return self.clients.get(module_id)

    async def shutdown(self) -> None:
        """Tear down every registered client. Called at app shutdown
        and during test teardown."""
        for client in list(self.clients.values()):
            try:
                await client.close()
            except Exception:
                # Swallow per-client failures so one bad client
                # doesn't block the rest of the shutdown.
                continue
        self.clients.clear()


__all__ = ["MCPClient", "MCPError", "MCPHost"]
