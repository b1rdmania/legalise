"""SQLAlchemy declarative base.

Models land Week 1 Day 2. Base is exposed here so alembic can autogenerate
from `Base.metadata` once models are imported.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all Legalise models."""
