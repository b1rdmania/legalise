"""Matter filesystem materialisation.

Each matter is mirrored to disk under `settings.matters_root/[slug]/`:

    matter.md          — YAML frontmatter (slug, parties, key dates, posture)
                         + markdown body (case theory, pivot fact).
    history.md         — append-only internal log. Every materialise call
                         and every domain event appends one line.
    chronology.md      — seeded chronology fixture. v0.1 hand-written, v0.2
                         lifts to live extraction.
    documents/         — uploaded files (placeholder names in v0.1; binary
                         storage upgrade lives behind the same path).

The schema deliberately matches the Stella matter folder convention
(`schemas/matter.json`) so a matter can move between workspaces without
translation.

This module is the only writer of files under `matters_root`. Callers
invoke `materialise_matter` on create and `append_history` on subsequent
events; binary document writes are stretch (Week 1 Day 5+).
"""

from __future__ import annotations

import os
from datetime import datetime, date
from pathlib import Path

from app.core.config import settings
from app.models import Matter


def _matters_root() -> Path:
    root = Path(settings.matters_root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def matter_dir(slug: str) -> Path:
    d = _matters_root() / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "documents").mkdir(exist_ok=True)
    return d


def _yaml_value(v: object) -> str:
    if v is None:
        return "null"
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    # String — quote if it contains anything that could confuse a YAML parser.
    s = str(v)
    if any(ch in s for ch in ":#\n\"'") or s.strip() != s:
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return s


def _emit(lines: list[str], key: str, value: object, indent: int) -> None:
    pad = "  " * indent
    if isinstance(value, list):
        if not value:
            lines.append(f"{pad}{key}: []")
            return
        lines.append(f"{pad}{key}:")
        for item in value:
            if isinstance(item, dict):
                first = True
                for ik, iv in item.items():
                    prefix = f"{pad}  - " if first else f"{pad}    "
                    if isinstance(iv, (list, dict)):
                        lines.append(f"{prefix}{ik}:")
                        _emit_value(lines, iv, indent + 2)
                    else:
                        lines.append(f"{prefix}{ik}: {_yaml_value(iv)}")
                    first = False
            else:
                lines.append(f"{pad}  - {_yaml_value(item)}")
    elif isinstance(value, dict):
        lines.append(f"{pad}{key}:")
        for ik, iv in value.items():
            _emit(lines, ik, iv, indent + 1)
    else:
        lines.append(f"{pad}{key}: {_yaml_value(value)}")


def _emit_value(lines: list[str], value: object, indent: int) -> None:
    pad = "  " * indent
    if isinstance(value, list):
        for item in value:
            lines.append(f"{pad}- {_yaml_value(item)}")
    elif isinstance(value, dict):
        for ik, iv in value.items():
            _emit(lines, ik, iv, indent)


def _yaml_frontmatter(fields: dict) -> str:
    lines = ["---"]
    for k, v in fields.items():
        _emit(lines, k, v, 0)
    lines.append("---")
    return "\n".join(lines) + "\n"


def materialise_matter(matter: Matter) -> Path:
    """Write `matter.md` to disk for `matter`. Idempotent — overwrites.

    Returns the path to the matter directory.
    """
    d = matter_dir(matter.slug)

    facts = matter.facts or {}
    key_dates = facts.get("key_dates", [])
    parties = facts.get("parties") or {}

    frontmatter = {
        "slug": matter.slug,
        "title": matter.title,
        "matter_type": matter.matter_type,
        "cause": matter.cause,
        "status": matter.status,
        "privilege_posture": matter.privilege_posture,
        "default_model_id": matter.default_model_id,
        "opened_at": matter.opened_at.date() if matter.opened_at else None,
        "closed_at": matter.closed_at.date() if matter.closed_at else None,
        "retention_until": matter.retention_until,
        "side": facts.get("side"),
        "proceedings_ref": facts.get("proceedings_ref"),
        "parties": parties,
        "key_dates": key_dates,
    }

    body_parts = [_yaml_frontmatter(frontmatter)]
    body_parts.append(f"# {matter.title}\n\n")

    if matter.case_theory:
        body_parts.append("## Case theory\n\n")
        body_parts.append(matter.case_theory.strip() + "\n\n")
    if matter.pivot_fact:
        body_parts.append("## Pivot fact\n\n")
        body_parts.append(matter.pivot_fact.strip() + "\n\n")

    (d / "matter.md").write_text("".join(body_parts), encoding="utf-8")

    append_history(matter.slug, "matter.materialised", f"matter.md written ({len(facts)} fact keys)")

    # Seed chronology placeholder if absent.
    chron = d / "chronology.md"
    if not chron.exists():
        chron.write_text(
            f"# Chronology — {matter.title}\n\n"
            "Seeded fixture. Live extraction lands v0.2.\n\n"
            "| Date | Event | Source | Significance |\n"
            "|------|-------|--------|--------------|\n",
            encoding="utf-8",
        )

    return d


def append_history(slug: str, event: str, detail: str | None = None) -> None:
    """Append a line to `matters/[slug]/history.md`. Creates file if absent."""
    d = matter_dir(slug)
    line = f"- {datetime.utcnow().isoformat(timespec='seconds')}Z  {event}"
    if detail:
        line += f"  —  {detail}"
    line += "\n"

    hist = d / "history.md"
    if not hist.exists():
        hist.write_text(f"# History — {slug}\n\n", encoding="utf-8")
    with hist.open("a", encoding="utf-8") as f:
        f.write(line)


def record_document(slug: str, filename: str, sha256: str, size: int, tag: str | None) -> None:
    """Record a document arrival in the matter history and write a stub
    placeholder file under `documents/` so the folder structure mirrors the
    domain even when the binary store hasn't landed yet."""
    d = matter_dir(slug)
    placeholder = d / "documents" / f"{filename}.meta"
    placeholder.write_text(
        f"filename: {filename}\nsha256: {sha256}\nsize_bytes: {size}\ntag: {tag or ''}\n",
        encoding="utf-8",
    )
    append_history(slug, "document.registered", f"{filename}  sha256={sha256[:12]}  size={size}")


__all__ = ["matter_dir", "materialise_matter", "append_history", "record_document"]
