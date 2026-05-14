"""Demo seed — the Khan v Acme Trading Ltd sample matter.

Idempotent. Called from `main.lifespan` in development environments so the
workspace is never empty on first boot.

The matter narrates a single, coherent unfair-dismissal claim with all the
fields the v0.1 modules need: case theory, pivot fact, parties, computed
ACAS dates, the s.207B "stop the clock" deadline, plus a seeded chronology.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.matter_fs import materialise_matter, append_history, record_document
from app.models import Document, Event, Matter, PRIVILEGE_MIXED, STATUS_OPEN, User


DEMO_USER_EMAIL = "demo@legalise.dev"
DEMO_USER_NAME = "Jasmine K. (demo)"
# `!disabled` password hash matches the migration backfill marker — the demo
# user can't sign in. Dev runs use it solely as the owner of the seeded
# Khan matter. Real-user auto-copy on signup lands as Day D.
DEMO_USER_PASSWORD_HASH = "!disabled"


async def _ensure_demo_user(session: AsyncSession) -> User:
    user = await session.scalar(select(User).where(User.email == DEMO_USER_EMAIL))
    if user is not None:
        return user
    user = User(
        email=DEMO_USER_EMAIL,
        name=DEMO_USER_NAME,
        role="solicitor",
        hashed_password=DEMO_USER_PASSWORD_HASH,
        is_active=False,  # cannot log in
        is_verified=True,
        is_superuser=False,
    )
    session.add(user)
    await session.flush()
    return user


KHAN_SLUG = "khan-v-acme-trading-2026"


KHAN_FACTS = {
    "side": "claimant",
    "proceedings_ref": None,
    "parties": {
        "client": "Jasmine Khan",
        "opposing": ["Acme Trading Ltd"],
    },
    "key_dates": [
        {"label": "EDT (dismissal)", "date": "2026-03-12"},
        {"label": "Continuous service from", "date": "2022-11-08"},
        {"label": "Internal grievance raised", "date": "2026-01-29"},
        {"label": "ACAS Day A", "date": "2026-05-02"},
        {"label": "ACAS Day B", "date": "2026-05-24"},
        {"label": "Latest ET1 by", "date": "2026-07-03"},
    ],
    "computed": {
        "service_years": 3.34,
        "primary_limit": "2026-06-11",
        "stop_the_clock_days": 22,
        "latest_et1": "2026-07-03",
    },
}


KHAN_CASE_THEORY = (
    "Ms Khan was dismissed by Acme Trading Ltd on 12 March 2026, after three years and "
    "four months of continuous service. The stated reason was conduct — a single alleged "
    "breach of the company's social-media policy — but the dismissal followed a "
    "documented grievance Ms Khan had raised six weeks earlier concerning her line "
    "manager's pattern of conduct toward female members of the warehouse team.\n\n"
    "Our case is that the conduct reason is pretextual. The real reason for dismissal "
    "falls within s.103A ERA 1996 (protected disclosure) or, in the alternative, "
    "constitutes victimisation under s.27 Equality Act 2010. The Burchell test fails "
    "on the second and third limbs: the investigator was the manager who was the "
    "subject of Ms Khan's prior grievance, and the sanction sat outside the band of "
    "reasonable responses given a clean disciplinary record and Iceland Frozen Foods "
    "proportionality."
)


KHAN_PIVOT_FACT = (
    "The social-media post the respondent treats as gross misconduct was a private "
    "comment on a personal Instagram account, set to a closed audience of 47 "
    "followers, none of whom were customers, suppliers, or named in the post."
)


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


async def _seed_documents(session: AsyncSession, matter: Matter, user_id) -> dict[str, Document]:
    """Seed two documents on the Khan matter:
      - Dismissal letter, tagged from_disclosure=True (the chronology
        relies on this to trip the CPR 31.22 gate)
      - Witness statement, draft, not from disclosure
    """
    docs: dict[str, Document] = {}

    dismissal = Document(
        matter_id=matter.id,
        filename="khan-dismissal-letter.pdf",
        mime_type="application/pdf",
        size_bytes=412_000,
        sha256=_sha("khan-dismissal-letter:fixture"),
        storage_uri=None,
        tag="disclosure",
        from_disclosure=True,
        disclosure_proceedings_ref="ET case 2406432/2026",
        uploaded_by_id=user_id,
    )
    session.add(dismissal)

    witness = Document(
        matter_id=matter.id,
        filename="witness-statement-khan.docx",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size_bytes=128_000,
        sha256=_sha("witness-statement-khan:fixture"),
        storage_uri=None,
        tag="draft",
        from_disclosure=False,
        uploaded_by_id=user_id,
    )
    session.add(witness)

    await session.flush()
    docs["dismissal"] = dismissal
    docs["witness"] = witness

    for d in (dismissal, witness):
        record_document(
            matter.slug, matter.created_by_id, str(d.id), d.filename, d.sha256, d.size_bytes, d.tag
        )

    return docs


async def _seed_chronology(
    session: AsyncSession,
    matter: Matter,
    user_id,
    docs: dict[str, Document],
) -> None:
    """Seed 7 chronology events for Khan. Significance 1-5. Some carry a
    source_doc_id pointing at the dismissal letter — those are the
    CPR 31.22-tainted entries that trip the gate.
    """
    dismissal_id = docs["dismissal"].id
    witness_id = docs["witness"].id

    fixtures = [
        (date(2022, 11, 8), 3, "Ms Khan begins continuous service at Acme Trading Ltd.", [], False),
        (
            date(2026, 1, 29),
            4,
            "Ms Khan raises internal grievance re: line manager's conduct toward female warehouse staff.",
            [witness_id],
            False,
        ),
        (
            date(2026, 2, 18),
            3,
            "Grievance acknowledged by HR; investigator appointed (same line manager subject of grievance).",
            [],
            False,
        ),
        (
            date(2026, 3, 5),
            3,
            "Personal Instagram post made (private, audience 47, no customers / suppliers named).",
            [],
            False,
        ),
        (
            date(2026, 3, 12),
            5,
            "Acme dismisses Ms Khan citing social-media policy breach. EDT.",
            [dismissal_id],
            False,
        ),
        (date(2026, 5, 2), 4, "ACAS Day A — EC notification submitted.", [], False),
        (date(2026, 5, 24), 4, "ACAS Day B — EC certificate issued.", [], False),
    ]

    for event_date, sig, desc, sources, priv in fixtures:
        session.add(
            Event(
                matter_id=matter.id,
                event_date=event_date,
                description=desc,
                significance=sig,
                source_doc_ids=sources,
                priv_flag=priv,
                created_by_id=user_id,
            )
        )

    await session.flush()


async def seed_demo_matter(session: AsyncSession) -> Matter:
    """Create the Khan sample matter, its two seed documents, and its
    seven chronology events. Idempotent: existing matter is left alone
    (no duplicate docs/events) and re-materialised so disk reflects DB.
    """
    user = await _ensure_demo_user(session)
    existing = await session.scalar(
        select(Matter).where(Matter.slug == KHAN_SLUG, Matter.created_by_id == user.id)
    )
    if existing is not None:
        materialise_matter(existing)
        return existing

    matter = Matter(
        slug=KHAN_SLUG,
        title="Khan v Acme Trading Ltd",
        matter_type="employment_tribunal",
        cause="s.94 ERA 1996, unfair dismissal",
        status=STATUS_OPEN,
        case_theory=KHAN_CASE_THEORY,
        pivot_fact=KHAN_PIVOT_FACT,
        privilege_posture=PRIVILEGE_MIXED,
        default_model_id="claude-opus-4-7",
        facts=KHAN_FACTS,
        opened_at=datetime(2026, 5, 12, 15, 45, 8, tzinfo=timezone.utc),
        retention_until=date(2032, 7, 3),
        created_by_id=user.id,
    )
    session.add(matter)
    await session.flush()

    docs = await _seed_documents(session, matter, user.id)
    await _seed_chronology(session, matter, user.id, docs)

    materialise_matter(matter)
    append_history(matter.slug, user.id, "matter.seeded", "Khan v Acme demo matter inserted")
    append_history(
        matter.slug,
        user.id,
        "chronology.seeded",
        f"{2} documents + 7 events; 1 disclosure-tainted (dismissal letter)",
    )

    await session.commit()
    await session.refresh(matter)
    return matter
