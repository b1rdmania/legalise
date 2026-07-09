// DocumentDetail focused tests: redline tools stay visible on the
// workspace, review queue and presence are honest, and ready document
// skills can be run against the whole file or a selected passage.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import * as api from "../lib/api";
import {
  body,
  doc,
  editorTextNode,
  mockReadyDocumentSkill,
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

describe("DocumentDetail — skills", () => {
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
});
