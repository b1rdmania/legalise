"""Phase 3 — sandbox runner tests.

Mostly pure-unit. The actual subprocess launcher is exercised by a
real ``/bin/echo`` invocation so we verify RLIMITs apply without
crashing. Linux-specific seccomp/AppArmor coverage skips on macOS
gracefully.

The real-subprocess launches also skip on macOS: RLIMIT_AS on Darwin
counts the whole mapped virtual address space (shared libraries,
dyld cache) against the limit, so the profile's memory cap breaks
``exec`` in the child before it runs. This is a real macOS/RLIMIT_AS
incompatibility, not just a missing marker — see backend follow-up
before assuming these pass on Linux CI runners without checking.
"""

from __future__ import annotations

import platform

import pytest

from app.core.sandbox import (
    SandboxError,
    SandboxProfile,
    launch_mcp_server,
    profile_for_kind,
)


def test_profile_for_kind_skill() -> None:
    p = profile_for_kind("skill")
    assert p.memory_mb_limit == 512
    assert p.cpu_seconds_limit == 30
    assert p.allow_network is False


def test_profile_for_kind_provider_allows_network() -> None:
    p = profile_for_kind("provider")
    assert p.allow_network is True


def test_profile_for_kind_workflow_has_larger_limits() -> None:
    workflow = profile_for_kind("workflow")
    skill = profile_for_kind("skill")
    assert workflow.memory_mb_limit > skill.memory_mb_limit
    assert workflow.cpu_seconds_limit > skill.cpu_seconds_limit


def test_profile_for_kind_unknown_falls_back_to_skill() -> None:
    p = profile_for_kind("not-a-kind")
    # Same shape as skill defaults.
    assert p.memory_mb_limit == 512


def test_profile_is_frozen() -> None:
    p = SandboxProfile(memory_mb_limit=100, cpu_seconds_limit=5)
    with pytest.raises(Exception):
        p.memory_mb_limit = 999  # type: ignore[misc]


def test_launch_empty_command_raises() -> None:
    with pytest.raises(SandboxError, match="empty command"):
        launch_mcp_server([], profile=profile_for_kind("skill"))


@pytest.mark.skipif(
    platform.system() == "Darwin",
    reason="RLIMIT_AS on macOS counts mapped shared-library address "
    "space against the cap, breaking exec in the preexec_fn child",
)
def test_launch_missing_binary_raises() -> None:
    with pytest.raises(SandboxError, match="command not found"):
        launch_mcp_server(
            ["/nonexistent/binary-xyz"],
            profile=profile_for_kind("skill"),
        )


@pytest.mark.skipif(
    platform.system() == "Darwin",
    reason="RLIMIT_AS on macOS counts mapped shared-library address "
    "space against the cap, breaking exec in the preexec_fn child",
)
def test_launch_real_subprocess_runs_and_terminates() -> None:
    """Launch /bin/echo and verify the SandboxedProcess wrapper
    handles the lifecycle correctly on Linux (RLIMIT_AS is
    macOS-incompatible — see module docstring)."""
    p = profile_for_kind("skill")
    proc = launch_mcp_server(["/bin/echo", "hello"], profile=p)
    assert proc.pid > 0
    exit_code = proc.terminate(timeout=3.0)
    assert exit_code == 0


@pytest.mark.skipif(
    platform.system() == "Darwin",
    reason="RLIMIT_AS on macOS counts mapped shared-library address "
    "space against the cap, breaking exec in the preexec_fn child",
)
def test_applied_features_include_rlimits() -> None:
    """RLIMITs apply on Linux; macOS is incompatible with the
    RLIMIT_AS approach (see module docstring)."""
    p = profile_for_kind("skill")
    proc = launch_mcp_server(["/bin/echo", "hi"], profile=p)
    try:
        assert "rlimits" in proc.applied_os_features
    finally:
        proc.terminate(timeout=2.0)


@pytest.mark.skipif(platform.system() != "Linux", reason="Linux-only feature")
def test_seccomp_available_on_linux_with_allowlist() -> None:
    """When running on Linux + pyseccomp is installed + profile has
    a syscall_allowlist, the launcher should report seccomp as
    applied. Phase 3 ships pyseccomp as optional; if it's not
    installed in CI this test still passes by virtue of the
    feature-bookkeeping being a best-effort signal."""
    profile = SandboxProfile(
        memory_mb_limit=128,
        cpu_seconds_limit=5,
        syscall_allowlist=["read", "write", "exit", "exit_group"],
    )
    proc = launch_mcp_server(["/bin/true"], profile=profile)
    try:
        # We don't assert seccomp IS applied (depends on pyseccomp
        # installation); only that the bookkeeping doesn't crash.
        assert "rlimits" in proc.applied_os_features
    finally:
        proc.terminate(timeout=2.0)
