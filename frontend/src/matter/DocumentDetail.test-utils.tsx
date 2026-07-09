// Shared builders, mount helper, and mock setup for the DocumentDetail test
// suite, split by behavior area across DocumentDetail.*.test.tsx files.
// Keep this file free of `vi.mock(...)` calls — those are hoisted per test
// file by Vitest and must live in each test file directly.

import { vi, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
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

export function doc(over: Partial<MatterDocument> = {}): MatterDocument {
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

export function mount(documentId = "doc-1", search = "") {
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

export function body(over: Partial<api.DocumentBody> = {}): api.DocumentBody {
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

export function versionSummary(
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

export function mockReadyDocumentSkill() {
  vi.spyOn(api, "listInstalledModules").mockResolvedValue([
    {
      module_id: "demo.guided-skill",
      version: "0.1.0",
      publisher: "legalise",
      visibility: "first_party",
      signature_status: "structure_verified",
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

export async function expectEditorText(container: HTMLElement, text: string) {
  await waitFor(() => {
    expect(container.querySelector(".legalise-document-editor")).toHaveTextContent(text);
  });
}

export async function editorTextNode(content: HTMLElement): Promise<ChildNode> {
  let node: ChildNode | undefined;
  await waitFor(() => {
    node = content.querySelector(".legalise-document-editor")?.firstChild ?? undefined;
    expect(node).toBeTruthy();
  });
  return node as ChildNode;
}

/** Shared beforeEach setup. Call from every DocumentDetail.*.test.tsx file's
 * own `beforeEach`. Does not include the PdfDocumentViewer mock — that's a
 * hoisted `vi.mock(...)` call and must be declared in each test file. */
export function setupDocumentDetailMocks() {
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
}
