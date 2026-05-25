"""Phase 5 Step 0 — carry-over tidy regressions.

Three things this file guards against:

1. `CeremonyState.DEPENDENCY_MISSING` is dead — removing it from the
   enum means it should not appear in the public surface (enum
   members, terminal-failure set, audit-action mapping, API response
   model). Test pins the removal so it cannot creep back via a
   future copy-paste.

2. ``datetime.utcnow()`` is deprecated in Python 3.12+. Phase 5
   swept the codebase to ``datetime.now(UTC)``. Test scans the
   tree and fails if any new usage lands.

3. FastAPI 1.x renamed ``HTTP_422_UNPROCESSABLE_ENTITY`` to
   ``HTTP_422_UNPROCESSABLE_CONTENT``. Test scans for the old name
   under ``backend/app`` (tests may still reference the deprecated
   name for historical reasons).
"""

from __future__ import annotations

import re
from pathlib import Path

from app.core.trust_ceremony import CeremonyState


REPO_ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = REPO_ROOT / "backend" / "app"


def test_dependency_missing_removed_from_enum() -> None:
    """CeremonyState no longer carries DEPENDENCY_MISSING."""
    members = {m.name for m in CeremonyState}
    assert "DEPENDENCY_MISSING" not in members, (
        "DEPENDENCY_MISSING was removed in Phase 5 Step 0 — see "
        "PHASE_5_BUILD_PLAN_V3.md. Phase 4 returns 422 BEFORE start_ceremony, "
        "so the state machine has no path to this terminal."
    )
    values = {m.value for m in CeremonyState}
    assert "dependency_missing" not in values


def test_dependency_missing_not_in_terminal_failures() -> None:
    """The terminal-failures frozenset does not carry the dead state."""
    from app.core.trust_ceremony import _TERMINAL_FAILURES

    assert all(
        m.value != "dependency_missing" for m in _TERMINAL_FAILURES
    )


def test_no_datetime_utcnow_in_app() -> None:
    """No ``datetime.utcnow()`` left under ``backend/app/``.

    The deprecation warning at runtime is ugly and the timezone-naive
    return value risks silent UTC bugs as model defaults move through
    SQLAlchemy. Phase 5 swept this to ``datetime.now(UTC)`` everywhere.
    """
    offenders: list[str] = []
    pattern = re.compile(r"\bdatetime\.utcnow\s*\(")
    for py in APP_ROOT.rglob("*.py"):
        if pattern.search(py.read_text(encoding="utf-8")):
            offenders.append(str(py.relative_to(REPO_ROOT)))
    assert not offenders, (
        f"Found {len(offenders)} files still using datetime.utcnow():\n  "
        + "\n  ".join(offenders)
    )


def test_no_http_422_unprocessable_entity_in_app() -> None:
    """No ``HTTP_422_UNPROCESSABLE_ENTITY`` left under ``backend/app/``.

    FastAPI 1.x renamed it to ``HTTP_422_UNPROCESSABLE_CONTENT``.
    """
    offenders: list[str] = []
    needle = "HTTP_422_UNPROCESSABLE_ENTITY"
    for py in APP_ROOT.rglob("*.py"):
        if needle in py.read_text(encoding="utf-8"):
            offenders.append(str(py.relative_to(REPO_ROOT)))
    assert not offenders, (
        f"Found {len(offenders)} files still using {needle}:\n  "
        + "\n  ".join(offenders)
    )
