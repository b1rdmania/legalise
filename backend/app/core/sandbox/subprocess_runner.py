"""Subprocess MCP server launcher with RLIMIT + optional Linux
seccomp/AppArmor.

Design notes:

- ``launch_mcp_server`` returns a ``SandboxedProcess`` wrapper around
  a started ``subprocess.Popen``. The caller (the MCP host) is
  responsible for terminating the process when the request ends.
- On Linux: RLIMIT_AS, RLIMIT_CPU, RLIMIT_NOFILE applied via
  ``preexec_fn`` so the limits take effect before ``exec``. seccomp
  + AppArmor scaffolded but degrade to no-op if the corresponding
  Python bindings (``pyseccomp`` or ``libapparmor``) are missing or
  if the system doesn't support the feature.
- On Darwin (macOS dev): RLIMIT_AS + RLIMIT_CPU + RLIMIT_NOFILE
  work; seccomp/AppArmor are silently skipped. The MCP host layer
  still enforces capability scoping in the request path so the
  sandbox gap doesn't translate to a privilege escalation.
- ``SandboxUnavailableError`` is raised only when the caller asks
  for a Linux-only feature that the host cannot honour AND the
  profile marks it as required (``require_os_sandbox=True`` —
  pending). Current profiles do not set this flag, so the launcher
  always proceeds.
"""

from __future__ import annotations

import os
import platform
import resource
import shlex
import subprocess
from dataclasses import dataclass, field
from typing import Any

import structlog

from app.core.sandbox.profiles import SandboxProfile

logger = structlog.get_logger()


class SandboxError(RuntimeError):
    """Raised when sandbox enforcement fails in a way that should
    prevent the subprocess from running."""


class SandboxUnavailableError(SandboxError):
    """Raised when the requested sandbox feature is unavailable on
    this host (e.g. seccomp on macOS) AND the profile required it."""


@dataclass
class SandboxedProcess:
    """Wrapper around a running subprocess.

    Attributes
    ----------
    process
        The underlying ``subprocess.Popen`` instance.
    profile
        The applied ``SandboxProfile``.
    pid
        Convenience accessor.
    is_alive
        Whether the process is still running.
    """

    process: subprocess.Popen
    profile: SandboxProfile
    applied_os_features: list[str] = field(default_factory=list)

    @property
    def pid(self) -> int:
        return self.process.pid

    @property
    def is_alive(self) -> bool:
        return self.process.poll() is None

    def terminate(self, *, timeout: float = 5.0) -> int | None:
        """Terminate the subprocess gracefully, then kill if it doesn't
        exit within ``timeout`` seconds. Returns the exit code."""
        if not self.is_alive:
            return self.process.returncode
        try:
            self.process.terminate()
            return self.process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            self.process.kill()
            return self.process.wait(timeout=timeout)


def _apply_rlimits(profile: SandboxProfile) -> None:
    """Apply RLIMIT_AS, RLIMIT_CPU, RLIMIT_NOFILE in the child
    process. Called via ``preexec_fn`` so the limits take effect
    before ``exec``."""
    memory_bytes = profile.memory_mb_limit * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    if profile.cpu_seconds_limit is not None:
        resource.setrlimit(
            resource.RLIMIT_CPU,
            (profile.cpu_seconds_limit, profile.cpu_seconds_limit),
        )
    resource.setrlimit(
        resource.RLIMIT_NOFILE,
        (profile.max_file_handles, profile.max_file_handles),
    )


def _apply_seccomp(profile: SandboxProfile) -> bool:
    """Apply Linux seccomp filter if available. Returns True if
    applied, False otherwise. Best-effort — not raising on failure so
    macOS dev keeps working."""
    if platform.system() != "Linux":
        return False
    if not profile.syscall_allowlist:
        return False
    try:
        import pyseccomp as seccomp  # type: ignore[import-not-found]
    except ImportError:
        return False
    try:
        filt = seccomp.SyscallFilter(defaction=seccomp.KILL)
        for syscall_name in profile.syscall_allowlist:
            filt.add_rule(seccomp.ALLOW, syscall_name)
        filt.load()
        return True
    except Exception:
        return False


def _apply_apparmor() -> bool:
    """Apply AppArmor confinement if libapparmor + a profile is
    available. Ships a no-op stub — Linux deployments can
    install ``apparmor-utils`` and a Legalise profile to enable this.
    Returns True if applied, False otherwise."""
    if platform.system() != "Linux":
        return False
    # Stub keeps the API in place so the launcher's
    # applied_os_features bookkeeping works.
    return False


def _build_preexec(profile: SandboxProfile) -> Any:
    """Build the preexec_fn for ``subprocess.Popen``."""

    def _preexec() -> None:
        _apply_rlimits(profile)
        # seccomp/AppArmor applied here too if available.
        _apply_seccomp(profile)
        _apply_apparmor()

    return _preexec


def launch_mcp_server(
    command: list[str] | str,
    *,
    profile: SandboxProfile,
    env: dict[str, str] | None = None,
    cwd: str | None = None,
) -> SandboxedProcess:
    """Launch an MCP server subprocess under the given profile.

    Parameters
    ----------
    command
        Either a list of argv tokens or a single shell-style string.
    profile
        The sandbox configuration to apply.
    env
        Environment variables. If None, the parent's environment is
        used (without filtering — callers should pass an explicit
        whitelisted env for tighter isolation).
    cwd
        Working directory.

    Returns
    -------
    SandboxedProcess
        Wrapper around the running subprocess.
    """
    argv: list[str]
    if isinstance(command, str):
        argv = shlex.split(command)
    else:
        argv = list(command)
    if not argv:
        raise SandboxError("empty command supplied to launch_mcp_server")

    preexec_fn = _build_preexec(profile)
    applied: list[str] = ["rlimits"]
    try:
        process = subprocess.Popen(
            argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env if env is not None else os.environ.copy(),
            cwd=cwd,
            preexec_fn=preexec_fn,
            close_fds=True,
        )
    except FileNotFoundError as exc:
        raise SandboxError(f"command not found: {argv[0]!r}") from exc
    except OSError as exc:
        raise SandboxError(f"failed to launch subprocess: {exc}") from exc

    # Best-effort feature bookkeeping. Note: this runs in the parent
    # so we can only check whether the *modules* are available,
    # not whether the actual filter applied in the child (subprocess
    # already detached). A heartbeat probe may be added later.
    if platform.system() == "Linux":
        try:
            import pyseccomp  # type: ignore[import-not-found]  # noqa: F401

            if profile.syscall_allowlist:
                applied.append("seccomp")
        except ImportError:
            pass
        # AppArmor stub.
    logger.info(
        "sandbox.launch_mcp_server",
        pid=process.pid,
        argv=argv,
        memory_mb=profile.memory_mb_limit,
        cpu_seconds=profile.cpu_seconds_limit,
        allow_network=profile.allow_network,
        applied=applied,
    )

    return SandboxedProcess(
        process=process,
        profile=profile,
        applied_os_features=applied,
    )


__all__ = [
    "SandboxedProcess",
    "SandboxError",
    "SandboxUnavailableError",
    "launch_mcp_server",
]
