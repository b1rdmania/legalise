"""MCP host runtime.

Phase 3 MCP integration per docs/handovers/PHASE_3_BUILD_PLAN.md §Step 4.

Module runtime layered on top of:
- Phase 1 substrate (capability checks, audit emission)
- Phase 2 manifest spec (v2 capability declarations)
- Phase 3 supply chain (sandboxed subprocess execution, signature
  verification, verified-publisher registry)

The MCP wire protocol (JSON-RPC framing, capability negotiation) is
abstracted behind a pluggable ``MCPTransport`` so callers can swap the
real ``mcp`` Python SDK in without touching this module. Phase 3
ships:
- StdioTransport for subprocess-based MCP servers
- SseTransport for remote MCP endpoints
- InMemoryTransport for unit tests

The MCP host enforces capability scoping on every ``invoke_tool``,
``list_resources``, and ``list_prompts`` call. The Phase 1 dual-audit
pattern (legacy module.capability.denied + Phase 1 *.blocked) fires
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
