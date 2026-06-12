from __future__ import annotations

from fastapi import APIRouter

from .common import *  # noqa: F403


router = APIRouter()


@router.get("/installed", response_model=list[InstalledModuleOut])
async def list_installed_modules(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(current_user),
) -> list[InstalledModuleOut]:
    """List currently-installed modules, one row per ``module_id``.

    When a module has multiple ``InstalledModule`` rows (substrate
    allows installing successive versions without deleting prior
    rows), returns the most recent by ``installed_at``. Mirrors the
    "most recent installed version" lookup in
    :func:`revoke_module_endpoint` at ``modules.py`` so the catalog
    UI and the revoke endpoint agree on which row represents
    "installed".

    Disabled rows (``enabled=False``) are returned with
    ``enabled: false`` so the catalog can render a muted
    "Installed (disabled)" badge.
    """
    # Window function: pick the latest row per module_id by
    # installed_at desc. This dedupes the per-version history into
    # one row per module without an N+1 group-by-then-fetch.
    from sqlalchemy import desc as _desc, func as _func

    from app.models import MatterSignoff

    # `id DESC` is a deterministic tie-breaker. `installed_at` is
    # high-resolution (timestamp with
    # microseconds) so collisions are rare in practice, but window
    # functions over a non-unique key are non-deterministic by SQL
    # standard. The tie-breaker pins the "most recent" choice to a
    # single row even if two installs share the exact same instant.
    rn = _func.row_number().over(
        partition_by=InstalledModule.module_id,
        order_by=(_desc(InstalledModule.installed_at), _desc(InstalledModule.id)),
    ).label("rn")
    sub = select(InstalledModule, rn).subquery()
    stmt = (
        select(
            sub.c.module_id,
            sub.c.version,
            sub.c.publisher,
            sub.c.visibility,
            sub.c.signature_status,
            sub.c.permissions_snapshot,
            sub.c.manifest_snapshot,
            sub.c.install_path,
            sub.c.enabled,
            sub.c.installed_at,
            sub.c.installed_by_user_id,
        )
        .where(sub.c.rn == 1)
        .order_by(sub.c.module_id)
    )
    rows = (await session.execute(stmt)).all()

    # Track record: sign-off decisions grouped by (module_id, decision).
    # One query for the whole listing; rejections count with the same
    # fidelity as approvals.
    tr_rows = (
        await session.execute(
            select(
                MatterSignoff.module_id,
                MatterSignoff.decision,
                _func.count().label("n"),
            ).group_by(MatterSignoff.module_id, MatterSignoff.decision)
        )
    ).all()
    track: dict[str, dict[str, int]] = {}
    for module_id, decision, n in tr_rows:
        track.setdefault(module_id, {})[decision] = n

    # Median review latency per module (M13): the review window is the
    # signer's first output.review.opened audit row → the sign-off's
    # signed_at, derived at read time per the spec. Sign-offs without an
    # open-event (legacy / direct API) simply don't contribute — the
    # median is over the decisions that have a derivable window.
    import statistics

    from app.core.signoff import review_latency_seconds, review_opened_at_map

    so_rows = (
        await session.execute(
            select(
                MatterSignoff.module_id,
                MatterSignoff.signer_id,
                MatterSignoff.artifact_id,
                MatterSignoff.signed_at,
            )
        )
    ).all()
    opened = await review_opened_at_map(
        session, pairs={(r.signer_id, r.artifact_id) for r in so_rows}
    )
    latencies_by_module: dict[str, list[int]] = {}
    for r in so_rows:
        latency = review_latency_seconds(
            opened.get((r.signer_id, r.artifact_id)), r.signed_at
        )
        if latency is not None:
            latencies_by_module.setdefault(r.module_id, []).append(latency)
    median_by_module = {
        module_id: int(statistics.median(values))
        for module_id, values in latencies_by_module.items()
    }
    latency_n_by_module = {
        module_id: len(values) for module_id, values in latencies_by_module.items()
    }

    return [
        InstalledModuleOut(
            module_id=r.module_id,
            name=(
                r.manifest_snapshot.get("name")
                if isinstance(r.manifest_snapshot, dict)
                else None
            ),
            version=r.version,
            publisher=r.publisher,
            visibility=r.visibility,
            signature_status=r.signature_status,
            capabilities=(
                r.permissions_snapshot.get("capabilities", [])
                if isinstance(r.permissions_snapshot, dict)
                else []
            ),
            enabled=r.enabled,
            installed_at=r.installed_at.isoformat(),
            installed_by_user_id=(
                str(r.installed_by_user_id) if r.installed_by_user_id else None
            ),
            install_path=r.install_path,
            track_record=track.get(r.module_id, {}),
            track_median_review_seconds=median_by_module.get(r.module_id),
            track_review_latency_n=latency_n_by_module.get(r.module_id, 0),
        )
        for r in rows
    ]
