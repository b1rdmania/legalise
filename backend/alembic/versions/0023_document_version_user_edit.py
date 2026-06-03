"""Allow direct editor saves as document versions.

Revision ID: 0023
Revises: 0022
Create Date: 2026-06-03

The document engine stores manual rich-editor saves as immutable
``document_versions`` rows with ``kind='user_edit'``. This widens the
existing kind check constraint; it does not add a table or column.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


_OLD_KIND_CHECK = (
    "kind IN ('upload','assistant_edit','user_accept','user_reject','generated','replicated')"
)
_NEW_KIND_CHECK = (
    "kind IN ('upload','assistant_edit','user_accept','user_reject','user_edit',"
    "'generated','replicated')"
)


def upgrade() -> None:
    op.drop_constraint(
        "ck_document_versions_kind",
        "document_versions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_document_versions_kind",
        "document_versions",
        sa.text(_NEW_KIND_CHECK),
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_document_versions_kind",
        "document_versions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_document_versions_kind",
        "document_versions",
        sa.text(_OLD_KIND_CHECK),
    )
