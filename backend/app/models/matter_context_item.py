"""MatterContextItem — Phase 1 substrate primitive model.

Items are the actual matter-scoped data rows written under a namespace.
Each item carries its ``schema_id`` and ``schema_version`` so the
runtime knows which schema validated the payload, and reads can
reconstruct items at their original schema version even after newer
schema versions are registered.

Append-only semantics:

- ``created`` / ``updated`` represent the row state; the runtime does
  not WORM-enforce this table (items can be amended via PATCH).
- Supersession is the supported soft-delete: a new item is written
  with ``superseded_by_id`` set on the older row, preserving history.
- True deletes are not supported in v0.2; if needed, withdraw the item
  (sets a tombstone flag via status, planned in Phase 2 reference
  module).

Per docs/architecture/MATTER_CONTEXT_STORE.md.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# Source types for matter context items, per MATTER_CONTEXT_STORE.md §86.
# Items can be source-backed when possible. Un-sourced items are allowed
# but should be labelled as assumptions/open-questions by the writing
# module.
SOURCE_TYPE_DOCUMENT = "document"
SOURCE_TYPE_EVENT = "event"
SOURCE_TYPE_AUDIT_ENTRY = "audit_entry"
SOURCE_TYPE_USER_ASSERTION = "user_assertion"
SOURCE_TYPE_CONNECTOR_RESULT = "connector_result"
SOURCE_TYPE_GENERATED_OUTPUT = "generated_output"

SOURCE_TYPE_VALUES = frozenset(
    {
        SOURCE_TYPE_DOCUMENT,
        SOURCE_TYPE_EVENT,
        SOURCE_TYPE_AUDIT_ENTRY,
        SOURCE_TYPE_USER_ASSERTION,
        SOURCE_TYPE_CONNECTOR_RESULT,
        SOURCE_TYPE_GENERATED_OUTPUT,
    }
)


class MatterContextItem(Base):
    __tablename__ = "matter_context_items"
    __table_args__ = (
        Index(
            "ix_matter_context_items_matter_namespace",
            "matter_id",
            "namespace",
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

    namespace: Mapped[str] = mapped_column(String(128), nullable=False, index=True)

    # Schema linkage — every item is bound to the schema it was
    # validated against. Reviewer P1.2 round 2: schema_version is
    # denormalised so reads work even if the schema row is later
    # archived (though Phase 1 does not archive schemas).
    schema_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matter_context_schemas.id"),
        nullable=False,
    )
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False)

    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)

    source_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_by_module_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # When this item is superseded by a newer item, this points at the
    # newer row. Reads can follow the chain to reconstruct history.
    superseded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matter_context_items.id"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return (
            f"<MatterContextItem {self.id} matter={self.matter_id} "
            f"ns={self.namespace}@{self.schema_version}>"
        )
