import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderAsync } from "docx-preview";

import { DocxOriginalPreview } from "./DocxOriginalPreview";
import * as api from "../../lib/api";

vi.mock("docx-preview", () => ({
  renderAsync: vi.fn(async (_blob: Blob, container: HTMLElement) => {
    container.innerHTML =
      "<h1>Witness statement</h1><h2>Dismissal facts</h2><article>Rendered Word body with dismissal facts and a limitation point.</article>";
  }),
}));

describe("DocxOriginalPreview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the audited original and renders it through docx-preview", async () => {
    const blob = new Blob(["docx"], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    vi.spyOn(api, "fetchDocumentOriginalBlob").mockResolvedValue(blob);

    render(<DocxOriginalPreview documentId="doc-1" filename="witness.docx" />);

    expect(screen.getByText(/rendering Word document/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(renderAsync).toHaveBeenCalledWith(
        blob,
        expect.any(HTMLElement),
        undefined,
        expect.objectContaining({
          className: "legalise-docx",
          renderComments: false,
          renderChanges: false,
        }),
      );
    });
    expect(screen.getByText(/Rendered Word body/)).toBeInTheDocument();
    expect(api.fetchDocumentOriginalBlob).toHaveBeenCalledWith("doc-1");
    expect(screen.getByTestId("document-docx-outline")).toHaveTextContent(
      "Witness statement",
    );
    expect(screen.getByTestId("document-docx-outline")).toHaveTextContent(
      "Dismissal facts",
    );
    expect(screen.getByRole("button", { name: "Paper" })).toHaveClass("bg-ink");
    await userEvent.click(screen.getByRole("button", { name: "Wide" }));
    expect(screen.getByRole("button", { name: "Wide" })).toHaveClass("bg-ink");
    expect(screen.getByTestId("document-docx-reader-canvas").firstChild).toHaveClass(
      "legalise-docx-preview-wide",
    );
  });

  it("searches rendered Word text and turns a hit into a review note quote", async () => {
    const blob = new Blob(["docx"], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    vi.spyOn(api, "fetchDocumentOriginalBlob").mockResolvedValue(blob);
    const onQuoteSelected = vi.fn();

    render(
      <DocxOriginalPreview
        documentId="doc-1"
        filename="witness.docx"
        sourceHighlight="dismissal facts"
        onQuoteSelected={onQuoteSelected}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("2 matches · 1 / 2")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/dismissal facts/).length).toBeGreaterThan(0);
    const activeHit = document.querySelector(".legalise-docx-search-hit-active");
    expect(activeHit?.textContent?.toLowerCase()).toContain("dismissal facts");

    await userEvent.click(screen.getAllByRole("button", { name: "Quote in note" })[0]);
    expect(onQuoteSelected).toHaveBeenCalledWith(
      expect.stringMatching(/dismissal facts/i),
    );

    await userEvent.clear(screen.getByPlaceholderText("Search text in this Word file"));
    await userEvent.type(screen.getByPlaceholderText("Search text in this Word file"), "limitation");
    await waitFor(() => {
      expect(screen.getByText("1 match · 1 / 1")).toBeInTheDocument();
    });
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("1 match · 1 / 1")).toBeInTheDocument();
  });

  it("shows a useful error if the original cannot be loaded", async () => {
    vi.spyOn(api, "fetchDocumentOriginalBlob").mockRejectedValue(
      new Error("not available"),
    );

    render(<DocxOriginalPreview documentId="doc-1" filename="witness.docx" />);

    expect(await screen.findByText("not available")).toBeInTheDocument();
  });
});
