/**
 * Phase 14.5 C — AdminAuditView regressions.
 *
 * Pins:
 *   - Superuser sees the workspace audit; getAdminReconstruction is
 *     called with the URL filter params.
 *   - Non-superuser sees "Admin required" and the endpoint is NOT
 *     called (UI-gate + no smuggled authority, mirroring
 *     AdminUsersList).
 *   - state_machine + advice_boundary chips render disabled
 *     (substrate constraint per the source-semantics lock).
 *   - Filter chips render when the URL carries invocation_id /
 *     action.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { router as productionRouter } from "../router";
import { AuthProvider } from "../auth/AuthProvider";
import * as api from "../lib/api";

function mountAt(path: string) {
  const router = createRouter({
    routeTree: productionRouter.routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

function spyAdminMe() {
  return vi.spyOn(api, "getCurrentUser").mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    name: "admin",
    role: "qualified_solicitor",
    plan: "free",
    default_model_id: null,
    default_privilege_posture: null,
    is_active: true,
    is_verified: true,
    is_superuser: true,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  // E2 supervision diagnostic loads alongside the record; default to
  // empty (the section hides itself) unless a test overrides it.
  vi.spyOn(api, "getAdminSupervision").mockResolvedValue({
    signers: [],
    healthy_band: [0.02, 0.3],
  });
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ status: "ok", version: "", database: "", environment: "test" }),
        { status: 200 },
      ),
    ),
  ) as never;
});
afterEach(() => {
  cleanup();
});

describe("AdminAuditView — auth gating", () => {
  it("non-superuser sees 'Admin required' shell and endpoint is NOT called", async () => {
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "u@example.com",
      name: "u",
      role: "solicitor",
      plan: "free",
      default_model_id: null,
      default_privilege_posture: null,
      is_active: true,
      is_verified: true,
      is_superuser: false,
    });
    const spy = vi.spyOn(api, "getAdminReconstruction");

    mountAt("/admin/audit");
    await waitFor(() => {
      expect(screen.getByText(/Admin required/i)).toBeInTheDocument();
    });
    // No smuggled authority — endpoint not called for non-admins.
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("AdminAuditView — superuser", () => {
  it("renders workspace audit rows and forwards URL filter params", async () => {
    spyAdminMe();
    const spy = vi.spyOn(api, "getAdminReconstruction").mockResolvedValue({
      entries: [
        {
          source: "audit",
          occurred_at: "2026-05-27T08:00:00",
          action: "module.ceremony.rejected",
          actor: { user_id: "u-1", role: "qualified_solicitor" },
          matter_id: null,
          module_id: "core.trust_ceremony",
          capability_id: null,
          payload: { ceremony_id: "cer-1" },
          refs: {},
          source_row_id: "row-1",
        },
      ],
      next_cursor: null,
      total_in_window_estimate: 1,
    });

    mountAt(
      "/admin/audit?action=module.ceremony.rejected",
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("admin-timeline-row-row-1"),
      ).toBeInTheDocument();
    });
    // Both the row action and the filter chip value carry the string;
    // assert at least one element matches.
    expect(
      screen.getAllByText("module.ceremony.rejected").length,
    ).toBeGreaterThanOrEqual(1);
    // Filter chip rendered.
    expect(screen.getByText("action=")).toBeInTheDocument();
    // URL filter forwarded.
    const lastCall = spy.mock.calls.at(-1)?.[0];
    expect(lastCall?.action).toBe("module.ceremony.rejected");
  });

  it("state_machine + advice_boundary source chips render disabled", async () => {
    spyAdminMe();
    vi.spyOn(api, "getAdminReconstruction").mockResolvedValue({
      entries: [],
      next_cursor: null,
      total_in_window_estimate: 0,
    });

    mountAt("/admin/audit");
    await waitFor(() => {
      expect(screen.getByTestId("source-chip-audit")).toBeInTheDocument();
    });

    const sm = screen.getByTestId("source-chip-state_machine") as HTMLButtonElement;
    const ab = screen.getByTestId("source-chip-advice_boundary") as HTMLButtonElement;
    expect(sm.disabled).toBe(true);
    expect(ab.disabled).toBe(true);
    // Tooltip names the substrate constraint.
    expect(sm.getAttribute("title")).toMatch(/matter-bound by substrate/);
  });

  it("renders the E2 supervision diagnostic table per signer", async () => {
    spyAdminMe();
    vi.spyOn(api, "getAdminReconstruction").mockResolvedValue({
      entries: [],
      next_cursor: null,
      total_in_window_estimate: 0,
    });
    vi.spyOn(api, "getAdminSupervision").mockResolvedValue({
      signers: [
        {
          signer_id: "u-1",
          signer_email: "solicitor@example.com",
          signed: 9,
          signed_with_observations: 1,
          rejected: 0,
          total: 10,
          scrutiny_rate: 0.1,
          median_review_seconds: 840,
          latency_n: 10,
        },
      ],
      healthy_band: [0.02, 0.3],
    });

    mountAt("/admin/audit");
    await waitFor(() => {
      expect(screen.getByTestId("supervision-diagnostic")).toBeInTheDocument();
    });
    const row = screen.getByTestId("supervision-row-u-1");
    expect(row).toHaveTextContent("solicitor@example.com");
    expect(row).toHaveTextContent("10%"); // scrutiny rate in the healthy band
    expect(row).toHaveTextContent("14 minutes");
    expect(row).toHaveTextContent("n=10");
  });

  it("substrate 403 → renders Admin required shell", async () => {
    spyAdminMe();
    vi.spyOn(api, "getAdminReconstruction").mockRejectedValue(
      new api.AdminRequiredError("Endpoint requires superuser."),
    );

    mountAt("/admin/audit");
    await waitFor(() => {
      expect(screen.getByText(/Admin required/i)).toBeInTheDocument();
    });
  });
});
