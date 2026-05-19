"""Schema vs runtime capability-vocabulary parity.

The runtime vocabulary lives in
`backend/app/core/capabilities.py::CAPABILITY_VOCABULARY`. The manifest
schema at `schemas/module.json` lists the same capabilities in TWO
places: plugin-level `capabilities[]` and per-skill
`skills.<slug>.capabilities[]`.

If those drift, a manifest can declare a capability that passes
manifest validation but is never granted at runtime - the exact
doctrine drift the reviewer flagged. This test pins the three lists
together. Update all three or fail the build.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.capabilities import CAPABILITY_VOCABULARY


# Mirror `modules.py`'s schema lookup so this test resolves the file in
# every environment we run: dev container (`/schemas` bind), production
# image (whatever sits next to `app/`), and host workstation. Parents
# index past the test file's depth raise IndexError; guard with try.
def _candidate_paths() -> list[Path]:
    candidates: list[Path] = [Path("/schemas/module.json")]
    here = Path(__file__).resolve()
    for n in (1, 2, 3):
        try:
            candidates.append(here.parents[n] / "schemas" / "module.json")
        except IndexError:
            break
    return candidates


def _schema() -> dict:
    for candidate in _candidate_paths():
        if candidate.exists():
            return json.loads(candidate.read_text(encoding="utf-8"))
    pytest.skip(
        f"schemas/module.json not found in any of: "
        f"{[str(p) for p in _candidate_paths()]}"
    )


def test_plugin_level_capabilities_enum_matches_vocabulary() -> None:
    """`properties.capabilities.items.enum` must equal the runtime set."""
    enum = _schema()["properties"]["capabilities"]["items"]["enum"]
    assert set(enum) == set(CAPABILITY_VOCABULARY), (
        f"plugin-level capability enum drifted from CAPABILITY_VOCABULARY. "
        f"schema-only: {set(enum) - set(CAPABILITY_VOCABULARY)}, "
        f"runtime-only: {set(CAPABILITY_VOCABULARY) - set(enum)}"
    )


def test_per_skill_capabilities_enum_matches_vocabulary() -> None:
    """`properties.skills.patternProperties.*.properties.capabilities.items.enum`
    must equal the runtime set. Per-skill overrides MUST be drawn from
    the same vocabulary as plugin-level declarations."""
    skills = _schema()["properties"]["skills"]["patternProperties"]
    # Single pattern key in v0.1; iterate defensively in case more are
    # added later.
    enums: list[set[str]] = []
    for pattern, spec in skills.items():
        enum = spec["properties"]["capabilities"]["items"]["enum"]
        enums.append(set(enum))

    assert enums, "schema has no per-skill capability enum"
    for e in enums:
        assert e == set(CAPABILITY_VOCABULARY), (
            f"per-skill capability enum drifted from CAPABILITY_VOCABULARY. "
            f"schema-only: {e - set(CAPABILITY_VOCABULARY)}, "
            f"runtime-only: {set(CAPABILITY_VOCABULARY) - e}"
        )
