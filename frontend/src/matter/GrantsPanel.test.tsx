/**
 * Phase 14 C — GrantsPanel happy-path + error-path regressions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GrantsPanel } from "./GrantsPanel";
import * as api from "../lib/api";

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
});

const MANIFEST = {
  module_id: "contract-review",
  source_kind: "v2",
  manifest: {
    name: "Contract Review",
    capabilities: [
      { id: "review", scope: "matter" },
      { id: "summary", scope: "matter" },
    ],
  },
  is_valid: true,
  validation_errors: [],
};

describe("GrantsPanel — list", () => {
  it("renders current grants in a table", async () => {
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [
        {
          id: "g-1",
          plugin: "contract-review",
          skill: "review",
          capability: "review",
          scope_type: "matter",
          scope_id: "m-1",
          granted_at: "2026-05-26T12:00:00",
        },
      ],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MANIFEST],
      ui_slots: [],
    });

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByText("contract-review")).toBeInTheDocument();
    });
    // All three columns of the grant row render.
    const cells = screen.getAllByText("review");
    expect(cells.length).toBeGreaterThanOrEqual(2);
  });

  it("renders empty-state when no grants", async () => {
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MANIFEST],
      ui_slots: [],
    });

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByText(/no capabilities granted/i)).toBeInTheDocument();
    });
  });
});

describe("GrantsPanel — create", () => {
  it("submits selected module + capability and refreshes the list", async () => {
    const listGrants = vi
      .spyOn(api, "listGrants")
      .mockResolvedValueOnce({ matter_id: "m-1", grants: [] })
      .mockResolvedValueOnce({
        matter_id: "m-1",
        grants: [
          {
            id: "g-1",
            plugin: "contract-review",
            skill: "review",
            capability: "review",
            scope_type: "matter",
            scope_id: "m-1",
            granted_at: "2026-05-26T12:00:00",
          },
        ],
      });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MANIFEST],
      ui_slots: [],
    });
    const create = vi.spyOn(api, "createGrant").mockResolvedValue({
      matter_id: "m-1",
      parent_capability_id: "review",
      module_id: "contract-review",
      grants: [
        {
          id: "g-1",
          plugin: "contract-review",
          skill: "review",
          capability: "review",
          scope_type: "matter",
          scope_id: "m-1",
          granted_at: "2026-05-26T12:00:00",
        },
      ],
      was_idempotent_noop: false,
    });

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByText(/Grant a capability/i)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/Module/i), {
      target: { value: "contract-review" },
    });
    fireEvent.change(screen.getByLabelText(/Capability/i), {
      target: { value: "review" },
    });
    fireEvent.click(screen.getByText("Grant"));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith("khan", {
        module_id: "contract-review",
        capability_id: "review",
      });
    });
    // After the create resolves the list refreshes via the second
    // listGrants spy return.
    expect(listGrants).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.getByText(/Granted\. 1 row\(s\) created/)).toBeInTheDocument();
    });
  });

  it("surfaces 404 module_not_installed inline", async () => {
    vi.spyOn(api, "listGrants").mockResolvedValue({ matter_id: "m-1", grants: [] });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MANIFEST],
      ui_slots: [],
    });
    vi.spyOn(api, "createGrant").mockRejectedValue(
      new api.ModuleNotInstalledError(
        "Module is not installed.",
        "contract-review",
      ),
    );

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByText(/Grant a capability/i)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/Module/i), {
      target: { value: "contract-review" },
    });
    fireEvent.change(screen.getByLabelText(/Capability/i), {
      target: { value: "review" },
    });
    fireEvent.click(screen.getByText("Grant"));

    await waitFor(() => {
      expect(screen.getByText(/not installed/i)).toBeInTheDocument();
    });
    // Substrate-truth: instruct the user to install via /modules.
    expect(screen.getByText(/\/modules/)).toBeInTheDocument();
  });

  it("surfaces 409 module_disabled inline", async () => {
    vi.spyOn(api, "listGrants").mockResolvedValue({ matter_id: "m-1", grants: [] });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MANIFEST],
      ui_slots: [],
    });
    vi.spyOn(api, "createGrant").mockRejectedValue(
      new api.ModuleDisabledError(
        "Module is installed but currently disabled.",
        "contract-review",
      ),
    );

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByText(/Grant a capability/i)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/Module/i), {
      target: { value: "contract-review" },
    });
    fireEvent.change(screen.getByLabelText(/Capability/i), {
      target: { value: "review" },
    });
    fireEvent.click(screen.getByText("Grant"));

    await waitFor(() => {
      expect(
        screen.getByText(/installed but currently disabled/i),
      ).toBeInTheDocument();
    });
  });

  it("calls out idempotent no-op without claiming a fresh write", async () => {
    vi.spyOn(api, "listGrants").mockResolvedValue({ matter_id: "m-1", grants: [] });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MANIFEST],
      ui_slots: [],
    });
    vi.spyOn(api, "createGrant").mockResolvedValue({
      matter_id: "m-1",
      parent_capability_id: "review",
      module_id: "contract-review",
      grants: [],
      was_idempotent_noop: true,
    });

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByText(/Grant a capability/i)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/Module/i), {
      target: { value: "contract-review" },
    });
    fireEvent.change(screen.getByLabelText(/Capability/i), {
      target: { value: "review" },
    });
    fireEvent.click(screen.getByText("Grant"));

    await waitFor(() => {
      expect(screen.getByText(/already granted/i)).toBeInTheDocument();
    });
    // The user is reminded that idempotent grants do NOT emit audit
    // rows — load-bearing per Phase 7 Decision #4.
    expect(screen.getByText(/do not emit audit rows/i)).toBeInTheDocument();
  });
});

describe("GrantsPanel — revoke", () => {
  it("DELETEs the grant and refreshes", async () => {
    vi.spyOn(api, "listGrants")
      .mockResolvedValueOnce({
        matter_id: "m-1",
        grants: [
          {
            id: "g-1",
            plugin: "contract-review",
            skill: "review",
            capability: "review",
            scope_type: "matter",
            scope_id: "m-1",
            granted_at: "2026-05-26T12:00:00",
          },
        ],
      })
      .mockResolvedValueOnce({ matter_id: "m-1", grants: [] });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MANIFEST],
      ui_slots: [],
    });
    const revoke = vi.spyOn(api, "revokeGrant").mockResolvedValue(undefined);

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByText("Revoke")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Revoke"));
    await waitFor(() => {
      expect(revoke).toHaveBeenCalledWith("khan", "g-1");
    });
    await waitFor(() => {
      expect(screen.getByText(/no capabilities granted/i)).toBeInTheDocument();
    });
  });
});
