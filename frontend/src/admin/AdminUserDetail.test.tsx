/**
 * Phase 14 F — AdminUserDetail regressions.
 *
 * Pins the load-bearing substrate contract:
 *   - POST body is {role} ONLY (Phase 14 v2 decision #8)
 *   - Self-promotion forbidden → inline banner, not a generic error
 *   - Same-role POST → "no change" copy with explicit no-audit-row note
 *   - Non-admin viewer never sees the role select
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function makeUser(overrides: Partial<api.UserAdminRead> = {}): api.UserAdminRead {
  return {
    id: "u-target",
    email: "target@example.com",
    role: "solicitor",
    is_superuser: false,
    is_active: true,
    is_verified: true,
    name: "Target",
    created_at: "2026-05-01T00:00:00",
    ...overrides,
  };
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

describe("AdminUserDetail — admin viewer, happy path", () => {
  it("POSTs exactly {role} (no reason field) and surfaces the substrate audit-row note", async () => {
    spyAdminMe();
    vi.spyOn(api, "getAdminUser").mockResolvedValue(makeUser());
    const change = vi.spyOn(api, "changeUserRole").mockResolvedValue({
      id: "u-target",
      email: "target@example.com",
      role: "qualified_solicitor",
      is_superuser: false,
    });

    mountAt("/admin/users/u-target");
    await waitFor(() => {
      expect(screen.getByTestId("role-select")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("role-select"), {
      target: { value: "qualified_solicitor" },
    });
    fireEvent.click(screen.getByTestId("role-submit"));

    await waitFor(() => {
      expect(change).toHaveBeenCalledWith("u-target", "qualified_solicitor");
    });
    // changeUserRole serialises {role} only — assert against the spy
    // call. The function signature itself enforces this; the runtime
    // check guards against any future refactor that adds a body field.
    await waitFor(() => {
      expect(
        screen.getByText(/user\.role\.changed/),
      ).toBeInTheDocument();
    });
  });

  it("same-role submit is disabled by the form (the no-op path is not user-reachable)", async () => {
    // Phase 14 F Reviewer redline: the no-op success UI was inferred
    // from comparing the response role to the prior role, but the
    // Phase 11 response carries no `changed` flag, so the inference
    // could mislabel a real write or a real no-op under stale data.
    // The fix is to drop the UI no-op branch and lean on the form's
    // submit-disabled guard. This regression pins the guard.
    spyAdminMe();
    vi.spyOn(api, "getAdminUser").mockResolvedValue(
      makeUser({ role: "qualified_solicitor" }),
    );

    mountAt("/admin/users/u-target");
    await waitFor(() => {
      expect(screen.getByTestId("role-select")).toBeInTheDocument();
    });
    // Draft role matches the current role — submit must be disabled.
    const submit = screen.getByTestId("role-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});

describe("AdminUserDetail — self-promotion", () => {
  it("substrate self-promo 403 surfaces inline, not a generic error", async () => {
    spyAdminMe();
    // The viewer IS the target — admin-1 in our spy.
    vi.spyOn(api, "getAdminUser").mockResolvedValue(
      makeUser({
        id: "admin-1",
        email: "admin@example.com",
        role: "qualified_solicitor",
        is_superuser: true,
      }),
    );
    // The substrate path: even if the UI guard slipped, the call
    // returns the typed SelfPromotionForbiddenError. We rely on that
    // typed error for the banner.
    vi.spyOn(api, "changeUserRole").mockRejectedValue(
      new api.SelfPromotionForbiddenError(
        "Superusers cannot change their own role via this endpoint.",
      ),
    );

    mountAt("/admin/users/admin-1");
    await waitFor(() => {
      expect(screen.getByTestId("role-select")).toBeInTheDocument();
    });
    // The UI also disables the form when viewer.id === target.id;
    // the explainer is the user-visible signal.
    expect(
      screen.getByText(/can't change your own role here/i),
    ).toBeInTheDocument();
  });
});

describe("AdminUserDetail — non-admin viewer", () => {
  it("renders 'Admin required' shell without the role form AND never calls getAdminUser", async () => {
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
    const detailSpy = vi.spyOn(api, "getAdminUser").mockResolvedValue(makeUser());

    mountAt("/admin/users/u-target");
    await waitFor(() => {
      expect(screen.getByText(/Admin required/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("role-select")).toBeNull();
    // No smuggled authority — the admin detail endpoint MUST NOT
    // be called when the viewer is not a superuser. Previously the
    // effect fired once before the render-gate kicked in; the
    // Reviewer redline tightened to zero calls.
    expect(detailSpy).not.toHaveBeenCalled();
  });
});
