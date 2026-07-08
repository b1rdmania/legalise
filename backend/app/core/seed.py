"""Demo seed — the Khan v Acme Trading Ltd sample matter.

Idempotent. Two call paths:

1. **Dev/demo boot** — `main.lifespan` calls `seed_demo_matter()` (no user
   arg). The function provisions a locked-out `demo@legalise.dev` row and
   seeds Khan under it so the workspace is never empty on first boot.

2. **Per-user signup (Day D)** — `core.auth.UserManager.on_after_verify`
   calls `seed_demo_matter_for_user(session, user)` so every newly verified
   account lands in a workspace with a working Khan matter. Slug tenancy
   is Option A (per Day A.5): `khan-v-acme-trading-2026` is shared across
   users, scoped by `created_by_id`. Each user gets their own row +
   filesystem materialisation.

The matter narrates a single, coherent unfair-dismissal claim with all the
fields the v0.1 modules need: case theory, pivot fact, parties, computed
ACAS dates, the s.207B "stop the clock" deadline, plus a seeded chronology.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.matter_fs import materialise_matter, append_history, record_document
from app.models import AuditEntry, Document, Event, Matter, PRIVILEGE_MIXED, STATUS_OPEN, User
from app.models.document_body import DocumentBody, BODY_KIND_EXTRACTED
from app.models.document_version import DocumentVersion, VERSION_KIND_UPLOAD

logger = logging.getLogger(__name__)


# Doctrine for seed-bootstrap audit rows. Locked. Three action types,
# one module name, a system actor (actor_id=None), payload always carries
# {"actor": "system.bootstrap", "kind": "seed", ...}. Keeps the Audit tab
# non-empty on first paint without faking a real user.
SEED_AUDIT_MODULE = "seed"
SEED_ACTION_MATTER = "seed.matter.created"
SEED_ACTION_DOCUMENT = "seed.document.ingested"
SEED_ACTION_CHRONOLOGY = "seed.chronology.ingested"


KHAN_DISMISSAL_BODY = """Acme Trading Ltd
Warehouse 4, Lockwood Industrial Estate
Bradford, BD12 9XX

12 March 2026

Ms Jasmine Khan
[address redacted]

Dear Ms Khan,

Re: Termination of Employment

Further to the disciplinary hearing held on 10 March 2026, we write to
confirm that your employment with Acme Trading Ltd is terminated with
immediate effect on grounds of gross misconduct.

The conduct found by the panel concerns a social-media post made on
your personal Instagram account on 5 March 2026. The panel concluded
that the post breached clause 7.3 of the Acme Social Media Policy
(October 2024) and brought the company into disrepute, notwithstanding
the post being made outside working hours and from a personal device.

You will be paid in lieu of notice for the four-week notice period
required under your contract of employment. Accrued but untaken
holiday will be paid alongside your final salary in the next pay run.

You have the right to appeal this decision. Any appeal must be lodged
in writing within five working days of the date of this letter and
addressed to Mr R. Holland, Operations Director.

Yours sincerely,

M. Whitford
HR Manager
Acme Trading Ltd
"""


KHAN_WITNESS_BODY = """IN THE EMPLOYMENT TRIBUNAL
BETWEEN:
              JASMINE KHAN                              Claimant
                  - and -
        ACME TRADING LTD                              Respondent

WITNESS STATEMENT OF JASMINE KHAN (DRAFT)

I, Jasmine Khan, of [address], will say as follows:

1. I am the Claimant in this matter. I make this statement from
   my own knowledge save where otherwise indicated.

2. I commenced employment with the Respondent as a Warehouse
   Supervisor on 8 November 2022. I worked at the Bradford depot
   until my dismissal on 12 March 2026, a period of three years
   and four months of continuous service. Throughout that time
   I had no disciplinary record.

3. On 29 January 2026 I raised a formal grievance with HR
   concerning the conduct of my line manager, Mr D. Caldwell,
   toward several female members of the warehouse team. The
   grievance described a pattern of comments and physical
   gestures over the preceding six months. Two of the colleagues
   referenced have indicated they would give evidence if asked.

4. The grievance was acknowledged by HR on 18 February 2026.
   I was informed that the investigator appointed would be Mr
   Caldwell himself, in his capacity as senior warehouse manager.
   I objected to this in writing on 19 February but received no
   response.

5. On 5 March 2026 I posted on my personal Instagram account, set
   to a closed audience of 47 followers, a single sentence
   expressing frustration with how the grievance was being handled.
   The post did not name any colleague, customer, supplier, or
   the Respondent.

