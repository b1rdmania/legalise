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

  it("renders findings_pack as a table with severity badge", () => {
    // Contract Review writes this kind. Shape per
    // examples/modules/contract_review/capability.py:Finding.to_dict.
    render(
      <ArtifactPreview
        kindHint="findings_pack"
        payload={{
          findings: [
            {
              clause_id: "12.3",
              severity: "high",
              comment: "Unilateral termination without notice.",
              citation: "Clause 12.3, line 4",
            },
            {
              clause_id: "7.1",
              severity: "medium",
              comment: "IP assignment is broader than market norm.",
              citation: "Clause 7.1, schedule B",
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("findings-pack-view")).toBeInTheDocument();
    expect(screen.getByText("12.3")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(
      screen.getByText(/Unilateral termination/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Clause 7.1/)).toBeInTheDocument();
  });

  it("auto-detects findings_pack when no kindHint given", () => {
    render(
      <ArtifactPreview
        kindHint={null}
        payload={{
          findings: [
            { clause_id: "1", severity: "low", comment: "ok", citation: "x" },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("findings-pack-view")).toBeInTheDocument();
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

  it("renders skill_response as output text + request/model header", () => {
    // Prompt Runtime writes this kind. Shape per
    // backend/app/core/prompt_runtime.py write_artifact payload.
    render(
      <ArtifactPreview
        kindHint="skill_response"
        payload={{
          output: "The clause is enforceable under UK law.",
          model_id: "claude-opus-4-7",
          input: "Is clause 4 enforceable?",
        }}
      />,
    );
    expect(screen.getByTestId("skill-response-view")).toBeInTheDocument();
    expect(screen.getByText(/enforceable under UK law/)).toBeInTheDocument();
    expect(screen.getByText("Is clause 4 enforceable?")).toBeInTheDocument();
    expect(screen.getByText("claude-opus-4-7")).toBeInTheDocument();
  });

  it("auto-detects skill_response from an output string when no kindHint", () => {
    render(<ArtifactPreview kindHint={null} payload={{ output: "hello" }} />);
    expect(screen.getByTestId("skill-response-view")).toBeInTheDocument();
  });

  it("renders source chips for skill_response anchors, linking to the document", () => {
    render(
      <ArtifactPreview
        kindHint="skill_response"
        matterSlug="khan"
        payload={{
          output: "Summary.",
          source_anchors: [
            {
              id: "src_d1",
              source_type: "document",
              document_id: "doc-9",
              filename: "khan-dismissal-letter.pdf",
              label: "Document · khan-dismissal-letter.pdf",
              quote: null,
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("source-anchors")).toBeInTheDocument();
    const chip = screen.getByTestId("source-chip-src_d1");
    expect(chip).toHaveTextContent(/khan-dismissal-letter\.pdf/);
    expect(chip.querySelector("a")?.getAttribute("href")).toBe(
      "/matters/khan/documents/doc-9?from=assistant&source=src_d1",
    );
  });

  it("links quote anchors into the document reader with source context", () => {
    render(
      <ArtifactPreview
        kindHint="skill_response"
        matterSlug="khan"
        payload={{
          output: "Summary.",
          source_anchors: [
            {
              id: "src_q1",
              source_type: "document",
              document_id: "doc-9",
              filename: "f.pdf",
              label: "Document · f.pdf",
              quote: "dismissed for a single social-media post",
              quote_found_in_source: true,
            },
          ],
        }}
      />,
    );
    const quote = screen.getByTestId("source-quote-src_q1");
    const href = quote.querySelector("a")?.getAttribute("href") ?? "";
    expect(href).toContain("/matters/khan/documents/doc-9?");
    expect(href).toContain("from=assistant");
    expect(href).toContain("source=src_q1");
    expect(href).toContain("quote=dismissed+for+a+single+social-media+post");
    expect(href).toContain("quote_found=true");
    expect(href).toContain("quoteFound=true");
  });

  it("flags a quote not found in source as a caution, not a verification", () => {
    render(
      <ArtifactPreview
        kindHint="skill_response"
        matterSlug="khan"
        payload={{
          output: "Summary.",
          source_anchors: [
            {
              id: "src_q1",
              source_type: "document",
              document_id: "doc-9",
              filename: "f.pdf",
              label: "Document · f.pdf",
              quote: "governed by New York law",
              quote_found_in_source: false,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText(/quote not found in source/i)).toBeInTheDocument();
    expect(screen.getByText("Open passage")).toBeInTheDocument();
  });

  it("shows 'No sources cited' for an empty anchors array", () => {
    render(
      <ArtifactPreview
        kindHint="skill_response"
        payload={{ output: "Summary.", source_anchors: [] }}
      />,
    );
    expect(screen.getByTestId("no-sources")).toBeInTheDocument();
  });

  it("does not render a source block for a legacy skill_response with no anchors key", () => {
    render(<ArtifactPreview kindHint="skill_response" payload={{ output: "old" }} />);
    expect(screen.queryByTestId("source-anchors")).toBeNull();
    expect(screen.queryByTestId("no-sources")).toBeNull();
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
