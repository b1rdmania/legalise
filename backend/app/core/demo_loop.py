"""Guided Demo Loop v1 — keyless, end-to-end supervised-autonomy proof.

Packages the already-built loop into a first-run experience a fresh
visitor can run WITHOUT a provider key:

    seeded stub-echo matter → installed prompt module → grant → run →
    skill_response artifact → request review → decision → Activity Trail.

Everything here uses the real substrate. The only thing that makes it
keyless is the matter's ``default_model_id = "stub-echo"`` — the gateway's
deterministic StubProvider returns output with no API key, so the
invocation, grants, advice-boundary, artifact write, and audit chain are
all genuine. Nothing is faked:

- No fake provider key (stub-echo is a real keyless provider).
- No fake audit rows (the run emits the real chain).
- No grant/review/invocation bypass (grants are created via the real
  ``create_grants_for_capability``; invocation goes through the normal
  endpoint + prompt runtime).

The matter, document, and module are clearly labelled as demo. The UI
tells the user this was a toy model path and to bring a key for real
providers.

Idempotent. ``ensure_guided_demo(session, user)`` can be called repeatedly;
it returns the existing demo handles unchanged.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.grants_lifecycle import create_grants_for_capability
from app.core.matter_fs import materialise_matter, record_document
from app.core.registry.validator import assert_manifest_v2
from app.core.trust_ceremony import build_permission_card
from app.models import (
    Document,
    InstalledModule,
    Matter,
    PRIVILEGE_CLEARED,
    STATUS_OPEN,
    User,
)
from app.models.document_body import BODY_KIND_EXTRACTED, DocumentBody
from app.models.document_version import VERSION_KIND_UPLOAD, DocumentVersion

DEMO_MATTER_SLUG = "guided-demo-loop"
DEMO_MODULE_ID = "demo.guided-skill"
DEMO_CAPABILITY_ID = "summarise"
DEMO_DOC_FILENAME = "demo-employment-note.txt"

# A short, synthetic, non-privileged note the demo skill summarises.
DEMO_DOC_BODY = """DEMO DOCUMENT — synthetic fixture for the Legalise guided demo.

Internal note: a warehouse employee with three years' continuous service
was dismissed for a single social-media post made outside working hours
from a personal account. The employee had, six weeks earlier, raised a
formal grievance about their line manager. The dismissal letter cites the
company social-media policy as the reason. No prior disciplinary record.

