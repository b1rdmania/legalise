"""Phase 16 C — `legalise doctor`.

Inspection-only check command for a local fork. Runs a fixed list of
checks against the running stack and prints one line per check.

Usage::

    docker compose exec backend python -m app.tools.doctor
    docker compose exec backend python -m app.tools.doctor --create-bucket

Exit codes:
    0  every check ok or note
    1  one or more checks failed (`fail` rows)

Doctrine (per the Phase 16 plan):
    - No-flag invocation only reads. Never writes, migrates, or seeds.
    - `--create-bucket` is the one explicit mutation allowed; it
      provisions the configured S3 bucket if missing.
    - The Khan demo check is STATEFUL: pre-signup it soft-notes; once
      a user exists it hard-fails if the seed didn't land.
    - Manifest validation goes through the existing Phase 2 registry +
      validator path. No hand-rolled JSON-schema work here.
    - The provider check is diagnostic only — a fork with zero
      provider keys is a fully valid state because the stub-echo
      keyless model handles the Khan demo.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


EXIT_OK = 0
EXIT_FAIL = 1


# ---------------------------------------------------------------------------
# Check result + reporter
# ---------------------------------------------------------------------------


@dataclass
class CheckResult:
    name: str
    status: str  # "ok" | "fail" | "note"
    detail: str
    remediation: str | None = None


def _print(result: CheckResult) -> None:
    symbol = {"ok": "ok  ", "note": "note", "fail": "fail"}[result.status]
    line = f"[{symbol}] {result.name}: {result.detail}"
    print(line)
    if result.status == "fail" and result.remediation:
        print(f"        → {result.remediation}")


# ---------------------------------------------------------------------------
# Individual checks. Each returns a CheckResult; raises only on
# programmer error. Connectivity failures surface as `fail` rows
# with remediation text.
# ---------------------------------------------------------------------------


async def check_db_reachable(session: AsyncSession) -> CheckResult:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        return CheckResult(
            "db.reachable",
            "fail",
            f"cannot reach Postgres at {settings.postgres_dsn}: {exc.__class__.__name__}",
            "is the `db` service up? `docker compose ps db` and check healthcheck",
        )
    return CheckResult("db.reachable", "ok", settings.postgres_dsn)


async def check_db_migrations_current(session: AsyncSession) -> CheckResult:
    """Compare DB's alembic_version against the latest script on disk."""
    # Heads on disk: scan alembic/versions/ for the file whose
    # `revision` line has no descendant. Simpler approximation:
    # take the lexically-greatest revision string from filenames
    # `NNNN_*.py`. This is reliable because the project numbers
    # migrations sequentially from 0001 upward (see alembic/versions/).
    versions_dir = Path(__file__).resolve().parents[2] / "alembic" / "versions"
    if not versions_dir.exists():
        return CheckResult(
            "db.migrations_current",
            "fail",
            f"alembic versions dir missing at {versions_dir}",
            "rebuild backend image — alembic/ not packaged",
        )
    revs_on_disk = sorted(
        p.name.split("_", 1)[0]
        for p in versions_dir.glob("[0-9]*.py")
    )
    if not revs_on_disk:
        return CheckResult(
            "db.migrations_current",
            "fail",
            "no migrations found on disk",
            "rebuild backend image",
        )
    head_on_disk = revs_on_disk[-1]

    try:
        row = await session.execute(text("SELECT version_num FROM alembic_version"))
        current = row.scalar()
    except Exception as exc:  # noqa: BLE001
        return CheckResult(
            "db.migrations_current",
            "fail",
            f"alembic_version table not readable: {exc.__class__.__name__}",
            "run `docker compose exec backend alembic upgrade head`",
        )

    if current == head_on_disk:
        return CheckResult(
            "db.migrations_current", "ok", f"head={head_on_disk}"
        )
    return CheckResult(
        "db.migrations_current",
        "fail",
        f"DB at {current!r}, disk head at {head_on_disk!r}",
        "run `docker compose exec backend alembic upgrade head`",
    )


async def check_db_audit_worm(session: AsyncSession) -> CheckResult:
    """`audit_entries` exists + WORM trigger present."""
    table_q = await session.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = current_schema() AND table_name = 'audit_entries'"
        )
    )
    if table_q.first() is None:
        return CheckResult(
            "db.audit_table_present",
            "fail",
            "audit_entries table missing",
            "alembic head should create it; run `alembic upgrade head`",
        )
    trig_q = await session.execute(
        text(
            "SELECT 1 FROM pg_trigger WHERE tgname = 'enforce_audit_worm' "
            "AND NOT tgisinternal"
        )
    )
    if trig_q.first() is None:
        return CheckResult(
            "db.audit_table_present",
            "note",
            "audit_entries present but WORM trigger missing (live-matter gate)",
        )
    return CheckResult(
        "db.audit_table_present", "ok", "audit_entries + WORM trigger present"
    )


