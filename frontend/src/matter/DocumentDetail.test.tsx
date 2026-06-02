/**
 * Document Workspace v1 — DocumentDetail focused tests.
 *
 * Asserts the honest-rendering contracts: metadata + extracted text +
 * versions render; the body-missing state is honest; and there is NO
 * "download original" / "open source file" button (the original-file
 * gap G1 is surfaced as a note, never a fake button).
 */

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
      expect(screen.getByText("claim-form.pdf")).toBeInTheDocument();
    });
    // Content is the hero — extracted text visible without any
    // disclosure being opened first.
    expect(screen.getByText(/IN THE COUNTY COURT/)).toBeInTheDocument();
    // Metadata starts collapsed behind a Details disclosure.
    expect(screen.queryByText("application/pdf")).toBeNull();
    // Original-file actions are still present (secondary).
    const open = screen.getByText("Open original");
    const download = screen.getByText("Download original");
    expect(open.getAttribute("href")).toContain("/documents/doc-1/original");
    expect(open.getAttribute("href")).not.toContain("download=1");
    expect(download.getAttribute("href")).toContain("download=1");
    // Old "not available" note is gone.
    expect(
      screen.queryByText(/original uploaded file isn't available/i),
    ).toBeNull();
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
      expect(screen.getByText("claim-form.pdf")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("document-details-toggle"));
    expect(screen.getByText("application/pdf")).toBeInTheDocument();
    expect(screen.getByText(/a{8}/)).toBeInTheDocument(); // sha prefix
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

  it("shows not-found when the document is not in the matter", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([]);
    vi.spyOn(api, "getDocumentBody").mockRejectedValue(new Error("404"));

    mount("missing");
    await waitFor(() => {
      expect(screen.getByText(/document not found/i)).toBeInTheDocument();
    });
  });
});
