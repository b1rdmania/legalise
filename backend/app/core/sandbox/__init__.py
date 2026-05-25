"""Subprocess sandbox for MCP servers.

Phase 3 supply-chain layer per docs/handovers/PHASE_3_BUILD_PLAN.md
§Step 3.

Modules run in subprocesses with:
- RLIMIT_AS (memory) + RLIMIT_CPU (CPU seconds) enforcement
  (universal — works on macOS and Linux)
- Linux seccomp filter when ``libseccomp`` is available + the profile
  declares syscall_allowlist (graceful no-op on macOS)
- AppArmor profile when running on Ubuntu/Debian with a matching
  profile (graceful no-op elsewhere)
- Capability-bound filesystem + network access via the
  ``host_bridge`` (the subprocess sees the explicit ``allow`` lists
  from its ``SandboxProfile`` and nothing else — the MCP host layer
  also enforces capability scopes for defence in depth)

Public surface:

    from app.core.sandbox import (
        SandboxedProcess,
        SandboxProfile,
        SandboxError,
        SandboxUnavailableError,
        launch_mcp_server,
        profile_for_kind,
    )
"""

from app.core.sandbox.profiles import (
    SandboxProfile,
    profile_for_kind,
)
from app.core.sandbox.subprocess_runner import (
    SandboxedProcess,
    SandboxError,
    SandboxUnavailableError,
    launch_mcp_server,
)

__all__ = [
    "SandboxedProcess",
    "SandboxProfile",
    "SandboxError",
    "SandboxUnavailableError",
    "launch_mcp_server",
    "profile_for_kind",
]
