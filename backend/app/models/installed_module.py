"""InstalledModule — record of an installed Legalise module.

Persists every successful trust ceremony as an
``installed_modules`` row. The row captures:

- which module is installed
- which version
- who installed it
- the manifest contents at install time (snapshot, JSONB)
- the permissions snapshot
- the signature verification outcome at install time
- whether it's currently enabled

This is the source-of-truth for the workspace's installed-module set.
The grant-lifecycle reads this on module update to diff
permissions and trigger re-prompt where needed.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class InstalledModule(Base):
    __tablename__ = "installed_modules"
    __table_args__ = (
        UniqueConstraint(
            "module_id",
            "version",
            name="uq_installed_modules_module_id_version",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    module_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    publisher: Mapped[str] = mapped_column(String(128), nullable=False)
    visibility: Mapped[str] = mapped_column(String(32), nullable=False)

    # Outcome from verify_manifest_signature at install time.
    signature_status: Mapped[str] = mapped_column(String(32), nullable=False)
    signed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Set when the verified-publisher fast path was taken at install
    # time. NULL for unverified-path installs.
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Where the manifest lives on disk. Used by the registry to
    # re-discover the module on workspace boot.
    install_path: Mapped[str] = mapped_column(String(512), nullable=False)

    # Full manifest payload at install time. Source of truth for the
    # ceremony's permission-card; the grant-lifecycle reads this on
    # module update to compute permission expansion.
    manifest_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Aggregated permissions (reads/writes/gates/data_movement/
    # advice_tier_max) for fast diff against new manifests.
    permissions_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)

    installed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    installed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    def __repr__(self) -> str:
        return (
            f"<InstalledModule {self.module_id}@{self.version} "
            f"enabled={self.enabled}>"
        )
