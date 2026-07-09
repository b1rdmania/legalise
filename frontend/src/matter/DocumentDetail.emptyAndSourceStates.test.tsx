// DocumentDetail focused tests: honest empty states — no extracted body,
// the source-anchor honesty banner when arrived from Chat, cited-quote
// highlighting, a not-located warning, and document-not-in-matter.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";

import * as api from "../lib/api";
import { doc, mount, setupDocumentDetailMocks } from "./DocumentDetail.test-utils";

vi.mock("../modules/document_preview/PdfDocumentViewer", () => ({
  PdfDocumentViewer: ({
    filename,
    onQuoteSelected,
  }: {
    filename: string;
    onQuoteSelected?: (quote: string) => void;
  }) => (
    <div data-testid="pdf-document-viewer">
      PDF reader for {filename}
      {onQuoteSelected && (
        <button
          type="button"
          onClick={() => onQuoteSelected("PDF quoted passage")}
        >
          Mock PDF quote
        </button>
      )}
    </div>
  ),
}));

beforeEach(() => {
  setupDocumentDetailMocks();
});
afterEach(() => cleanup());

describe("DocumentDetail — empty and source states", () => {
  it("shows an honest empty state when no extracted body exists", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockRejectedValue(new Error("404"));

    mount();
    await waitFor(() => {
      expect(screen.getByText(/no extracted text/i)).toBeInTheDocument();
    });
  });

  it("surfaces the source-anchor honesty banner when arrived from chat", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue({
      document_id: "doc-1",
      kind: "extracted",
      extracted_text: "BODY",
      extraction_method: "pypdf",
      extracted_at: "2026-05-28T09:01:00",
      char_count: 4,
      page_count: 1,
      error_reason: null,
    });

    mount("doc-1", "?from=assistant");
    // Smart back reflects the arrived-from tab.
    await waitFor(() => {
      expect(screen.getByTestId("document-back-link")).toHaveTextContent(/Back to Chat/i);
    });
    // P25: no narration note without a cited quote, and no lecture card.
    expect(screen.queryByTestId("from-chat-note")).toBeNull();
    expect(screen.queryByText(/Ask the next question with this file attached/i)).toBeNull();
  });

  it("highlights a cited quote when opened from an output source link", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue({
      document_id: "doc-1",
      kind: "extracted",
      extracted_text:
        "The employee was dismissed for a single social-media post made outside working hours.",
      extraction_method: "pypdf",
      extracted_at: "2026-05-28T09:01:00",
      char_count: 85,
      page_count: 1,
      error_reason: null,
    });

    const { container } = mount(
      "doc-1",
      "?from=assistant&source=src_q1&quote=dismissed+for+a+single+social-media+post&quote_found=true",
    );
    await waitFor(() => {
      expect(screen.getByTestId("from-chat-note")).toHaveTextContent(
        /cited passage is highlighted/i,
      );
    }, { timeout: 5000 });
    // The <mark> is painted by Tiptap/ProseMirror, whose editor view
    // mounts in an effect AFTER the React commit that renders the
    // from-chat note — under parallel CI load the highlight can land a
    // tick later than the note. Wait for it explicitly.
    await waitFor(
      () => {
        expect(container.querySelector("mark")).not.toBeNull();
      },
      { timeout: 5000 },
    );
  });

  it("warns when a source quote was not located in the extracted source body", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue({
      document_id: "doc-1",
      kind: "extracted",
      extracted_text: "The employee was dismissed.",
      extraction_method: "pypdf",
      extracted_at: "2026-05-28T09:01:00",
      char_count: 27,
      page_count: 1,
      error_reason: null,
    });

    mount(
      "doc-1",
      "?from=assistant&source=src_q2&quote=governed+by+New+York+law&quoteFound=false",
    );
    await waitFor(() => {
      expect(screen.getByTestId("from-chat-note")).toHaveTextContent(
        /could not locate it/i,
      );
    });
  });

  it("shows not-found when the document is not in the matter", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([]);
    vi.spyOn(api, "getDocumentBody").mockRejectedValue(new Error("404"));

    mount("missing");
    await waitFor(() => {
      expect(screen.getByText(/document not found/i)).toBeInTheDocument();
    });
  });
});
