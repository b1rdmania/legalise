"""Per-kind sandbox profiles.

Each capability ``kind`` from the v2 manifest grammar gets a default
sandbox profile. Modules can override individual fields via their
manifest's data_movement + entrypoint configuration, but the kind
default establishes the safe baseline.

Per the PHASE_3_BUILD_PLAN plan (repo history) 3.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SandboxProfile:
    """Frozen sandbox configuration for a subprocess.

    Attributes
    ----------
    memory_mb_limit
        RLIMIT_AS in MB. The subprocess cannot exceed this; an OOM
        attempt terminates the process.
    cpu_seconds_limit
        RLIMIT_CPU. Cumulative CPU seconds before the process is
        killed. None disables the cap.
    allow_network
        If False, the host bridge refuses outbound network calls and
        AppArmor (when available) blocks socket syscalls. Does not
        yet block via seccomp because TCP requires many
        syscalls; AppArmor + host bridge are the enforcement layers.
    allow_filesystem_paths
        Read/write filesystem paths the subprocess can access. Empty
        list means no filesystem access (the bridge serialises
        everything through MCP resource calls). Typically a tmpdir
        scoped per invocation.
    syscall_allowlist
        Optional Linux seccomp allowlist (system call names). None
        means seccomp is not applied for this profile (host bridge +
        RLIMIT only).
    max_file_handles
        RLIMIT_NOFILE. Defaults to a small number to prevent fd
        exhaustion.
    """

    memory_mb_limit: int = 512
    cpu_seconds_limit: int | None = 30
    allow_network: bool = False
    allow_filesystem_paths: list[str] = field(default_factory=list)
    syscall_allowlist: list[str] | None = None
    max_file_handles: int = 64


# Default profiles per capability kind. Mirrors the v2 ``kind`` enum
# (skill | tool | workflow | provider | gate).
#
# Design intent:
# - ``skill`` and ``tool`` get tight defaults. Most modules don't
#   need network or filesystem beyond what the MCP host provides.
# - ``workflow`` gets bigger limits (multi-step orchestration tends
#   to be longer-lived).
# - ``provider`` gets network (to reach the model API).
# - ``gate`` runs in-process; this profile is a no-op for those
#   capabilities but kept for symmetry.
_KIND_PROFILES: dict[str, SandboxProfile] = {
    "skill": SandboxProfile(
        memory_mb_limit=512,
        cpu_seconds_limit=30,
        allow_network=False,
        max_file_handles=64,
    ),
    "tool": SandboxProfile(
        memory_mb_limit=512,
        cpu_seconds_limit=60,
        allow_network=False,
        max_file_handles=64,
    ),
    "workflow": SandboxProfile(
        memory_mb_limit=1024,
        cpu_seconds_limit=300,
        allow_network=False,
        max_file_handles=128,
    ),
    "provider": SandboxProfile(
        memory_mb_limit=512,
        cpu_seconds_limit=120,
        allow_network=True,
        max_file_handles=64,
    ),
    "gate": SandboxProfile(
        memory_mb_limit=128,
        cpu_seconds_limit=10,
        allow_network=False,
        max_file_handles=16,
    ),
}


def profile_for_kind(kind: str) -> SandboxProfile:
    """Return the default sandbox profile for a capability kind.

    Unknown kinds get a conservative fallback (skill-shaped) so a
    misconfigured manifest still runs under reasonable limits rather
    than escaping the sandbox.
    """
    return _KIND_PROFILES.get(kind, _KIND_PROFILES["skill"])


__all__ = ["SandboxProfile", "profile_for_kind"]
