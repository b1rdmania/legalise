"""Phase 16 C — doctor.check_manifests_valid regression.

R3 finding: the original implementation called validate_manifest_v2
(returns (ok, errors)) inside a try/except InvalidManifestError block.
The except branch was unreachable so every invalid manifest reported
as `ok`. This test pins the raising contract: a deliberately invalid
v2 manifest discovered by the registry MUST produce a `fail` result.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.registry.discovery import DiscoveredModule
from app.tools.doctor import check_manifests_valid, check_worker_heartbeat


def _bad_v2_payload() -> dict:
    """A v2-shaped manifest that fails schema validation.

    The v2 schema requires a `manifest_version` of 2 and a `capabilities`
    array of objects with `id`, `kind`, `scope`. Missing all of that
    while still being a non-empty dict guarantees the validator
    flags it.
    """
    return {
        "name": "deliberately invalid",
        "module_id": "phase16-c-regression",
    }


def test_check_manifests_valid_fails_on_invalid_manifest(monkeypatch):
    fake = DiscoveredModule(
        module_id="phase16-c-regression",
        manifest_path=Path("/dev/null"),
        source_kind="v2",
        payload=_bad_v2_payload(),
    )
    # Patch discover_modules at the doctor module's import site so the
    # function-local `from app.core.registry import ... discover_modules`
    # resolves to our fake list.
    monkeypatch.setattr(
        "app.core.registry.discover_modules",
        lambda: [fake],
    )

    result = check_manifests_valid()

    assert result.name == "manifests.valid"
    assert result.status == "fail", (
        f"expected fail for an invalid v2 manifest, got "
        f"{result.status!r} (detail={result.detail!r}) — this would be the "
        f"silent-green regression the R3 review caught"
    )
    assert "phase16-c-regression" in result.detail


def test_check_manifests_valid_ok_on_empty(monkeypatch):
    """Belt-and-braces: zero manifests yields a note, not fail."""
    monkeypatch.setattr(
        "app.core.registry.discover_modules",
        lambda: [],
    )
    result = check_manifests_valid()
    assert result.status == "note"


class _FakeRedis:
    """Stand-in for redis.asyncio client — GET returns the wired value."""

    def __init__(self, value: bytes | None):
        self._value = value
        self.requested_key: str | None = None

    async def get(self, key: str) -> bytes | None:
        self.requested_key = key
        return self._value

    async def aclose(self) -> None:
        return None


@pytest.mark.asyncio
async def test_worker_heartbeat_ok_when_health_key_present(monkeypatch):
    fake = _FakeRedis(b"Jul-05 12:00:00 j_complete=3 j_failed=0 j_retried=0 j_ongoing=0 queued=0")
    monkeypatch.setattr("redis.asyncio.from_url", lambda url: fake)

    result = await check_worker_heartbeat()

    assert result.name == "worker.heartbeat"
    assert result.status == "ok"
    assert "j_complete=3" in result.detail
    # arq's default health key: queue name + suffix.
    assert fake.requested_key == "arq:queue:health-check"


@pytest.mark.asyncio
async def test_worker_heartbeat_fails_when_health_key_absent(monkeypatch):
    """No health key means no worker has run within its heartbeat window —
    queued jobs (indexing, exports) would sit forever. Must be a hard fail."""
    fake = _FakeRedis(None)
    monkeypatch.setattr("redis.asyncio.from_url", lambda url: fake)

    result = await check_worker_heartbeat()

    assert result.status == "fail"
    assert "not running" in result.detail
    assert result.remediation is not None
    assert "fly scale count worker=1" in result.remediation