(This is demo content. It is not legal advice and not a real matter.)
"""

# A valid v2 prompt-runtime manifest. model_access is "required" (the skill
# always calls a model) and the internal provider capability satisfies the
# validator's required-provider rule — same honest pattern as imported Lawve
# skills. visibility "example" marks it as a demo/reference module.
DEMO_MANIFEST: dict[str, Any] = {
    "schema_version": "2.0.0",
    "id": DEMO_MODULE_ID,
    "name": "Plain-English Summary (demo)",
    "version": "1.0.0",
    "publisher": "legalise-demo",
    "visibility": "example",
    "runtime": "prompt",
    "description": "Demo prompt skill: summarises a document in plain English. Runs on the keyless stub model.",
    "entrypoint": {
        "prompt_source": "manifest",
        "instructions": (
            "You are a plain-English legal summariser for a non-lawyer. "
            "Summarise the provided document in three short, clear bullet "
            "points. Do not give legal advice; describe what the document "
            "says and flags worth a solicitor's attention."
        ),
    },
    "capabilities": [
        {
            "id": DEMO_CAPABILITY_ID,
            "kind": "skill",
            "scope": "matter",
            "reads": ["document.body.read"],
            "writes": ["matter.artifact.write"],
            "model_access": "required",
            "external_network": False,
            "data_movement": {"external_destinations": [], "local_only": True},
            "gates": ["privilege_posture"],
            "ui": {"slot": "matter.workflows", "label": "Plain-English Summary (demo)"},
            "streaming_mode": "sync",
            "advice_tier_max": "draft_advice",
            "audit_events": [
                "module.capability.invoked",
                "model.invoked",
                "module.capability.completed",
                "posture_gate.check.blocked",
            ],
        },
        {
            "id": "default-provider",
            "kind": "provider",
            "scope": "workspace",
            "reads": [],
            "writes": [],
            "model_access": "none",
            "external_network": False,
            "data_movement": {"external_destinations": [], "local_only": True},
            "gates": [],
            "ui": {"slot": "matter.workflows", "label": "Provider (internal)"},
            "streaming_mode": "sync",
            "advice_tier_max": "factual_extraction",
            "audit_events": ["model.invoked"],
        },
    ],
}


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


async def _ensure_demo_module(session: AsyncSession, user: User) -> InstalledModule:
    """Install the demo prompt module workspace-wide (idempotent by id).

    Direct row insert mirrors ``_persist_install`` — the trust ceremony is
    the user-facing install flow; the demo pre-provisions the same install
    state so a visitor doesn't have to walk the admin ceremony to see the
    loop. The manifest is validated first (fail-closed, no invalid seed).
    """
    existing = await session.scalar(
        select(InstalledModule).where(InstalledModule.module_id == DEMO_MODULE_ID)
    )
    if existing is not None:
        return existing

    assert_manifest_v2(DEMO_MANIFEST)
    # Build the permissions snapshot via the SAME permission-card builder
    # the trust ceremony uses (`_persist_install`), so `capabilities`
    # carries the full per-capability shape (id/kind/scope/reads/writes/
    # model_access/...) that GET /api/modules/installed returns and the
    # matter action panel reads — not bare ids.
    card = build_permission_card(DEMO_MANIFEST)
    permissions_snapshot = {
        "data_movement": card.data_movement_summary,
        "gates": card.gates,
        "advice_tier_max": card.advice_tier_max,
        "audit_events": card.audit_events,
        "capabilities": card.capabilities,
    }
    row = InstalledModule(
        id=uuid.uuid4(),
        module_id=DEMO_MODULE_ID,
        version=DEMO_MANIFEST["version"],
        publisher=DEMO_MANIFEST["publisher"],
        visibility=DEMO_MANIFEST["visibility"],
        signature_status="unsigned",
        signed_by=None,
        verified_at=None,
        install_path="<demo-inline>",
        manifest_snapshot=DEMO_MANIFEST,
        permissions_snapshot=permissions_snapshot,
        installed_by_user_id=user.id,
        enabled=True,
    )
    session.add(row)
    await session.flush()
    return row


async def _ensure_demo_matter(session: AsyncSession, user: User) -> tuple[Matter, Document]:
    """Create the keyless demo matter + one synthetic document for this user.

    Idempotent by (slug, created_by_id). ``default_model_id="stub-echo"`` is
    what makes the loop runnable with no provider key; ``A_cleared`` posture
    means any authenticated user passes the posture gate.
    """
    matter = await session.scalar(
        select(Matter).where(
            Matter.slug == DEMO_MATTER_SLUG, Matter.created_by_id == user.id
        )
    )
    if matter is None:
        matter = Matter(
            slug=DEMO_MATTER_SLUG,
            title="Guided Demo — Governed Loop (stub model)",
            matter_type="employment_tribunal",
            cause="Demo — not a real matter",
            status=STATUS_OPEN,
            privilege_posture=PRIVILEGE_CLEARED,
            default_model_id="stub-echo",
            opened_at=datetime.now(timezone.utc),
            created_by_id=user.id,
        )
        session.add(matter)
        await session.flush()

    document = await session.scalar(
        select(Document).where(
            Document.matter_id == matter.id, Document.filename == DEMO_DOC_FILENAME
        )
    )
    if document is None:
        document = Document(
            matter_id=matter.id,
            filename=DEMO_DOC_FILENAME,
            mime_type="text/plain",
            size_bytes=len(DEMO_DOC_BODY),
            sha256=_sha(f"{DEMO_DOC_FILENAME}:{matter.id}"),
            storage_uri=None,
            tag="demo",
            from_disclosure=False,
            uploaded_by_id=user.id,
        )
        session.add(document)
        await session.flush()
        session.add(
            DocumentBody(
                document_id=document.id,
                kind=BODY_KIND_EXTRACTED,
                extracted_text=DEMO_DOC_BODY,
                extraction_method="passthrough",
                char_count=len(DEMO_DOC_BODY),
                page_count=1,
            )
        )
        session.add(
            DocumentVersion(
                document_id=document.id,
                version_number=1,
                kind=VERSION_KIND_UPLOAD,
                created_by_id=user.id,
                storage_uri=None,
                notes=None,
            )
        )
        await session.flush()
        record_document(
            matter.slug,
            matter.created_by_id,
            str(document.id),
            document.filename,
            document.sha256,
            document.size_bytes,
            document.tag,
        )

    return matter, document


async def ensure_guided_demo(session: AsyncSession, user: User) -> dict[str, Any]:
    """Idempotently provision the guided demo for ``user`` and return its
    handles. Commits its own transaction."""
    installed = await _ensure_demo_module(session, user)
    matter, document = await _ensure_demo_matter(session, user)
    # Real grant creation — matter-scoped grants for the capability's
    # declared reads + writes. No bypass; the invocation still enforces.
    await create_grants_for_capability(
        session,
        user=user,
        matter=matter,
        installed_module=installed,
        capability_id=DEMO_CAPABILITY_ID,
    )
    await session.commit()
    materialise_matter(matter)
    return {
        "matter_slug": matter.slug,
        "matter_title": matter.title,
        "module_id": DEMO_MODULE_ID,
        "capability_id": DEMO_CAPABILITY_ID,
        "document_id": str(document.id),
        "document_filename": document.filename,
        "model_id": "stub-echo",
    }


__all__ = [
    "DEMO_CAPABILITY_ID",
    "DEMO_MATTER_SLUG",
    "DEMO_MODULE_ID",
    "ensure_guided_demo",
]
