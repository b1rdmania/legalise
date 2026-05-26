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
    // discovered onward).
    expect(screen.getByText("Contract Review")).toBeInTheDocument();
    expect(screen.getByText("0.2.1")).toBeInTheDocument();
  });
});

describe("InstallCeremony — advance actions", () => {
  it("trust + grant call advanceCeremony with the right action", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(makeCeremony());
    const advance = vi
      .spyOn(api, "advanceCeremony")
      .mockResolvedValue(makeCeremony({ state: "inspected" }));

    mountAt("/modules/install/cer-1");
    await waitFor(() => {
      expect(screen.getByText("Trust + continue")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Trust + continue"));
    await waitFor(() => {
      expect(advance).toHaveBeenCalledWith("cer-1", "trust");
    });

    fireEvent.click(screen.getByText("Grant + enable"));
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
  it("renders a structured banner with the audit deep-link", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(makeCeremony());
    vi.spyOn(api, "advanceCeremony").mockRejectedValueOnce(
      new api.InvalidCeremonyTransitionError(
        "cannot grant before permissions_reviewed",
        "cer-1",
        "grant",
      ),
    );

    mountAt("/modules/install/cer-1");
    await waitFor(() => {
      expect(screen.getByText("Grant + enable")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Grant + enable"));

    await waitFor(() => {
      expect(
        screen.getByText(/invalid ceremony transition/i),
      ).toBeInTheDocument();
    });
    // The banner references the substrate's audit row.
    expect(screen.getByText(/module\.ceremony\.rejected/)).toBeInTheDocument();
    // Deep-link uses the stable query-param shape Phase 14 E will
    // honour.
    const auditLink = screen.getByRole("link", {
      name: /view in audit trail/i,
    });
    expect(auditLink.getAttribute("href")).toMatch(
      /action=module\.ceremony\.rejected/,
    );
    expect(auditLink.getAttribute("href")).toMatch(/ceremony=cer-1/);
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
    expect(screen.queryByText("Trust + continue")).toBeNull();
    expect(screen.queryByText("Grant + enable")).toBeNull();
    expect(screen.queryByText("Reject")).toBeNull();
  });
});
