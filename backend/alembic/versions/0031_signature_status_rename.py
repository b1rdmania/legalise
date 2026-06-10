"""Rename signature_status 'verified' to 'structure_verified'.

Revision ID: 0031
Revises: 0030
Create Date: 2026-06-10

The manifest signature verifier is structural only (shape + verified-publisher
registry membership); it performs no cryptographic verification. Storing the
outcome as ``verified`` overclaimed the guarantee. Rename the persisted value
on installed modules so the record states exactly what was checked. A true
``verified`` status returns when real sigstore verification lands.
"""

from __future__ import annotations

from alembic import op


revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE installed_modules SET signature_status = 'structure_verified' "
        "WHERE signature_status = 'verified'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE installed_modules SET signature_status = 'verified' "
        "WHERE signature_status = 'structure_verified'"
    )
