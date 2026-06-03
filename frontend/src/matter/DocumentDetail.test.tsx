// DocumentDetail focused tests: content is the hero, document tools
// sit beside it, Open / Download original land on the real proxy URLs,
// source-anchor honesty banner appears when arrived from Chat,
// body-missing state is honest, and deep metadata sits behind Details.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import { DocumentDetail } from "./DocumentDetail";
import * as api from "../lib/api";
import * as anonApi from "../modules/anonymisation/api";
import type { MatterDocument } from "../lib/api";

function doc(over: Partial<MatterDocument> = {}): MatterDocument {
  return {
    id: "doc-1",
    matter_id: "m-1",
    filename: "claim-form.pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
    sha256: "a".repeat(64),
    tag: "pleading",
    from_disclosure: false,
    uploaded_at: "2026-05-28T09:00:00",
    uploaded_by_id: "u-1",
    ...over,
  };
}

function mount(documentId = "doc-1", search = "") {
  const root = createRootRoute({ component: () => <Outlet /> });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/documents/$documentId",
    validateSearch: (s: Record<string, unknown>) => ({
      from: typeof s.from === "string" ? s.from : undefined,
      source: typeof s.source === "string" ? s.source : undefined,
      quote: typeof s.quote === "string" ? s.quote : undefined,
      quote_found: typeof s.quote_found === "string" ? s.quote_found : undefined,
      quoteFound: typeof s.quoteFound === "string" ? s.quoteFound : undefined,
    }),
    component: () => <DocumentDetail slug="khan" documentId={documentId} />,
  });
  const tabStub = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/$tab",
    component: () => <div data-testid="tab-stub" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([detail, tabStub]),
    history: createMemoryHistory({
      initialEntries: [`/matters/khan/documents/${documentId}${search}`],
    }),
  });
  return render(<RouterProvider router={router} />);
}

function body(over: Partial<api.DocumentBody> = {}): api.DocumentBody {
  return {
    document_id: "doc-1",
    kind: "extracted",
    extracted_text: "Original body",
    extraction_method: "python-docx",
    extracted_at: "2026-05-28T09:01:00",
    char_count: 13,
    page_count: 1,
    error_reason: null,
    ...over,
  };
}

function versionSummary(
  id: string,
  versionNumber: number,
  resolvedText: string | null,
  kind = "user_edit",
): api.DocumentVersionSummary {
  return {
    version: {
      id,
      document_id: "doc-1",
      version_number: versionNumber,
      kind,
      created_by_id: "u-1",
      created_at: `2026-05-28T09:0${versionNumber}:00`,
      storage_uri: null,
      notes: null,
      resolved_text: resolvedText,
    },
    pending_count: 0,
    accepted_count: 0,
    rejected_count: 0,
  };
}

async function expectEditorText(container: HTMLElement, text: string) {
  await waitFor(() => {
    expect(container.querySelector(".legalise-document-editor")).toHaveTextContent(text);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "getDocumentVersions").mockResolvedValue([]);
  vi.spyOn(api, "getAnonymisation").mockRejectedValue(new Error("404"));
  // AnonymiseButton (child) fetches its own module's getAnonymisation on
  // mount — stub it so the test doesn't hit the network.
  vi.spyOn(anonApi, "getAnonymisation").mockResolvedValue(null as never);
});
afterEach(() => cleanup());

describe("DocumentDetail", () => {
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
    expect(screen.getByText(/pypdf · 23 chars · 3 pages/)).toBeInTheDocument();
    expect(screen.getByText("Document tools")).toBeInTheDocument();
    expect(screen.getByTestId("document-workbench-tabs")).toBeInTheDocument();
    expect(screen.queryByText("Version record")).toBeNull();
    // Admin-ish document facts sit behind Details; the primary scan
    // path is filename, text, original actions, and document tools.
    expect(screen.queryByText("application/pdf")).toBeNull();
    expect(screen.queryByText(/a{8}/)).toBeNull();
    // Original-file actions are still present (secondary).
    const open = screen.getByText("Open original");
    const download = screen.getByText("Download");
    expect(open.getAttribute("href")).toContain("/documents/doc-1/original");
    expect(open.getAttribute("href")).not.toContain("download=1");
    expect(download.getAttribute("href")).toContain("download=1");
    expect(screen.queryByTestId("document-download-edited-docx")).toBeNull();
    expect(screen.queryByTestId("document-original-preview")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    expect(screen.getByTestId("document-original-preview")).toBeInTheDocument();
    // Old "not available" note is gone.
    expect(
      screen.queryByText(/original uploaded file isn't available/i),
    ).toBeNull();
  });

  it("offers edited DOCX download when a saved resolved version exists", async () => {
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
    expect(screen.getByText(/Viewing saved version v2/)).toBeInTheDocument();
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
    await screen.findByText(/Viewing saved version v3/);
    await expectEditorText(container, "Second saved body");
    expect(screen.getByTestId("document-download-edited-docx").getAttribute("href")).toContain(
      "/documents/doc-1/versions/v-3/docx",
    );

    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    fireEvent.click(screen.getByRole("button", { name: "v2" }));
    await waitFor(() => {
      expect(screen.getByText(/Viewing saved version v2/)).toBeInTheDocument();
    });
    await expectEditorText(container, "First saved body");
    expect(screen.getByTestId("document-download-edited-docx").getAttribute("href")).toContain(
      "/documents/doc-1/versions/v-2/docx",
    );

    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    fireEvent.click(screen.getByRole("button", { name: "Extracted text" }));
    await waitFor(() => {
      expect(screen.getByText(/python-docx · 13 chars · 1 pages/)).toBeInTheDocument();
    });
    await expectEditorText(container, "Original body");
    expect(screen.queryByTestId("document-download-edited-docx")).toBeNull();
  });

  it("surfaces full metadata once the Details disclosure is opened", async () => {
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

  it("keeps redline tools and history visible on the document workspace", async () => {
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

    expect(screen.getByTestId("document-redline-workspace")).toBeInTheDocument();
    expect(screen.getByText("Tighten this clause")).toBeInTheDocument();

    expect(screen.queryByTestId("document-history-workspace")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect(screen.getByTestId("document-history-workspace")).toBeInTheDocument();
    expect(screen.getByText("Version record")).toBeInTheDocument();
    expect(screen.getByText("Redaction")).toBeInTheDocument();
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
    expect(screen.getByText(/Review suggested changes/i)).toBeInTheDocument();
    expect(redlines).toHaveTextContent(/on written notice/i);
    expect(
      screen.getByText(/Proposed edits are ready in the document review area/i),
    ).toBeInTheDocument();
  });

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
    await waitFor(() => {
      expect(screen.getByTestId("from-chat-note")).toBeInTheDocument();
    });
    // Smart back reflects the arrived-from tab.
    expect(screen.getByTestId("document-back-link")).toHaveTextContent(/Back to Chat/i);
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
    });
    expect(container.querySelector("mark")).not.toBeNull();
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
