"""Event model — chronology entries.

Used by the chronology module. Day 2 lands the table; live extraction is v0.2.
"""

from __future__ import annotations

import uuid
from datetime import datetime, date, UTC

from sqlalchemy import String, DateTime, Date, ForeignKey, Text, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# Review lifecycle for a chronology event. Auto-build proposes events the
# solicitor then accepts or rejects; manually-created and seeded events are
# "accepted" on creation so the existing read surface is unchanged.
STATUS_PROPOSED = "proposed"
STATUS_ACCEPTED = "accepted"
STATUS_REJECTED = "rejected"
STATUS_VALUES = {STATUS_PROPOSED, STATUS_ACCEPTED, STATUS_REJECTED}


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    matter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("matters.id"), nullable=False, index=True)

    event_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    significance: Mapped[int] = mapped_column(Integer, nullable=False, default=3)  # 1..5

    source_doc_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False, default=list)
    priv_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Propose -> review -> accept lifecycle. New rows default to "accepted"
    # (manual / seeded events keep current behaviour); the auto-build path
    # sets "proposed" explicitly. The CPR 31.22 taint of a row is NOT stored
    # here — it is derived at read time from whether any `source_doc_ids`
    # document has `from_disclosure=True` (see chronology/router.py).
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=STATUS_ACCEPTED, default=STATUS_ACCEPTED
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    def __repr__(self) -> str:
        return f"<Event {self.event_date} sig={self.significance}>"
