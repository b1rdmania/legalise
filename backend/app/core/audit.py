"""Audit middleware.

Writes one `AuditEntry` per API request that touches a matter resource
(path under `/api/matters/...`). Read-only GETs are deliberately not
logged here — they would inflate the audit log without adding provenance
value. Mutations (POST/PATCH/DELETE) are always logged. Domain-specific
audit rows (matter.create, document.upload, model.call) are written
inline by the routers and the model gateway, so this middleware sets
`action = http.{method}` and references the route — together they form
the full picture without duplicating semantic context.

Failed requests (status >= 400) are logged too so the trail captures
attempted operations, not just successful ones.

Actor resolution: the session cookie is read from the request and the
token is looked up in `access_token`. For unauthenticated traffic
(missing/invalid cookie, expired token) `actor_id` is NULL — never the
stub user. This keeps `http.*` rows consistent with the semantic rows
written by the route handlers and the model gateway.
"""

from __future__ import annotations

import re
import time
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.models import AccessToken, AuditEntry, Matter


# Collection (`/api/matters` and `/api/matters/`) and resource paths
# (`/api/matters/{slug}` and `/api/matters/{slug}/{rest…}`) are both
# audited. The collection match keeps the slug group empty.
_MATTER_PATH = re.compile(r"^/api/matters(?:/(?P<slug>[^/]+)(?P<rest>/.*)?)?/?$")


async def _resolve_actor_id(request: Request, session) -> uuid.UUID | None:
    """Return the user_id behind the request's session cookie, or None.

    Pure middleware-level resolution: we can't use the fastapi-users
    Depends() chain here because the middleware runs outside the
    handler's dependency graph. We read the cookie value and look it up
    against the access_token table directly.
    """
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None

    row = await session.execute(
        select(AccessToken.user_id, AccessToken.created_at).where(AccessToken.token == token)
    )
    record = row.first()
    if record is None:
        return None
    user_id, created_at = record
    # Mirror the DatabaseStrategy lifetime check.
    if created_at is not None:
        age = datetime.now(timezone.utc) - created_at
        if age > timedelta(seconds=settings.session_lifetime_seconds):
            return None
    return user_id


class AuditMiddleware(BaseHTTPMiddleware):
    """Records every mutation on `/api/matters/*` — including failed
    attempts at the collection level — to the audit log."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        response = await call_next(request)

        if request.method == "GET":
            return response
        m = _MATTER_PATH.match(request.url.path)
        if not m:
            return response

        slug = m.group("slug")          # may be None for /api/matters
        rest = m.group("rest") or ""

        factory = getattr(request.app.state, "session_factory", None)
        if factory is None:
            return response

        async with factory() as session:
            actor_id = await _resolve_actor_id(request, session)

            matter_id: uuid.UUID | None = None
            if slug:
                # Slug is now per-owner unique — scope the lookup by actor.
                # Anon traffic (actor_id None) doesn't resolve a matter_id,
                # which is fine: the request was 401-ed by the handler and
                # the http.* row records the attempt without a matter link.
                if actor_id is not None:
                    matter_id = await session.scalar(
                        select(Matter.id).where(
                            Matter.slug == slug, Matter.created_by_id == actor_id
                        )
                    )

            # Resource type — for the collection endpoint, the resource
            # is the matter collection itself (no slug yet).
            if slug is None:
                resource_type = "matter_collection"
                resource_id = None
            elif rest:
                resource_type = rest.strip("/").split("/")[0] or "matter"
                resource_id = slug
            else:
                resource_type = "matter"
                resource_id = slug

            session.add(
                AuditEntry(
                    actor_id=actor_id,
                    matter_id=matter_id,
                    action=f"http.{request.method.lower()}",
                    resource_type=resource_type,
                    resource_id=resource_id,
                    latency_ms=int((time.perf_counter() - start) * 1000),
                    payload={
                        "path": request.url.path,
                        "status_code": response.status_code,
                        "client": request.client.host if request.client else None,
                    },
                )
            )
            await session.commit()

        return response