async def check_redis_reachable() -> CheckResult:
    try:
        import redis.asyncio as redis_asyncio
    except ImportError:
        return CheckResult(
            "redis.reachable",
            "fail",
            "redis package not importable",
            "rebuild backend image",
        )
    client = redis_asyncio.from_url(settings.redis_url)
    try:
        pong = await client.ping()
    except Exception as exc:  # noqa: BLE001
        return CheckResult(
            "redis.reachable",
            "fail",
            f"PING failed at {settings.redis_url}: {exc.__class__.__name__}",
            "is the `redis` service up? `docker compose ps redis`",
        )
    finally:
        try:
            await client.aclose()
        except Exception:  # noqa: BLE001
            pass
    if pong is True or pong == b"PONG" or pong == "PONG":
        return CheckResult("redis.reachable", "ok", settings.redis_url)
    return CheckResult(
        "redis.reachable",
        "fail",
        f"unexpected PING response: {pong!r}",
        "investigate redis health",
    )


def _build_s3_client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )


def check_s3_endpoint_reachable() -> CheckResult:
    try:
        client = _build_s3_client()
        client.list_buckets()
    except Exception as exc:  # noqa: BLE001
        return CheckResult(
            "s3.endpoint_reachable",
            "fail",
            f"cannot reach S3 endpoint {settings.s3_endpoint}: {exc.__class__.__name__}",
            "is the `minio` service up? `docker compose ps minio`",
        )
    return CheckResult("s3.endpoint_reachable", "ok", settings.s3_endpoint)


