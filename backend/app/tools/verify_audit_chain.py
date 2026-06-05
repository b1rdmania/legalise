"""Verify the audit hash chain.

Usage::

    docker compose exec backend python -m app.tools.verify_audit_chain
    docker compose exec backend python -m app.tools.verify_audit_chain --matter-id <uuid>

Read-only. Exits non-zero when the chain is missing, incomplete, or hash
verification fails.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.audit_chain import verify_audit_chain
from app.core.config import settings


async def _run(matter_id: uuid.UUID | None) -> int:
    engine = create_async_engine(settings.postgres_dsn, echo=False, future=True)
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    try:
        async with factory() as session:
            result = await verify_audit_chain(session, matter_id=matter_id)
    finally:
        await engine.dispose()

    scope = f"matter {matter_id}" if matter_id else "all scopes"
    if result.ok:
        print(
            "ok audit_chain "
            f"scope={scope} audit_entries={result.audit_entry_count} "
            f"chain_entries={result.chain_entry_count} scopes={result.scopes_verified}"
        )
        return 0

    print(
        "fail audit_chain "
        f"scope={scope} audit_entries={result.audit_entry_count} "
        f"chain_entries={result.chain_entry_count} scopes={result.scopes_verified}"
    )
    for issue in result.issues:
        loc = []
        if issue.chain_id is not None:
            loc.append(f"chain_id={issue.chain_id}")
        if issue.audit_entry_id is not None:
            loc.append(f"audit_entry_id={issue.audit_entry_id}")
        where = f" ({', '.join(loc)})" if loc else ""
        print(f"- {issue.code}{where}: {issue.message}")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify audit_chain integrity.")
    parser.add_argument("--matter-id", type=uuid.UUID, default=None)
    args = parser.parse_args()
    return asyncio.run(_run(args.matter_id))


if __name__ == "__main__":
    sys.exit(main())
