"""SQLAlchemy models for Legalise.

Importing this package imports every model module so `Base.metadata` is
populated for alembic autogenerate.

Schema overview:
- User: id, email, name, role
- Matter: id, slug, title, matter_type, status, case_theory, pivot_fact,
    privilege_posture, default_model_id, facts (JSONB),
    opened_at, closed_at, retention_until, created_by_id
- Document: id, matter_id, filename, mime_type, size_bytes, sha256,
    storage_uri, tag, from_disclosure, disclosure_proceedings_ref,
    uploaded_at, uploaded_by_id
- Event: id, matter_id, event_date, description, significance,
    source_doc_ids, priv_flag, created_at, created_by_id
- AuditEntry: id, timestamp, actor_id, matter_id, action, resource_type,
    resource_id, model_used, prompt_hash, response_hash, token_count,
    latency_ms, payload (JSONB)

See ARCHITECTURE.md for the full data model.
"""

from app.models.base import Base
from app.models.user import AccessToken, User, UserApiKey
from app.models.matter import (
    Matter,
    PRIVILEGE_CLEARED,
    PRIVILEGE_MIXED,
    PRIVILEGE_PAUSED,
    PRIVILEGE_VALUES,
    STATUS_OPEN,
    STATUS_SETTLEMENT,
    STATUS_CLOSED,
    STATUS_VALUES,
)
from app.models.document import Document, TAG_VALUES
from app.models.event import Event
from app.models.audit import AuditEntry
from app.models.document_body import DocumentBody, BODY_KIND_VALUES, EXTRACTION_METHOD_VALUES
from app.models.document_version import DocumentVersion, VERSION_KIND_VALUES
from app.models.document_edit import DocumentEdit, EDIT_STATUS_VALUES
from app.models.tabular_review import TabularReview, TabularReviewRow
from app.models.workspace_skill import WorkspaceDisabledSkill
from app.models.workspace_skill_capability_grant import WorkspaceSkillCapabilityGrant
from app.models.matter_citation import MatterCitation
from app.models.assistant import AssistantMessage

__all__ = [
    "Base",
    "User",
    "AccessToken",
    "UserApiKey",
    "Matter",
    "Document",
    "Event",
    "AuditEntry",
    "DocumentBody",
    "DocumentVersion",
    "DocumentEdit",
    "TabularReview",
    "TabularReviewRow",
    "WorkspaceDisabledSkill",
    "WorkspaceSkillCapabilityGrant",
    "MatterCitation",
    "AssistantMessage",
    "PRIVILEGE_CLEARED",
    "PRIVILEGE_MIXED",
    "PRIVILEGE_PAUSED",
    "PRIVILEGE_VALUES",
    "STATUS_OPEN",
    "STATUS_SETTLEMENT",
    "STATUS_CLOSED",
    "STATUS_VALUES",
    "TAG_VALUES",
    "BODY_KIND_VALUES",
    "EXTRACTION_METHOD_VALUES",
    "VERSION_KIND_VALUES",
    "EDIT_STATUS_VALUES",
]
