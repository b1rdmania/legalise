"""Bootstrap audit-row seeding for the Khan demo matter.

The Audit tab must be non-empty on first paint. `seed.py` writes three
action types under doctrine `actor_id=None`, `module="seed"`,
`payload={"actor": "system.bootstrap", "kind": "seed", ...}`:

  - seed.matter.created          (1 row per matter)
  - seed.document.ingested       (1 row per seeded document)
  - seed.chronology.ingested     (1 row per seeded chronology event)

Two invariants pinned here:
  1. Re-running the seed on the same user does NOT duplicate rows.
  2. Upgrade path: a matter that exists but has no bootstrap audit rows
     (registered before P1 landed) gets backfilled on next seed call.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from app.core import seed as seed_module
from app.core.seed import (
    SEED_ACTION_CHRONOLOGY,
    SEED_ACTION_DOCUMENT,
    SEED_ACTION_MATTER,
    SEED_AUDIT_MODULE,
    KHAN_SLUG,
    _seed_audit_rows_present,
    _write_seed_audit_rows,
    seed_demo_matter_for_user,
)
from app.models import (
    AuditEntry,
    Document,
    Event,
    InstalledModule,
    Matter,
    WorkspaceSkillCapabilityGrant,
)


def _fake_matter(user_id: uuid.UUID) -> Matter:
    m = Matter(
        slug=KHAN_SLUG,
        title="Khan v Acme Trading Ltd",
        matter_type="employment_tribunal",
        cause="s.94 ERA 1996, unfair dismissal",
        status="open",
        privilege_posture="mixed",
        default_model_id="claude-opus-4-7",
        facts={},
        opened_at=datetime(2026, 5, 12, 15, 45, 8, tzinfo=timezone.utc),
        retention_until=date(2032, 7, 3),
        created_by_id=user_id,
    )
    m.id = uuid.uuid4()
    return m


def _fake_doc(matter_id: uuid.UUID, filename: str, tag: str) -> Document:
    d = Document(
        matter_id=matter_id,
        filename=filename,
        mime_type="application/pdf",
        size_bytes=1000,
        sha256="0" * 64,
        storage_uri=None,
        tag=tag,
        from_disclosure=False,
        uploaded_by_id=None,
    )
    d.id = uuid.uuid4()
    return d


def _fake_event(matter_id: uuid.UUID, day: int, sig: int) -> Event:
    e = Event(
        matter_id=matter_id,
        event_date=date(2026, 3, day),
        description="fixture",
        significance=sig,
        source_doc_ids=[],
        priv_flag=False,
        created_by_id=None,
    )
    e.id = uuid.uuid4()
    return e


class _StubSession:
    """In-memory async session stand-in.

    Tracks `session.add()` calls. `scalar`/`scalars` are dispatched off the
    statement's target table so the seed function's queries land on the
    right list. Pre-populated rows simulate the "matter exists" branch.
    """

    def __init__(
        self,
        matters: list[Matter] | None = None,
        documents: list[Document] | None = None,
        events: list[Event] | None = None,
        audit_entries: list[AuditEntry] | None = None,
        installed_modules: list[InstalledModule] | None = None,
        grants: list[WorkspaceSkillCapabilityGrant] | None = None,
    ) -> None:
        self.matters: list[Matter] = list(matters or [])
        self.documents: list[Document] = list(documents or [])
        self.events: list[Event] = list(events or [])
        self.audit_entries: list[AuditEntry] = list(audit_entries or [])
        self.installed_modules: list[InstalledModule] = list(installed_modules or [])
        self.grants: list[WorkspaceSkillCapabilityGrant] = list(grants or [])
        self.added: list = []
        self.commits = 0

    def _bucket_for(self, obj):
        if isinstance(obj, AuditEntry):
            return self.audit_entries
        if isinstance(obj, Document):
            return self.documents
        if isinstance(obj, Event):
            return self.events
        if isinstance(obj, Matter):
            return self.matters
        if isinstance(obj, InstalledModule):
            return self.installed_modules
        if isinstance(obj, WorkspaceSkillCapabilityGrant):
            return self.grants
        return None

    def add(self, obj) -> None:
        self.added.append(obj)
        bucket = self._bucket_for(obj)
        if bucket is not None and obj not in bucket:
            # Assign an id on flush-like add for rows that need one.
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            bucket.append(obj)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, obj) -> None:
        return None

    async def scalar(self, stmt):
        # Inspect the FROM target table name and return a single match.
        target = self._target_name(stmt)
        if target == "matters":
            return self.matters[0] if self.matters else None
        if target == "document_bodies":
            return None  # always trigger insert path
        if target == "document_versions":
            return None
        if target == "audit_entries":
            # Used by _seed_audit_rows_present
            return next(
                (
                    a.id
                    for a in self.audit_entries
                    if a.action == SEED_ACTION_MATTER
                ),
                None,
            )
        if target == "installed_modules":
            module_id = self._param(stmt, "module_id")
            return next(
                (
                    m
                    for m in self.installed_modules
                    if module_id is None or m.module_id == module_id
                ),
                None,
            )
        if target == "workspace_skill_capability_grants":
            user_id = self._param(stmt, "user_id")
            plugin = self._param(stmt, "plugin")
            skill = self._param(stmt, "skill")
            capability = self._param(stmt, "capability")
            scope_type = self._param(stmt, "scope_type")
            scope_id = self._param(stmt, "scope_id")
            return next(
                (
                    g
                    for g in self.grants
                    if (user_id is None or g.user_id == user_id)
                    and (plugin is None or g.plugin == plugin)
                    and (skill is None or g.skill == skill)
                    and (capability is None or g.capability == capability)
                    and (scope_type is None or g.scope_type == scope_type)
                    and (scope_id is None or g.scope_id == scope_id)
                ),
                None,
            )
        return None

    async def scalars(self, stmt):
        target = self._target_name(stmt)
        if target == "documents":
            rows = list(self.documents)
        elif target == "events":
            rows = list(self.events)
        elif target == "audit_entries":
            rows = list(self.audit_entries)
        else:
            rows = []
        return SimpleNamespace(all=lambda: rows)

    @staticmethod
    def _target_name(stmt) -> str:
        # `select(Model)` → froms[0].name; `select(Model.col)` → also resolves.
        try:
            froms = stmt.get_final_froms()
            return froms[0].name
        except Exception:
            return ""

    @staticmethod
    def _param(stmt, name: str):
        try:
            params = stmt.compile().params
        except Exception:
            return None
        for key, value in params.items():
            if key == name or key.startswith(f"{name}_"):
                return value
        return None


@pytest.fixture(autouse=True)
def _silence_matter_fs(monkeypatch, tmp_path):
    """Stub the disk-touching helpers imported into seed's namespace so
    the FS side-effects don't leak into the dev workspace during tests.
    """
    monkeypatch.setattr(seed_module, "materialise_matter", lambda m: tmp_path)
    monkeypatch.setattr(seed_module, "append_history", lambda *a, **k: None)
    monkeypatch.setattr(seed_module, "record_document", lambda *a, **k: None)


class TestWriteSeedAuditRows:
    @pytest.mark.asyncio
    async def test_emits_doctrine_compliant_rows(self) -> None:
        user_id = uuid.uuid4()
        matter = _fake_matter(user_id)
        docs = [
            _fake_doc(matter.id, "a.pdf", "disclosure"),
            _fake_doc(matter.id, "b.docx", "draft"),
        ]
        events = [_fake_event(matter.id, 12, 5), _fake_event(matter.id, 13, 3)]
        session = _StubSession()

        await _write_seed_audit_rows(session, matter, docs, events)

        rows = [a for a in session.added if isinstance(a, AuditEntry)]
        assert len(rows) == 1 + len(docs) + len(events)
        for r in rows:
            assert r.actor_id is None
            assert r.module == SEED_AUDIT_MODULE
            assert r.payload["actor"] == "system.bootstrap"
            assert r.payload["kind"] == "seed"
            assert r.matter_id == matter.id

        actions = [r.action for r in rows]
        assert actions.count(SEED_ACTION_MATTER) == 1
        assert actions.count(SEED_ACTION_DOCUMENT) == len(docs)
        assert actions.count(SEED_ACTION_CHRONOLOGY) == len(events)

    @pytest.mark.asyncio
    async def test_presence_check_detects_existing_bootstrap(self) -> None:
        user_id = uuid.uuid4()
        matter = _fake_matter(user_id)
        session = _StubSession()
        assert await _seed_audit_rows_present(session, matter.id) is False

        await _write_seed_audit_rows(session, matter, [], [])
        assert await _seed_audit_rows_present(session, matter.id) is True


class TestSeedDemoMatterForUserIdempotency:
    @pytest.mark.asyncio
    async def test_second_call_does_not_duplicate_audit_rows(self) -> None:
        """First call writes bootstrap rows and demo grants. Second call
        sees both already exist and writes no duplicate audit rows."""
        user = SimpleNamespace(id=uuid.uuid4())
        session = _StubSession()

        await seed_demo_matter_for_user(session, user)
        first_count = len(session.audit_entries)
        bootstrap_rows = [
            a for a in session.audit_entries if a.module == SEED_AUDIT_MODULE
        ]
        grant_rows = [
            a for a in session.audit_entries if a.action == "module.grant.created"
        ]
        # 1 matter + 3 docs + 7 events = 11 bootstrap rows. The demo
        # V2 skill grants are legitimate non-bootstrap rows.
        assert len(bootstrap_rows) == 11
        assert len(grant_rows) == 2

        await seed_demo_matter_for_user(session, user)
        assert len(session.audit_entries) == first_count
        assert len(session.grants) == 2

    @pytest.mark.asyncio
    async def test_upgrade_path_backfills_when_matter_exists_without_audit_rows(
        self,
    ) -> None:
        """Matter pre-exists but no seed.matter.created row is present.
        The idempotent branch must detect the gap and write the rows."""
        user = SimpleNamespace(id=uuid.uuid4())
        existing = _fake_matter(user.id)
        # Pre-populate three docs and seven events to mirror current seed.
        docs = [
            _fake_doc(existing.id, "khan-dismissal-letter.pdf", "disclosure"),
            _fake_doc(existing.id, "witness-statement-khan.docx", "draft"),
            _fake_doc(existing.id, "synthetic-mutual-nda.docx", "contract"),
        ]
        events = [_fake_event(existing.id, d, 3) for d in range(1, 8)]
        session = _StubSession(
            matters=[existing], documents=docs, events=events, audit_entries=[]
        )

        assert await _seed_audit_rows_present(session, existing.id) is False
        await seed_demo_matter_for_user(session, user)

        assert await _seed_audit_rows_present(session, existing.id) is True
        # 1 matter + 3 docs + 7 events
        bootstrap_rows = [
            a
            for a in session.audit_entries
            if a.module == SEED_AUDIT_MODULE
        ]
        assert len(bootstrap_rows) == 11
