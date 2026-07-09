// Shared fixtures, mount helper, and mock setup for the AssistantTab test
// suite, split across AssistantTab.*.test.tsx files. Pure relocation of the
// setup that used to live at the top of AssistantTab.test.tsx — no behavior
// changes here.

import { afterEach, beforeEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { AssistantTab } from "./AssistantTab";
import * as api from "../../lib/api";
import type { AssistantMessage, Matter, MatterDocument } from "../../lib/api";

export {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
  api,
  AssistantTab,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
};
export type { AssistantMessage, Matter, MatterDocument };

export const matter: Matter = {
  id: "m-1",
  slug: "khan-v-acme",
  title: "Khan v Acme",
  matter_type: "civil",
  privilege_posture: "B_mixed",
  required_provider: null,
  default_model_id: null,
} as never;

export function mountChat(overrides?: {
  setTabAndHash?: (k: string) => void;
  docs?: MatterDocument[] | null;
  initialMessages?: AssistantMessage[];
  onDocumentChip?: (documentId: string) => void;
  initialDocumentId?: string | null;
  matter?: Matter;
  onPostureChange?: (next: string) => Promise<void>;
}) {
  const setTabAndHash = overrides?.setTabAndHash ?? vi.fn();
  const docs = overrides?.docs ?? [];
  const mounted = overrides?.matter ?? matter;
  const root = createRootRoute({ component: () => <Outlet /> });
  const tab = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/assistant",
    component: () => (
      <AssistantTab
        matter={mounted}
        docs={docs}
        chronology={[]}
        setTabAndHash={setTabAndHash as never}
        auditCount={0}
        showPostureInPulse={false}
        initialMessages={overrides?.initialMessages}
        onDocumentChip={overrides?.onDocumentChip}
        initialDocumentId={overrides?.initialDocumentId}
        onPostureChange={overrides?.onPostureChange}
      />
    ),
  });
  const lawveStub = createRoute({
    getParentRoute: () => root,
    path: "/skills/lawve",
    component: () => <div data-testid="lawve-stub" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([tab, lawveStub]),
    history: createMemoryHistory({
      initialEntries: [`/matters/${matter.slug}/assistant`],
    }),
  });
  const { unmount } = render(<RouterProvider router={router} />);
  return { setTabAndHash, unmount };
}

export const someDoc = (
  id: string,
  filename: string,
  uploadedAt = "2026-06-03T10:00:00",
): MatterDocument =>
  ({
    id,
    matter_id: "m-1",
    filename,
    mime_type: "text/plain",
    size_bytes: 100,
    sha256: "a".repeat(64),
    tag: "draft",
    from_disclosure: false,
    uploaded_at: uploadedAt,
    uploaded_by_id: "u-1",
  }) as never;

// Call once at module scope in each split test file to install the shared
// mock setup/teardown (equivalent to the original file's top-level
// beforeEach/afterEach).
export function registerAssistantTabHooks() {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "listAssistantMessages").mockResolvedValue([]);
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [],
      ui_slots: [],
    } as never);
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [],
    });
    vi.spyOn(api, "postAssistantMessage").mockResolvedValue({
      user: {
        id: "u-1",
        role: "user",
        content: "",
        suggested_actions: [],
        created_at: "",
      },
      assistant: {
        id: "a-1",
        role: "assistant",
        content: "",
        suggested_actions: [],
        created_at: "",
      },
    } as never);
    vi.spyOn(api, "postAssistantMessageStream").mockImplementation(
      async function* () {
        yield {
          event: "result",
          data: {
            user: {
              id: "u-1",
              role: "user",
              content: "",
              suggested_actions: [],
              created_at: "",
            },
            assistant: {
              id: "a-1",
              role: "assistant",
              content: "",
              suggested_actions: [],
              created_at: "",
            },
          },
        } as never;
      },
    );
  });
  afterEach(() => {
    cleanup();
  });
}
