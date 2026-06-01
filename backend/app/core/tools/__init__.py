"""Gateway tools registry.

Three model-callable tools:
  - `generate_docx` — render markdown to a .docx under matter_fs
  - `edit_document` — persist a batch of pending edits against a version
  - `replicate_document` — clone the latest version to a new working copy

Each tool declares Pydantic input/output models (JSON Schema derived via
`model_json_schema()`); the gateway validates both sides. Posture gating
applies uniformly — see `ModelGateway.invoke_tool`.

The `register_phase_a_tools(gateway)` helper (name preserved for caller
compatibility) is invoked from `main.lifespan` at startup.
"""

from __future__ import annotations

from app.core.model_gateway import GatewayTool, ModelGateway
from app.core.tools.edit_document import handle_edit_document
from app.core.tools.generate_docx import handle_generate_docx
from app.core.tools.replicate_document import handle_replicate_document
from app.core.tools.schemas import (
    EditDocumentInput,
    EditDocumentOutput,
    GenerateDocxInput,
    GenerateDocxOutput,
    ReplicateDocumentInput,
    ReplicateDocumentOutput,
)


def register_phase_a_tools(gateway: ModelGateway) -> None:
    """Register the three model-callable tools on the supplied gateway.

    Idempotent-ish: calling twice re-registers (last write wins). Tests
    should call `gateway.clear_tools()` between cases.
    """
    gateway.register_tool(
        GatewayTool(
            name="generate_docx",
            description="Render a title + markdown body to a .docx written under matter_fs.",
            input_model=GenerateDocxInput,
            output_model=GenerateDocxOutput,
            handler=handle_generate_docx,
            posture_gated=True,
        )
    )
    gateway.register_tool(
        GatewayTool(
            name="edit_document",
            description="Persist a batch of pending edits against a document version.",
            input_model=EditDocumentInput,
            output_model=EditDocumentOutput,
            handler=handle_edit_document,
            posture_gated=True,
        )
    )
    gateway.register_tool(
        GatewayTool(
            name="replicate_document",
            description="Clone the latest version of a document into a new working copy.",
            input_model=ReplicateDocumentInput,
            output_model=ReplicateDocumentOutput,
            handler=handle_replicate_document,
            posture_gated=True,
        )
    )


__all__ = ["register_phase_a_tools"]