def check_s3_bucket_present(*, create_bucket: bool) -> CheckResult:
    """Soft-note on miss by default. With --create-bucket, provision it."""
    from botocore.exceptions import ClientError

    try:
        client = _build_s3_client()
        client.head_bucket(Bucket=settings.s3_bucket)
        return CheckResult(
            "s3.bucket_present", "ok", f"bucket={settings.s3_bucket}"
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code not in {"404", "NoSuchBucket"}:
            return CheckResult(
                "s3.bucket_present",
                "fail",
                f"head_bucket {settings.s3_bucket} returned {code}",
                "check S3 credentials and bucket permissions",
            )
    except Exception as exc:  # noqa: BLE001
        return CheckResult(
            "s3.bucket_present",
            "fail",
            f"head_bucket failed: {exc.__class__.__name__}",
            "check S3 endpoint + credentials",
        )

    # Bucket missing.
    if not create_bucket:
        return CheckResult(
            "s3.bucket_present",
            "note",
            f"bucket {settings.s3_bucket!r} not created yet (storage layer "
            f"creates it lazily on first use); rerun with --create-bucket "
            f"to provision it now",
        )
    try:
        client = _build_s3_client()
        client.create_bucket(Bucket=settings.s3_bucket)
    except Exception as exc:  # noqa: BLE001
        return CheckResult(
            "s3.bucket_present",
            "fail",
            f"create_bucket {settings.s3_bucket} failed: {exc.__class__.__name__}",
            "check S3 credentials have create-bucket permission",
        )
    return CheckResult(
        "s3.bucket_present", "ok", f"bucket created: {settings.s3_bucket}"
    )


def check_plugins_root_mounted() -> CheckResult:
    from app.core.registry import discover_modules

    try:
        discovered = discover_modules()
    except Exception as exc:  # noqa: BLE001
        return CheckResult(
            "plugins.root_mounted",
            "fail",
            f"registry discovery failed: {exc.__class__.__name__}: {exc}",
            "is PLUGINS_HOST_PATH pointed at claude-for-uk-legal?",
        )
    if not discovered:
        return CheckResult(
            "plugins.root_mounted",
            "fail",
            f"no modules discovered under {settings.plugins_root}",
            "clone claude-for-uk-legal next to this repo or set "
            "PLUGINS_HOST_PATH and re-`compose up`",
        )
    return CheckResult(
        "plugins.root_mounted",
        "ok",
        f"{len(discovered)} module(s) discovered under {settings.plugins_root}",
    )


def check_manifests_valid() -> CheckResult:
    """Run the Phase 2 v2 validator against every discovered module."""
    from app.core.registry import (
        InvalidManifestError,
        discover_modules,
        validate_manifest_v2,
    )
    from app.core.registry.shim import auto_derive_v2_from_v1

    try:
        discovered = discover_modules()
    except Exception as exc:  # noqa: BLE001
        return CheckResult(
            "manifests.valid",
            "fail",
            f"discovery raised before validation: {exc.__class__.__name__}",
            "see plugins.root_mounted",
        )
    if not discovered:
        return CheckResult(
            "manifests.valid", "note", "no modules to validate"
        )

    failures: list[str] = []
    for entry in discovered:
        try:
            if entry.source_kind == "v2":
                manifest = entry.payload
            elif entry.source_kind == "v1_module_json":
                manifest = auto_derive_v2_from_v1(
                    source_kind="v1_module_json", payload=entry.payload
                )
            elif entry.source_kind == "v1_skill":
                manifest = auto_derive_v2_from_v1(
                    source_kind="v1_skill",
                    skill_md=entry.payload,
                    plugin_id=entry.extra.get("plugin_id"),
                    skill_id=entry.extra.get("skill_id"),
                )
            else:
                failures.append(
                    f"{entry.module_id}: unknown source_kind {entry.source_kind!r}"
                )
                continue
            validate_manifest_v2(manifest)
        except InvalidManifestError as exc:
            failures.append(f"{entry.module_id}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{entry.module_id}: {exc.__class__.__name__}: {exc}")

    if failures:
        head = failures[0]
        more = f" (+{len(failures) - 1} more)" if len(failures) > 1 else ""
        return CheckResult(
            "manifests.valid",
            "fail",
            f"{head}{more}",
            "fix the manifest or pin a known-good PLUGINS_REPO_REF",
        )
    return CheckResult(
        "manifests.valid",
        "ok",
        f"{len(discovered)} manifest(s) validate against schemas/module.v2.json",
    )


async def check_khan_demo_present(session: AsyncSession) -> CheckResult:
    """Stateful: pre-signup → note; post-signup → demand the seed."""
    from app.models import Matter, User
    from app.core.seed import KHAN_SLUG, SEED_ACTION_MATTER

    user_count = (
        await session.execute(text("SELECT COUNT(*) FROM users"))
    ).scalar() or 0
    if user_count == 0:
        return CheckResult(
            "khan.demo_present",
            "note",
            "no users yet — seed lands on first signup",
        )

    matter = await session.scalar(
        select(Matter).where(Matter.slug == KHAN_SLUG)
    )
    if matter is None:
        return CheckResult(
            "khan.demo_present",
            "fail",
            f"users exist but Khan matter ({KHAN_SLUG}) missing",
            "register a fresh user via /auth/signin — seeding runs on first signup",
        )

    seed_row = (
        await session.execute(
            text(
                "SELECT 1 FROM audit_entries WHERE matter_id = :mid "
                "AND action = :action LIMIT 1"
            ),
            {"mid": matter.id, "action": SEED_ACTION_MATTER},
        )
    ).first()
    if seed_row is None:
        return CheckResult(
            "khan.demo_present",
            "fail",
            f"Khan matter present but no {SEED_ACTION_MATTER} audit row",
            "delete the matter row and re-register to re-seed, or inspect "
            "backend logs for seeding failures",
        )
    return CheckResult(
        "khan.demo_present", "ok", f"{KHAN_SLUG} + seed audit row present"
    )


def check_provider_mode() -> CheckResult:
    """Diagnostic only — never fails."""
    configured = []
    if settings.anthropic_api_key:
        configured.append("anthropic")
    if settings.openai_api_key:
        configured.append("openai")
    # Ollama is reachable-as-a-URL; treat as configured if the URL
    # is set to something other than the compose default and the
    # forker may want to know we're not pinging it.
    configured.append("stub-echo")  # always available, keyless
    return CheckResult(
        "provider.mode",
        "note",
        f"configured providers: {', '.join(configured)}",
    )


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


async def _run_all(*, create_bucket: bool) -> int:
    engine = create_async_engine(settings.postgres_dsn, echo=False)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    results: list[CheckResult] = []

    async with factory() as session:
        # DB-bound checks share one session.
        db_ok = await check_db_reachable(session)
        results.append(db_ok)
        if db_ok.status == "ok":
            results.append(await check_db_migrations_current(session))
            results.append(await check_db_audit_worm(session))
        # Skip downstream DB-needing checks if DB is unreachable.

    # Redis (own client).
    results.append(await check_redis_reachable())

    # S3 endpoint + bucket.
    endpoint = check_s3_endpoint_reachable()
    results.append(endpoint)
    if endpoint.status == "ok":
        results.append(check_s3_bucket_present(create_bucket=create_bucket))

    # Plugin substrate.
    results.append(check_plugins_root_mounted())
    results.append(check_manifests_valid())

    # Khan demo — only meaningful if DB was reachable.
    if db_ok.status == "ok":
        async with factory() as session:
            results.append(await check_khan_demo_present(session))

    # Provider mode — diagnostic only.
    results.append(check_provider_mode())

    await engine.dispose()

    for r in results:
        _print(r)

    failed = [r for r in results if r.status == "fail"]
    if failed:
        print(f"\n{len(failed)} check(s) failed.")
        return EXIT_FAIL
    print(f"\nall {len(results)} check(s) passed (notes are informational).")
    return EXIT_OK


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="doctor",
        description=(
            "Inspect a local Legalise stack. Reports one line per check; "
            "exits non-zero on any failure. Inspection-only by default."
        ),
    )
    parser.add_argument(
        "--create-bucket",
        action="store_true",
        help=(
            "explicit mutation: if the configured S3 bucket is missing, "
            "provision it. Without this flag the missing-bucket case "
            "is a soft note (the storage layer creates the bucket "
            "lazily on first use)."
        ),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    return asyncio.run(_run_all(create_bucket=args.create_bucket))


if __name__ == "__main__":
    raise SystemExit(main())
