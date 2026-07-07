/**
 * Phase 14 A — AppHome three-state regression tests.
 *
 * Asserts copy + structure for each state:
 *   1. user_count=0          → "Register first account" CTA; copy says
 *                              local quickstart auto-promotes first user
 *   2. has_superuser=false   → CLI literal + binary path visible;
 *                              no UI shortcut to self-promote
 *   3. has_superuser=true    → either signin redirect (unauth) or
 *                              authed home (matters list)
 *
 * Reviewer P1 invariant from the v2 plan redline:
 *   "Do not imply registration makes someone superuser unless the
 *    backend actually does that." The backend now does that in local
 *    quickstart only, so the test keeps the scope explicit.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import { AppHome } from "./AppHome";
import { AuthProvider } from "../auth/AuthProvider";
import * as api from "../lib/api";

function mountAt(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/app",
    component: AppHome,
  });
  // /auth/login + /matters target stubs — AppHome may navigate to
  // them and we need real routes for navigate() to resolve cleanly.
  const signinRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/auth/login",
    component: () => <div data-testid="signin-stub" />,
  });
  const waitlistRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/waitlist",
    component: () => <div data-testid="waitlist-stub" />,
  });
  const signupRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/auth/signup",
    component: () => <div data-testid="signup-stub" />,
  });
  const matterDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/matters/$slug",
    component: () => <div data-testid="matter-detail-stub" />,
  });
  const mattersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/matters",
    component: () => <div data-testid="matters-stub" />,
  });
  const newMatterRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/matters/new",
    component: () => <div data-testid="new-matter-stub" />,
  });
  const tree = rootRoute.addChildren([
    appRoute,
    signinRoute,
    waitlistRoute,
    signupRoute,
    matterDetailRoute,
    mattersRoute,
    newMatterRoute,
  ]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("AppHome — State 1: fresh fork (user_count=0)", () => {
  it("renders the empty state and the 'Register first account' CTA", async () => {
    vi.spyOn(api, "getBootstrapState").mockResolvedValue({
      user_count: 0,
      has_superuser: false,
    });
    // Also stub /auth/users/me — AuthProvider runs it on mount.
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(null);

    mountAt("/app");

    await waitFor(() => {
      expect(screen.getByText(/no accounts yet/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: /register first account/i }),
    ).toHaveAttribute("href", "/auth/signup");
  });

  it("scopes first-user auto-admin to local quickstart", async () => {
    vi.spyOn(api, "getBootstrapState").mockResolvedValue({
      user_count: 0,
      has_superuser: false,
    });
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(null);

    mountAt("/app");

    await waitFor(() => {
      expect(screen.getByText(/no accounts yet/i)).toBeInTheDocument();
    });
    const body = document.body.textContent ?? "";
    expect(body).toMatch(/local quickstart/i);
    expect(body).toMatch(/promoted to workspace admin automatically/i);
    expect(body).toMatch(/disable auto-admin/i);
    expect(body).toMatch(/host-side bootstrap CLI command/i);
  });
});

describe("AppHome — State 2: bootstrap required", () => {
  it("renders the literal CLI command and the binary path", async () => {
    vi.spyOn(api, "getBootstrapState").mockResolvedValue({
      user_count: 3,
      has_superuser: false,
    });
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(null);

    mountAt("/app");

    await waitFor(() => {
      expect(
        screen.getByText(/administrator not yet bootstrapped/i),
      ).toBeInTheDocument();
    });
    // CLI literal must appear verbatim — the operator copy-pastes this.
    expect(
      screen.getByText("python -m app.tools.bootstrap_admin <email>"),
    ).toBeInTheDocument();
    // Binary path so the operator knows where to run it from.
    expect(
      screen.getByText("backend/app/tools/bootstrap_admin.py"),
    ).toBeInTheDocument();
  });
});

describe("AppHome — State 3: has_superuser, viewer unauthed", () => {
  it("bounces an unauthed visitor away from the home", async () => {
    vi.spyOn(api, "getBootstrapState").mockResolvedValue({
      user_count: 3,
      has_superuser: true,
    });
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(null);

    mountAt("/app");

    // The redirect happens in a useEffect. Where it lands depends on
    // HOSTED_ACCESS_WAITLIST (defaults to false in self-host/dev), but the
    // invariant is the same: AppHome must NOT render the authed home
    // for an unauthed viewer. Either stub is fine.
    await waitFor(() => {
      const onSignin = screen.queryByTestId("signin-stub");
      const onWaitlist = screen.queryByTestId("waitlist-stub");
      expect(onSignin || onWaitlist).not.toBeNull();
    });
    // Critical invariant: the authed home content is NOT mounted.
    expect(screen.queryByText("Matters")).toBeNull();
  });
});

describe("AppHome — State 3: has_superuser, viewer authed", () => {
  it("bounces to the /matters workspace index", async () => {
    vi.spyOn(api, "getBootstrapState").mockResolvedValue({
      user_count: 3,
      has_superuser: true,
    });
    vi.spyOn(api, "getCurrentUser").mockResolvedValue({
      id: "u-1",
      email: "andy@example.com",
      role: "qualified_solicitor",
      is_superuser: false,
    } as never);

    mountAt("/app");

    // The authed-home dashboard was retired with the IA reset:
    // /matters is the canonical workspace index. AppHome renders a
    // brief loader and the router takes the user to the matters list.
    await waitFor(() => {
      expect(screen.getByTestId("matters-stub")).toBeInTheDocument();
    });
  });
});
