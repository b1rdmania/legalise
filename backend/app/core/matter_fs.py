"""Matter filesystem materialisation.

Each matter is mirrored to disk under `settings.matters_root/[slug]/`:

    matter.md          — YAML frontmatter (slug, parties, key dates, posture)
                         + markdown body (case theory, pivot fact).
    history.md         — append-only internal log. Every materialise call
                         and every domain event appends one line.
    chronology.md      — written once on matter creation and never updated
                         after. The real chronology is extracted events in
                         the database (`app.modules.chronology.build`); this
                         file is a static disk mirror, not a live view.
    documents/         — one `.meta` sidecar per document under this path;
                         binary bytes live in the configured storage backend
                         (`app.core.storage`), not here.

The schema deliberately matches the Stella matter folder convention
(`schemas/matter.json`) so a matter can move between workspaces without
translation.

This module is the only writer of files under `matters_root`. Callers
invoke `materialise_matter` on create and `append_history` on subsequent
events.
"""

from __future__ import annotations

import os
from datetime import datetime, date, UTC
from pathlib import Path

import yaml

from app.core.config import settings
from app.models import Matter


def _matters_root() -> Path:
    root = Path(settings.matters_root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _user_shard(user_id) -> str:
    """12-char hex prefix of the user UUID. Stable across runs; collision
    space at v0.1 scale is irrelevant."""
    return str(user_id).replace("-", "")[:12]


def matter_dir(slug: str, user_id) -> Path:
    """Per-owner sharded matter directory: `matters/{user-shard}/{slug}/`.

    Slug uniqueness is per-owner so two users can each hold
    `khan-v-acme-trading-2026` without colliding on disk.
    """
    d = _matters_root() / _user_shard(user_id) / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "documents").mkdir(exist_ok=True)
    return d


def _coerce_for_yaml(value: object) -> object:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _coerce_for_yaml(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_coerce_for_yaml(v) for v in value]
    return value


def _yaml_frontmatter(fields: dict) -> str:
    payload = {k: _coerce_for_yaml(v) for k, v in fields.items()}
    dumped = yaml.safe_dump(payload, sort_keys=False, allow_unicode=True, default_flow_style=False)
    return f"---\n{dumped}---\n"


def materialise_matter(matter: Matter) -> Path:
    """Write `matter.md` to disk for `matter`. Idempotent — overwrites.

    Returns the path to the matter directory.
    """
    d = matter_dir(matter.slug, matter.created_by_id)

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

    append_history(
        matter.slug,
        matter.created_by_id,
        "matter.materialised",
        f"matter.md written ({len(facts)} fact keys)",
    )

    # Seed chronology placeholder if absent.
    chron = d / "chronology.md"
    if not chron.exists():
        chron.write_text(
            f"# Chronology — {matter.title}\n\n"
            "Static disk mirror, written once. The live chronology is "
            "extracted events in the database — see the Chronology tab.\n\n"
            "| Date | Event | Source | Significance |\n"
            "|------|-------|--------|--------------|\n",
            encoding="utf-8",
        )

    return d


def append_history(slug: str, user_id, event: str, detail: str | None = None) -> None:
    """Append a line to `matters/{user-shard}/{slug}/history.md`. Creates file if absent."""
    d = matter_dir(slug, user_id)
    line = f"- {datetime.now(UTC).isoformat(timespec='seconds')}Z  {event}"
    if detail:
        line += f"  —  {detail}"
    line += "\n"

    hist = d / "history.md"
    if not hist.exists():
        hist.write_text(f"# History — {slug}\n\n", encoding="utf-8")
    with hist.open("a", encoding="utf-8") as f:
        f.write(line)


def record_document(
    slug: str,
    user_id,
    document_id: str,
    filename: str,
    sha256: str,
    size: int,
    tag: str | None,
) -> None:
    """Record a document arrival in the matter history and write a metadata
    sidecar under `documents/` so the on-disk folder structure mirrors the
    domain. Binary bytes live in the configured storage backend
    (`app.core.storage`), not in this file.

    The metadata file is named by the document's primary key — never by the
    user-supplied filename — so attacker-controlled filenames cannot escape
    the matter's documents directory or overwrite siblings. The original
    filename is preserved inside the file.
    """
    d = matter_dir(slug, user_id)
    docs_dir = (d / "documents").resolve()
    # `document_id` is a UUID we generated; safe by construction. Still
    # bound-check the resolved path stays under documents_dir as a
    # belt-and-braces guard against future ID-format changes.
    placeholder = (docs_dir / f"{document_id}.meta").resolve()
    if not str(placeholder).startswith(str(docs_dir) + os.sep):
        raise ValueError(f"refusing to write document meta outside matter dir: {placeholder}")

    placeholder.write_text(
        f"document_id: {document_id}\n"
        f"filename: {filename}\n"
        f"sha256: {sha256}\n"
        f"size_bytes: {size}\n"
        f"tag: {tag or ''}\n",
        encoding="utf-8",
    )
    append_history(
        slug,
        user_id,
        "document.registered",
        f"{filename}  id={document_id}  sha256={sha256[:12]}  size={size}",
    )


__all__ = [
    "matter_dir",
    "materialise_matter",
    "append_history",
    "record_document",
]