6. On 10 March 2026 I was called to a disciplinary hearing chaired
   by Mr Caldwell. The hearing addressed the Instagram post. I
   was not given prior sight of the screenshots relied on. The
   panel's decision was communicated by letter on 12 March 2026
   (the dismissal letter at exhibit JK1).

7. I will give further evidence at hearing as to the surrounding
   facts and the impact of the dismissal.

[draft — for review with solicitor before signature]
"""


KHAN_NDA_BODY = """[Draft Mutual NDA — synthetic fixture for Legalise demo]

MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is entered into as of 1 May 2026 between:

(1) ACME TRADING LTD, a company incorporated in England & Wales
    (company number 09384721), whose registered office is at
    Warehouse 4, Lockwood Industrial Estate, Bradford, BD12 9XX
    ("Acme"); and

(2) NORTH MILL CONSULTING LIMITED, a company incorporated in
    England & Wales (company number 12992014), whose registered
    office is at 7 Croft Street, Leeds, LS2 7BL ("North Mill"),

(each a "Party" and together the "Parties").

1. PURPOSE

1.1 The Parties wish to exchange confidential information in
    connection with North Mill providing advisory services to
    Acme in relation to a contemplated commercial arrangement
    (the "Purpose").

2. CONFIDENTIAL INFORMATION

2.1 "Confidential Information" means any and all information
    disclosed by one Party (the "Disclosing Party") to the other
    (the "Receiving Party"), whether orally, in writing, or in
    any other form, that is identified as confidential or that
    a reasonable person would understand to be confidential.

2.2 Confidential Information does NOT include information that
    is or becomes publicly available through no fault of the
    Receiving Party, was already known to the Receiving Party,
    or is required to be disclosed by law.

3. OBLIGATIONS

3.1 The Receiving Party shall use the Confidential Information
    solely for the Purpose and shall not disclose it to any
    third party without the prior written consent of the
    Disclosing Party.

3.2 The Receiving Party shall take all reasonable steps to
    protect the Confidential Information.

4. DATA PROTECTION

4.1 To the extent that the exchange of Confidential Information
    involves personal data, each Party shall comply with
    applicable data protection laws and shall handle such
    personal data in a careful and appropriate manner.

5. INDEMNITY

5.1 The Receiving Party shall indemnify the Disclosing Party
    against all losses, damages, costs, expenses and liabilities
    of whatever nature arising from any breach of this Agreement
    by the Receiving Party, its employees, agents or
    sub-contractors.

6. TERM

6.1 This Agreement shall commence on the date hereof and shall
    continue in force for a period of three (3) years.

6.2 The obligations of confidentiality shall survive termination
    of this Agreement and shall continue indefinitely.

7. ENTIRE AGREEMENT

7.1 This Agreement constitutes the entire agreement between the
    Parties in relation to its subject matter and supersedes all
    prior negotiations, representations and agreements.

8. NOTICES

8.1 All notices under this Agreement shall be in writing and
    shall be delivered by hand or sent by first-class post to
    the registered office of the relevant Party.

IN WITNESS WHEREOF the Parties have executed this Agreement on
the date first above written.

