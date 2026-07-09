// DocumentDetail focused tests: review-note CRUD — quoting from the PDF
// viewer or selected text, adding, resolving, and reopening notes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import * as api from "../lib/api";
import {
  body,
  doc,
  editorTextNode,
  mount,
  setupDocumentDetailMocks,
} from "./DocumentDetail.test-utils";

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

describe("DocumentDetail — review notes", () => {
  it("turns a PDF search result into a quoted review note", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body());

    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Original" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mock PDF quote" }));

    expect(screen.getByPlaceholderText("Optional quoted passage")).toHaveValue(
      "PDF quoted passage",
    );
    expect(screen.getByTestId("document-selected-quote")).toHaveTextContent(
      "PDF quoted passage",
    );
  });

  it("shows document review notes and lets the user add one", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body());
    const getComments = vi.spyOn(api, "getDocumentComments");
    getComments
      .mockResolvedValueOnce([
        {
          id: "comment-1",
          document_id: "doc-1",
          author_id: "u-1",
          quote_text: "Original body",
          body_sha256: "a".repeat(64),
          anchor_start: 0,
          anchor_end: 13,
          body: "Check the context before relying on this.",
          status: "open",
          created_at: "2026-06-03T10:00:00",
          resolved_at: null,
          resolved_by_id: null,
        },
        {
          id: "comment-resolved",
          document_id: "doc-1",
          author_id: "u-1",
          quote_text: "Original body",
          body_sha256: "a".repeat(64),
          anchor_start: 0,
          anchor_end: 13,
          body: "Resolved note kept for the file record.",
          status: "resolved",
          created_at: "2026-06-03T09:00:00",
          resolved_at: "2026-06-03T09:30:00",
          resolved_by_id: "u-1",
        },
      ])
      .mockResolvedValue([]);
    const create = vi.spyOn(api, "createDocumentComment").mockResolvedValue({
      id: "comment-2",
      document_id: "doc-1",
      author_id: "u-1",
      quote_text: null,
      body_sha256: null,
      anchor_start: null,
      anchor_end: null,
      body: "Ask client for policy copy.",
      status: "open",
      created_at: "2026-06-03T10:05:00",
      resolved_at: null,
      resolved_by_id: null,
    });

    mount();
    expect(await screen.findByTestId("document-comments")).toHaveTextContent(
      "Check the context before relying on this.",
    );
    expect(await screen.findByTestId("document-note-navigator")).toHaveTextContent(
      "1 open note on this file.",
    );
    expect(screen.getByTestId("document-note-navigator")).toHaveTextContent(
      "Check the context before relying on this.",
    );
    fireEvent.click(
      within(screen.getByTestId("document-note-navigator")).getByRole("button", {
        name: /Note 1/i,
      }),
    );
    expect(screen.getByTestId("document-content")).toBeInTheDocument();
    expect(screen.getByTestId("document-comments")).toHaveTextContent("Open");
    expect(screen.getByTestId("document-comments")).toHaveTextContent("Anchored");
    expect(screen.getByTestId("document-comments")).toHaveTextContent("Resolved");
    fireEvent.click(screen.getByText("Resolved notes (1)"));
    expect(screen.getByText("Resolved note kept for the file record.")).toBeInTheDocument();
    expect(screen.getByText(/resolved 2026-06-03 09:30/)).toBeInTheDocument();
    expect(await screen.findByTestId("document-editor-note-rail")).toHaveTextContent(
      "Original body",
    );
    fireEvent.change(
      screen.getByPlaceholderText("Optional quoted passage"),
      {
      target: { value: "policy breach" },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText("What should be checked before relying on this document?"),
      {
      target: { value: "Ask client for policy copy." },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        "doc-1",
        expect.objectContaining({
          body: "Ask client for policy copy.",
          quote_text: "policy breach",
          body_sha256: null,
          anchor_start: null,
          anchor_end: null,
        }),
      );
    });
  });

  it("turns selected document text into a quoted review note", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(
      body({
        extracted_text: "The dismissal letter mentioned a single social-media post.",
        char_count: 60,
      }),
    );
    vi.spyOn(api, "getDocumentComments").mockResolvedValue([]);
    const create = vi.spyOn(api, "createDocumentComment").mockResolvedValue({
      id: "comment-2",
      document_id: "doc-1",
      author_id: "u-1",
      quote_text: "single social-media post",
      body_sha256: "b".repeat(64),
      anchor_start: 33,
      anchor_end: 57,
      body: "Check this passage.",
      status: "open",
      created_at: "2026-06-03T10:05:00",
      resolved_at: null,
      resolved_by_id: null,
    });

    mount();
    const content = await screen.findByTestId("document-content");
    const textNode = await editorTextNode(content);
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "single social-media post",
      anchorNode: textNode,
      focusNode: textNode,
    } as unknown as Selection);

    fireEvent.mouseUp(content);
    const selectedPassage = await screen.findByTestId("document-editor-selected-passage");
    expect(selectedPassage).toHaveTextContent("single social-media post");
    fireEvent.click(within(selectedPassage).getByRole("button", { name: "Add review note" }));
    fireEvent.change(
      screen.getByPlaceholderText("What should be checked before relying on this document?"),
      {
        target: { value: "Check this passage." },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        "doc-1",
        expect.objectContaining({
          body: "Check this passage.",
          quote_text: "single social-media post",
          anchor_start: 33,
          anchor_end: 57,
        }),
      );
    });
  });

  it("resolves open document review notes", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body());
    vi.spyOn(api, "getDocumentComments").mockResolvedValue([
      {
        id: "comment-1",
        document_id: "doc-1",
        author_id: "u-1",
        quote_text: null,
        body_sha256: null,
        anchor_start: null,
        anchor_end: null,
        body: "Resolve after checking the source.",
        status: "open",
        created_at: "2026-06-03T10:00:00",
        resolved_at: null,
        resolved_by_id: null,
      },
    ]);
    const update = vi
      .spyOn(api, "updateDocumentComment")
      .mockResolvedValue({
        id: "comment-1",
        document_id: "doc-1",
        author_id: "u-1",
        quote_text: null,
        body_sha256: null,
        anchor_start: null,
        anchor_end: null,
        body: "Edited after checking the source.",
        status: "open",
        created_at: "2026-06-03T10:00:00",
        resolved_at: null,
        resolved_by_id: null,
      });
    const resolve = vi
      .spyOn(api, "resolveDocumentComment")
      .mockResolvedValue({
        id: "comment-1",
        document_id: "doc-1",
        author_id: "u-1",
        quote_text: null,
        body_sha256: null,
        anchor_start: null,
        anchor_end: null,
        body: "Resolve after checking the source.",
        status: "resolved",
        created_at: "2026-06-03T10:00:00",
        resolved_at: "2026-06-03T10:10:00",
        resolved_by_id: "u-1",
    });
    mount();
    await screen.findByTestId("document-comments");
    expect(screen.getByTestId("document-comments")).toHaveTextContent(
      "Resolve after checking the source.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Edit note"), {
      target: { value: "Edited after checking the source." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith("doc-1", "comment-1", {
        body: "Edited after checking the source.",
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() => {
      expect(resolve).toHaveBeenCalledWith("doc-1", "comment-1");
    });
  });

  it("reopens resolved document review notes", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body());
    vi.spyOn(api, "getDocumentComments").mockResolvedValue([
      {
        id: "comment-1",
        document_id: "doc-1",
        author_id: "u-1",
        quote_text: null,
        body_sha256: null,
        anchor_start: null,
        anchor_end: null,
        body: "Resolve after checking the source.",
        status: "resolved",
        created_at: "2026-06-03T10:00:00",
        resolved_at: "2026-06-03T10:10:00",
        resolved_by_id: "u-1",
      },
    ]);
    const reopen = vi
      .spyOn(api, "reopenDocumentComment")
      .mockResolvedValue({
        id: "comment-1",
        document_id: "doc-1",
        author_id: "u-1",
        quote_text: null,
        body_sha256: null,
        anchor_start: null,
        anchor_end: null,
        body: "Resolve after checking the source.",
        status: "open",
        created_at: "2026-06-03T10:00:00",
        resolved_at: null,
        resolved_by_id: null,
      });

    mount();
    await waitFor(() => {
      expect(screen.getByText(/Resolved notes \(1\)/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Resolved notes \(1\)/));
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));

    await waitFor(() => {
      expect(reopen).toHaveBeenCalledWith("doc-1", "comment-1");
    });
  });
});
