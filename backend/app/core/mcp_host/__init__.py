"""MCP host runtime.


Module runtime layered on top of:
- substrate (capability checks, audit emission)
- manifest spec (v2 capability declarations)
- supply chain (sandboxed subprocess execution, signature
  verification, verified-publisher registry)

The MCP wire protocol (JSON-RPC framing, capability negotiation) is
abstracted behind a pluggable ``MCPTransport`` so callers can swap the
real ``mcp`` Python SDK in without touching this module. Three
transports ship:
- StdioTransport for subprocess-based MCP servers
- SseTransport for remote MCP endpoints
- InMemoryTransport for unit tests

The MCP host enforces capability scoping on every ``invoke_tool``,
``list_resources``, and ``list_prompts`` call. The dual-audit
pattern (legacy module.capability.denied + *.blocked) fires
on capability denial.

Public surface:

    from app.core.mcp_host import (
        MCPClient,
        MCPHost,
        MCPTransport,
        StdioTransport,
        SseTransport,
        InMemoryTransport,
        MCPError,
        MCPCapabilityDenied,
        invoke_tool,
    )
"""

from app.core.mcp_host.client import (
    MCPClient,
    MCPError,
    MCPHost,
)
from app.core.mcp_host.tool_proxy import (
    MCPCapabilityDenied,
    invoke_tool,
)
from app.core.mcp_host.transports import (
    InMemoryTransport,
    MCPTransport,
    SseTransport,
    StdioTransport,
)

__all__ = [
    "MCPClient",
    "MCPError",
    "MCPHost",
    "MCPTransport",
    "MCPCapabilityDenied",
    "StdioTransport",
    "SseTransport",
    "InMemoryTransport",
    "invoke_tool",
]
