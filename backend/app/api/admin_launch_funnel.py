"""Launch funnel — the 90-day falsifier dashboard (Gate 4).

Single operator-facing endpoint:

  GET /api/admin/launch-funnel

Superuser-only, JSON-only by design — this is an operator tool, not a
product surface. It answers, day-1 queryable, the questions the launch
must produce evidence for:

1. Who signed up — counts by persona, email-domain class, and channel
   tag. The locked-out ``demo@legalise.dev`` seed row is excluded.
2. Did anyone complete the golden loop — matters created and outputs
   signed by real (non-seed) users. The auto-seeded Khan sample copy
   every new user receives is excluded from "matters created" (it says
   nothing about demand); sign-offs ON the Khan copy ARE counted — a
   real person signing the sample is exactly the loop we want evidence
   of, and the split is reported separately.
3. Practitioner-labelled GitHub issues — NOT queryable from here (the
   server holds no GitHub token; adding one for a vanity count would be
   the wrong trade). The payload says so and names the manual command.

Buckets are exhaustive: rows with NULL capture fields land in
``unspecified`` / ``unknown`` / ``untagged`` rather than vanishing, so
the by-* maps always sum to the total. No vanity normalisation.
"""

from __future__ import annotations

from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user
from app.core.db import get_session
from app.core.seed import DEMO_USER_EMAIL, KHAN_SLUG
from app.models import Matter, User
from app.models.matter_signoff import SIGNOFF_AFFIRMATIVE, MatterSignoff


router = APIRouter()


def _require_superuser(caller: User) -> None:
    if not caller.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "admin_required"},
        )


def _bucket(rows: list[tuple[str | None, int]], null_label: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for value, count in rows:
        out[value if value else null_label] = count
    return out


@router.get("/launch-funnel")
async def launch_funnel_endpoint(
    session: AsyncSession = Depends(get_session),
    caller: User = Depends(current_user),
) -> dict:
    _require_superuser(caller)

    # --- Signups (seed demo row excluded) --------------------------------
    not_seed = User.email != DEMO_USER_EMAIL

    total = await session.scalar(select(func.count(User.id)).where(not_seed)) or 0

    async def grouped(column) -> list[tuple[str | None, int]]:
        rows = await session.execute(
            select(column, func.count(User.id)).where(not_seed).group_by(column)
        )
        return [(value, count) for value, count in rows.all()]

    by_persona = _bucket(await grouped(User.persona), "unspecified")
    by_domain_class = _bucket(await grouped(User.domain_class), "unknown")
    by_channel = _bucket(await grouped(User.signup_channel), "untagged")

    # --- Golden loop (non-seed users) -------------------------------------
    seed_user_id = await session.scalar(
        select(User.id).where(User.email == DEMO_USER_EMAIL)
    )

    def exclude_seed_creator(stmt):
        if seed_user_id is not None:
            stmt = stmt.where(Matter.created_by_id != seed_user_id)
        return stmt

    # Matters a real user created themselves — the auto-seeded Khan copy
    # (slug pinned by the seeder) is excluded.
    own_matters_where = exclude_seed_creator(
        select(func.count(Matter.id)).where(Matter.slug != KHAN_SLUG)
    )
    matters_created = await session.scalar(own_matters_where) or 0

    matter_creators = await session.scalar(
        exclude_seed_creator(
            select(func.count(func.distinct(Matter.created_by_id))).where(
                Matter.slug != KHAN_SLUG
            )
        )
    ) or 0

    affirmative = MatterSignoff.decision.in_(sorted(SIGNOFF_AFFIRMATIVE))
    not_seed_signer = (
        MatterSignoff.signer_id != seed_user_id
        if seed_user_id is not None
        else True
    )

    outputs_signed = await session.scalar(
        select(func.count(MatterSignoff.id)).where(affirmative, not_seed_signer)
    ) or 0
    signers = await session.scalar(
        select(func.count(func.distinct(MatterSignoff.signer_id))).where(
            affirmative, not_seed_signer
        )
    ) or 0
    # Of those, sign-offs on the seeded Khan sample (still real users
    # completing the loop — reported as its own honest slice).
    outputs_signed_on_sample = await session.scalar(
        select(func.count(MatterSignoff.id))
        .join(Matter, Matter.id == MatterSignoff.matter_id)
        .where(affirmative, not_seed_signer, Matter.slug == KHAN_SLUG)
    ) or 0

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "signups": {
            "total": total,
            "by_persona": by_persona,
            "by_domain_class": by_domain_class,
            "by_channel": by_channel,
        },
        "golden_loop": {
            "matters_created": matters_created,
            "users_who_created_a_matter": matter_creators,
            "outputs_signed": outputs_signed,
            "outputs_signed_on_seeded_sample": outputs_signed_on_sample,
            "users_who_signed_an_output": signers,
        },
        "provenance_issues": {
            "source": "manual",
            "note": (
                "Practitioner-labelled GitHub issues are counted manually — "
                "the server holds no GitHub token. Run: gh issue list "
                "--label provenance:practitioner (also provenance:builder, "
                "provenance:firm)."
            ),
        },
    }
