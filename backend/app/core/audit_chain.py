"""Audit hash-chain verification.

The database writes chain links synchronously in an ``AFTER INSERT`` trigger.
This module deliberately re-computes the same hashes in Python so CI can catch
drift between the PL/pgSQL recipe and the verifier.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEntry
from app.models.audit_chain import (
    AUDIT_CHAIN_SCOPE_MATTER,
    AUDIT_CHAIN_SCOPE_SYSTEM,
    AUDIT_CHAIN_VERSION,
    AuditChainEntry,
)

ENTRY_PREFIX = "audit-chain-entry-v1"
LINK_PREFIX = "audit-chain-link-v1"


def _field(value: str | None) -> str:
    if value is None:
        return "-1:"
    return f"{len(value)}:{value}"


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _timestamp_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _text(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


@dataclass(frozen=True)
class AuditEntryCanonical:
    id: uuid.UUID
    timestamp: datetime
    actor_id: uuid.UUID | None
    matter_id: uuid.UUID | None
    action: str
    module: str | None
    resource_type: str | None
    resource_id: str | None
    model_used: str | None
    prompt_hash: str | None
    response_hash: str | None
    token_count: int | None
    latency_ms: int | None
    tokens_in: int | None
    tokens_out: int | None
    cost_micros: int | None
    currency: str | None
    provider: str | None
    model_id: str | None
    payload_text: str

    @classmethod
    def from_row(cls, row: AuditEntry, payload_text: str) -> AuditEntryCanonical:
        return cls(
            id=row.id,
            timestamp=row.timestamp,
            actor_id=row.actor_id,
            matter_id=row.matter_id,
            action=row.action,
            module=row.module,
            resource_type=row.resource_type,
            resource_id=row.resource_id,
            model_used=row.model_used,
            prompt_hash=row.prompt_hash,
            response_hash=row.response_hash,
            token_count=row.token_count,
            latency_ms=row.latency_ms,
            tokens_in=row.tokens_in,
            tokens_out=row.tokens_out,
            cost_micros=row.cost_micros,
            currency=row.currency,
            provider=row.provider,
            model_id=row.model_id,
            payload_text=payload_text,
        )

    def canonical_fields(self) -> dict[str, str | None]:
        """Field values as canonical strings, in hash order.

        This is the exact rendering the entry hash is computed over.
        The matter export writes these strings into ``audit_chain.json``
        so the offline verifier (``export_chain_verifier.py``) can
        recompute hashes without re-deriving any rendering rules.
        """
        return {
            "id": str(self.id),
            "timestamp": _timestamp_utc(self.timestamp),
            "actor_id": _text(self.actor_id),
            "matter_id": _text(self.matter_id),
            "action": self.action,
            "module": self.module,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "model_used": self.model_used,
            "prompt_hash": self.prompt_hash,
            "response_hash": self.response_hash,
            "token_count": _text(self.token_count),
            "latency_ms": _text(self.latency_ms),
            "tokens_in": _text(self.tokens_in),
            "tokens_out": _text(self.tokens_out),
            "cost_micros": _text(self.cost_micros),
            "currency": self.currency,
            "provider": self.provider,
            "model_id": self.model_id,
            "payload_text": self.payload_text,
        }

    def canonical(self) -> str:
        return "\n".join(
            [ENTRY_PREFIX, *(_field(value) for value in self.canonical_fields().values())]
        )

    def entry_hash(self) -> str:
        return _hash(self.canonical())


def chain_link_canonical(
    *,
    chain_version: int,
    scope_type: str,
    matter_id: uuid.UUID | None,
    scope_sequence: int,
    audit_entry_id: uuid.UUID,
    previous_chain_hash: str | None,
    entry_hash: str,
) -> str:
    return "\n".join(
        [
            LINK_PREFIX,
            _field(str(chain_version)),
            _field(scope_type),
            _field(_text(matter_id)),
            _field(str(scope_sequence)),
            _field(str(audit_entry_id)),
            _field(previous_chain_hash),
            _field(entry_hash),
        ]
    )


def chain_link_hash(
    *,
    chain_version: int,
    scope_type: str,
    matter_id: uuid.UUID | None,
    scope_sequence: int,
    audit_entry_id: uuid.UUID,
    previous_chain_hash: str | None,
    entry_hash: str,
) -> str:
    return _hash(
        chain_link_canonical(
            chain_version=chain_version,
            scope_type=scope_type,
            matter_id=matter_id,
            scope_sequence=scope_sequence,
            audit_entry_id=audit_entry_id,
            previous_chain_hash=previous_chain_hash,
            entry_hash=entry_hash,
        )
    )


@dataclass(frozen=True)
class AuditChainIssue:
    code: str
    message: str
    audit_entry_id: uuid.UUID | None = None
    chain_id: int | None = None


@dataclass
class AuditChainVerification:
    ok: bool
    audit_entry_count: int
    chain_entry_count: int
    scopes_verified: int
    issues: list[AuditChainIssue] = field(default_factory=list)


def _scope_for(entry: AuditEntry) -> tuple[str, uuid.UUID | None]:
    if entry.matter_id is None:
        return AUDIT_CHAIN_SCOPE_SYSTEM, None
    return AUDIT_CHAIN_SCOPE_MATTER, entry.matter_id


async def _entry_payload_text(session: AsyncSession, entry_id: uuid.UUID) -> str:
    payload_text = await session.scalar(
        select(cast(AuditEntry.payload, String)).where(AuditEntry.id == entry_id)
    )
    return payload_text or "{}"


async def verify_audit_chain(
    session: AsyncSession,
    *,
    matter_id: uuid.UUID | None = None,
) -> AuditChainVerification:
    """Verify every chain row, or one matter scope when ``matter_id`` is set."""

    issues: list[AuditChainIssue] = []

    audit_count_stmt = select(func.count()).select_from(AuditEntry)
    chain_count_stmt = select(func.count()).select_from(AuditChainEntry)
    chain_stmt = (
        select(AuditChainEntry, AuditEntry)
        .join(AuditEntry, AuditEntry.id == AuditChainEntry.audit_entry_id, isouter=True)
        .order_by(AuditChainEntry.scope_type, AuditChainEntry.matter_id, AuditChainEntry.scope_sequence)
    )

    if matter_id is not None:
        audit_count_stmt = audit_count_stmt.where(AuditEntry.matter_id == matter_id)
        chain_count_stmt = chain_count_stmt.where(AuditChainEntry.matter_id == matter_id)
        chain_stmt = chain_stmt.where(AuditChainEntry.matter_id == matter_id)

    audit_count = int(await session.scalar(audit_count_stmt) or 0)
    chain_count = int(await session.scalar(chain_count_stmt) or 0)

    if audit_count != chain_count:
        issues.append(
            AuditChainIssue(
                code="count_mismatch",
                message=f"audit_entries={audit_count}; audit_chain={chain_count}",
            )
        )

    rows = (await session.execute(chain_stmt)).all()
    seen_scopes: set[tuple[str, uuid.UUID | None]] = set()
    previous_by_scope: dict[tuple[str, uuid.UUID | None], AuditChainEntry] = {}

    for chain, entry in rows:
        scope = (chain.scope_type, chain.matter_id)
        seen_scopes.add(scope)
        previous = previous_by_scope.get(scope)
        expected_sequence = 1 if previous is None else previous.scope_sequence + 1

        if chain.chain_version != AUDIT_CHAIN_VERSION:
            issues.append(
                AuditChainIssue(
                    code="unsupported_chain_version",
                    message=f"expected {AUDIT_CHAIN_VERSION}; got {chain.chain_version}",
                    chain_id=chain.id,
                    audit_entry_id=chain.audit_entry_id,
                )
            )

        if chain.scope_sequence != expected_sequence:
            issues.append(
                AuditChainIssue(
                    code="sequence_gap",
                    message=f"expected sequence {expected_sequence}; got {chain.scope_sequence}",
                    chain_id=chain.id,
                    audit_entry_id=chain.audit_entry_id,
                )
            )

        expected_previous = None if previous is None else previous.chain_hash
        if chain.previous_chain_hash != expected_previous:
            issues.append(
                AuditChainIssue(
                    code="previous_hash_mismatch",
                    message=f"expected {expected_previous}; got {chain.previous_chain_hash}",
                    chain_id=chain.id,
                    audit_entry_id=chain.audit_entry_id,
                )
            )

        if entry is None:
            issues.append(
                AuditChainIssue(
                    code="missing_audit_entry",
                    message="chain row points at a missing audit entry",
                    chain_id=chain.id,
                    audit_entry_id=chain.audit_entry_id,
                )
            )
            previous_by_scope[scope] = chain
            continue

        expected_scope = _scope_for(entry)
        if scope != expected_scope:
            issues.append(
                AuditChainIssue(
                    code="scope_mismatch",
                    message=f"expected {expected_scope}; got {scope}",
                    chain_id=chain.id,
                    audit_entry_id=chain.audit_entry_id,
                )
            )

        payload_text = await _entry_payload_text(session, entry.id)
        expected_entry_hash = AuditEntryCanonical.from_row(entry, payload_text).entry_hash()
        if chain.entry_hash != expected_entry_hash:
            issues.append(
                AuditChainIssue(
                    code="entry_hash_mismatch",
                    message=f"expected {expected_entry_hash}; got {chain.entry_hash}",
                    chain_id=chain.id,
                    audit_entry_id=chain.audit_entry_id,
                )
            )

        expected_chain_hash = chain_link_hash(
            chain_version=chain.chain_version,
            scope_type=chain.scope_type,
            matter_id=chain.matter_id,
            scope_sequence=chain.scope_sequence,
            audit_entry_id=chain.audit_entry_id,
            previous_chain_hash=chain.previous_chain_hash,
            entry_hash=chain.entry_hash,
        )
        if chain.chain_hash != expected_chain_hash:
            issues.append(
                AuditChainIssue(
                    code="chain_hash_mismatch",
                    message=f"expected {expected_chain_hash}; got {chain.chain_hash}",
                    chain_id=chain.id,
                    audit_entry_id=chain.audit_entry_id,
                )
            )

        previous_by_scope[scope] = chain

    return AuditChainVerification(
        ok=not issues,
        audit_entry_count=audit_count,
        chain_entry_count=chain_count,
        scopes_verified=len(seen_scopes),
        issues=issues,
    )
