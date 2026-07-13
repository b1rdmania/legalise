/**
 * MagicLink — the /auth/magic-link landing page.
 *
 * Pins:
 *   - no token: immediate error state, no API call
 *   - valid token: verifies, refreshes auth state, shows "You're in"
 *   - invalid/expired token: friendly message, not the raw error
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { MagicLink } from "./MagicLink";
import { AuthProvider } from "./AuthProvider";
import * as api from "../lib/api";

const USER: api.CurrentUser = {
  id: "u-1",
  email: "magic@example.com",
  name: "",
  role: "solicitor",
  plan: "free",
  default_model_id: null,
  default_privilege_posture: null,
  is_active: true,
  is_verified: true,
  is_superuser: false,
};

function mount(token: string | null) {
  return render(
    <AuthProvider>
      <MagicLink token={token} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "getCurrentUser").mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
});

describe("MagicLink", () => {
  it("shows an error immediately when there's no token", async () => {
    const spy = vi.spyOn(api, "verifyMagicLink");
    mount(null);

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument();
    expect(screen.getByText(/missing sign-in link/i)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("verifies, refreshes, and shows the signed-in state on success", async () => {
    vi.spyOn(api, "verifyMagicLink").mockResolvedValue(undefined);
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(USER);
    mount("good-token");

    expect(await screen.findByText(/you're in/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open workspace/i })).toHaveAttribute(
      "href",
      "/matters",
    );
  });

  it("shows a friendly message for an expired/invalid token", async () => {
    vi.spyOn(api, "verifyMagicLink").mockRejectedValue(
      new Error("400 Bad Request: MAGIC_LINK_INVALID_OR_EXPIRED"),
    );
    mount("stale-token");

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument();
    expect(screen.getByText(/expired or has already been used/i)).toBeInTheDocument();
  });
});
