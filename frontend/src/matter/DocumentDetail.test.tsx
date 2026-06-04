// DocumentDetail focused tests: content is the hero, document tools
// sit beside it, Open / Download original land on the real proxy URLs,
// source-anchor honesty banner appears when arrived from Chat,
// body-missing state is honest, and deep metadata sits behind Details.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  storageUri: string | null = null,
): api.DocumentVersionSummary {
  return {
    version: {
      id,
      document_id: "doc-1",
      version_number: versionNumber,
      kind,
      created_by_id: "u-1",
      created_at: `2026-05-28T09:0${versionNumber}:00`,
      storage_uri: storageUri,
      filename: storageUri ? `draft-v${versionNumber}.txt` : "claim-form.pdf",
      mime_type: storageUri ? "text/plain" : "application/pdf",
      size_bytes: resolvedText?.length ?? 2048,
      sha256: storageUri ? "b".repeat(64) : "a".repeat(64),
      notes: null,
      resolved_text: resolvedText,
    },
    pending_count: 0,
    accepted_count: 0,
    rejected_count: 0,
  };
}

function mockReadyDocumentSkill() {
  vi.spyOn(api, "listInstalledModules").mockResolvedValue([
    {
      module_id: "demo.guided-skill",
      version: "0.1.0",
      publisher: "legalise",
      visibility: "first_party",
      signature_status: "verified",
      enabled: true,
      installed_at: "2026-01-01T00:00:00",
      installed_by_user_id: null,
    },
  ]);
  vi.spyOn(api, "getModulesV2").mockResolvedValue({
    modules: [
      {
        module_id: "demo.guided-skill",
        source_kind: "v2",
        manifest: {
          name: "Demo skill",
          description: "Summarises the selected file.",
          capabilities: [
            {
              id: "summarise",
              kind: "skill",
              scope: "matter",
              reads: ["document.body.read"],
              writes: ["matter.artifact.write"],
              model_access: "required",
              ui: {
                label: "Plain-English Summary",
                default_request: "Summarise {filename}.",
              },
            },
          ],
        },
        is_valid: true,
        validation_errors: [],
      },
    ],
    ui_slots: [],
  });
  vi.spyOn(api, "listGrants").mockResolvedValue({
    matter_id: "m-1",
    grants: [
      {
        id: "g-1",
        plugin: "demo.guided-skill",
        skill: "summarise",
        capability: "document.body.read",
        scope_type: "matter",
        scope_id: "m-1",
        granted_at: "2026-01-01T00:00:00",
      },
      {
        id: "g-2",
        plugin: "demo.guided-skill",
        skill: "summarise",
        capability: "matter.artifact.write",
        scope_type: "matter",
        scope_id: "m-1",
        granted_at: "2026-01-01T00:00:00",
      },
    ],
  });
}

async function expectEditorText(container: HTMLElement, text: string) {
  await waitFor(() => {
    expect(container.querySelector(".legalise-document-editor")).toHaveTextContent(text);
  });
}

