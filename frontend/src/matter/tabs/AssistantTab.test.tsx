/**
 * AssistantTab — chat skill picker (PR 5).
 *
 * Pins the source-of-truth contract: the in-chat picker reads
 * getMatterWorkflows and shows only workflows already granted on this
 * matter. No third skill-state model.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
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
import type { Matter } from "../../lib/api";

const matter: Matter = {
  id: "m-1",
  slug: "khan-v-acme",
  title: "Khan v Acme",
  matter_type: "civil",
  privilege_posture: "B_mixed",
  required_provider: null,
  default_model_id: null,
} as never;

function mountChat(overrides?: { setTabAndHash?: (k: string) => void }) {
  const setTabAndHash = overrides?.setTabAndHash ?? vi.fn();
  const root = createRootRoute({ component: () => <Outlet /> });
  const tab = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/assistant",
    component: () => (
      <AssistantTab
        matter={matter}
        docs={[]}
        chronology={[]}
        setTabAndHash={setTabAndHash as never}
        auditCount={0}
        showPostureInPulse={false}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([tab]),
    history: createMemoryHistory({
      initialEntries: [`/matters/${matter.slug}/assistant`],
    }),
  });
  render(<RouterProvider router={router} />);
  return { setTabAndHash };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "listAssistantMessages").mockResolvedValue([]);
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
});
afterEach(() => {
  cleanup();
});

describe("AssistantTab — in-chat skill picker", () => {
  it("counts and lists only workflows granted on this matter", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({
      workflows: [
        {
          key: "premotion",
          title: "Pre-Motion",
          description: "Analyse the dispute.",
          declared_capabilities: [],
          granted_capabilities: [],
          grant: "granted",
          last_run_at: null,
          availability: "ok",
          reason: null,
        },
        {
          key: "letters",
          title: "Letters",
          description: "Draft pre-action letters.",
          declared_capabilities: [],
          granted_capabilities: [],
          grant: "granted",
          last_run_at: null,
          availability: "ok",
          reason: null,
        },
        // Not granted on this matter — must not appear.
        {
          key: "contract-review",
          title: "Contract Review",
          description: "Review contracts.",
          declared_capabilities: [],
          granted_capabilities: [],
          grant: "blocked",
          last_run_at: null,
          availability: "blocked-by-grant",
          reason: null,
        },
      ],
    } as never);

    mountChat();

    const toggle = await screen.findByTestId("chat-skills-toggle");
    await waitFor(() => expect(toggle).toHaveTextContent("Skills (2)"));

    fireEvent.click(toggle);
    expect(await screen.findByTestId("chat-skills-popover")).toBeInTheDocument();
    expect(screen.getByTestId("chat-skill-premotion")).toBeInTheDocument();
    expect(screen.getByTestId("chat-skill-letters")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-skill-contract-review")).toBeNull();
  });

  it("routes to the picked skill's tab via setTabAndHash", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({
      workflows: [
        {
          key: "premotion",
          title: "Pre-Motion",
          description: "Analyse.",
          declared_capabilities: [],
          granted_capabilities: [],
          grant: "granted",
          last_run_at: null,
          availability: "ok",
          reason: null,
        },
      ],
    } as never);

    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash });

    fireEvent.click(await screen.findByTestId("chat-skills-toggle"));
    fireEvent.click(await screen.findByTestId("chat-skill-premotion"));

    expect(setTabAndHash).toHaveBeenCalledWith("premotion");
  });

  it("shows the empty state and routes to the matter Skills tab when nothing is enabled", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({
      workflows: [],
    } as never);

    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash });

    const toggle = await screen.findByTestId("chat-skills-toggle");
    fireEvent.click(toggle);

    expect(
      await screen.findByText(/No skills enabled on this matter yet/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Enable a skill/i));
    expect(setTabAndHash).toHaveBeenCalledWith("workflows");
  });

  it("exposes the ambient Record and Documents links in the header", async () => {
    vi.spyOn(api, "getMatterWorkflows").mockResolvedValue({
      workflows: [],
    } as never);

    const setTabAndHash = vi.fn();
    mountChat({ setTabAndHash });

    fireEvent.click(await screen.findByTestId("open-record-link"));
    expect(setTabAndHash).toHaveBeenCalledWith("audit");

    fireEvent.click(screen.getByTestId("open-documents-link"));
    expect(setTabAndHash).toHaveBeenCalledWith("documents");
  });
});
