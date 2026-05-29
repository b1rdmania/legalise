/**
 * Phase 14 C — GrantsPanel happy-path + error-path regressions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GrantsPanel } from "./GrantsPanel";
import * as api from "../lib/api";

beforeEach(() => {
  vi.restoreAllMocks();
  // Phase 14.5 B — every test that mounts GrantsPanel triggers a
  // listInstalledModules fetch. Default-mock to an empty list; tests
  // that assert Run buttons must override with the installed rows
  // they expect. Tests that assert Run is ABSENT can rely on this
  // default — no installed row → no runnable pair.
  vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);
  vi.spyOn(api, "listApiKeys").mockResolvedValue([]);
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
      expect(
        screen.getByText(/Granted\. This module may now use that permission/i),
      ).toBeInTheDocument();
    });
  });

  it("offers installed inline modules that are not in the v2 registry catalog", async () => {
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [],
      ui_slots: [],
    });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([
      {
        module_id: "contract-review-anthropic",
        version: "2026.01.30",
        publisher: "Anthropic",
        visibility: "community",
        signature_status: "unsigned",
        enabled: true,
        installed_at: "2026-01-01T00:00:00",
        installed_by_user_id: null,
        capabilities: [
          {
            id: "default",
            kind: "skill",
            scope: "matter",
            reads: ["matter.document.read"],
            writes: ["matter.artifact.write"],
          },
        ],
      },
    ]);
    const create = vi.spyOn(api, "createGrant").mockResolvedValue({
      matter_id: "m-1",
      parent_capability_id: "default",
      module_id: "contract-review-anthropic",
      grants: [],
      was_idempotent_noop: false,
    });

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(
        screen.getByText(/contract-review-anthropic/i),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Module/i), {
      target: { value: "contract-review-anthropic" },
    });
    fireEvent.change(screen.getByLabelText(/Capability/i), {
      target: { value: "default" },
    });
    fireEvent.click(screen.getByText("Grant"));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith("khan", {
        module_id: "contract-review-anthropic",
        capability_id: "default",
      });
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

describe("GrantsPanel — capability filtering (matter-scope only)", () => {
  it("hides non-matter-scope capabilities and modules with no matter caps", async () => {
    // Module A: one matter cap + one workspace cap → only the matter
    //           cap should appear in the capability select.
    // Module B: only a workspace cap → module itself must not appear
    //           in the module select.
    const MODULE_A = {
      module_id: "module-a",
      source_kind: "v2",
      manifest: {
        name: "Module A",
        capabilities: [
          { id: "matter-cap", scope: "matter" },
          { id: "workspace-cap", scope: "workspace" },
        ],
      },
      is_valid: true,
      validation_errors: [],
    };
    const MODULE_B = {
      module_id: "module-b",
      source_kind: "v2",
      manifest: {
        name: "Module B",
        capabilities: [{ id: "global-cap", scope: "global" }],
      },
      is_valid: true,
      validation_errors: [],
    };
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MODULE_A, MODULE_B],
      ui_slots: [],
    });

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Module/i)).toBeInTheDocument();
    });

    // Module-B is filtered out entirely.
    const moduleSelect = screen.getByLabelText(/Module/i) as HTMLSelectElement;
    const moduleValues = Array.from(moduleSelect.options).map((o) => o.value);
    expect(moduleValues).toContain("module-a");
    expect(moduleValues).not.toContain("module-b");

    // Pick Module-A and inspect the capability select.
    fireEvent.change(moduleSelect, { target: { value: "module-a" } });
    const capSelect = screen.getByLabelText(/Capability/i) as HTMLSelectElement;
    const capValues = Array.from(capSelect.options).map((o) => o.value);
    expect(capValues).toContain("matter-cap");
    // The workspace cap is hidden — the matter endpoint would reject
    // it with 422; the UI must not offer impossible options.
    expect(capValues).not.toContain("workspace-cap");
  });
});

describe("GrantsPanel — runnable-pairs derivation (Phase 14 D)", () => {
  // Capabilities with reads + writes shape — substrate expansion at
  // grants_lifecycle.py:355-389 creates one WorkspaceSkillCapabilityGrant
  // row per string in reads ∪ writes. Run must require ALL of them
  // on this matter, with plugin/skill/capability matching strictly.
  const MULTI_CAP_MANIFEST = {
    module_id: "contract-review",
    source_kind: "v2",
    manifest: {
      name: "Contract Review",
      capabilities: [
        {
          id: "review",
          scope: "matter",
          reads: ["matter.document.read"],
          writes: ["matter.artifact.write"],
        },
        {
          id: "summary",
          scope: "matter",
          reads: ["matter.document.read"],
          writes: ["matter.artifact.write"],
        },
      ],
    },
    is_valid: true,
    validation_errors: [],
  };

  function grant(
    plugin: string,
    skill: string,
    capability: string,
  ): api.GrantRow {
    return {
      id: `g-${plugin}-${skill}-${capability}`,
      plugin,
      skill,
      capability,
      scope_type: "matter",
      scope_id: "m-1",
      granted_at: "2026-05-26T12:00:00",
    };
  }

  it("shows Run only for the capability whose required strings are all granted", async () => {
    // Granted: review (read+write). Not granted: summary (no rows).
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [
        grant("contract-review", "review", "matter.document.read"),
        grant("contract-review", "review", "matter.artifact.write"),
      ],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MULTI_CAP_MANIFEST],
      ui_slots: [],
    });
    // Phase 14.5 B — module must be installed AND enabled.
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([{
      module_id: "contract-review",
      version: "0.1.0",
      publisher: "legalise",
      visibility: "first_party",
      signature_status: "verified",
      enabled: true,
      installed_at: "2026-01-01T00:00:00",
      installed_by_user_id: null,
    }]);

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByTestId("runnable-capabilities")).toBeInTheDocument();
    });
    // The runnable section names review, not summary.
    expect(screen.getByText(/contract-review · review/)).toBeInTheDocument();
    expect(screen.queryByText(/contract-review · summary/)).toBeNull();
    // The Run button for review exists.
    expect(
      screen.getByTestId("run-contract-review-review"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("run-contract-review-summary"),
    ).toBeNull();
  });

  it("does NOT show Run when a required write has been revoked", async () => {
    // Only the read remains — write was revoked. Substrate would 403
    // at dispatch (potentially after a provider call). UI must hide.
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [grant("contract-review", "review", "matter.document.read")],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MULTI_CAP_MANIFEST],
      ui_slots: [],
    });

    render(<GrantsPanel slug="khan" />);
    // Wait for the panel to settle (the catalog + grants both
    // resolve, but no runnable-capabilities block should render).
    await waitFor(() => {
      expect(screen.getByText(/Grant a capability/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("runnable-capabilities")).toBeNull();
    expect(
      screen.queryByTestId("run-contract-review-review"),
    ).toBeNull();
  });

  it("shows Run when both read + write grants are present", async () => {
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [
        grant("contract-review", "review", "matter.document.read"),
        grant("contract-review", "review", "matter.artifact.write"),
      ],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MULTI_CAP_MANIFEST],
      ui_slots: [],
    });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([{
      module_id: "contract-review",
      version: "0.1.0",
      publisher: "legalise",
      visibility: "first_party",
      signature_status: "verified",
      enabled: true,
      installed_at: "2026-01-01T00:00:00",
      installed_by_user_id: null,
    }]);

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(
        screen.getByTestId("run-contract-review-review"),
      ).toBeInTheDocument();
    });
  });

  it("blocks Run up front when the matter model needs a missing provider key", async () => {
    const MODEL_CAP_MANIFEST = {
      ...MULTI_CAP_MANIFEST,
      manifest: {
        ...MULTI_CAP_MANIFEST.manifest,
        capabilities: [
          {
            id: "review",
            scope: "matter",
            model_access: "required",
            reads: ["matter.document.read"],
            writes: ["matter.artifact.write"],
          },
          {
            id: "default-provider",
            kind: "provider",
            scope: "workspace",
            model_access: "none",
            reads: [],
            writes: [],
          },
        ],
      },
    };
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [
        grant("contract-review", "review", "matter.document.read"),
        grant("contract-review", "review", "matter.artifact.write"),
      ],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MODEL_CAP_MANIFEST],
      ui_slots: [],
    });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([{
      module_id: "contract-review",
      version: "0.1.0",
      publisher: "legalise",
      visibility: "first_party",
      signature_status: "verified",
      enabled: true,
      installed_at: "2026-01-01T00:00:00",
      installed_by_user_id: null,
    }]);

    render(<GrantsPanel slug="khan" defaultModelId="claude-opus-4-7" />);
    const run = await screen.findByTestId("run-contract-review-review");

    expect(run).toBeDisabled();
    expect(screen.getByText(/anthropic key needed/i)).toBeInTheDocument();
    expect(screen.getByText(/configure provider keys/i)).toBeInTheDocument();
  });

  it("shows a ready keyless status for stub-model matter actions", async () => {
    const MODEL_CAP_MANIFEST = {
      ...MULTI_CAP_MANIFEST,
      manifest: {
        ...MULTI_CAP_MANIFEST.manifest,
        capabilities: [
          {
            id: "review",
            scope: "matter",
            model_access: "required",
            reads: ["matter.document.read"],
            writes: ["matter.artifact.write"],
          },
        ],
      },
    };
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [
        grant("contract-review", "review", "matter.document.read"),
        grant("contract-review", "review", "matter.artifact.write"),
      ],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MODEL_CAP_MANIFEST],
      ui_slots: [],
    });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([{
      module_id: "contract-review",
      version: "0.1.0",
      publisher: "legalise",
      visibility: "first_party",
      signature_status: "verified",
      enabled: true,
      installed_at: "2026-01-01T00:00:00",
      installed_by_user_id: null,
    }]);

    render(<GrantsPanel slug="khan" defaultModelId="stub-echo" />);
    const run = await screen.findByTestId("run-contract-review-review");

    expect(run).not.toBeDisabled();
    expect(screen.getByText(/ready: keyless\/local model/i)).toBeInTheDocument();
  });

  it("does NOT show Run when the module is installed but disabled", async () => {
    // Phase 14.5 B regression: enabled-AND gate. Grants are
    // complete, capability is matter-scoped, manifest is valid —
    // but the installed module's enabled=false. Substrate would
    // 409 module_disabled on POST /grants and on invoke; the UI
    // hides Run upstream.
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [
        grant("contract-review", "review", "matter.document.read"),
        grant("contract-review", "review", "matter.artifact.write"),
      ],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MULTI_CAP_MANIFEST],
      ui_slots: [],
    });
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([{
      module_id: "contract-review",
      version: "0.1.0",
      publisher: "legalise",
      visibility: "first_party",
      signature_status: "verified",
      enabled: false,                 // ← the only difference
      installed_at: "2026-01-01T00:00:00",
      installed_by_user_id: null,
    }]);

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByText(/Grant a capability/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("runnable-capabilities")).toBeNull();
    expect(
      screen.queryByTestId("run-contract-review-review"),
    ).toBeNull();
  });

  it("does NOT show Run when the module is not in the installed list at all", async () => {
    // Phase 14.5 B regression: not-installed path. Grants are
    // complete + capability matter-scoped, but no installed row
    // exists for this module_id (catalog discovers it but the
    // workspace hasn't run the install ceremony). UI hides Run.
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [
        grant("contract-review", "review", "matter.document.read"),
        grant("contract-review", "review", "matter.artifact.write"),
      ],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MULTI_CAP_MANIFEST],
      ui_slots: [],
    });
    // Empty installed list — default from the file-level beforeEach,
    // pinned here for explicitness.
    vi.spyOn(api, "listInstalledModules").mockResolvedValue([]);

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByText(/Grant a capability/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("runnable-capabilities")).toBeNull();
  });

  it("does NOT show Run when a grant row exists for the wrong skill", async () => {
    // Row exists but skill mismatch — pre-redline UI showed Run
    // because plugin matched. Post-redline: strict skill check.
    vi.spyOn(api, "listGrants").mockResolvedValue({
      matter_id: "m-1",
      grants: [
        grant("contract-review", "other-skill", "matter.document.read"),
        grant("contract-review", "other-skill", "matter.artifact.write"),
      ],
    });
    vi.spyOn(api, "getModulesV2").mockResolvedValue({
      modules: [MULTI_CAP_MANIFEST],
      ui_slots: [],
    });

    render(<GrantsPanel slug="khan" />);
    await waitFor(() => {
      expect(screen.getByText(/Grant a capability/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("runnable-capabilities")).toBeNull();
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
