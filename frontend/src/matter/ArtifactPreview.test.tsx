/**
 * Phase 14 D — ArtifactPreview kind-routing regressions.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArtifactPreview } from "./ArtifactPreview";

describe("ArtifactPreview", () => {
  it("renders motion_draft as markdown + claim_summary card", () => {
    render(
      <ArtifactPreview
        kindHint="motion_draft"
        payload={{
          markdown: "# Pre-motion brief\nBody.",
          claim_summary: "Khan v Acme — unfair dismissal",
          claim_type: "unfair_dismissal",
        }}
      />,
    );
    expect(screen.getByTestId("motion-draft-view")).toBeInTheDocument();
    expect(
      screen.getByText("Khan v Acme — unfair dismissal"),
    ).toBeInTheDocument();
    expect(screen.getByText("unfair_dismissal")).toBeInTheDocument();
  });

  it("renders evidence_list as a table with document/relevance/citation", () => {
    render(
      <ArtifactPreview
        kindHint="evidence_list"
        payload={{
          evidence: [
            {
              document_id: "doc-1",
              relevance: "high",
              citation_hint: "para 3",
            },
            {
              document_id: "doc-2",
              relevance: "med",
              citation_hint: "para 9",
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("evidence-list-view")).toBeInTheDocument();
    expect(screen.getByText("doc-1")).toBeInTheDocument();
    expect(screen.getByText("para 9")).toBeInTheDocument();
  });

  it("renders JSON fallback for unknown kinds", () => {
    render(
      <ArtifactPreview
        kindHint="experimental_kind"
        payload={{ wat: 42 }}
      />,
    );
    expect(screen.getByTestId("json-fallback")).toBeInTheDocument();
    expect(screen.getByText(/wat/)).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it("falls back to JSON when payload shape doesn't match the kind hint", () => {
    // kindHint says motion_draft but payload has no markdown
    render(
      <ArtifactPreview
        kindHint="motion_draft"
        payload={{ malformed: true }}
      />,
    );
    expect(screen.getByTestId("json-fallback")).toBeInTheDocument();
  });

  it("auto-detects motion_draft when no kindHint given", () => {
    render(
      <ArtifactPreview
        kindHint={null}
        payload={{ markdown: "# hello" }}
      />,
    );
    expect(screen.getByTestId("motion-draft-view")).toBeInTheDocument();
  });
});
