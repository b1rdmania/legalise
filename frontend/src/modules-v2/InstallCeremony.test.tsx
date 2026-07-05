/**
 * InstallCeremony — admission-scan regression tests.
 *
 * Coverage focus:
 *   - The scan auto-advances the verification states on load (one
 *     "trust" advance per state, each its own audited transition) and
 *     halts at the decision boundary
 *   - Ledger rows render the real verification results
 *   - Approve & enable drives granted → enabled (trust then grant)
 *   - Refuse strikes the entry in seal red and bounces to /skills
 *   - Terminal failures stop the scan and hide the decision
 *   - Revisiting an enabled ceremony renders the record without
 *     re-advancing
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

const FULL_PATH_ORDER = [
  "inspected",
  "signature_checked",
  "publisher_checked",
  "permissions_reviewed",
  "gates_reviewed",
] as const;

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
      signature_status: "structure_verified",
      visibility: "first_party",
      version: "0.2.1",
      capabilities: [
        {
          id: "review",
          kind: "skill",
          reads: ["document.body.read"],
          writes: ["matter.artifact.write"],
          model_access: "required",
        },
      ],
      audit_events: ["module.enabled"],
      gates: ["privilege_posture"],
      advice_tier_max: "draft_advice",
      data_movement_summary: { local_only: true },
    },
    history: [],
    ...overrides,
  };
}

/** advanceCeremony stub that walks the full path one state per call. */
function walkingAdvance() {
  let i = 0;
  return vi
    .spyOn(api, "advanceCeremony")
    .mockImplementation(async (_id, action) => {
      if (action === "reject") {
        return makeCeremony({ state: "rejected_by_user", is_terminal: true });
      }
      if (action === "grant") {
        return makeCeremony({ state: "enabled", is_terminal: true });
      }
      const state = FULL_PATH_ORDER[Math.min(i, FULL_PATH_ORDER.length - 1)];
      i += 1;
      if (i > FULL_PATH_ORDER.length) return makeCeremony({ state: "granted" });
      return makeCeremony({ state });
    });
}

function mountAt(initialPath: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const ceremonyRoute = createRoute({
    getParentRoute: () => root,
    path: "/skills/install/$ceremonyId",
    component: () => {
      const { ceremonyId } = ceremonyRoute.useParams();
      return <InstallCeremony ceremonyId={ceremonyId} />;
    },
  });
  const modulesStub = createRoute({
    getParentRoute: () => root,
    path: "/skills",
    component: () => <div data-testid="modules-stub" />,
  });
  const registerStub = createRoute({
    getParentRoute: () => root,
    path: "/register",
    component: () => <div data-testid="register-stub" />,
  });
  const tree = root.addChildren([ceremonyRoute, modulesStub, registerStub]);
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

describe("InstallCeremony — the scan", () => {
  it("auto-advances the verification states and halts at the decision", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(makeCeremony());
    const advance = walkingAdvance();

    mountAt("/skills/install/cer-1");

    // The scan walks discovered → … → gates_reviewed with one audited
    // "trust" advance per state, then presents the single decision.
    await waitFor(
      () => {
        expect(screen.getByTestId("ceremony-decision")).toBeInTheDocument();
      },
      { timeout: 6000 },
    );
    expect(advance).toHaveBeenCalledTimes(FULL_PATH_ORDER.length);
    for (const call of advance.mock.calls) {
      expect(call).toEqual(["cer-1", "trust"]);
    }

    // The ledger shows the real verification results.
    expect(screen.getByTestId("scan-row-signature_checked")).toHaveTextContent(
      "structure checked",
    );
    expect(screen.getByTestId("scan-row-publisher_checked")).toHaveTextContent(
      "legalise · in publisher registry",
    );
    expect(screen.getByTestId("scan-row-gates_reviewed")).toHaveTextContent(
      "privilege_posture",
    );

    // One decision: approve or refuse. No stepper, no step buttons.
    expect(screen.getByTestId("ceremony-approve-all")).toBeInTheDocument();
    expect(screen.getByTestId("ceremony-refuse")).toBeInTheDocument();
    expect(screen.queryByText("Step through review")).toBeNull();
  }, 10000);

  it("approve drives granted then enabled and shows the enrolment", async () => {
    // Start at the decision boundary so the test skips the scan stagger.
    vi.spyOn(api, "getCeremony").mockResolvedValue(
      makeCeremony({
        state: "gates_reviewed",
        history: [
          { state: "discovered" },
          { state: "inspected" },
          { state: "signature_checked" },
          { state: "publisher_checked" },
          { state: "permissions_reviewed" },
          { state: "gates_reviewed" },
        ],
      }),
    );
    const advance = vi
      .spyOn(api, "advanceCeremony")
      .mockResolvedValueOnce(makeCeremony({ state: "granted" }))
      .mockResolvedValueOnce(
        makeCeremony({ state: "enabled", is_terminal: true }),
      );

    mountAt("/skills/install/cer-1");
    await waitFor(() => {
      expect(screen.getByTestId("ceremony-approve-all")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("ceremony-approve-all"));
    await waitFor(
      () => {
        expect(screen.getByTestId("ceremony-enrolled")).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
    expect(advance).toHaveBeenNthCalledWith(1, "cer-1", "trust");
    expect(advance).toHaveBeenNthCalledWith(2, "cer-1", "grant");
    // The enrolment points at the register.
    expect(screen.getByRole("link", { name: /view the register/i })).toBeInTheDocument();
  }, 10000);

  it("refuse strikes the entry and bounces to /skills", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(
      makeCeremony({
        state: "gates_reviewed",
        history: [{ state: "discovered" }],
      }),
    );
    vi.spyOn(api, "advanceCeremony").mockResolvedValue(
      makeCeremony({ state: "rejected_by_user", is_terminal: true }),
    );

    mountAt("/skills/install/cer-1");
    await waitFor(() => {
      expect(screen.getByTestId("ceremony-refuse")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("ceremony-refuse"));

    // The refusal lands as a struck ledger entry before the bounce.
    await waitFor(() => {
      expect(screen.getByTestId("scan-row-refused")).toBeInTheDocument();
    });
    await waitFor(
      () => {
        expect(screen.getByTestId("modules-stub")).toBeInTheDocument();
      },
      { timeout: 2500 },
    );
  }, 10000);

  it("revisiting an enabled ceremony renders the record without advancing", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(
      makeCeremony({
        state: "enabled",
        is_terminal: true,
        history: [
          { state: "discovered" },
          { state: "inspected" },
          { state: "signature_checked" },
          { state: "publisher_checked" },
          { state: "permissions_reviewed" },
          { state: "gates_reviewed" },
          { state: "granted" },
          { state: "enabled" },
        ],
      }),
    );
    const advance = vi.spyOn(api, "advanceCeremony");

    mountAt("/skills/install/cer-1");
    await waitFor(() => {
      expect(screen.getByTestId("ceremony-enrolled")).toBeInTheDocument();
    });
    expect(advance).not.toHaveBeenCalled();
    expect(screen.getByTestId("scan-row-signature_checked")).toBeInTheDocument();
  });
});

describe("InstallCeremony — terminal failures", () => {
  it("stops the scan and hides the decision", async () => {
    vi.spyOn(api, "getCeremony").mockResolvedValue(
      makeCeremony({ state: "publisher_blocked", is_terminal: true }),
    );
    mountAt("/skills/install/cer-1");
    await waitFor(() => {
      expect(screen.getByText(/admission terminated/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("ceremony-approve-all")).toBeNull();
    expect(screen.queryByTestId("ceremony-refuse")).toBeNull();
  });
});
