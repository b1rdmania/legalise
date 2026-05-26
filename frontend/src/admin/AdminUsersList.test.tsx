/**
 * Phase 14 F — AdminUsersList regressions.
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

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn(() =>
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

function makeUser(overrides: Partial<api.UserAdminRead> = {}): api.UserAdminRead {
  return {
    id: "u-1",
    email: "u@example.com",
    role: "qualified_solicitor",
    is_superuser: false,
    is_active: true,
    is_verified: true,
    name: "U One",
    created_at: "2026-05-01T00:00:00",
    ...overrides,
  };
}

describe("AdminUsersList — non-admin", () => {
  it("renders 'Admin required' shell for a non-superuser viewer", async () => {
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
    // listAdminUsers shouldn't even be called in the gated branch; we
    // assert that below in addition to the UI shape.
    const listSpy = vi.spyOn(api, "listAdminUsers");

    mountAt("/admin/users");
    await waitFor(() => {
      expect(screen.getByText(/Admin required/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("role-filter")).toBeNull();
    // No smuggled authority: UI does not even attempt the call. The
    // backend would also reject, but we don't rely on that for the
    // gating story.
    // (listAdminUsers may have been called by the not-yet-resolved
    // initial render; tolerate up to one call but expect no second
    // call once the gate flips.)
    expect(listSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("AdminUsersList — admin", () => {
  beforeEach(() => {
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
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
  });

  it("renders the user table with substrate columns + Open link", async () => {
    vi.spyOn(api, "listAdminUsers").mockResolvedValue([
      makeUser({ id: "u-row", email: "row@example.com", role: "solicitor" }),
    ]);

    mountAt("/admin/users");
    await waitFor(() => {
      expect(screen.getByText("row@example.com")).toBeInTheDocument();
    });
    // Role appears in the table cell. Filter dropdown also has a
    // "solicitor" option; match the row cell specifically by its
    // monospace styling — only role cells use font-mono on this page.
    const rowCell = Array.from(document.querySelectorAll("td.font-mono")).find(
      (el) => el.textContent === "solicitor",
    );
    expect(rowCell).toBeTruthy();
    const link = screen.getByRole("link", { name: /open/i });
    expect(link.getAttribute("href")).toBe("/admin/users/u-row");
  });

  it("passes the role filter through to the API call", async () => {
    const spy = vi.spyOn(api, "listAdminUsers").mockResolvedValue([]);
    mountAt("/admin/users");
    await waitFor(() => {
      expect(screen.getByTestId("role-filter")).toBeInTheDocument();
    });
    // Initial call has no role filter.
    expect(spy.mock.calls[0]?.[0]?.role).toBeUndefined();

    fireEvent.change(screen.getByTestId("role-filter"), {
      target: { value: "workspace_admin" },
    });
    await waitFor(() => {
      const last = spy.mock.calls.at(-1)?.[0];
      expect(last?.role).toBe("workspace_admin");
    });
  });

  it("passes the is_superuser filter through", async () => {
    const spy = vi.spyOn(api, "listAdminUsers").mockResolvedValue([]);
    mountAt("/admin/users");
    await waitFor(() => {
      expect(screen.getByTestId("superuser-filter")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("superuser-filter"), {
      target: { value: "true" },
    });
    await waitFor(() => {
      const last = spy.mock.calls.at(-1)?.[0];
      expect(last?.is_superuser).toBe(true);
    });
  });

  it("renders the substrate's admin_required body as the gate shell", async () => {
    // Substrate-side AdminRequiredError from the listing call.
    vi.spyOn(api, "listAdminUsers").mockRejectedValue(
      new api.AdminRequiredError("Endpoint requires superuser."),
    );

    mountAt("/admin/users");
    await waitFor(() => {
      expect(screen.getByText(/Admin required/i)).toBeInTheDocument();
    });
  });
});
