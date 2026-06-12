import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemoDocumentReader, demoDocumentMatches, splitSearchMatches } from "./DemoMatter";

describe("DemoMatter document search", () => {
  it("splits all case-insensitive matches without changing source text", () => {
    const text = "Witness statement says the witness raised a grievance.";
    const segments = splitSearchMatches(text, "witness");

    expect(segments.filter((segment) => segment.match).map((segment) => segment.text)).toEqual([
      "Witness",
      "witness",
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
  });

  it("returns the original text as a non-match for empty queries", () => {
    expect(splitSearchMatches("No search", "   ")).toEqual([
      { text: "No search", match: false },
    ]);
  });

  it("matches demo documents by filename, source, tag, and hash", () => {
    const doc = {
      id: "doc-1",
      matter_id: "matter-1",
      filename: "dismissal-letter.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      sha256: "abc123".padEnd(64, "0"),
      tag: "disclosure",
      from_disclosure: true,
      uploaded_at: "2026-06-03T10:00:00",
      uploaded_by_id: "user-1",
    };

    expect(demoDocumentMatches(doc, "")).toBe(true);
    expect(demoDocumentMatches(doc, "dismissal")).toBe(true);
    expect(demoDocumentMatches(doc, "cpr 31")).toBe(true);
    expect(demoDocumentMatches(doc, "abc123")).toBe(true);
    expect(demoDocumentMatches(doc, "witness")).toBe(false);
  });

  it("renders the stripped public reader: title, document body, facts — no workbench chrome", () => {
    const docs = [
      {
        id: "doc-1",
        matter_id: "matter-1",
        filename: "dismissal-letter.pdf",
        mime_type: "application/pdf",
        size_bytes: 2048,
        sha256: "abc123".padEnd(64, "0"),
        tag: "disclosure",
        from_disclosure: true,
        uploaded_at: "2026-06-03T10:00:00",
        uploaded_by_id: "user-1",
      },
    ];

    render(<DemoDocumentReader documentId="doc-1" docs={docs} />);

    expect(screen.getByRole("heading", { name: "dismissal-letter.pdf" })).toBeInTheDocument();
    expect(screen.getByTestId("demo-document-reader")).toBeInTheDocument();
    // P29 §3: the workbench rail and lecture list are gone.
    expect(screen.queryByTestId("demo-document-workbench-rail")).not.toBeInTheDocument();
    expect(screen.queryByText(/What happens in the workspace/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Run a skill with this file/i })).not.toBeInTheDocument();
    // Facts render as plain rows, humanised.
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
  });
});
