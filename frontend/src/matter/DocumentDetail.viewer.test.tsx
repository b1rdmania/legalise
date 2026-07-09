// DocumentDetail focused tests: content is the hero, document tools sit
// beside it, Open / Download original land on the real proxy URLs, version
// switching, and deep metadata sits behind Details.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import * as api from "../lib/api";
import {
  body,
  doc,
  expectEditorText,
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

describe("DocumentDetail — viewer", () => {
  it("renders content as the hero, with Open/Download original as secondary actions", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue({
      document_id: "doc-1",
      kind: "extracted",
      extracted_text: "IN THE COUNTY COURT...",
      extraction_method: "pypdf",
      extracted_at: "2026-05-28T09:01:00",
      char_count: 23,
      page_count: 3,
      error_reason: null,
    });

    mount();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "claim-form.pdf" }),
      ).toBeInTheDocument();
    });
    // The editor is the hero — source text opens directly in the
    // editable document surface without metadata disclosure first.
    expect(screen.getByTestId("document-editor")).toBeInTheDocument();
    expect(screen.getByText("Ready to read")).toBeInTheDocument();
    // P25: narration chrome is gone — no zero-counter row, no lecture card,
    // no counter board, no shortcuts accordion, no outputs accordion.
    expect(screen.queryByTestId("document-header-status")).toBeNull();
    expect(screen.queryByTestId("document-review-board")).toBeNull();
    expect(screen.queryByTestId("document-work-plan")).toBeNull();
    expect(screen.queryByTestId("document-output-links")).toBeNull();
    expect(screen.queryByText("Work on this file")).toBeNull();
    expect(screen.getByTestId("document-state-rail")).toBeInTheDocument();
    expect(screen.getByText("Suggest edits")).toBeInTheDocument();
    expect(screen.getByTestId("document-workbench-tabs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read" })).toBeInTheDocument();
    expect(screen.queryByText("Version record")).toBeNull();
    // Admin-ish document facts sit behind File details; the primary scan
    // path is filename, text, original actions, review, skills, and versions.
    expect(screen.queryByText("application/pdf")).toBeNull();
    expect(screen.queryByText(/a{8}/)).toBeNull();
    // Original-file actions are still present (secondary).
    const open = screen.getByText("Open original");
    const download = screen.getByText("Download");
    expect(open.getAttribute("href")).toContain("/documents/doc-1/original");
    expect(open.getAttribute("href")).not.toContain("download=1");
    expect(download.getAttribute("href")).toContain("download=1");
    expect(screen.getByRole("button", { name: "Compare versions" })).toBeInTheDocument();
    const ask = screen.getByTestId("document-ask-chat-link");
    expect(ask).toHaveTextContent("Ask about this file");
    expect(ask.getAttribute("href")).toContain("/matters/khan/assistant");
    expect(ask.getAttribute("href")).toContain("document=doc-1");
    expect(screen.getAllByRole("link", { name: "View Activity" }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("document-download-edited-docx")).toBeNull();
    expect(screen.queryByTestId("document-download-edited-pdf")).toBeNull();
    expect(screen.queryByTestId("pdf-document-viewer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    expect(await screen.findByTestId("pdf-document-viewer")).toBeInTheDocument();
    // Old "not available" note is gone.
    expect(
      screen.queryByText(/original uploaded file isn't available/i),
    ).toBeNull();
  });

  it("offers edited DOCX and PDF downloads when a saved resolved version exists", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc({ filename: "witness.docx" })]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body());
    vi.spyOn(api, "getDocumentVersions").mockResolvedValue([
      versionSummary("v-1", 1, null, "upload"),
      versionSummary("v-2", 2, "Edited body"),
    ]);

    mount();
    const link = await screen.findByTestId("document-download-edited-docx");
    expect(link).toHaveTextContent("Download edited DOCX");
    expect(link.getAttribute("href")).toContain("/documents/doc-1/versions/v-2/docx");
    const pdf = screen.getByTestId("document-download-edited-pdf");
    expect(pdf).toHaveTextContent("Download PDF");
    expect(pdf.getAttribute("href")).toContain("/documents/doc-1/versions/v-2/pdf");
    expect(screen.getByText("Viewing saved version v2")).toBeInTheDocument();
  });

  it("shows original file actions for uploaded versions in the version record", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc({ filename: "witness.docx" })]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body());
    vi.spyOn(api, "getDocumentVersions").mockResolvedValue([
      versionSummary("v-1", 1, null, "upload"),
      versionSummary(
        "v-2",
        2,
        "Replacement body",
        "upload",
        "users/u/matters/m/documents/doc-1/v2/replacement.docx",
      ),
      versionSummary("v-3", 3, "Edited body", "user_edit"),
    ]);

    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Versions" }));

    const openOriginal = screen
      .getAllByRole("link", { name: "Open original" })
      .find((link) =>
        link.getAttribute("href")?.includes("/documents/doc-1/versions/v-2/original"),
      );
    const downloadOriginal = screen.getByRole("link", { name: "Download original" });
    if (!openOriginal) throw new Error("version original link not found");
    expect(openOriginal.getAttribute("href")).toContain(
      "/documents/doc-1/versions/v-2/original",
    );
    expect(openOriginal.getAttribute("href")).not.toContain("download=1");
    expect(downloadOriginal.getAttribute("href")).toContain(
      "/documents/doc-1/versions/v-2/original?download=1",
    );
    const editedDocx = screen
      .getAllByRole("link", { name: "Download DOCX" })
      .find((link) => link.getAttribute("href")?.includes("/versions/v-3/docx"));
    if (!editedDocx) throw new Error("edited version DOCX link not found");
    expect(editedDocx.getAttribute("href")).toContain(
      "/documents/doc-1/versions/v-3/docx",
    );
  });

  it("lets the reader switch between saved versions and extracted text", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc({ filename: "witness.docx" })]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body());
    vi.spyOn(api, "getDocumentVersions").mockResolvedValue([
      versionSummary("v-1", 1, null, "upload"),
      versionSummary("v-2", 2, "First saved body"),
      versionSummary("v-3", 3, "Second saved body"),
    ]);

    const { container } = mount();
    await screen.findByText("Viewing saved version v3");
    await expectEditorText(container, "Second saved body");
    expect(screen.getByTestId("document-download-edited-docx").getAttribute("href")).toContain(
      "/documents/doc-1/versions/v-3/docx",
    );
    expect(screen.getByTestId("document-download-edited-pdf").getAttribute("href")).toContain(
      "/documents/doc-1/versions/v-3/pdf",
    );

    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect(screen.getByLabelText("Compare against")).toHaveValue("__extracted");
    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText(/Before · Extracted text/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Compare against"), {
      target: { value: "v-2" },
    });
    expect(screen.getByText(/Before · v2/)).toBeInTheDocument();
    expect(screen.getByText("First saved body")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "v2" }));
    await waitFor(() => {
      expect(screen.getByText("Viewing saved version v2")).toBeInTheDocument();
    });
    await expectEditorText(container, "First saved body");
    expect(screen.getByTestId("document-download-edited-docx").getAttribute("href")).toContain(
      "/documents/doc-1/versions/v-2/docx",
    );
    expect(screen.getByTestId("document-download-edited-pdf").getAttribute("href")).toContain(
      "/documents/doc-1/versions/v-2/pdf",
    );

    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    fireEvent.click(screen.getByRole("button", { name: "Extracted text" }));
    await waitFor(() => {
      // P25: extraction meta cut from chrome
    });
    await expectEditorText(container, "Original body");
    expect(screen.queryByTestId("document-download-edited-docx")).toBeNull();
    expect(screen.queryByTestId("document-download-edited-pdf")).toBeNull();
  });

  it("surfaces full metadata once File details is opened", async () => {
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

    mount();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "claim-form.pdf" }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("document-details-toggle"));
    expect(screen.getByText("application/pdf")).toBeInTheDocument();
    expect(screen.getByText(/a{8}/)).toBeInTheDocument(); // sha prefix
  });
});
