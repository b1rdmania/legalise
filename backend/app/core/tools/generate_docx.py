"""generate_docx tool — render a markdown body to a .docx file.

v0.1 markdown handling is intentionally narrow:
  - blank lines separate paragraphs
  - `# ` / `## ` / `### ` prefixes become Heading 1/2/3
  - single newlines inside a paragraph become soft line breaks

A full markdown parser is out of scope; the tool's job is to produce a
plausibly-formatted Word document, not perfect fidelity.

Storage path deviates from the delta sheet: we don't have `user_id` /
`matter_slug` available at the handler boundary without an additional
DB lookup. Path used: `matter_files/generated/{matter_id|_orphan}/{uuid}.docx`.
See HANDOVER_BROADER_A — Phase B should plumb user_id through and
align with `matter_fs.matter_dir(slug, user_id)`.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from docx import Document as DocxDocument
from docx.enum.section import WD_ORIENTATION
from docx.shared import Inches
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.tools.schemas import GenerateDocxInput, GenerateDocxOutput
from app.models import AuditEntry


def _apply_orientation(document: DocxDocument, orientation: str) -> None:
    if orientation != "landscape":
        return
    section = document.sections[0]
    new_width, new_height = section.page_height, section.page_width
    section.orientation = WD_ORIENTATION.LANDSCAPE
    section.page_width = new_width
    section.page_height = new_height


def _render_markdown(document: DocxDocument, title: str, body: str) -> None:
    document.add_heading(title, level=0)
    for block in body.split("\n\n"):
        block = block.rstrip()
        if not block:
            continue
        if block.startswith("### "):
            document.add_heading(block[4:].strip(), level=3)
        elif block.startswith("## "):
            document.add_heading(block[3:].strip(), level=2)
        elif block.startswith("# "):
            document.add_heading(block[2:].strip(), level=1)
        else:
            lines = block.split("\n")
            para = document.add_paragraph(lines[0])
            for line in lines[1:]:
                run = para.add_run()
                run.add_break()
                para.add_run(line)


async def handle_generate_docx(
    inputs: GenerateDocxInput,
    *,
    session: AsyncSession,
    actor_id: uuid.UUID,
    matter_id: uuid.UUID | None,
) -> GenerateDocxOutput:
    document = DocxDocument()
    orientation = (inputs.options.orientation if inputs.options else "portrait")
    _apply_orientation(document, orientation)
    _render_markdown(document, inputs.title, inputs.body_markdown)

    # Path: matter_files/generated/{matter_slug|matter_id}/{uuid}.docx.
    # Phase B plumbs `matter_slug` through `GenerateDocxOptions` so callers
    # that already know it can produce slug-shaped paths (matches
    # matter_fs.matter_dir layout). Falls back to matter_id segment
    # otherwise. See module docstring for Phase A deviation note.
    matter_slug = (
        inputs.options.matter_slug
        if (inputs.options and inputs.options.matter_slug)
        else None
    )
    if matter_slug and matter_id is not None:
        matter_segment = matter_slug
    elif inputs.options and inputs.options.matter_id:
        matter_segment = str(inputs.options.matter_id)
    elif matter_id is not None:
        matter_segment = str(matter_id)
    else:
        matter_segment = "_orphan"
    file_uuid = uuid.uuid4()
    relative = Path("generated") / matter_segment / f"{file_uuid}.docx"
    target = Path(settings.matters_root) / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    document.save(str(target))

    byte_count = target.stat().st_size
    char_count = len(inputs.body_markdown)
    storage_uri = str(relative)

    session.add(
        AuditEntry(
            actor_id=actor_id,
            matter_id=matter_id,
            module="document_generation",
            action="document.generated",
            resource_type="document",
            resource_id=str(file_uuid),
            payload={
                "format": "docx",
                "char_count": char_count,
                "byte_count": byte_count,
                "storage_uri": storage_uri,
                "orientation": orientation,
                "title": inputs.title,
            },
        )
    )

    return GenerateDocxOutput(
        storage_uri=storage_uri,
        byte_count=byte_count,
        char_count=char_count,
    )


__all__ = ["handle_generate_docx"]
