"""`legalise reindex` — backfill retrieval indexes for every matter.

Chunks + embeds each document's extracted body into ``document_chunks`` so the
assistant's audited retrieval (P3) can search it. Idempotent: existing chunks
are swept and rebuilt, so it is safe to re-run. Used to backfill the seeded
Khan demo (and any documents uploaded before retrieval existed).

Usage::

    docker compose exec backend python -m app.tools.reindex

Exit codes:
    0  every matter reindexed (documents may individually be 'failed' —
       reported per matter; the run itself still succeeds)
    1  a fatal error (e.g. DB unreachable)

The embedding backend is selected by ``LEGALISE_EMBEDDING_BACKEND`` (local +
keyless by default); privileged content is never sent to a third party to be
indexed. See docs/RETRIEVAL_DESIGN.md.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.indexing import reindex_matter
from app.models import Matter


EXIT_OK = 0
EXIT_FAIL = 1


def _build_session_factory():
    engine = create_async_engine(settings.postgres_dsn, echo=False)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _reindex_all() -> int:
    factory = _build_session_factory()

    totals = {"indexed": 0, "empty": 0, "failed": 0}
    matter_count = 0
    async with factory() as session:
        matters = list(
            (await session.scalars(select(Matter))).all()
        )
        for matter in matters:
            summary = await reindex_matter(session, matter.id)
            await session.commit()
            matter_count += 1
            for key in totals:
                totals[key] += summary.get(key, 0)
            print(
                f"[{matter.slug}] indexed={summary['indexed']} "
                f"empty={summary['empty']} failed={summary['failed']}"
            )

    print(
        f"\nreindexed {matter_count} matter(s) "
        f"(backend={settings.embedding_backend}): "
        f"indexed={totals['indexed']} empty={totals['empty']} "
        f"failed={totals['failed']}"
    )
    return EXIT_OK


def main(argv: list[str] | None = None) -> int:
    try:
        return asyncio.run(_reindex_all())
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc.__class__.__name__}: {exc}", file=sys.stderr)
        return EXIT_FAIL


if __name__ == "__main__":
    raise SystemExit(main())
