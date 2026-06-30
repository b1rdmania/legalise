"""AssistantMessage — one row per turn in a matter-scoped conversation.

Persists user + assistant messages alternately. `suggested_actions` carries
the action-chip payload the frontend routes into module tabs. Provenance
columns (`model_used`, `prompt_hash`, `response_hash`, `token_count`) are
populated only on assistant rows; user rows leave them null.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


ROLE_USER = "user"
ROLE_ASSISTANT = "assistant"
ROLE_VALUES = {ROLE_USER, ROLE_ASSISTANT}


class AssistantThread(Base):
    """A named conversation within a matter.

    A matter can hold several independent assistant threads, each with its
    own message history. Messages reference a thread via
    ``AssistantMessage.thread_id``. ``title`` is nullable — a fresh thread
    is titled from its first user message on the first turn.
    """

    __tablename__ = "assistant_threads"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Rolling-summary conversation memory. As a thread grows past the recent
    # window (``_HISTORY_MESSAGE_LIMIT`` turns), older turns are folded into
    # this summary instead of being silently dropped from context. Null until
    # the thread first overflows the window. ``summary_updated_at`` records the
    # last refresh.
    rolling_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    def __repr__(self) -> str:
        return f"<AssistantThread {self.id} matter={self.matter_id}>"


class AssistantMessage(Base):
    __tablename__ = "assistant_messages"
    __table_args__ = (
        CheckConstraint(
            "role IN ('user','assistant')",
            name="ck_assistant_messages_role",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Nullable for back-compat: rows predating the threads migration are
    # backfilled into a per-matter "Main thread". New rows always set it.
    thread_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assistant_threads.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_actions: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )
    # Retrieved passages the assistant reply rests on (P4). One entry per
    # retrieval hit: {document_id, title, snippet, char_start, char_end,
    # score}. Empty on user rows and on non-retrieval turns.
    sources: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    model_used: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<AssistantMessage {self.role} matter={self.matter_id}>"
