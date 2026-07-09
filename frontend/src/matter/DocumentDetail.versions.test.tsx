// DocumentDetail focused tests: the saved-versions workspace — open and
// download saved versions, upload a replacement, restore a prior version,
// and promote accepted redlines into the main review area.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import * as api from "../lib/api";
import {
  body,
  doc,
  mount,
  setupDocumentDetailMocks,
  versionSummary,
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

describe("DocumentDetail — versions", () => {
  it("makes saved versions openable and downloadable from the version workspace", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc({ filename: "witness.docx" })]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body());
    vi.spyOn(api, "getDocumentComments").mockResolvedValue([
      {
        id: "comment-1",
        document_id: "doc-1",
        author_id: "u-1",
        quote_text: "Edited",
        body_sha256: "a".repeat(64),
        anchor_start: null,
        anchor_end: null,
        body: "Check the edit before relying on it.",
        status: "open",
        created_at: "2026-06-03T10:00:00",
        resolved_at: null,
        resolved_by_id: null,
      },
    ]);
    vi.spyOn(api, "getDocumentVersions").mockResolvedValue([
      versionSummary("v-1", 1, null, "upload"),
      versionSummary("v-2", 2, "Edited body"),
    ]);

    mount();
    await screen.findByText("Viewing saved version v2");
    fireEvent.click(screen.getByRole("button", { name: "Versions" }));

    expect(screen.getByRole("heading", { name: "Saved versions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in editor" })).toBeInTheDocument();
    const download = screen.getByRole("link", { name: "Download DOCX" });
    expect(download.getAttribute("href")).toContain("/documents/doc-1/versions/v-2/docx");
    expect(screen.getAllByText("Includes 1 review note.").length).toBeGreaterThan(0);
  });

  it("uploads a replacement file as the next active document version", async () => {
    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce([doc({ filename: "draft-v1.txt", mime_type: "text/plain" })])
      .mockResolvedValueOnce([doc({ filename: "draft-v2.txt", mime_type: "text/plain", sha256: "b".repeat(64) })]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body({ extracted_text: "Updated body" }));
    vi.spyOn(api, "getDocumentVersions")
      .mockResolvedValueOnce([versionSummary("v-1", 1, null, "upload")])
      .mockResolvedValueOnce([
        versionSummary("v-1", 1, null, "upload"),
        versionSummary("v-2", 2, "Updated body", "upload"),
      ]);
    const upload = vi.spyOn(api, "uploadDocumentVersion").mockResolvedValue({
      id: "v-2",
      document_id: "doc-1",
      version_number: 2,
      kind: "upload",
      created_by_id: "u-1",
      created_at: "2026-05-28T09:06:00",
      storage_uri: "users/u/matters/m/documents/doc-1/b",
      filename: "draft-v2.txt",
      mime_type: "text/plain",
      size_bytes: 12,
      sha256: "b".repeat(64),
      notes: "Clean copy",
      resolved_text: "Updated body",
    });

    mount();
    await screen.findByRole("heading", { name: "draft-v1.txt" });
    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    const input = screen.getByTestId("document-version-file-input");
    const file = new File(["Updated body"], "draft-v2.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(screen.getByPlaceholderText("Optional version note"), {
      target: { value: "Clean copy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload version" }));

    await waitFor(() => {
      expect(upload).toHaveBeenCalledWith("doc-1", file, "Clean copy");
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "draft-v2.txt" })).toBeInTheDocument();
    });
    expect(screen.getByText("Viewing saved version v2")).toBeInTheDocument();
  });

  it("restores a prior saved version and refreshes active document content", async () => {
    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce([doc({ filename: "draft-v2.txt", mime_type: "text/plain", sha256: "b".repeat(64) })])
      .mockResolvedValueOnce([doc({ filename: "draft-v1.txt", mime_type: "text/plain", sha256: "a".repeat(64) })]);
    vi.spyOn(api, "getDocumentBody")
      .mockResolvedValueOnce(body({ extracted_text: "Current body" }))
      .mockResolvedValueOnce(body({ extracted_text: "Restored body" }));
    vi.spyOn(api, "getDocumentVersions")
      .mockResolvedValueOnce([
        versionSummary("v-1", 1, "Restored body", "upload", "users/u/m/doc/a"),
        versionSummary("v-2", 2, "Current body", "upload", "users/u/m/doc/b"),
      ])
      .mockResolvedValueOnce([
        versionSummary("v-1", 1, "Restored body", "upload", "users/u/m/doc/a"),
        versionSummary("v-2", 2, "Current body", "upload", "users/u/m/doc/b"),
        versionSummary("v-3", 3, "Restored body", "restored", "users/u/m/doc/a"),
      ]);
    const restore = vi.spyOn(api, "restoreDocumentVersion").mockResolvedValue({
      id: "v-3",
      document_id: "doc-1",
      version_number: 3,
      kind: "restored",
      created_by_id: "u-1",
      created_at: "2026-05-28T09:06:00",
      storage_uri: "users/u/m/doc/a",
      filename: "draft-v1.txt",
      mime_type: "text/plain",
      size_bytes: 13,
      sha256: "a".repeat(64),
      notes: "Restored from v1",
      resolved_text: "Restored body",
    });

    mount();
    await screen.findByRole("heading", { name: "draft-v2.txt" });
    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    const restoreButtons = await screen.findAllByRole("button", { name: "Restore" });
    fireEvent.click(restoreButtons[0]);

    await waitFor(() => {
      expect(restore).toHaveBeenCalledWith("doc-1", "v-1");
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "draft-v1.txt" })).toBeInTheDocument();
    });
    expect(screen.getByTestId("document-editor")).toHaveTextContent("Restored body");
  });

  it("moves proposed redlines into the main document review area", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue({
      document_id: "doc-1",
      kind: "extracted",
      extracted_text: "The agreement may terminate immediately.",
      extraction_method: "pypdf",
      extracted_at: "2026-05-28T09:01:00",
      char_count: 40,
      page_count: 1,
      error_reason: null,
    });
    vi.spyOn(api, "postEditInstruction").mockResolvedValue({
      version: {
        id: "v-2",
        document_id: "doc-1",
        version_number: 2,
        kind: "model_edit",
        created_by_id: "u-1",
        created_at: "2026-05-28T09:05:00",
        storage_uri: null,
        filename: "claim-form.pdf",
        mime_type: "application/pdf",
        size_bytes: 2048,
        sha256: "a".repeat(64),
        notes: null,
        resolved_text: null,
      },
      pending_edits: [
        {
          id: "edit-1",
          document_version_id: "v-2",
          change_id: "c1",
          correlation_id: null,
          deleted_text: "may terminate immediately",
          inserted_text: "may terminate on written notice",
          context_before: "The agreement ",
          context_after: ".",
          rationale: "Avoids abrupt termination language.",
          status: "pending",
          created_at: "2026-05-28T09:05:00",
        },
      ],
      model_used: "stub-echo",
      model_notes: "One edit proposed.",
      instruction_hash: "hash",
      parse_ok: true,
    });
    vi.spyOn(api, "acceptAll").mockResolvedValue({
      affected_count: 1,
      new_version: {
        id: "v-3",
        document_id: "doc-1",
        version_number: 3,
        kind: "user_accept",
        created_by_id: "u-1",
        created_at: "2026-05-28T09:06:00",
        storage_uri: null,
        filename: "claim-form.pdf",
        mime_type: "application/pdf",
        size_bytes: 45,
        sha256: "b".repeat(64),
        notes: "Accepted model edits",
        resolved_text: "The agreement may terminate on written notice.",
      },
      resolved_text: "The agreement may terminate on written notice.",
    });

    mount();
    await waitFor(() => {
      expect(screen.getByTestId("document-editor")).toBeInTheDocument();
    });
    fireEvent.change(
      screen.getByPlaceholderText(/type an edit instruction/i),
      {
        target: { value: "Tighten termination wording." },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Propose edits" }));

    const redlines = await screen.findByTestId("document-inline-redlines");
    expect(redlines).toBeInTheDocument();
    expect(screen.getByTestId("document-redlines-ready")).toHaveTextContent(
      "1 proposed edit waiting",
    );
    expect(screen.getByText(/Review suggested changes/i)).toBeInTheDocument();
    expect(redlines).toHaveTextContent(/on written notice/i);
    expect(
      screen.getByText(/Proposed edits are ready in the document review area/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    const reviewSaved = await screen.findByRole("button", {
      name: "Review saved version",
    });
    fireEvent.click(reviewSaved);

    expect(screen.getByRole("heading", { name: "Version record" })).toBeInTheDocument();
    expect(screen.getByText(/Before · Extracted text/)).toBeInTheDocument();
    expect(screen.getByText(/After · v3/)).toBeInTheDocument();
  });
});
