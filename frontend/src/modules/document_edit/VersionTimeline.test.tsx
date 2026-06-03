import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DocumentVersionRead, DocumentVersionSummary } from "../../lib/api";
import { VersionTimeline } from "./VersionTimeline";

function version(
  id: string,
  versionNumber: number,
  overrides: Partial<DocumentVersionRead> = {},
): DocumentVersionRead {
  return {
    id,
    document_id: "doc-1",
    version_number: versionNumber,
    kind: "user_edit",
    created_by_id: "user-1",
    created_at: "2026-06-03T20:00:00Z",
    storage_uri: null,
    filename: `draft-v${versionNumber}.docx`,
    mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size_bytes: 1200,
    sha256: `sha-${versionNumber}`,
    notes: null,
    resolved_text: "Document text",
    resolved_json: null,
    ...overrides,
  };
}

describe("VersionTimeline", () => {
  it("summarises saved document history before the raw version rows", () => {
    const versions: DocumentVersionSummary[] = [
      {
        version: version("v1", 1, {
          kind: "upload",
          storage_uri: "s3://bucket/doc-v1",
          resolved_text: null,
        }),
        pending_count: 0,
        accepted_count: 0,
        rejected_count: 0,
      },
      {
        version: version("v2", 2, { kind: "user_accept" }),
        pending_count: 1,
        accepted_count: 2,
        rejected_count: 1,
      },
    ];

    render(<VersionTimeline documentId="doc-1" versions={versions} />);

    expect(screen.getByRole("heading", { name: "Saved versions" })).toBeInTheDocument();
    expect(screen.getByText("Versions")).toBeInTheDocument();
    expect(screen.getByText("Editable")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByTestId("version-redline-summary")).toHaveTextContent(
      "Redlines: 1 pending · 2 accepted · 1 rejected.",
    );
    expect(screen.getAllByText("Current").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Accepted redlines")).toBeInTheDocument();
  });
});
