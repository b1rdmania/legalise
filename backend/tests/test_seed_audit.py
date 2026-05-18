"""Bootstrap audit rows on per-user demo seed.

A freshly-seeded Khan matter must populate the Audit tab on first
paint. The reviewer's doctrine: rows are system-actor (actor_id is
None) and payload kind is "seed" so the audit log remains truthful
about what the user did vs what was bootstrapped on their behalf.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date
from typing import Any

from app.core.seed import _write_seed_audit_rows
from app.models import AuditEntry


class _CapturingSession:
    """Async-session stand-in. Records `session.add()` payloads."""

    def __init__(self) -> None:
        self.added: list[Any] = []

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        return None


class _Doc:
    def __init__(self, filename: str) -> None:
        self.id = uuid.uuid4()
        self.filename = filename


class _Event:
    def __init__(self, event_date: date) -> None:
        self.id = uuid.uuid4()
        self.event_date = event_date


class _Matter:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.slug = "khan-v-acme-trading-2026"


def _run(coro):
    return asyncio.run(coro)


def _added_audit_rows(session: _CapturingSession) -> list[AuditEntry]:
    return [obj for obj in session.added if isinstance(obj, AuditEntry)]


class TestSeedAuditBootstrap:
    """`_write_seed_audit_rows` writes the right shape per resource."""

    def test_writes_one_matter_row_plus_one_per_doc_and_event(self) -> None:
        session = _CapturingSession()
        matter = _Matter()
        docs = {
            "dismissal": _Doc("khan-dismissal-letter.pdf"),
            "witness": _Doc("witness-statement-khan.docx"),
            "nda": _Doc("synthetic-mutual-nda.docx"),
        }
        events = [_Event(date(2026, 1, 29)), _Event(date(2026, 3, 12))]

        _run(_write_seed_audit_rows(session, matter, docs, events))

        rows = _added_audit_rows(session)
        # 1 matter + 3 docs + 2 events
        assert len(rows) == 1 + len(docs) + len(events)

    def test_every_row_is_system_actor_with_seed_payload(self) -> None:
        session = _CapturingSession()
        matter = _Matter()
        docs = {"d": _Doc("a.pdf")}
        events = [_Event(date(2026, 5, 2))]

        _run(_write_seed_audit_rows(session, matter, docs, events))

        rows = _added_audit_rows(session)
        for row in rows:
            assert row.actor_id is None, (
                f"row {row.action!r} has actor_id={row.actor_id}; "
                "seed rows must be system-actor (None)"
            )
            assert row.module == "seed"
            assert row.matter_id == matter.id
            assert row.payload.get("actor") == "system.bootstrap"
            assert row.payload.get("kind") == "seed"

    def test_action_namespace_is_seed_dotted(self) -> None:
        session = _CapturingSession()
        matter = _Matter()
        docs = {"d": _Doc("a.pdf")}
        events = [_Event(date(2026, 5, 2))]

        _run(_write_seed_audit_rows(session, matter, docs, events))

        actions = {row.action for row in _added_audit_rows(session)}
        assert actions == {
            "seed.matter.created",
            "seed.document.ingested",
            "seed.chronology.ingested",
        }

    def test_resource_ids_resolve_to_seeded_objects(self) -> None:
        session = _CapturingSession()
        matter = _Matter()
        doc = _Doc("witness.docx")
        event = _Event(date(2026, 3, 12))

        _run(_write_seed_audit_rows(session, matter, {"w": doc}, [event]))

        by_action = {row.action: row for row in _added_audit_rows(session)}
        assert by_action["seed.matter.created"].resource_id == str(matter.id)
        assert by_action["seed.document.ingested"].resource_id == str(doc.id)
        assert by_action["seed.chronology.ingested"].resource_id == str(event.id)
