/**
 * OAuthButtons — provider button visibility + oauth_error banner.
 *
 * Pins:
 *   - renders nothing when no providers are configured and no error
 *   - renders only the configured providers, Microsoft-Google-GitHub order
 *   - each button is a plain <a href> to the authorize endpoint (a real
 *     browser redirect, not a fetch-intercepted click)
 *   - shows a friendly message for a known ?oauth_error=, and a fallback
 *     for an unknown one
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { OAuthButtons } from "./OAuthButtons";
import * as api from "../lib/api";

const setSearch = (search: string) => {
  window.history.replaceState({}, "", `/auth/login${search}`);
};

beforeEach(() => {
  vi.restoreAllMocks();
  setSearch("");
});

afterEach(() => {
  cleanup();
});

describe("OAuthButtons", () => {
  it("renders nothing when no providers are configured and no error", async () => {
    vi.spyOn(api, "getSignInMethods").mockResolvedValue({
      google: false,
      microsoft: false,
      github: false,
      magic_link: false,
    });
    const { container } = render(<OAuthButtons />);

    await waitFor(() => expect(api.getSignInMethods).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only configured providers, Microsoft first", async () => {
    vi.spyOn(api, "getSignInMethods").mockResolvedValue({
      google: true,
      microsoft: true,
      github: false,
      magic_link: false,
    });
    render(<OAuthButtons />);

    const links = await screen.findAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent("Microsoft");
    expect(links[1]).toHaveTextContent("Google");
    expect(screen.queryByText(/GitHub/)).not.toBeInTheDocument();
  });

  it("each button links straight to the provider's authorize endpoint", async () => {
    vi.spyOn(api, "getSignInMethods").mockResolvedValue({
      google: false,
      microsoft: false,
      github: true,
      magic_link: false,
    });
    render(<OAuthButtons />);

    const link = await screen.findByRole("link", { name: /GitHub/i });
    expect(link).toHaveAttribute("href", api.oauthAuthorizeUrl("github"));
  });

  it("shows a friendly message for a known oauth_error", async () => {
    setSearch("?oauth_error=no_email");
    vi.spyOn(api, "getSignInMethods").mockResolvedValue({
      google: false,
      microsoft: false,
      github: false,
      magic_link: false,
    });
    render(<OAuthButtons />);

    expect(
      await screen.findByText(/no public, verified email/i),
    ).toBeInTheDocument();
  });

  it("falls back to a generic message for an unrecognised oauth_error", async () => {
    setSearch("?oauth_error=something_new");
    vi.spyOn(api, "getSignInMethods").mockResolvedValue({
      google: false,
      microsoft: false,
      github: false,
      magic_link: false,
    });
    render(<OAuthButtons />);

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument();
  });
});
