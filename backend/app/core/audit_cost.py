"""Model-invocation cost metadata helper.

The single function in this module — ``audit_emit_model_invoked`` —
writes a canonical ``model.invoked`` audit row with cost data promoted
to first-class columns on ``audit_entries`` so cost rollups are an
index scan rather than a JSONB scan.

Why this exists
---------------
``app.core.api.audit.log`` is the generic emission helper. Cost data
(tokens, $$, provider, model) needs both the indexed columns AND the
JSONB payload (so readers that only look at JSONB still work). To
keep emission sites honest, this helper:

1. Validates the cost/currency pairing (``(cost_micros NULL) =
   (currency NULL)``) BEFORE the row reaches Postgres — so the
   check constraint catches drift, not the user.
2. Populates BOTH the new columns AND the JSONB payload —
   backwards-compatible forward.
3. Routes through ``audit.log`` so WORM triggers, transaction
   semantics, and standard plumbing all apply identically.

It does NOT commit. Caller commits — same contract as ``audit.log``.

Usage
-----
Reference modules (Contract Review first) call this from the
post-provider-call site. The model gateway can also route through it
once providers report token / cost. Today's stub provider returns
token count only; ``cost_micros`` and ``currency`` stay None until a
real provider plumbs the cost band through.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api import audit


_VALID_CURRENCIES = frozenset({"GBP", "USD", "EUR"})  # extend per provider footprint


async def audit_emit_model_invoked(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID | None,
    actor_user_id: uuid.UUID | None,
    module_id: str,
    capability_id: str,
    model_id: str,
    provider: str,
    tokens_in: int | None,
    tokens_out: int | None,
    cost_micros: int | None = None,
    currency: str | None = None,
    payload_extra: dict[str, Any] | None = None,
) -> None:
    """Emit a ``model.invoked`` audit row with cost columns populated.

    Parameters
    ----------
    session
        Caller's request session. Row is added; caller commits.
    matter_id
        Matter the invocation ran against. None only for system-level
        calls (rare; reconstruction filters by matter so these are
        invisible in matter timelines).
    actor_user_id
        User on whose behalf the invocation ran.
    module_id, capability_id
        Module + capability that triggered the invocation. Stored in
        the JSONB payload (matches the substrate ``audit_phase1`` shape).
    model_id, provider
        The actual model + provider used. Both columns and payload.
    tokens_in, tokens_out
        Token counts; both nullable for providers that don't report.
    cost_micros, currency
        Cost in integer minor-unit micros + ISO 4217 currency code.
        BOTH must be None or BOTH must be set; the helper validates
        before the DB check constraint catches it. Currency must be
        in ``_VALID_CURRENCIES`` (extend list as provider footprint
        grows).
    payload_extra
        Additional JSONB payload fields. Standard cost/token/provider
        fields are added under canonical keys; extras override
        anything you can't smuggle through the typed kwargs.

    Raises
    ------
    ValueError
        - cost_micros and currency not paired (one None, the other not)
        - cost_micros negative
        - currency not in the allow-list
    """
    if (cost_micros is None) != (currency is None):
        raise ValueError(
            "cost_micros and currency must both be set or both be None — "
            f"got cost_micros={cost_micros!r}, currency={currency!r}"
        )
    if cost_micros is not None and cost_micros < 0:
        raise ValueError(f"cost_micros must be non-negative; got {cost_micros}")
    if currency is not None and currency not in _VALID_CURRENCIES:
        raise ValueError(
            f"currency {currency!r} not in allow-list "
            f"{sorted(_VALID_CURRENCIES)}; extend audit_cost._VALID_CURRENCIES"
        )

    # Payload mirrors the columns for forward-compat with any reader
    # that doesn't know about the new columns yet (e.g. external log
    # consumers, the reconstruction view's JSONB fallback path).
    payload: dict[str, Any] = {
        "module_id": module_id,
        "capability_id": capability_id,
        "model_id": model_id,
        "provider": provider,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "cost_micros": cost_micros,
        "currency": currency,
    }
    if payload_extra:
        payload.update(payload_extra)

    await audit.log(
        session,
        "model.invoked",
        actor_id=actor_user_id,
        matter_id=matter_id,
        module=module_id,
        model_used=model_id,
        token_count=(
            (tokens_in or 0) + (tokens_out or 0)
            if (tokens_in is not None or tokens_out is not None)
            else None
        ),
        payload=payload,
        # Cost columns. ``audit.log`` accepts these kwargs.
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost_micros=cost_micros,
        currency=currency,
        provider=provider,
        model_id=model_id,
    )


__all__ = ["audit_emit_model_invoked"]
