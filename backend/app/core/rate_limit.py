"""Per-IP rate limiting for the unauthenticated auth surface.

Doctrine (same as ``app/core/limits.py``): counts are recomputed from
Postgres on each call — no Redis counter, no in-process state — so the
limit holds across multiple backend instances and survives restarts.

Mechanism: a sliding window over ``auth_throttle_events``. Every attempt
on a throttled route inserts one row (ip, route, created_at); the check
counts rows for that (route, ip) inside the window. Blocked attempts are
recorded too, so an attacker who keeps hammering keeps the window full —
the limit is on *attempts*, not successes. That is deliberate: this is an
abuse throttle, not a quota.

Defaults (overridable via ``LEGALISE_RATE_LIMIT_<ROUTE>_PER_HOUR``):

- ``auth.register``               5 / IP / hour
- ``auth.request_verify_token``  10 / IP / hour
- ``auth.forgot_password``       10 / IP / hour

Set an override to ``0`` to disable that route's throttle (e.g. local
load testing).

Client IP resolution: the hosted instance sits behind Cloudflare → Fly,
so the direct peer (``request.client.host``) is a proxy. We prefer
``CF-Connecting-IP``, then ``Fly-Client-IP``, then the first hop of
``X-Forwarded-For``, then the direct peer. Self-hosters terminating TLS
themselves get the direct peer, which is correct for them. A client that
can reach the origin directly could spoof these headers; the hosted
deployment only exposes the origin via the proxy chain, and the
worst-case failure is a throttle bypass — never an authz bypass.

Throttled responses are 429 with the same ``detail``-envelope shape as
``limits.py``. The first rejection in a window also writes one
``auth.rate_limited`` audit row (only the first, so a sustained attack
cannot flood the WORM audit log at request rate).
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

# Route key -> (env var suffix, default per-hour limit). The window is one
# hour for every route; per-route windows can be added if ever needed.
RATE_LIMITED_ROUTES: dict[str, tuple[str, int]] = {
    "auth.register": ("REGISTER", 5),
    "auth.request_verify_token": ("REQUEST_VERIFY_TOKEN", 10),
    "auth.forgot_password": ("FORGOT_PASSWORD", 10),
}

WINDOW_SECONDS = 3600

# Proxy headers in trust order for the hosted Cloudflare → Fly chain.
_IP_HEADERS = ("cf-connecting-ip", "fly-client-ip")


def route_limit(route: str) -> int:
    """Resolved per-hour limit for a route (env override read per call —
    cheap, and keeps tests free of process-lifetime singletons)."""
    suffix, default = RATE_LIMITED_ROUTES[route]
    # Compose passthrough sets the var to "" when the host leaves it
    # unset (${VAR:-}); empty means "use the in-code default".
    value = os.environ.get(f"LEGALISE_RATE_LIMIT_{suffix}_PER_HOUR")
    return int(value) if value else default


def client_ip(request: Request) -> str:
    for header in _IP_HEADERS:
        value = request.headers.get(header)
        if value:
            return value.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _rate_limited(route: str, limit: int) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail={
            "error": "rate_limited",
            "route": route,
            "limit_per_hour": limit,
            "message": (
                "Too many requests from this address. "
                "Try again in an hour."
            ),
        },
        headers={"Retry-After": str(WINDOW_SECONDS)},
    )


async def enforce_ip_rate_limit(
    request: Request, session: AsyncSession, route: str
) -> None:
    """Record this attempt and raise 429 if the IP is over the limit.

    Commits its own writes on the request session before any raise so the
    attempt row (and the audit row on first rejection) survives the 429.
    """
    from app.models.audit import AuditEntry
    from app.models.auth_throttle import AuthThrottleEvent

    limit = route_limit(route)
    if limit <= 0:
        return  # throttle disabled for this route

    ip = client_ip(request)
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=WINDOW_SECONDS)

    # Opportunistic cleanup: expired rows for this route are dead weight.
    await session.execute(
        delete(AuthThrottleEvent).where(
            AuthThrottleEvent.route == route,
            AuthThrottleEvent.created_at < window_start,
        )
    )

    count = await session.scalar(
        select(func.count(AuthThrottleEvent.id)).where(
            AuthThrottleEvent.route == route,
            AuthThrottleEvent.ip == ip,
            AuthThrottleEvent.created_at >= window_start,
        )
    )
    current = count or 0

    # Record the attempt — including blocked ones (see module docstring).
    session.add(AuthThrottleEvent(ip=ip, route=route, created_at=now))

    if current >= limit:
        # Audit only the first rejection in the window: current == limit
        # exactly once, then keeps growing as blocked attempts accrue.
        if current == limit:
            session.add(
                AuditEntry(
                    actor_id=None,
                    matter_id=None,
                    action="auth.rate_limited",
                    resource_type="auth",
                    resource_id=route,
                    payload={
                        "ip": ip,
                        "route": route,
                        "limit_per_hour": limit,
                        "window_seconds": WINDOW_SECONDS,
                        "path": request.url.path,
                    },
                )
            )
        await session.commit()
        raise _rate_limited(route, limit)

    await session.commit()
