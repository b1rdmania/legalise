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
  global.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ status: "ok", version: "", database: "", environment: "test" }), {
        status: 200,
      }),
    ),
  ) as never;
  // AuthGate consults the snapshot; populate so __authed lets us through.
  // (AuthProvider runs on mount; it'll call getCurrentUser via apiFetch
  // unless we mock it.)
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
      expect(
        screen.getByText("module.capability.invoked"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("advice_boundary.decision.completed"),
    ).toBeInTheDocument();
    // Source pills render substrate vocabulary verbatim.
    const pills = screen.getAllByTestId("row-source-pill");
    expect(pills.length).toBe(2);
  });
});

describe("ReconstructionView — invocation_id filter (client-side)", () => {
  it("filters rows by payload.invocation_id", async () => {
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [
        entry({
          payload: { invocation_id: "inv-9999" },
          action: "module.capability.invoked",
          source_row_id: "r-match",
        }),
        entry({
          payload: { invocation_id: "inv-other" },
          action: "module.capability.invoked",
          source_row_id: "r-other",
        }),
      ],
      next_cursor: null,
      total_in_window_estimate: 2,
    });

    mountAt("/matters/khan/audit?invocation_id=inv-9999");
    await waitFor(() => {
      expect(
        screen.getByTestId("timeline-row-r-match"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId("timeline-row-r-other")).toBeNull();
    // Active filter chip names invocation_id verbatim.
    expect(screen.getByText("invocation_id=")).toBeInTheDocument();
    expect(screen.getByText("inv-9999")).toBeInTheDocument();
  });

  it("also matches refs.invocation_id (substrate dual-name)", async () => {
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

describe("ReconstructionView — action filter", () => {
  it("filters rows by exact action match", async () => {
    vi.spyOn(api, "getReconstruction").mockResolvedValue({
      entries: [
        entry({
          action: "posture_gate.check.blocked",
          source_row_id: "r-blocked",
        }),
        entry({
          action: "module.capability.invoked",
          source_row_id: "r-other",
        }),
      ],
      next_cursor: null,
      total_in_window_estimate: 2,
    });

    mountAt(
      "/matters/khan/audit?action=posture_gate.check.blocked",
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("timeline-row-r-blocked"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId("timeline-row-r-other")).toBeNull();
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
    // (all three sources).
    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
    expect(spy.mock.calls[0]?.[1]?.include).toBeUndefined();

    // Toggle "advice_boundary" off.
    fireEvent.click(screen.getByTestId("source-chip-advice_boundary"));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(2);
    });
    const lastCall = spy.mock.calls[1]?.[1];
    expect(lastCall?.include).toEqual(["audit", "state_machine"]);
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
