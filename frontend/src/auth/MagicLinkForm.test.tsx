/**
 * MagicLinkForm — collapsed-by-default passwordless request form.
 *
 * Pins:
 *   - renders nothing until enabled (MAGIC_LINK_ENABLED), and nothing
 *     at all when it's off — magic link needs no external credentials
 *     to work, so it needs its own explicit switch or it goes live in
 *     prod the moment the feature deploys
 *   - once enabled: starts collapsed behind a toggle link, no form
 *     fields visible
 *   - clicking the toggle reveals the email field + submit button
 *   - a successful submit calls requestMagicLink and shows the
 *     check-your-inbox confirmation, not the form
 *   - a failed submit shows the error inline and keeps the form open
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MagicLinkForm } from "./MagicLinkForm";
import * as api from "../lib/api";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "getSignInMethods").mockResolvedValue({
    google: false,
    microsoft: false,
    github: false,
    magic_link: true,
  });
});

afterEach(() => {
  cleanup();
});

describe("MagicLinkForm — disabled by default", () => {
  it("renders nothing when magic_link is off", async () => {
    vi.spyOn(api, "getSignInMethods").mockResolvedValue({
      google: false,
      microsoft: false,
      github: false,
      magic_link: false,
    });
    const { container } = render(<MagicLinkForm />);

    await waitFor(() => expect(api.getSignInMethods).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MagicLinkForm — enabled", () => {
  it("starts collapsed with just the toggle link", async () => {
    render(<MagicLinkForm />);
    expect(await screen.findByText(/email me a sign-in link/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it("reveals the form on toggle click", async () => {
    const user = userEvent.setup();
    render(<MagicLinkForm />);

    await user.click(await screen.findByText(/email me a sign-in link/i));

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send sign-in link/i })).toBeInTheDocument();
  });

  it("submits and shows the check-your-inbox confirmation", async () => {
    const spy = vi.spyOn(api, "requestMagicLink").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MagicLinkForm />);

    await user.click(await screen.findByText(/email me a sign-in link/i));
    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.click(screen.getByRole("button", { name: /send sign-in link/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("test@example.com"));
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send sign-in link/i })).not.toBeInTheDocument();
  });

  it("shows an inline error and keeps the form open on failure", async () => {
    vi.spyOn(api, "requestMagicLink").mockRejectedValue(new Error("500 Internal Server Error"));
    const user = userEvent.setup();
    render(<MagicLinkForm />);

    await user.click(await screen.findByText(/email me a sign-in link/i));
    await user.type(screen.getByLabelText(/email/i), "fails@example.com");
    await user.click(screen.getByRole("button", { name: /send sign-in link/i }));

    expect(await screen.findByText(/500 Internal Server Error/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send sign-in link/i })).toBeInTheDocument();
  });
});
