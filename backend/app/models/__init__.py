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
    STATUS_ARCHIVED,
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
from app.models.job import (
    Job,
    JOB_STATUS_QUEUED,
    JOB_STATUS_RUNNING,
    JOB_STATUS_SUCCEEDED,
    JOB_STATUS_FAILED,
    JOB_STATUS_CANCELLED,
    JOB_STATUS_VALUES,
    JOB_ACTIVE_STATUSES,
    JOB_KIND_PRE_MOTION,
    JOB_KIND_CONTRACT_REVIEW,
    JOB_KIND_EXPORT,
)

# Phase 1 substrate primitives.
from app.models.matter_context_schema import MatterContextSchema
from app.models.matter_context_item import (
    MatterContextItem,
    SOURCE_TYPE_DOCUMENT,
    SOURCE_TYPE_EVENT,
    SOURCE_TYPE_AUDIT_ENTRY,
    SOURCE_TYPE_USER_ASSERTION,
    SOURCE_TYPE_CONNECTOR_RESULT,
    SOURCE_TYPE_GENERATED_OUTPUT,
    SOURCE_TYPE_VALUES,
)
from app.models.state_machine_definition import StateMachineDefinition
from app.models.state_machine_instance import (
    StateMachineInstance,
    OWNER_SCOPE_MATTER,
    OWNER_SCOPE_WORKSPACE,
    OWNER_SCOPE_PROSPECT,
)
from app.models.state_machine_transition import (
    StateMachineTransition,
    TRANSITION_STATUS_COMPLETED,
    TRANSITION_STATUS_BLOCKED,
    TRANSITION_STATUS_FAILED,
    TRANSITION_STATUS_VALUES,
)

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
    "Job",
    "JOB_STATUS_QUEUED",
    "JOB_STATUS_RUNNING",
    "JOB_STATUS_SUCCEEDED",
    "JOB_STATUS_FAILED",
    "JOB_STATUS_CANCELLED",
    "JOB_STATUS_VALUES",
    "JOB_ACTIVE_STATUSES",
    "JOB_KIND_PRE_MOTION",
    "JOB_KIND_CONTRACT_REVIEW",
    "JOB_KIND_EXPORT",
    "PRIVILEGE_CLEARED",
    "PRIVILEGE_MIXED",
    "PRIVILEGE_PAUSED",
    "PRIVILEGE_VALUES",
    "STATUS_OPEN",
    "STATUS_SETTLEMENT",
    "STATUS_CLOSED",
    "STATUS_ARCHIVED",
    "STATUS_VALUES",
    "TAG_VALUES",
    "BODY_KIND_VALUES",
    "EXTRACTION_METHOD_VALUES",
    "VERSION_KIND_VALUES",
    "EDIT_STATUS_VALUES",
    # Phase 1 — matter context primitive.
    "MatterContextSchema",
    "MatterContextItem",
    "SOURCE_TYPE_DOCUMENT",
    "SOURCE_TYPE_EVENT",
    "SOURCE_TYPE_AUDIT_ENTRY",
    "SOURCE_TYPE_USER_ASSERTION",
    "SOURCE_TYPE_CONNECTOR_RESULT",
    "SOURCE_TYPE_GENERATED_OUTPUT",
    "SOURCE_TYPE_VALUES",
    # Phase 1 — state machine primitive.
    "StateMachineDefinition",
    "StateMachineInstance",
    "StateMachineTransition",
    "OWNER_SCOPE_MATTER",
    "OWNER_SCOPE_WORKSPACE",
    "OWNER_SCOPE_PROSPECT",
    "TRANSITION_STATUS_COMPLETED",
    "TRANSITION_STATUS_BLOCKED",
    "TRANSITION_STATUS_FAILED",
    "TRANSITION_STATUS_VALUES",
]