For ACME TRADING LTD: ____________________
For NORTH MILL CONSULTING LIMITED: ____________________
"""


async def _ensure_body(session: AsyncSession, document: Document, text: str) -> None:
    """Idempotent insert of a passthrough extracted-body row for a seed doc."""
    existing = await session.scalar(
        select(DocumentBody).where(
            DocumentBody.document_id == document.id,
            DocumentBody.kind == BODY_KIND_EXTRACTED,
        )
    )
    if existing is not None:
        return
    session.add(
        DocumentBody(
            document_id=document.id,
            kind=BODY_KIND_EXTRACTED,
            extracted_text=text,
            extraction_method="passthrough",
            char_count=len(text),
            page_count=1,
        )
    )


async def _ensure_initial_version(
    session: AsyncSession, document: Document, owner_id
) -> None:
    """Idempotent insert of the v1 `upload` DocumentVersion for a seed doc.

    Invariant: every Document has a v1 DocumentVersion of kind=upload.
    Edit-instruction + replicate_document derive new version
    numbers from `max(version_number)+1`, so missing v1 produces incorrect
    numbering on the first model-assisted edit.
    """
    existing = await session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document.id,
            DocumentVersion.version_number == 1,
        )
    )
    if existing is not None:
        return
    session.add(
        DocumentVersion(
            document_id=document.id,
            version_number=1,
            kind=VERSION_KIND_UPLOAD,
            created_by_id=owner_id,
            storage_uri=document.storage_uri,
            filename=document.filename,
            mime_type=document.mime_type,
            size_bytes=document.size_bytes,
            sha256=document.sha256,
            notes=None,
        )
    )


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

    # Synthetic mutual NDA — third Khan document, ships unmodified for
    # contract-review demo. Deliberately weak governing-law / indemnity /
    # UK GDPR Art 28 framing so the Analyst stage has something to flag.
    nda = Document(
        matter_id=matter.id,
        filename="synthetic-mutual-nda.docx",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size_bytes=len(KHAN_NDA_BODY) * 2,
        sha256=_sha("synthetic-mutual-nda:fixture"),
        storage_uri=None,
        tag="contract",
        from_disclosure=False,
        uploaded_by_id=user_id,
    )
    session.add(nda)

    await session.flush()
    docs["dismissal"] = dismissal
    docs["witness"] = witness
    docs["nda"] = nda

    await _ensure_body(session, dismissal, KHAN_DISMISSAL_BODY)
    await _ensure_body(session, witness, KHAN_WITNESS_BODY)
    await _ensure_body(session, nda, KHAN_NDA_BODY)
    await _ensure_initial_version(session, dismissal, user_id)
    await _ensure_initial_version(session, witness, user_id)
    await _ensure_initial_version(session, nda, user_id)
    await session.flush()

    for d in (dismissal, witness, nda):
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


async def _write_seed_audit_rows(
    session: AsyncSession,
    matter: Matter,
    documents,
    events,
) -> None:
    """Bootstrap the Audit tab so it isn't empty on first paint.

    One row for the matter, one per document, one per event. Doctrine:
    actor_id=None (system actor), module="seed", payload carries the
    fixed bootstrap marker. Never called from a real request path.
    """
    session.add(
        AuditEntry(
            actor_id=None,
            matter_id=matter.id,
            action=SEED_ACTION_MATTER,
            module=SEED_AUDIT_MODULE,
            resource_type="matter",
            resource_id=matter.slug,
            payload={
                "actor": "system.bootstrap",
                "kind": "seed",
                "slug": matter.slug,
                "title": matter.title,
            },
        )
    )
    for d in documents:
        session.add(
            AuditEntry(
                actor_id=None,
                matter_id=matter.id,
                action=SEED_ACTION_DOCUMENT,
                module=SEED_AUDIT_MODULE,
                resource_type="document",
                resource_id=str(d.id),
                payload={
                    "actor": "system.bootstrap",
                    "kind": "seed",
                    "filename": d.filename,
                    "sha256": d.sha256,
                    "tag": d.tag,
                },
            )
        )
    for e in events:
        session.add(
            AuditEntry(
                actor_id=None,
                matter_id=matter.id,
                action=SEED_ACTION_CHRONOLOGY,
                module=SEED_AUDIT_MODULE,
                resource_type="event",
                resource_id=str(e.id) if e.id is not None else None,
                payload={
                    "actor": "system.bootstrap",
                    "kind": "seed",
                    "event_date": e.event_date.isoformat() if e.event_date else None,
                    "significance": e.significance,
                },
            )
        )


async def _seed_audit_rows_present(session: AsyncSession, matter_id) -> bool:
    """True if the matter already has a `seed.matter.created` bootstrap row."""
    row = await session.scalar(
        select(AuditEntry.id).where(
            AuditEntry.matter_id == matter_id,
            AuditEntry.action == SEED_ACTION_MATTER,
        )
    )
    return row is not None


async def _index_seed_matter(session: AsyncSession, matter: Matter) -> None:
    """Index the seeded documents so retrieval works immediately.

    The seed path inserts Documents + extracted bodies directly, bypassing
    the upload route (which indexes inline). Without this, a fresh user opens
    Khan, asks a question, and retrieval finds nothing until a manual reindex.

    Resilient by contract: ``reindex_matter`` indexes each document
    independently and never commits, so the seed's own commit persists the
    chunks. Any unexpected failure here must never break signup/seed, so it is
    logged and swallowed.
    """
    from app.core.indexing import reindex_matter

    try:
        await reindex_matter(session, matter.id)
    except Exception:
        logger.exception("seed indexing failed for matter %s", matter.slug)


async def seed_demo_matter_for_user(session: AsyncSession, user: User) -> Matter:
    """Create the Khan sample matter, two seed documents, and seven
    chronology events under the given user's scope. Idempotent: an existing
    Khan row for this user is returned unchanged and re-materialised so
    disk reflects DB. Used by Day D signup auto-copy and by the dev-boot
    seed (which passes the locked-out demo user).
    """
    existing = await session.scalar(
        select(Matter).where(Matter.slug == KHAN_SLUG, Matter.created_by_id == user.id)
    )
    from app.core.demo_loop import ensure_demo_skill_on_matter

    if existing is not None:
        # Backfill body rows on previously-seeded matters (idempotent).
        existing_docs_list = list(
            (
                await session.scalars(
                    select(Document).where(Document.matter_id == existing.id)
                )
            ).all()
        )
        for d in existing_docs_list:
            if d.filename == "khan-dismissal-letter.pdf":
                await _ensure_body(session, d, KHAN_DISMISSAL_BODY)
            elif d.filename == "witness-statement-khan.docx":
                await _ensure_body(session, d, KHAN_WITNESS_BODY)
            elif d.filename == "synthetic-mutual-nda.docx":
                await _ensure_body(session, d, KHAN_NDA_BODY)
            await _ensure_initial_version(session, d, existing.created_by_id)

        # Backfill the synthetic NDA on matters seeded before W3 landed.
        has_nda = any(d.filename == "synthetic-mutual-nda.docx" for d in existing_docs_list)
        if not has_nda:
            nda = Document(
                matter_id=existing.id,
                filename="synthetic-mutual-nda.docx",
                mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                size_bytes=len(KHAN_NDA_BODY) * 2,
                sha256=_sha("synthetic-mutual-nda:fixture"),
                storage_uri=None,
                tag="contract",
                from_disclosure=False,
                uploaded_by_id=existing.created_by_id,
            )
            session.add(nda)
            await session.flush()
            await _ensure_body(session, nda, KHAN_NDA_BODY)
            await _ensure_initial_version(session, nda, existing.created_by_id)
            await session.flush()
            record_document(
                existing.slug,
                existing.created_by_id,
                str(nda.id),
                nda.filename,
                nda.sha256,
                nda.size_bytes,
                nda.tag,
            )

        # Backfill bootstrap audit rows on matters seeded before P1 landed.
        # Idempotent: presence of any seed.matter.created row is the marker.
        if not await _seed_audit_rows_present(session, existing.id):
            current_docs = list(
                (
                    await session.scalars(
                        select(Document).where(Document.matter_id == existing.id)
                    )
                ).all()
            )
            current_events = list(
                (
                    await session.scalars(
                        select(Event).where(Event.matter_id == existing.id)
                    )
                ).all()
            )
            await _write_seed_audit_rows(session, existing, current_docs, current_events)

        await ensure_demo_skill_on_matter(session, user=user, matter=existing)
        # Index seeded docs so retrieval works immediately; commit persists
        # the chunks reindex_matter staged (it does not commit itself).
        await _index_seed_matter(session, existing)
        await session.commit()
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
        # Matches settings.default_model_id (Sonnet) — the recommended model.
        default_model_id="claude-sonnet-5",
        facts=KHAN_FACTS,
        opened_at=datetime(2026, 5, 12, 15, 45, 8, tzinfo=timezone.utc),
        retention_until=date(2032, 7, 3),
        created_by_id=user.id,
    )
    session.add(matter)
    await session.flush()

    docs = await _seed_documents(session, matter, user.id)
    await _seed_chronology(session, matter, user.id, docs)

    # Bootstrap audit rows so the Audit tab is non-empty on first paint.
    # Pull events fresh so each row carries an id.
    seeded_events = list(
        (
            await session.scalars(
                select(Event).where(Event.matter_id == matter.id)
            )
        ).all()
    )
    await _write_seed_audit_rows(
        session, matter, list(docs.values()), seeded_events
    )
    await ensure_demo_skill_on_matter(session, user=user, matter=matter)

    materialise_matter(matter)
    append_history(matter.slug, user.id, "matter.seeded", "Khan v Acme demo matter inserted")
    append_history(
        matter.slug,
        user.id,
        "chronology.seeded",
        f"{3} documents + 7 events; 1 disclosure-tainted (dismissal letter)",
    )

    # Index seeded docs so retrieval works immediately; commit persists the
    # chunks reindex_matter staged (it does not commit itself).
    await _index_seed_matter(session, matter)

    await session.commit()
    await session.refresh(matter)
    return matter


async def seed_demo_matter(session: AsyncSession) -> Matter:
    """Dev-boot wrapper. Provisions the locked-out demo user and seeds
    Khan under it. Called by `main.lifespan` so the workspace is non-empty
    on first boot in development / demo environments.

    For per-user signup auto-copy (Day D), call
    `seed_demo_matter_for_user(session, user)` directly with the real user.
    """
    user = await _ensure_demo_user(session)
    return await seed_demo_matter_for_user(session, user)
