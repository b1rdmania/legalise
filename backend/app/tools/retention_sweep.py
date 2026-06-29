"""`legalise retention_sweep` — purge matters past their retention date.

Every matter may carry a ``retention_until`` date. Until now that field
was recorded but nothing acted on it. This sweeper finds matters whose
retention has lapsed and runs the SAME destructive tombstone the
``DELETE /api/matters/{slug}`` route uses (``app.core.matter_lifecycle.
tombstone_matter``): storage bytes purged, ``status=archived``, audit FKs
preserved. It writes a ``matter.retention.purged`` audit row per matter.

DRY-RUN BY DEFAULT. With no flags it only PRINTS what it would purge and
changes nothing. Pass ``--apply`` to actually purge. This DELETES data —
the two-step is deliberate.

Selection (exact): ``retention_until IS NOT NULL AND retention_until <
today AND status != 'archived'``. Already-tombstoned matters are skipped,
so the sweep is idempotent.

Actor: an unattended cron has no human actor, so audit rows are written
with ``actor_id=None`` — the system-actor convention already used by
``seed.py`` and ``bootstrap_admin``. The payload carries
``purged_by="retention_sweep"`` so the trail is honest about provenance.

Per-matter transaction: each matter's purge + its audit row(s) commit
together (so the audit advisory lock is released per matter and one
failure doesn't roll back the rest). On a per-matter error we log it and
continue to the next matter.

Blast radius: ``--limit N`` caps a run to at most N matters, the
longest-lapsed first (ordered by ``retention_until`` ascending). This
stops a first ``--apply`` from purging every expired matter at once;
re-run to continue. No cap by default.

Usage::

    docker compose exec backend python -m app.tools.retention_sweep
    docker compose exec backend python -m app.tools.retention_sweep --apply
    docker compose exec backend python -m app.tools.retention_sweep --apply --limit 50

Exit codes:
    0  ran cleanly (dry-run, or apply with no per-matter failures)
    1  a fatal error (e.g. DB unreachable)
    2  apply completed but one or more matters failed to purge
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.matter_lifecycle import (
    MatterHasActiveJobsError,
    tombstone_matter,
)
from app.models import Matter, STATUS_ARCHIVED


EXIT_OK = 0
EXIT_FAIL = 1
EXIT_PARTIAL = 2


def _build_session_factory():
    """Create an async engine + sessionmaker outside FastAPI's lifespan.
    The CLI runs as a one-shot process; we open one engine and let
    process exit clean up."""
    engine = create_async_engine(settings.postgres_dsn, echo=False)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _select_expired(today: date, *, limit: int | None = None):
    """The exact selection query: retention lapsed, not already a
    tombstone. Shared by dry-run and apply so they can never diverge.

    Ordered most-overdue-first (oldest ``retention_until``), so a
    ``limit`` blast-radius cap purges the longest-lapsed matters first
    and leaves the rest for the next run."""
    stmt = (
        select(Matter)
        .where(
            Matter.retention_until.is_not(None),
            Matter.retention_until < today,
            Matter.status != STATUS_ARCHIVED,
        )
        .order_by(Matter.retention_until.asc())
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    return stmt


async def _sweep(
    session: AsyncSession, *, apply: bool, today: date, limit: int | None = None
) -> int:
    expired = list((await session.scalars(_select_expired(today, limit=limit))).all())
    capped = limit is not None and len(expired) == limit

    if not expired:
        print(f"retention sweep ({today.isoformat()}): 0 matters past retention. Nothing to do.")
        return EXIT_OK

    mode = "APPLY" if apply else "DRY-RUN"
    cap_note = f" (capped at --limit {limit}; re-run for more)" if capped else ""
    print(
        f"retention sweep ({today.isoformat()}) [{mode}]: "
        f"{len(expired)} matter(s) past retention{cap_note}:"
    )
    for matter in expired:
        overdue = (today - matter.retention_until).days
        print(
            f"  - {matter.slug} (id={matter.id}) "
            f"retention_until={matter.retention_until.isoformat()} "
            f"overdue={overdue}d status={matter.status}"
        )

    if not apply:
        print("\nDRY-RUN: nothing changed. Re-run with --apply to purge.")
        return EXIT_OK

    purged = 0
    failed = 0
    for matter in expired:
        slug = matter.slug
        retention_until = matter.retention_until
        try:
            await tombstone_matter(
                session,
                matter,
                actor_id=None,  # system actor — unattended cron, cf. seed.py
                action="matter.retention.purged",
                payload={
                    "retention_until": retention_until.isoformat()
                    if retention_until
                    else None,
                    "purged_by": "retention_sweep",
                },
            )
            # Commit per matter so one failure doesn't roll back the rest
            # and the audit advisory lock is released between matters.
            await session.commit()
            purged += 1
            print(f"  purged {slug}")
        except MatterHasActiveJobsError as exc:
            await session.rollback()
            failed += 1
            print(
                f"  SKIPPED {slug}: {exc} — purge later once jobs finish",
                file=sys.stderr,
            )
        except Exception as exc:  # noqa: BLE001 — isolate per-matter failure
            await session.rollback()
            failed += 1
            print(
                f"  FAILED {slug}: {exc.__class__.__name__}: {exc}",
                file=sys.stderr,
            )

    print(f"\nretention sweep done: purged={purged} failed={failed}")
    return EXIT_PARTIAL if failed else EXIT_OK


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="retention_sweep",
        description=(
            "Purge matters past their retention_until date via the shared "
            "destructive tombstone. Dry-run by default; --apply to purge."
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help=(
            "actually purge expired matters. Without this flag the tool "
            "only prints what it would do and changes nothing."
        ),
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help=(
            "blast-radius cap: process at most N matters (the longest-lapsed "
            "first). Prevents a first run from purging every expired matter "
            "at once. Re-run to continue. Default: no cap."
        ),
    )
    args = parser.parse_args(argv)
    if args.limit is not None and args.limit <= 0:
        parser.error("--limit must be a positive integer")
    return args


async def _main_async(args: argparse.Namespace) -> int:
    factory = _build_session_factory()
    today = date.today()
    async with factory() as session:
        return await _sweep(session, apply=args.apply, today=today, limit=args.limit)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        return asyncio.run(_main_async(args))
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc.__class__.__name__}: {exc}", file=sys.stderr)
        return EXIT_FAIL


if __name__ == "__main__":
    raise SystemExit(main())
