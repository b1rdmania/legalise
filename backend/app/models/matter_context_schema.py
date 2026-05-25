"""MatterContextSchema — Phase 1 substrate primitive model.

A schema declares the typed shape of items stored under a matter-context
namespace. Schemas are versioned. Items written under a namespace are
validated against a specific schema version (latest by default) and
that version is permanently linked to the item so reconstruction across
schema evolutions stays possible.

Per docs/architecture/MATTER_CONTEXT_STORE.md.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MatterContextSchema(Base):
    __tablename__ = "matter_context_schemas"
    __table_args__ = (
        UniqueConstraint(
            "namespace",
            "version",
            name="uq_matter_context_schemas_namespace_version",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Fully-qualified namespace string. Convention is
    # ``<module_namespace>.<category>`` (e.g.
    # ``"legalise_memory.accepted_facts"`` or ``"companies_house.party"``).
    # The runtime enforces capability strings shaped
    # ``matter.context.<namespace>.<action>``.
    namespace: Mapped[str] = mapped_column(String(128), nullable=False, index=True)

    # Which module owns this schema.
    module_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)

    # Semver. Items bind to a specific version.
    version: Mapped[str] = mapped_column(String(32), nullable=False)

    # The JSON Schema document validating items under this
    # (namespace, version) tuple. Stored verbatim.
    json_schema: Mapped[dict] = mapped_column(JSONB, nullable=False)

    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.utcnow(),
        nullable=False,
    )
    # Soft attribution for who registered the schema. For substrate
    # operations this is "core"; for reference modules it's the module id.
    registered_by_module_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True
    )

    def __repr__(self) -> str:
        return f"<MatterContextSchema {self.namespace}@{self.version}>"
