import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderAsync } from "docx-preview";

import { DocxOriginalPreview } from "./DocxOriginalPreview";
import * as api from "../../lib/api";

vi.mock("docx-preview", () => ({
  renderAsync: vi.fn(async (_blob: Blob, container: HTMLElement) => {
    container.innerHTML = "<article>Rendered Word body</article>";
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
    expect(screen.getByText("Rendered Word body")).toBeInTheDocument();
    expect(api.fetchDocumentOriginalBlob).toHaveBeenCalledWith("doc-1");
  });

  it("shows a useful error if the original cannot be loaded", async () => {
    vi.spyOn(api, "fetchDocumentOriginalBlob").mockRejectedValue(
      new Error("not available"),
    );

    render(<DocxOriginalPreview documentId="doc-1" filename="witness.docx" />);

    expect(await screen.findByText("not available")).toBeInTheDocument();
  });
});
