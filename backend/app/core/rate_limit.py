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
- ``auth.login``                 10 / IP / hour
- ``auth.magic_link_request``     5 / IP / hour — tighter than
  forgot_password since a magic link both logs in *and* can create an
  account, not just reset a credential.

Set an override to ``0`` to disable that route's throttle (e.g. local
load testing).

Client IP resolution: the hosted instance sits behind Cloudflare → Fly,
so the direct peer (``request.client.host``) is a proxy. ``CF-Connecting-IP``
is only trusted when the request demonstrably arrived via Cloudflare:
``Fly-Client-IP`` (set by Fly's proxy, not client-controllable) must fall
inside Cloudflare's published ranges. A client hitting the .fly.dev origin
directly gets its ``CF-Connecting-IP`` ignored — otherwise it could mint a
fresh throttle bucket per request. Fallback order: ``Fly-Client-IP``, then
the direct peer. Self-hosters without either proxy get the direct peer,
which is correct for them.

Throttled responses are 429 with the same ``detail``-envelope shape as
``limits.py``. The first rejection in a window also writes one
``auth.rate_limited`` audit row (only the first, so a sustained attack
cannot flood the WORM audit log at request rate).
"""

from __future__ import annotations

import ipaddress
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
    "auth.login": ("LOGIN", 10),
    "auth.magic_link_request": ("MAGIC_LINK_REQUEST", 5),
}

WINDOW_SECONDS = 3600

# Cloudflare's published egress ranges — https://www.cloudflare.com/ips/
# (static list, embedded to stay dependency-free; refresh on the rare
# occasions Cloudflare changes it). `CF-Connecting-IP` is only trusted
# when `Fly-Client-IP` — set by Fly's proxy, not client-controllable —
# falls inside one of these.
_CLOUDFLARE_RANGES = tuple(
    ipaddress.ip_network(cidr)
    for cidr in (
        # IPv4
        "173.245.48.0/20",
        "103.21.244.0/22",
        "103.22.200.0/22",
        "103.31.4.0/22",
        "141.101.64.0/18",
        "108.162.192.0/18",
        "190.93.240.0/20",
        "188.114.96.0/20",
        "197.234.240.0/22",
        "198.41.128.0/17",
        "162.158.0.0/15",
        "104.16.0.0/13",
        "104.24.0.0/14",
        "172.64.0.0/13",
        "131.0.72.0/22",
        # IPv6
        "2400:cb00::/32",
        "2606:4700::/32",
        "2803:f800::/32",
        "2405:b500::/32",
        "2405:8100::/32",
        "2a06:98c0::/29",
        "2c0f:f248::/32",
    )
)


def _is_cloudflare_ip(value: str) -> bool:
    try:
        addr = ipaddress.ip_address(value)
    except ValueError:
        return False
    return any(addr in network for network in _CLOUDFLARE_RANGES)


def route_limit(route: str) -> int:
    """Resolved per-hour limit for a route (env override read per call —
    cheap, and keeps tests free of process-lifetime singletons)."""
    suffix, default = RATE_LIMITED_ROUTES[route]
    # Compose passthrough sets the var to "" when the host leaves it
    # unset (${VAR:-}); empty means "use the in-code default".
    value = os.environ.get(f"LEGALISE_RATE_LIMIT_{suffix}_PER_HOUR")
    return int(value) if value else default


def client_ip(request: Request) -> str:
    fly_ip = (request.headers.get("fly-client-ip") or "").strip()
    cf_ip = (request.headers.get("cf-connecting-ip") or "").strip()
    # CF-Connecting-IP is trustworthy only when the hop that reached Fly
    # actually was Cloudflare; anyone hitting the .fly.dev origin directly
    # can set the header to anything (module docstring, spoof scenario).
    if cf_ip and fly_ip and _is_cloudflare_ip(fly_ip):
        return cf_ip
    if fly_ip:
        return fly_ip
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
