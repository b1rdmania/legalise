/**
 * Phase 14 D — InvocationRunner failure-path + happy-path regressions.
 *
 * Coverage focus is on the structured failure surfaces — those are
 * load-bearing per ACCEPTANCE §11 (no hidden failures). The happy
 * path is covered too but lightly; ArtifactPreview is unit-tested
 * separately.
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

import { InvocationRunner } from "./InvocationRunner";
import * as api from "../lib/api";

function mountRunner() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const matterRoute = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug",
    component: () => (
      <InvocationRunner
        slug="khan"
        moduleId="pre-motion"
        capabilityId="generate"
      />
    ),
  });
  const artifactsListStub = createRoute({
    getParentRoute: () => root,
    path: "/matters/$slug/artifacts",
    component: () => <div data-testid="artifacts-list-stub" />,
  });
  const settingsKeysStub = createRoute({
    getParentRoute: () => root,
    path: "/settings/keys",
    component: () => <div data-testid="settings-keys-stub" />,
  });
  const tree = root.addChildren([matterRoute, artifactsListStub, settingsKeysStub]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ["/matters/khan"] }),
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("InvocationRunner — happy path", () => {
  it("renders success state with the invocation id + kind-aware preview", async () => {
    vi.spyOn(api, "invokeCapability").mockResolvedValue({
      invocation_id: "inv-1",
      module_id: "pre-motion",
      capability_id: "generate",
      matter_id: "m-1",
      result: {
        markdown: "# Pre-motion brief\nClaim outline.",
        claim_summary: "Khan v Acme — unfair dismissal",
      },
    });

    mountRunner();
    const runBtn = await screen.findByText("Run");
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Invocation complete/i)).toBeInTheDocument();
    });
    expect(screen.getByText("inv-1")).toBeInTheDocument();
    expect(screen.getByTestId("motion-draft-view")).toBeInTheDocument();
    // Deep-link to Phase 14 E target carries invocation_id.
    const auditLink = screen.getByRole("link", {
      name: /see audit trail/i,
    });
    expect(auditLink.getAttribute("href")).toMatch(
      /\/matters\/khan\/audit\?invocation_id=inv-1/,
    );
  });
});

describe("InvocationRunner — structured failure paths", () => {
  it("renders posture banner with required role + actor role", async () => {
    vi.spyOn(api, "invokeCapability").mockRejectedValue(
      new api.PostureBlockedError(
        "posture blocked",
        "B_mixed",
        "qualified_solicitor",
        "solicitor",
        "posture_gate_failed",
      ),
    );

    mountRunner();
    const runBtn = await screen.findByText("Run");
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Privilege gate blocked/)).toBeInTheDocument();
    });
    expect(screen.getByText(/B_mixed/)).toBeInTheDocument();
    expect(screen.getByText(/qualified_solicitor/)).toBeInTheDocument();
    expect(
      screen.getByText(/posture_gate\.check\.blocked/),
    ).toBeInTheDocument();
  });

  it("renders provider key-missing banner with /settings/keys link", async () => {
    vi.spyOn(api, "invokeCapability").mockRejectedValue(
      new api.ProviderKeyMissingForInvokeError(
        "no key",
        "anthropic",
      ),
    );

    mountRunner();
    const runBtn = await screen.findByText("Run");
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Provider API key not configured/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/anthropic/)).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /Configure a provider key/i,
    });
    expect(link.getAttribute("href")).toMatch(/\/settings\/keys/);
  });

  it("renders capability-denied banner referencing module.capability.denied", async () => {
    vi.spyOn(api, "invokeCapability").mockRejectedValue(
      new api.CapabilityDeniedError(
        "denied",
        "pre-motion",
        "generate",
        "matter.read",
      ),
    );

    mountRunner();
    const runBtn = await screen.findByText("Run");
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Capability denied/)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/module\.capability\.denied/),
    ).toBeInTheDocument();
  });

  it("renders advice-boundary banner with blocked_reason", async () => {
    vi.spyOn(api, "invokeCapability").mockRejectedValue(
      new api.Phase1BlockedError(
        "blocked",
        "advice_tier_too_high",
        { tier: "tier_3" },
      ),
    );

    mountRunner();
    const runBtn = await screen.findByText("Run");
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Advice-boundary gate blocked/),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/advice_tier_too_high/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/advice_boundary\.check\.blocked/),
    ).toBeInTheDocument();
  });

  it("renders invalid-args banner with substrate message", async () => {
    vi.spyOn(api, "invokeCapability").mockRejectedValue(
      new api.InvocationInvalidArgsError("claim_type is required"),
    );

    mountRunner();
    const runBtn = await screen.findByText("Run");
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Invalid args/)).toBeInTheDocument();
    });
    expect(screen.getByText(/claim_type is required/)).toBeInTheDocument();
  });
});
