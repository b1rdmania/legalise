"""MCP tool invocation proxy with capability enforcement.

``invoke_tool`` is the canonical entry point for runtime code that
wants to invoke an MCP tool on behalf of a user. It enforces the
capability scope per the manifest's declared ``reads`` and ``writes``
before forwarding to the MCP client.

On capability denial the Phase 1 dual-audit pattern fires (legacy
module.capability.denied + Phase 1
``mcp.tool.invoked.blocked``) and ``MCPCapabilityDenied`` is raised
carrying the canonical ``BlockedPayload``.

Per docs/handovers/PHASE_3_BUILD_PLAN.md §Step 4.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mcp_host.client import MCPClient, MCPError
from app.core.phase1_runtime import (
    BlockedPayload,
    BlockedReason,
    Phase1Blocked,
    audit_phase1,
    check_or_block,
)

logger = structlog.get_logger()


class MCPCapabilityDenied(Phase1Blocked):
    """Capability denied for an MCP tool invocation.

    Subclass of ``Phase1Blocked`` so callers that already handle the
    blocked pattern catch this too.
    """


async def invoke_tool(
    session: AsyncSession,
    *,
    client: MCPClient,
    tool_name: str,
    arguments: dict[str, Any] | None,
    user_id: uuid.UUID,
    capability_id: str,
    reads_required: list[str] | None = None,
    writes_required: list[str] | None = None,
    matter_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Invoke an MCP tool with capability enforcement.

    Parameters
    ----------
    session
        Request session for capability + audit writes.
    client
        The MCPClient for the installed module.
    tool_name
        The tool's name as declared by the MCP server.
    arguments
        Arguments forwarded to the tool.
    user_id
        Calling user. Capability check resolves against this user's
        grants.
    capability_id
        The canonical capability identifier this invocation
        represents. Used for audit attribution.
    reads_required, writes_required
        Capability strings from the manifest's ``reads`` and
        ``writes`` arrays for this capability. Every entry must be
        granted to ``user_id`` before the tool runs.
    matter_id, actor_id
        Forwarded to audit emissions.

    Returns
    -------
    dict
        The tool's result payload as returned by the MCP server.

    Raises
    ------
    MCPCapabilityDenied
        On capability denial. The dual-audit pattern has already
        fired by the time this raises.
    MCPError
        On transport-level failure.
    """
    primitive = "mcp_host"
    block_action = "mcp.tool.invoked.blocked"

    for cap in (reads_required or []):
        try:
            await check_or_block(
                session,
                user_id=user_id,
                capability=cap,
                primitive=primitive,
                block_action=block_action,
                actor_id=actor_id or user_id,
                matter_id=matter_id,
                resource_type="mcp_tool",
                resource_id=f"{client.module_id}:{tool_name}",
            )
        except Phase1Blocked as exc:
            raise MCPCapabilityDenied(exc.payload) from None
    for cap in (writes_required or []):
        try:
            await check_or_block(
                session,
                user_id=user_id,
                capability=cap,
                primitive=primitive,
                block_action=block_action,
                actor_id=actor_id or user_id,
                matter_id=matter_id,
                resource_type="mcp_tool",
                resource_id=f"{client.module_id}:{tool_name}",
            )
        except Phase1Blocked as exc:
            raise MCPCapabilityDenied(exc.payload) from None

    # All capability checks passed — invoke the tool.
    started = time.perf_counter()
    try:
        result = await client.call_tool(tool_name, arguments=arguments)
    except MCPError as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        await audit_phase1(
            session,
            action="mcp.tool.invoked.failed",
            primitive=primitive,
            actor_id=actor_id or user_id,
            matter_id=matter_id,
            module_id=client.module_id,
            capability_id=capability_id,
            resource_type="mcp_tool",
            resource_id=f"{client.module_id}:{tool_name}",
            payload={
                "tool_name": tool_name,
                "error": str(exc),
            },
            latency_ms=latency_ms,
        )
        raise

    latency_ms = int((time.perf_counter() - started) * 1000)
    await audit_phase1(
        session,
        action="mcp.tool.invoked",
        primitive=primitive,
        actor_id=actor_id or user_id,
        matter_id=matter_id,
        module_id=client.module_id,
        capability_id=capability_id,
        resource_type="mcp_tool",
        resource_id=f"{client.module_id}:{tool_name}",
        payload={
            "tool_name": tool_name,
            "argument_count": len(arguments or {}),
        },
        latency_ms=latency_ms,
    )
    return result


__all__ = ["MCPCapabilityDenied", "invoke_tool"]
