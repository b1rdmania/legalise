"""MatterArtifact model — append-only matter-scoped capability output.

One row per artifact produced by a matter-scoped capability
invocation. The row is the authoritative reference; the actual
payload lives on the matter filesystem at ``storage_path``.

WORM enforcement (migration 0018):
- A Postgres trigger (``enforce_matter_artifacts_worm``) blocks
  UPDATE and DELETE at the DB layer.

Ships with a single producer (Contract Review). Other reference
modules will write here too — Pre-Motion outputs, chronology
snapshots, etc.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MatterArtifact(Base):
    __tablename__ = "matter_artifacts"
    __table_args__ = (
        UniqueConstraint(
            "invocation_id", "kind", name="uq_matter_artifacts_invocation_kind"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id"),
        nullable=False,
    )
    module_id: Mapped[str] = mapped_column(String(128), nullable=False)
    capability_id: Mapped[str] = mapped_column(String(256), nullable=False)
    invocation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    # NULL = no workspace user authored this artifact (external-pack
    # documents whose author was the external assistant or an external
    # human). signer_is_author is computed as created_by_id == signer.id,
    # so a NULL author always reads as signer_is_author=false.
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    def __repr__(self) -> str:
        return (
            f"<MatterArtifact {self.id} matter={self.matter_id} "
            f"kind={self.kind} module={self.module_id}>"
        )
