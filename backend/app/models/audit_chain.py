"""Audit chain model.

``audit_chain`` is a separate append-only table populated by a Postgres
``AFTER INSERT`` trigger on ``audit_entries``. Keeping it separate avoids
mutating WORM-protected audit rows while still giving every audit entry a
hash-chain link.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import BigInteger, CHAR, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


AUDIT_CHAIN_VERSION = 1
AUDIT_CHAIN_SCOPE_MATTER = "matter"
AUDIT_CHAIN_SCOPE_SYSTEM = "system"
AUDIT_CHAIN_SCOPES = (AUDIT_CHAIN_SCOPE_MATTER, AUDIT_CHAIN_SCOPE_SYSTEM)


class AuditChainEntry(Base):
    __tablename__ = "audit_chain"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    audit_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("audit_entries.id"),
        nullable=False,
        unique=True,
    )

    scope_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    matter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    scope_sequence: Mapped[int] = mapped_column(BigInteger, nullable=False)

    previous_chain_hash: Mapped[str | None] = mapped_column(CHAR(64), nullable=True)
    entry_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    chain_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    chain_version: Mapped[int] = mapped_column(Integer, nullable=False, default=AUDIT_CHAIN_VERSION)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<AuditChainEntry {self.scope_type}:{self.matter_id or 'system'}"
            f"#{self.scope_sequence} {self.chain_hash[:8]}>"
        )
