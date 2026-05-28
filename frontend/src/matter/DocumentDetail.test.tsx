/**
 * Document Workspace v1 — DocumentDetail focused tests.
 *
 * Asserts the honest-rendering contracts: metadata + extracted text +
 * versions render; the body-missing state is honest; and there is NO
 * "download original" / "open source file" button (the original-file
 * gap G1 is surfaced as a note, never a fake button).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

function mount(documentId = "doc-1") {
  const root = createRootRoute({ component: () => <Outlet /> });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/documents/$documentId",
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
      initialEntries: [`/matters/khan/documents/${documentId}`],
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
  it("renders metadata + extracted text, and NO download-original button", async () => {
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
    expect(screen.getByText("application/pdf")).toBeInTheDocument();
    expect(screen.getByText(/IN THE COUNTY COURT/)).toBeInTheDocument();
    // Honest original-file gap note present.
    expect(
      screen.getByText(/original uploaded file isn't available to download/i),
    ).toBeInTheDocument();
    // No fake download/open-original control.
    expect(screen.queryByText(/download original/i)).toBeNull();
    expect(screen.queryByText(/open (source|original) file/i)).toBeNull();
  });

  it("shows an honest empty state when no extracted body exists", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([doc()]);
    vi.spyOn(api, "getDocumentBody").mockRejectedValue(new Error("404"));

    mount();
    await waitFor(() => {
      expect(screen.getByText(/no extracted text/i)).toBeInTheDocument();
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
