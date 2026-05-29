/**
 * Phase 14 B — InstallCeremony regression tests.
 *
 * Coverage focus:
 *   - Stepper reflects substrate state
 *   - Advance buttons call the substrate with the right action string
 *   - 409 invalid-transition surfaces a structured banner including
 *     the module.ceremony.rejected audit-row reference + deep-link
 *     (Phase 14 E target)
 *   - Reject path bounces to /modules
 *   - Terminal-failure states block further advances
 *
 * Reviewer-narrow: no polling, no telemetry assertions, no audit
 * row inspection (substrate-side tests already cover those).
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

import { InstallCeremony } from "./InstallCeremony";
import * as api from "../lib/api";
import type { CeremonyResponse } from "../lib/api";

function makeCeremony(overrides: Partial<CeremonyResponse> = {}): CeremonyResponse {
  return {
    ceremony_id: "cer-1",
    module_id: "contract-review",
    state: "discovered",
    fast_path: false,
    is_terminal: false,
    permission_card: {
      module_id: "contract-review",
      module_name: "Contract Review",
      publisher: "legalise",
      publisher_verified: true,
      signature_status: "verified",
      visibility: "first_party",
      version: "0.2.1",
      capabilities: [{ id: "cap-1" }],
      audit_events: [{ action: "module.enabled" }],
      gates: [],
      advice_tier_max: "tier_2",
    },
    history: [],
    ...overrides,
  };
}

function mountAt(initialPath: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const ceremonyRoute = createRoute({
    getParentRoute: () => root,
    path: "/modules/install/$ceremonyId",
    component: () => {
      const { ceremonyId } = ceremonyRoute.useParams();
      return <InstallCeremony ceremonyId={ceremonyId} />;
    },
  });
  const modulesStub = createRoute({
    getParentRoute: () => root,
    path: "/modules",
    component: () => <div data-testid="modules-stub" />,
  });
  const tree = root.addChildren([ceremonyRoute, modulesStub]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("InstallCeremony — stepper", () => {
  it("highlights the current substrate state", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(
      makeCeremony({ state: "permissions_reviewed" }),
    );
    mountAt("/modules/install/cer-1");
    await waitFor(() => {
      expect(screen.getByText("Permissions reviewed")).toBeInTheDocument();
    });
    // Permission card always visible (substrate publishes it from
    // discovered onward). Phase 18-B: the module name now also heads the
    // page, so it appears both in the headline and the permission card.
    expect(screen.getAllByText("Contract Review").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("0.2.1")).toBeInTheDocument();
  });
});

describe("InstallCeremony — advance actions", () => {
  it("continues review before the granted boundary", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(makeCeremony());
    const advance = vi
      .spyOn(api, "advanceCeremony")
      .mockResolvedValue(makeCeremony({ state: "inspected" }));

    mountAt("/modules/install/cer-1");
    await waitFor(() => {
      expect(screen.getByText("Continue review")).toBeInTheDocument();
    });

    expect(screen.queryByText("Enable module")).toBeNull();

    fireEvent.click(screen.getByText("Continue review"));
    await waitFor(() => {
      expect(advance).toHaveBeenCalledWith("cer-1", "trust");
    });
  });

  it("renders the enable action only at the granted boundary", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(
      makeCeremony({ state: "granted" }),
    );
    const advance = vi
      .spyOn(api, "advanceCeremony")
      .mockResolvedValue(makeCeremony({ state: "enabled", is_terminal: true }));

    mountAt("/modules/install/cer-1");
    await waitFor(() => {
      expect(screen.getByText("Enable module")).toBeInTheDocument();
    });

    expect(screen.queryByText("Continue review")).toBeNull();

    fireEvent.click(screen.getByText("Enable module"));
    await waitFor(() => {
      expect(advance).toHaveBeenCalledWith("cer-1", "grant");
    });
  });

  it("reject bounces to /modules after the terminal state renders", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(makeCeremony());
    vi.spyOn(api, "advanceCeremony").mockResolvedValue(
      makeCeremony({
        state: "rejected_by_user",
        is_terminal: true,
      }),
    );

    mountAt("/modules/install/cer-1");
    await waitFor(() => {
      expect(screen.getByText("Reject")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Reject"));

    await waitFor(
      () => {
        expect(screen.getByTestId("modules-stub")).toBeInTheDocument();
      },
      { timeout: 1500 },
    );
  });
});

describe("InstallCeremony — 409 invalid-transition", () => {
  it("renders a structured banner naming the substrate audit row", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(
      makeCeremony({ state: "granted" }),
    );
    vi.spyOn(api, "advanceCeremony").mockRejectedValueOnce(
      new api.InvalidCeremonyTransitionError(
        "cannot grant before permissions_reviewed",
        "cer-1",
        "grant",
      ),
    );

    mountAt("/modules/install/cer-1");
    await waitFor(() => {
      expect(screen.getByText("Enable module")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Enable module"));

    await waitFor(() => {
      expect(
        screen.getByText(/invalid ceremony transition/i),
      ).toBeInTheDocument();
    });
    // The banner references the substrate's audit row by name.
    expect(screen.getByText(/module\.ceremony\.rejected/)).toBeInTheDocument();
    // Phase 14.5 C — the deep-link is back. Action-filter only per
    // the Phase 14.5 plan P1 redline (no ?ceremony= param).
    const link = screen.getByRole("link", { name: /workspace audit/i });
    expect(link.getAttribute("href")).toBe(
      "/admin/audit?action=module.ceremony.rejected",
    );
    // The link MUST NOT carry a ceremony_id — that param doesn't
    // exist on the backend.
    expect(link.getAttribute("href")).not.toMatch(/ceremony=/);
  });
});

describe("InstallCeremony — terminal failures", () => {
  it("hides advance buttons and shows the failure banner", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(
      makeCeremony({ state: "publisher_blocked", is_terminal: true }),
    );
    mountAt("/modules/install/cer-1");
    await waitFor(() => {
      expect(
        screen.getByText(/ceremony terminated/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Continue review")).toBeNull();
    expect(screen.queryByText("Enable module")).toBeNull();
    expect(screen.queryByText("Reject")).toBeNull();
  });
});
