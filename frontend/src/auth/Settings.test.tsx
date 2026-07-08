/**
 * Settings keys tab — OpenRouter as a first-class BYO-key provider.
 *
 * Pins:
 *   - the provider select offers OpenRouter alongside Anthropic/OpenAI
 *   - a stored OpenRouter key renders as a row with the remove affordance
 *   - the default-model picker renders the catalog's OpenRouter entries
 *     plus the single reference-model caveat line (once, not per entry)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { Settings } from "./Settings";
import { AuthProvider } from "./AuthProvider";
import * as api from "../lib/api";
import type { CurrentUser, ModelOption, UserApiKeyRead } from "../lib/api";

const USER: CurrentUser = {
  id: "u-1",
  email: "user@example.com",
  name: "Test User",
  role: "user",
  plan: "eval",
  default_model_id: null,
  default_privilege_posture: null,
  is_active: true,
  is_verified: true,
  is_superuser: false,
};

const MODELS: ModelOption[] = [
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5 - reference model",
    provider: "anthropic",
    requires_key: true,
    note: "Legalise is built and tested against Sonnet 5. Runs on your Anthropic key.",
    recommended: true,
    key_configured: false,
  },
  {
    id: "anthropic/claude-sonnet-5",
    label: "Claude Sonnet 5 (via OpenRouter)",
    provider: "openrouter",
    requires_key: true,
    note: "The reference model on an OpenRouter key.",
    recommended: false,
    key_configured: true,
  },
  {
    id: "deepseek/deepseek-r1",
    label: "DeepSeek R1 (via OpenRouter)",
    provider: "openrouter",
    requires_key: true,
    note: "Strong open-weights reasoning model on an OpenRouter key.",
    recommended: false,
    key_configured: true,
  },
];

const OPENROUTER_KEY: UserApiKeyRead = {
  provider: "openrouter",
  last_used_at: null,
  created_at: "2026-07-08T09:00:00Z",
};

function mountKeysTab() {
  return render(
    <AuthProvider>
      <Settings tab="keys" />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "getCurrentUser").mockResolvedValue(USER);
  vi.spyOn(api, "listModels").mockResolvedValue(MODELS);
  vi.spyOn(api, "listApiKeys").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
});

describe("Settings keys — OpenRouter provider", () => {
  it("offers OpenRouter in the add-key provider select", async () => {
    mountKeysTab();

    const option = await screen.findByRole("option", {
      name: /openrouter - one key, many models/i,
    });
    expect((option as HTMLOptionElement).value).toBe("openrouter");
    // The existing providers are still there.
    expect(
      screen.getByRole("option", { name: /anthropic/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /openai/i })).toBeInTheDocument();
  });

  it("renders a stored OpenRouter key as a row with Remove", async () => {
    vi.spyOn(api, "listApiKeys").mockResolvedValue([OPENROUTER_KEY]);
    mountKeysTab();

    await waitFor(() => {
      expect(screen.getByText("openrouter")).toBeInTheDocument();
    });
    expect(screen.getByText(/many models, one key/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove/i }),
    ).toBeInTheDocument();
  });

  it("renders OpenRouter catalog entries and the caveat line once", async () => {
    mountKeysTab();

    await waitFor(() => {
      expect(
        screen.getByText("Claude Sonnet 5 (via OpenRouter)"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("DeepSeek R1 (via OpenRouter)")).toBeInTheDocument();
    // Sonnet 5 direct entry is marked recommended.
    expect(
      screen.getByText("Claude Sonnet 5 - reference model"),
    ).toBeInTheDocument();
    expect(screen.getByText(/recommended/i)).toBeInTheDocument();
    // The honest caveat renders exactly once for the whole list.
    const caveats = screen.getAllByText(
      /Citation behaviour is verified on the reference model only/i,
    );
    expect(caveats).toHaveLength(1);
  });
});
