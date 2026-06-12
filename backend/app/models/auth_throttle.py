"""AuthThrottleEvent — one row per attempt on a throttled auth route.

Postgres-backed sliding-window rate limiting for the unauthenticated auth
surface (register / request-verify-token / forgot-password). The window is
recomputed from this table on each call — same doctrine as
``app/core/limits.py``: no Redis counter, no in-process cache, correct
across multiple backend instances.

Rows are tiny (ip + route + timestamp) and short-lived in relevance: only
rows inside the window are ever counted. A sweep job is not required for
correctness; ``app.core.rate_limit`` opportunistically deletes expired rows
for the route it is checking.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import DateTime, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuthThrottleEvent(Base):
    __tablename__ = "auth_throttle_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Textual IP (v4 or v6). String not INET so the model stays portable and
    # we never do address arithmetic on it — it is an opaque bucket key.
    ip: Mapped[str] = mapped_column(String(64), nullable=False)
    # Route key, e.g. "auth.register" — see RATE_LIMITED_ROUTES in
    # app/core/rate_limit.py for the canonical set.
    route: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_auth_throttle_events_route_ip_created", "route", "ip", "created_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AuthThrottleEvent {self.route} {self.ip} {self.created_at}>"