async function editorTextNode(content: HTMLElement): Promise<ChildNode> {
  let node: ChildNode | undefined;
  await waitFor(() => {
    node = content.querySelector(".legalise-document-editor")?.firstChild ?? undefined;
    expect(node).toBeTruthy();
  });
  return node as ChildNode;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "getModulesV2").mockResolvedValue({
    modules: [],
    ui_slots: [],
  });
  vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
  vi.spyOn(api, "listGrants").mockResolvedValue({ matter_id: "m-1", grants: [] });
  vi.spyOn(api, "listArtifacts").mockResolvedValue([]);
  vi.spyOn(api, "readArtifact").mockRejectedValue(new Error("not found"));
  vi.spyOn(api, "getDocumentVersions").mockResolvedValue([]);
  vi.spyOn(api, "getDocumentComments").mockResolvedValue([]);
  vi.spyOn(api, "getDocumentEditSessions").mockResolvedValue([]);
  vi.spyOn(api, "startDocumentEditSession").mockResolvedValue({
    current: {
      id: "edit-session-1",
      document_id: "doc-1",
      user_id: "u-1",
      client_id: "client-1",
      user_label: "Andy",
      started_at: "2026-06-03T18:00:00",
      last_seen_at: "2026-06-03T18:00:00",
      ended_at: null,
    },
    active: [
      {
        id: "edit-session-1",
        document_id: "doc-1",
        user_id: "u-1",
        client_id: "client-1",
        user_label: "Andy",
        started_at: "2026-06-03T18:00:00",
        last_seen_at: "2026-06-03T18:00:00",
        ended_at: null,
      },
    ],
  });
  vi.spyOn(api, "endDocumentEditSession").mockResolvedValue(undefined);
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
    expect(screen.getByText("Ready to read")).toBeInTheDocument();
    expect(screen.getByTestId("document-header-status")).toHaveTextContent("Open notes");
    expect(screen.getByTestId("document-header-status")).toHaveTextContent("Pending changes");
    expect(screen.getByTestId("document-header-status")).toHaveTextContent("Versions");
    expect(screen.getByTestId("document-header-status")).toHaveTextContent("Ready skills");
    expect(screen.getByTestId("document-state-rail")).toBeInTheDocument();
    expect(screen.getByTestId("document-next-step")).toHaveTextContent(
      "Start by reading or selecting text.",
    );
    expect(screen.getByTestId("document-review-board")).toHaveTextContent("Notes");
    expect(screen.getByTestId("document-review-board")).toHaveTextContent("Skills");
    expect(screen.getByTestId("document-review-board")).toHaveTextContent("Outputs");
    expect(await screen.findByTestId("document-output-links")).toHaveTextContent(
      "No signed outputs cite this file yet",
    );
    expect(screen.getByTestId("document-work-plan")).toHaveTextContent(
      "Run document skill",
    );
    expect(screen.getByText("Suggested edits")).toBeInTheDocument();
    expect(screen.getByTestId("document-workbench-tabs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read / edit" })).toBeInTheDocument();
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
    expect(screen.getAllByRole("link", { name: "View Record" }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("document-download-edited-docx")).toBeNull();
    expect(screen.queryByTestId("pdf-document-viewer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    expect(await screen.findByTestId("pdf-document-viewer")).toBeInTheDocument();
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

  it("links signed outputs that cite this document", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body());
    vi.spyOn(api, "listArtifacts").mockResolvedValue([
      {
        id: "art-1",
        matter_id: "m-1",
        module_id: "demo.guided-skill",
        capability_id: "summarise",
        invocation_id: "inv-1",
        kind: "skill_response",
        created_by_id: "u-1",
        created_at: "2026-06-03T10:00:00",
        size_bytes: 123,
      },
    ]);
    vi.spyOn(api, "readArtifact").mockResolvedValue({
      id: "art-1",
      matter_id: "m-1",
      module_id: "demo.guided-skill",
      capability_id: "summarise",
      invocation_id: "inv-1",
      kind: "skill_response",
      created_by_id: "u-1",
      created_at: "2026-06-03T10:00:00",
      size_bytes: 123,
      payload: {
        output: "Summary",
        source_anchors: [
          {
            id: "a1",
            source_type: "document",
            document_id: "doc-1",
            filename: "claim-form.pdf",
          },
        ],
      },
    });

    mount();

    const links = await screen.findByTestId("document-output-links");
    expect(links).toHaveTextContent("1 signed output cites this file");
    const attached = await screen.findByTestId("document-attached-outputs");
    expect(attached).toHaveTextContent("Work from this file");
    expect(attached).toHaveTextContent("1 signed output cites this document.");
    expect(within(attached).getByRole("link", { name: /skill response/i })).toHaveAttribute(
      "href",
      "/matters/khan/artifacts/art-1",
    );
    expect(screen.getAllByRole("link", { name: /skill response/i })).toHaveLength(2);
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
    await screen.findByText(/Viewing saved version v3/);
    await expectEditorText(container, "Second saved body");
    expect(screen.getByTestId("document-download-edited-docx").getAttribute("href")).toContain(
      "/documents/doc-1/versions/v-3/docx",
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

  it("shows a review queue and honest live presence on the workbench", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body());
    vi.spyOn(api, "getDocumentVersions").mockResolvedValue([
      {
        ...versionSummary("v-1", 1, "Original body"),
        pending_count: 2,
      },
    ]);
    vi.spyOn(api, "getDocumentComments").mockResolvedValue([
      {
        id: "comment-1",
        document_id: "doc-1",
        author_id: "u-1",
        quote_text: null,
        body_sha256: null,
        anchor_start: null,
        anchor_end: null,
        body: "Check this before signing.",
        status: "open",
        created_at: "2026-06-03T10:00:00",
        resolved_at: null,
        resolved_by_id: null,
      },
    ]);
    vi.spyOn(api, "startDocumentEditSession").mockResolvedValue({
      current: {
        id: "edit-session-1",
        document_id: "doc-1",
        user_id: "u-1",
        client_id: "client-1",
        user_label: "Andy",
        started_at: "2026-06-03T18:00:00",
        last_seen_at: "2026-06-03T18:00:00",
        ended_at: null,
      },
      active: [
        {
          id: "edit-session-1",
          document_id: "doc-1",
          user_id: "u-1",
          client_id: "client-1",
          user_label: "Andy",
          started_at: "2026-06-03T18:00:00",
          last_seen_at: "2026-06-03T18:00:00",
          ended_at: null,
        },
        {
          id: "edit-session-2",
          document_id: "doc-1",
          user_id: "u-2",
          client_id: "client-2",
          user_label: "Reviewer",
          started_at: "2026-06-03T18:01:00",
          last_seen_at: "2026-06-03T18:01:00",
          ended_at: null,
        },
      ],
    });

    mount();

    expect(await screen.findByTestId("document-review-queue")).toHaveTextContent(
      "4 review items waiting",
    );
    expect(screen.getByTestId("document-review-queue")).toHaveTextContent(
      "Proposed redlines",
    );
    expect(screen.getByTestId("document-presence-strip")).toHaveTextContent(
      "2 people have this file open",
    );
    expect(screen.getByText(/Another session is active/i)).toBeInTheDocument();
  });

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

  it("runs ready document skills from the document workbench", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(body());
    mockReadyDocumentSkill();
    vi.spyOn(api, "invokeCapability").mockResolvedValue({
      invocation_id: "inv-1",
      module_id: "demo.guided-skill",
      capability_id: "summarise",
      matter_id: "m-1",
      result: { artifact_id: "art-1" },
    });
    vi.spyOn(api, "readArtifact").mockResolvedValue({
      id: "art-1",
      matter_id: "m-1",
      module_id: "demo.guided-skill",
      capability_id: "summarise",
      invocation_id: "inv-1",
      kind: "skill_response",
      created_by_id: "u-1",
      created_at: "2026-06-03T10:00:00",
      size_bytes: 123,
      payload: {
        output: "Summary",
        source_anchors: [
          {
            id: "a1",
            source_type: "document",
            document_id: "doc-1",
            filename: "claim-form.pdf",
          },
        ],
      },
    });

    mount();

    expect(await screen.findByTestId("document-skill-runner")).toHaveTextContent(
      "1 ready",
    );
    expect(screen.getByTestId("document-skill-runner")).toHaveTextContent(
      "Run a skill with this file selected.",
    );
    expect(screen.getByTestId("document-skill-runner")).toHaveTextContent(
      "Run with this file",
    );
    fireEvent.click(screen.getByRole("button", { name: /Plain-English Summary/i }));

    expect(screen.getByTestId("generic-runner-demo.guided-skill-summarise")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Summarise claim-form.pdf.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("generic-run-demo.guided-skill-summarise"));

    expect(await screen.findByTestId("generic-runner-result")).toHaveTextContent("Output written");
    expect(screen.getByTestId("document-output-links")).toHaveTextContent(
      "1 signed output cites this file",
    );
  });

  it("runs a ready document skill against a selected passage", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockResolvedValue(
      body({
        extracted_text: "The dismissal letter mentioned a single social-media post.",
        char_count: 60,
      }),
    );
    mockReadyDocumentSkill();
    const invoke = vi.spyOn(api, "invokeCapability").mockResolvedValue({
      invocation_id: "inv-1",
      module_id: "demo.guided-skill",
      capability_id: "summarise",
      matter_id: "m-1",
      result: { artifact_id: "art-1" },
    });
    vi.spyOn(api, "readArtifact").mockResolvedValue({
      id: "art-1",
      matter_id: "m-1",
      module_id: "demo.guided-skill",
      capability_id: "summarise",
      invocation_id: "inv-1",
      kind: "skill_response",
      created_by_id: "u-1",
      created_at: "2026-06-03T10:00:00",
      size_bytes: 123,
      payload: { output: "Summary" },
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
    expect(await screen.findByTestId("document-selected-quote")).toHaveTextContent(
      "single social-media post",
    );

    fireEvent.click(await screen.findByRole("button", { name: "Run skill on passage" }));

    const expectedRequest = [
      "Use this selected passage from claim-form.pdf:",
      "",
      '"single social-media post"',
      "",
      "Run Plain-English Summary.",
    ].join("\n");
    expect(screen.getAllByRole("textbox")[0]).toHaveValue(expectedRequest);
    fireEvent.click(screen.getByTestId("generic-run-demo.guided-skill-summarise"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "khan",
        expect.objectContaining({
          module_id: "demo.guided-skill",
          capability_id: "summarise",
          args: expect.objectContaining({
            input: expectedRequest,
            document_id: "doc-1",
          }),
        }),
      );
    });
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
    expect(await screen.findByTestId("document-editor-selected-passage")).toHaveTextContent(
      "single social-media post",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add review note" }));
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
    await screen.findByText(/Viewing saved version v2/);
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
    expect(screen.getByText(/Viewing saved version v2/)).toBeInTheDocument();
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
    expect(screen.getByTestId("document-next-step")).toHaveTextContent(
      /Ask the next question with this file attached/i,
    );
    expect(screen.getByRole("button", { name: "Back to Chat" })).toBeInTheDocument();
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
