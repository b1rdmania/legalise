"""MCP transports.

Three transports for Phase 3:

1. ``StdioTransport`` — wraps a ``SandboxedProcess`` from
   ``core.sandbox``. The MCP server reads JSON-RPC frames on stdin
   and writes responses on stdout. Phase 3 ships the transport
   plumbing; the actual JSON-RPC framing is handled by callers (the
   real ``mcp`` SDK or an equivalent client).

2. ``SseTransport`` — for remote MCP endpoints. Phase 3 ships the
   shape; the actual SSE/HTTP plumbing is delegated to whichever
   HTTP client the caller chooses. The transport here owns the URL
   + headers contract.

3. ``InMemoryTransport`` — test fixture. Callers pre-register
   responses keyed by method + params; the transport returns them
   synchronously. Used by Phase 3's unit tests.

All three implement the abstract ``MCPTransport`` interface.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.core.sandbox import SandboxedProcess


class MCPTransport(ABC):
    """Abstract transport for the MCP wire protocol.

    Each method takes a JSON-RPC-shaped dict and returns the response
    dict. Concrete subclasses handle the actual transport (subprocess
    stdin/stdout, HTTP/SSE, in-memory routing).
    """

    @abstractmethod
    async def send_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Send a request, await + return the response."""

    @abstractmethod
    async def close(self) -> None:
        """Tear down the transport (terminate subprocess, close
        connection, etc.)."""


@dataclass
class StdioTransport(MCPTransport):
    """Transport over a sandboxed subprocess's stdio.

    Phase 3 implementation is a thin shim: it owns the subprocess
    handle and supplies a synchronous send/receive loop using
    newline-delimited JSON. The real MCP SDK does framing differently
    (Content-Length headers) but the contract is the same — the host
    writes one request payload, reads one response payload.

    Callers that want strict MCP framing can subclass and override
    ``send_request`` while keeping the transport's process lifecycle
    management.
    """

    process: SandboxedProcess

    async def send_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.process.is_alive:
            raise MCPTransportError("MCP server subprocess is not running")
        try:
            line = json.dumps(payload).encode("utf-8") + b"\n"
            assert self.process.process.stdin is not None
            self.process.process.stdin.write(line)
            self.process.process.stdin.flush()
            assert self.process.process.stdout is not None
            response_line = self.process.process.stdout.readline()
            if not response_line:
                raise MCPTransportError(
                    "MCP server closed stdout without a response"
                )
            return json.loads(response_line)
        except (OSError, ValueError) as exc:
            raise MCPTransportError(f"stdio transport error: {exc}") from exc

    async def close(self) -> None:
        self.process.terminate()


@dataclass
class SseTransport(MCPTransport):
    """Transport over a remote SSE/HTTP MCP endpoint.

    Phase 3 ships the contract only. The actual HTTP plumbing is
    delegated to the caller's HTTP client (passed in via ``http_call``).
    This keeps the host module free of any specific HTTP library
    dependency and lets the existing ``httpx`` usage elsewhere in the
    codebase be reused.
    """

    url: str
    headers: dict[str, str] = field(default_factory=dict)
    http_call: Any = None  # callable: async (method, url, headers, json) -> dict

    async def send_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.http_call is None:
            raise MCPTransportError(
                "SseTransport.http_call not configured; cannot send request"
            )
        try:
            return await self.http_call(
                "POST", self.url, headers=self.headers, json=payload
            )
        except Exception as exc:
            raise MCPTransportError(f"sse transport error: {exc}") from exc

    async def close(self) -> None:
        # SSE is request-scoped; no persistent state to tear down.
        return None


@dataclass
class InMemoryTransport(MCPTransport):
    """Pre-baked transport for unit tests.

    Callers register responses keyed by the JSON-RPC ``method``. The
    transport returns the pre-registered response synchronously when
    that method is invoked. Methods that aren't registered raise
    ``MCPTransportError``.

    Usage::

        transport = InMemoryTransport()
        transport.register_response("tools/list", {"tools": [...]})
        client = MCPClient(transport=transport)
        result = await client.send_request({"method": "tools/list", ...})
    """

    responses: dict[str, dict[str, Any]] = field(default_factory=dict)
    calls: list[dict[str, Any]] = field(default_factory=list)

    def register_response(self, method: str, response: dict[str, Any]) -> None:
        self.responses[method] = response

    async def send_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(payload)
        method = payload.get("method")
        if method not in self.responses:
            raise MCPTransportError(
                f"InMemoryTransport has no response for method {method!r}"
            )
        return {
            "jsonrpc": "2.0",
            "id": payload.get("id"),
            "result": self.responses[method],
        }

    async def close(self) -> None:
        return None


class MCPTransportError(RuntimeError):
    """Raised on transport-level failure (subprocess died, HTTP
    error, unregistered method, etc.)."""


__all__ = [
    "MCPTransport",
    "StdioTransport",
    "SseTransport",
    "InMemoryTransport",
    "MCPTransportError",
]
