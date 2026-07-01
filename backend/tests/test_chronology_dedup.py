"""Chronology build dedup — a re-run must not re-propose events the matter
already has (the "build again -> duplicate events" bug).
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.models import Matter, User
from app.modules.chronology.build import build_chronology

KHAN = "khan-v-acme-trading-2026"
EMAIL = "chron-dedup@example.com"
PASSWORD = "chron-dedup-password-2026"


class _FakeResult:
    def __init__(self, text: str) -> None:
        self.text = text
        self.token_count = 0


class _FakeGateway:
    """Returns a fixed extraction envelope; no model call, no audit."""

    def __init__(self, envelope: dict) -> None:
        self._text = json.dumps(envelope)

    async def call(self, **kwargs) -> _FakeResult:  # noqa: ANN003
        return _FakeResult(self._text)


@pytest.mark.asyncio
async def test_rebuild_skips_duplicate_events(client, db_session) -> None:
    reg = await client.post(
        "/auth/register", json={"email": EMAIL, "password": PASSWORD}
    )
    assert reg.status_code == 201, reg.text

    user = await db_session.scalar(select(User).where(User.email == EMAIL))
    matter = await db_session.scalar(
        select(Matter).where(
            Matter.slug == KHAN, Matter.created_by_id == user.id
        )
    )
    assert matter is not None

    envelope = {
        "events": [
            {"event_date": "2026-02-01", "description": "Fake dedup event one",
             "source_document_id": None},
            {"event_date": "2026-02-02", "description": "Fake dedup event two",
             "source_document_id": None},
        ]
    }
    gw = _FakeGateway(envelope)

    # First build: both events are new.
    first = await build_chronology(
        session=db_session, matter=matter, actor=user, gateway=gw
    )
    assert len(first.events) == 2
    assert first.duplicates_skipped == 0

    # Second build, same envelope: nothing new, both recognised as duplicates.
    second = await build_chronology(
        session=db_session, matter=matter, actor=user, gateway=gw
    )
    assert second.events == []
    assert second.duplicates_skipped == 2
