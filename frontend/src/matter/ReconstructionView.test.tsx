/**
 * Phase 14 E — ReconstructionView regressions.
 *
 * Pins the deep-link contract earlier sub-steps depend on:
 *   - ?invocation_id=… filters timeline rows client-side
 *   - ?action=… filters by exact substrate action string
 *   - source chips toggle the include= param
 *   - pagination via next_cursor
 *
 * Note: this page must NOT invent audit rows. The substrate emits
 * `audit.reconstruction.viewed` server-side when /reconstruction is
 * called — Phase 14 E verifies via integration, not via UI emission.
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
import type { TimelineEntry } from "../lib/api";

function entry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    source: "audit",
    occurred_at: "2026-05-26T12:00:00",
    action: "module.capability.invoked",
    actor: { user_id: "u-1", role: "qualified_solicitor" },
    matter_id: "m-1",
    module_id: "pre-motion",
    capability_id: "generate",
    payload: { invocation_id: "inv-9999" },
    refs: {},
    source_row_id: "row-1",
    ...overrides,
  };
}

function mountAt(initialPath: string) {
  // Re-use the production router definition so the route's
  // validateSearch + useParams + useSearch are exactly what ships.
  // Memory history isolates the test from window.location.
  const router = createRouter({
    routeTree: productionRouter.routeTree,
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
  // The shell calls /health on mount; stub fetch broadly.
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ status: "ok", version: "", database: "", environment: "test" }), {
        status: 200,
      }),
    ),
  ) as never;
  // AuthGate consults the snapshot; populate so __authed lets us through.
  // (AuthProvider runs on mount; it'll call getCurrentUser via apiFetch
  // unless we mock it.)
  // Chain status is fetched on every mount; default to a clean chain so
  // existing assertions stay focused. Individual tests override.
  vi.spyOn(api, "getAuditChainStatus").mockResolvedValue({
    verified: true,
    scope: "matter",
    length: 11,
    head: {
      chain_hash: "deadbeefcafe0123" + "0".repeat(48),
      scope_sequence: 11,
      entry_hash: "1".repeat(64),
    },
    issues: [],
  });
  vi.spyOn(api, "getCurrentUser").mockResolvedValue({
    id: "u-1",
    email: "u@example.com",
    name: "u",
    role: "qualified_solicitor",
    plan: "free",
    default_model_id: null,
    default_privilege_posture: null,
    is_active: true,
    is_verified: true,
    is_superuser: false,
  });
});
afterEach(() => {
  cleanup();
});

describe("ReconstructionView — basic render", () => {
  it("renders timeline rows with source pill, action, actor", async () => {
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [
        entry({
          source: "audit",
          action: "module.capability.invoked",
          source_row_id: "r-1",
        }),
        entry({
          source: "advice_boundary",
          action: "advice_boundary.decision.completed",
          source_row_id: "r-2",
        }),
      ],
      next_cursor: null,
      total_in_window_estimate: 2,
    });

    mountAt("/matters/khan/audit");
    await waitFor(() => {
      expect(screen.getByText("Skill run started")).toBeInTheDocument();
    });
    expect(screen.getByText("Advice boundary decided")).toBeInTheDocument();
    // Source pills render substrate vocabulary verbatim.
    const pills = screen.getAllByTestId("row-source-pill");
    expect(pills.length).toBe(2);

    fireEvent.click(screen.getByTestId("timeline-row-r-1").querySelector("button")!);
    expect(screen.getByText("Raw action")).toBeInTheDocument();
    expect(screen.getByText("module.capability.invoked")).toBeInTheDocument();
  });
});

describe("ReconstructionView — chain status line", () => {
  it("renders the quiet verified line with link count and head prefix", async () => {
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [entry()],
      next_cursor: null,
      total_in_window_estimate: 1,
    });

    mountAt("/matters/khan/audit");
    await waitFor(() => {
      expect(screen.getByTestId("chain-status")).toBeInTheDocument();
    });
    expect(screen.getByTestId("chain-status").textContent).toBe(
      "Chain verified · 11 links · head deadbeef",
    );
  });

  it("renders the seal-toned broken line when verified=false", async () => {
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [entry()],
      next_cursor: null,
      total_in_window_estimate: 1,
    });
    vi.spyOn(api, "getAuditChainStatus").mockResolvedValue({
      verified: false,
      scope: "matter",
      length: 11,
      head: {
        chain_hash: "0".repeat(64),
        scope_sequence: 11,
        entry_hash: "1".repeat(64),
      },
      issues: [
        {
          code: "chain_hash_mismatch",
          message: "expected x; got y",
          audit_entry_id: null,
          chain_id: 1,
        },
      ],
    });

    mountAt("/matters/khan/audit");
    await waitFor(() => {
      expect(screen.getByTestId("chain-status")).toBeInTheDocument();
    });
    const line = screen.getByTestId("chain-status");
    expect(line.textContent).toBe("chain broken — see issues");
    expect(line.className).toContain("text-seal");
  });

  it("renders no chain line when the endpoint fails", async () => {
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [entry()],
      next_cursor: null,
      total_in_window_estimate: 1,
    });
    vi.spyOn(api, "getAuditChainStatus").mockImplementation(() =>
      Promise.reject(new Error("503")),
    );

    mountAt("/matters/khan/audit");
    // A single non-decision row lands in the collapsed background lane,
    // so wait for the always-visible empty-foreground marker instead.
    await waitFor(() => {
      expect(screen.getByTestId("no-decision-points")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("chain-status")).toBeNull();
  });
});

describe("ReconstructionView — invocation_id filter (server-authoritative)", () => {
  it("forwards the URL filter to the substrate and renders whatever the server returned", async () => {
    // Phase 14.5 A — substrate is the source of truth for filtering.
    // The server returns ONLY matching rows (per-source carrier
    // semantics: payload.invocation_id for audit, output_id for
    // advice_boundary, none for state_machine). The page renders
    // them verbatim — no client-side narrowing that could drop
    // valid rows.
    const spy = vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [
        entry({
          payload: { invocation_id: "inv-9999" },
          action: "module.capability.invoked",
          source_row_id: "r-match",
        }),
      ],
      next_cursor: null,
      total_in_window_estimate: 1,
    });

    mountAt("/matters/khan/audit?invocation_id=inv-9999");
    await waitFor(() => {
      expect(screen.getByTestId("timeline-row-r-match")).toBeInTheDocument();
    });
    // Active filter chip names invocation_id verbatim.
    expect(screen.getByText("invocation_id=")).toBeInTheDocument();
    expect(screen.getByText("inv-9999")).toBeInTheDocument();
    // URL filter forwarded to the substrate.
    const lastCall = spy.mock.calls.at(-1)?.[1];
    expect(lastCall?.invocation_id).toBe("inv-9999");
  });

  it("also surfaces rows whose only invocation carrier is refs.invocation_id (substrate provides them)", async () => {
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [
        entry({
          payload: {},
          refs: { invocation_id: "inv-9999" },
          source_row_id: "r-via-refs",
        }),
      ],
      next_cursor: null,
      total_in_window_estimate: 1,
    });

    mountAt("/matters/khan/audit?invocation_id=inv-9999");
    await waitFor(() => {
      expect(
        screen.getByTestId("timeline-row-r-via-refs"),
      ).toBeInTheDocument();
    });
  });
});

describe("ReconstructionView — action filter (server-authoritative)", () => {
  it("forwards the URL action filter to the substrate", async () => {
    const spy = vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [
        entry({
          action: "posture_gate.check.blocked",
          source_row_id: "r-blocked",
        }),
      ],
      next_cursor: null,
      total_in_window_estimate: 1,
    });

    mountAt(
      "/matters/khan/audit?action=posture_gate.check.blocked",
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("timeline-row-r-blocked"),
      ).toBeInTheDocument();
    });
    const lastCall = spy.mock.calls.at(-1)?.[1];
    expect(lastCall?.action).toBe("posture_gate.check.blocked");
  });
});

describe("ReconstructionView — source chips", () => {
  it("toggles a source off and re-fetches with the include filter", async () => {
    const spy = vi
      .spyOn(api, "getReconstruction")
      .mockResolvedValue({
        entries: [],
        next_cursor: null,
        total_in_window_estimate: 0,
      });

    mountAt("/matters/khan/audit");
    // Initial render fires getReconstruction with no include filter
    // (all three sources). Generous timeouts: the full production
    // router + AuthProvider mount can exceed vitest's 1s default under
    // parallel CI load (this test failed repeatedly in CI, never alone).
    await waitFor(
      () => {
        expect(spy).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 },
    );
    expect(spy.mock.calls[0]?.[1]?.include).toBeUndefined();

    // Toggle "advice_boundary" off.
    fireEvent.click(await screen.findByTestId("source-chip-advice_boundary", {}, { timeout: 5000 }));

    await waitFor(
      () => {
        expect(spy).toHaveBeenCalledTimes(2);
      },
      { timeout: 5000 },
    );
    const lastCall = spy.mock.calls[1]?.[1];
    expect(lastCall?.include).toEqual(["audit", "state_machine"]);
  });
});

describe("ReconstructionView — server-side filters (Phase 14.5 A)", () => {
  // Phase 14.5 A pushed invocation_id + action filtering into the
  // substrate. The partial-page UX gymnastics from the Phase 14 E P1
  // redline are no longer needed: an empty filtered page is now
  // substrate-truthful.
  it("passes invocation_id + action filters through to the API call", async () => {
    const spy = vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [],
      next_cursor: null,
      total_in_window_estimate: 0,
    });

    mountAt(
      "/matters/khan/audit?invocation_id=inv-target&action=model.call",
    );

    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
    const lastCall = spy.mock.calls.at(-1)?.[1];
    expect(lastCall?.invocation_id).toBe("inv-target");
    expect(lastCall?.action).toBe("model.call");
  });

  it("renders advice_boundary rows whose payload.output_id matches the invocation filter (server is authoritative)", async () => {
    // Phase 14.5 A Reviewer P1: the substrate's invocation_id filter
    // matches per-source carriers — audit rows via
    // payload.invocation_id, advice_boundary rows via
    // AdviceBoundaryDecision.output_id (surfaced as
    // payload.output_id on the synthesised TimelineEntry). A
    // client-side filter that only looked at payload.invocation_id
    // would drop valid advice_boundary rows. The fix: trust the
    // server, no client-side narrowing.
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [
        entry({
          source: "advice_boundary",
          action: "advice_boundary.decision.completed",
          // payload.invocation_id is NOT present; only output_id.
          payload: { output_id: "inv-target", status: "completed" },
          refs: { advice_boundary_decision_id: "abd-1" },
          source_row_id: "abd-1",
        }),
      ],
      next_cursor: null,
      total_in_window_estimate: 1,
    });

    mountAt("/matters/khan/audit?invocation_id=inv-target");
    await waitFor(() => {
      // Row MUST render. Pre-redline a client filter on
      // payload.invocation_id would have dropped it.
      expect(screen.getByTestId("timeline-row-abd-1")).toBeInTheDocument();
    });
    expect(screen.getByText("Advice boundary decided")).toBeInTheDocument();
  });

  it("with active filter + substrate returns empty, renders the absolute 'no match' variant", async () => {
    // Phase 14.5 A — substrate applies the filter before paginating,
    // so an empty response with the filter active accurately means
    // "no matching rows in window." No partial-page disclaimer.
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [],
      next_cursor: null,
      total_in_window_estimate: 0,
    });

    mountAt("/matters/khan/audit?invocation_id=inv-target");
    await waitFor(() => {
      expect(
        screen.getByTestId("empty-filter-no-match"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Load more")).toBeNull();
  });
});

describe("ReconstructionView — decision lane + chains (AT-2/AT-3)", () => {
  it("groups an invocation with a review decision into a chain with an output node", async () => {
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [
        entry({
          action: "module.capability.invoked",
          payload: { invocation_id: "inv-7" },
          source_row_id: "r-invoked",
        }),
        entry({
          source: "audit",
          action: "review.approved",
          payload: { invocation_id: "inv-7", artifact_id: "art-1" },
          source_row_id: "r-review",
        }),
      ],
      next_cursor: null,
      total_in_window_estimate: 2,
    });

    mountAt("/matters/khan/audit");
    await waitFor(() => {
      expect(screen.getByTestId("chain-inv-7")).toBeInTheDocument();
    });
    // Chain is open by default → both rows + the output node render.
    expect(screen.getByText("Review approved")).toBeInTheDocument();
    const out = screen.getByTestId("chain-output-node");
    expect(out).toBeInTheDocument();
    expect(out.querySelector("a")?.getAttribute("href")).toContain(
      "/matters/khan/artifacts/art-1",
    );
  });

  it("filters the loaded page by decision class chip", async () => {
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [
        entry({
          action: "user.role.changed",
          payload: {},
          source_row_id: "r-role",
        }),
        entry({
          action: "model.invoked",
          payload: {},
          source_row_id: "r-model",
        }),
      ],
      next_cursor: null,
      total_in_window_estimate: 2,
    });

    mountAt("/matters/khan/audit");
    await waitFor(() => {
      expect(screen.getByTestId("class-chip-grant_role")).toBeInTheDocument();
    });
    // grant_role is a decision row → foreground; model is background.
    expect(screen.getByTestId("timeline-row-r-role")).toBeInTheDocument();
    // Select the "Model" class chip → only model rows survive the facet,
    // and model is background, so the decision lane reports none.
    fireEvent.click(screen.getByTestId("class-chip-model"));
    await waitFor(() => {
      expect(screen.getByTestId("no-decision-points")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("timeline-row-r-role")).toBeNull();
  });

  it("does NOT lane-split when a deep-link filter is active (flat render, no class chips)", async () => {
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [
        entry({
          action: "module.capability.invoked",
          payload: { invocation_id: "inv-7" },
          source_row_id: "r-flat",
        }),
      ],
      next_cursor: null,
      total_in_window_estimate: 1,
    });

    mountAt("/matters/khan/audit?invocation_id=inv-7");
    await waitFor(() => {
      expect(screen.getByTestId("timeline-row-r-flat")).toBeInTheDocument();
    });
    // Deep-linked: flat list, no decision lane / class chips.
    expect(screen.queryByTestId("decision-lane")).toBeNull();
    expect(screen.queryByTestId("class-chip-review")).toBeNull();
    expect(screen.queryByTestId("chain-inv-7")).toBeNull();
  });
});

describe("ReconstructionView — pagination", () => {
  it("loads more rows via the next_cursor", async () => {
    const spy = vi.spyOn(api, "getReconstruction");
    spy.mockResolvedValueOnce({
      entries: [entry({ source_row_id: "r-1" })],
      next_cursor: "page-2",
      total_in_window_estimate: 2,
    });
    spy.mockResolvedValueOnce({
      entries: [entry({ source_row_id: "r-2" })],
      next_cursor: null,
      total_in_window_estimate: 2,
    });

    mountAt("/matters/khan/audit");
    // These rows are module.capability.invoked (no decision) so they
    // land in the collapsed background lane (AT-2 ratified default).
    // Expand it to assert the paginated rows render.
    await waitFor(() => {
      expect(screen.getByTestId("toggle-background")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("toggle-background"));
    await waitFor(() => {
      expect(screen.getByTestId("timeline-row-r-1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Load more"));
    await waitFor(() => {
      expect(screen.getByTestId("timeline-row-r-2")).toBeInTheDocument();
    });
    // Cursor from page 1 was passed into the page 2 fetch.
    expect(spy.mock.calls[1]?.[1]?.cursor).toBe("page-2");
  });
});
