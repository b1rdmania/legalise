/**
 * Phase 15 A — typed substrate helpers for e2e tests.
 *
 * Tests drive the UI for the action under test; prerequisites
 * (matter setup, key configuration, grant creation, etc.) go
 * through the real substrate endpoints via these helpers. Faster
 * than UI setup and equally substrate-truthful.
 *
 * All helpers take an APIRequestContext that has a session cookie
 * (call `signIn(...)` from auth.ts first). No new substrate is
 * touched — every endpoint here exists in the shipped Phase 13b /
 * 14 / 14.5 surface.
 */

import type { APIRequestContext } from "@playwright/test";

const BACKEND_BASE =
  process.env.E2E_BACKEND_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Audit / reconstruction read helpers (used for assertions)
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  source: "audit" | "state_machine" | "advice_boundary";
  occurred_at: string;
  action: string;
  actor: Record<string, unknown>;
  matter_id: string | null;
  module_id: string | null;
  capability_id: string | null;
  payload: Record<string, unknown>;
  refs: Record<string, unknown>;
  source_row_id: string;
}

export interface ReconstructionPage {
  entries: TimelineEntry[];
  next_cursor: string | null;
  total_in_window_estimate: number;
}

export async function readMatterReconstruction(
  req: APIRequestContext,
  slug: string,
  opts: { invocation_id?: string; action?: string } = {},
): Promise<ReconstructionPage> {
  const params = new URLSearchParams();
  if (opts.invocation_id) params.set("invocation_id", opts.invocation_id);
  if (opts.action) params.set("action", opts.action);
  const qs = params.toString();
  const url = `${BACKEND_BASE}/api/matters/${encodeURIComponent(slug)}/audit/reconstruction${qs ? `?${qs}` : ""}`;
  const resp = await req.get(url);
  if (!resp.ok()) {
    throw new Error(`matter reconstruction failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

export async function readWorkspaceReconstruction(
  req: APIRequestContext,
  opts: { invocation_id?: string; action?: string } = {},
): Promise<ReconstructionPage> {
  const params = new URLSearchParams();
  if (opts.invocation_id) params.set("invocation_id", opts.invocation_id);
  if (opts.action) params.set("action", opts.action);
  const qs = params.toString();
  const url = `${BACKEND_BASE}/api/admin/audit/reconstruction${qs ? `?${qs}` : ""}`;
  const resp = await req.get(url);
  if (!resp.ok()) {
    throw new Error(`admin reconstruction failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

/**
 * Assert that an audit row with the given action landed in the
 * matter's reconstruction window. Returns the first matching
 * entry for further payload inspection.
 *
 * The assertion drives the substrate-side server filter (Phase
 * 14.5 A), so it works correctly even when the timeline has
 * pages of unrelated rows.
 */
export async function expectMatterAuditRow(
  req: APIRequestContext,
  slug: string,
  action: string,
): Promise<TimelineEntry> {
  const page = await readMatterReconstruction(req, slug, { action });
  const match = page.entries.find((e) => e.action === action);
  if (!match) {
    throw new Error(
      `expected audit action "${action}" on matter "${slug}", got actions: ` +
        page.entries.map((e) => e.action).join(", "),
    );
  }
  return match;
}

export async function expectWorkspaceAuditRow(
  req: APIRequestContext,
  action: string,
): Promise<TimelineEntry> {
  const page = await readWorkspaceReconstruction(req, { action });
  const match = page.entries.find((e) => e.action === action);
  if (!match) {
    throw new Error(
      `expected workspace audit action "${action}", got actions: ` +
        page.entries.map((e) => e.action).join(", "),
    );
  }
  return match;
}

// ---------------------------------------------------------------------------
// Matter setup helpers
// ---------------------------------------------------------------------------

export interface Matter {
  id: string;
  slug: string;
  title: string;
  default_model_id: string;
  privilege_posture: string;
}

export async function createMatter(
  req: APIRequestContext,
  body: {
    title: string;
    matter_type?: string;
    default_model_id?: string;
    privilege_posture?: string;
  },
): Promise<Matter> {
  const resp = await req.post(`${BACKEND_BASE}/api/matters`, {
    data: {
      matter_type: "employment_tribunal",
      ...body,
    },
  });
  if (!resp.ok()) {
    throw new Error(`createMatter failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

export async function setMatterPrivilege(
  req: APIRequestContext,
  slug: string,
  privilege_posture: "A_cleared" | "B_mixed" | "C_paused",
): Promise<Matter> {
  const resp = await req.patch(
    `${BACKEND_BASE}/api/matters/${encodeURIComponent(slug)}/privilege`,
    { data: { privilege_posture } },
  );
  if (!resp.ok()) {
    throw new Error(`setPrivilege failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

/**
 * Set the calling user's default_model_id via PATCH /auth/users/me
 * (fastapi-users alias surfaced through /settings/profile). Phase
 * 13b D's `auth.user.profile_updated` covers the audit row.
 */
export async function setUserDefaultModel(
  req: APIRequestContext,
  modelId: string,
): Promise<void> {
  const resp = await req.patch(`${BACKEND_BASE}/auth/users/me`, {
    data: { default_model_id: modelId },
  });
  if (!resp.ok()) {
    throw new Error(`setUserDefaultModel failed: ${resp.status()} ${await resp.text()}`);
  }
}

// ---------------------------------------------------------------------------
// System / bootstrap-state
// ---------------------------------------------------------------------------

export async function getBootstrapState(
  req: APIRequestContext,
): Promise<{ user_count: number; has_superuser: boolean }> {
  const resp = await req.get(`${BACKEND_BASE}/api/system/bootstrap-state`);
  if (!resp.ok()) {
    throw new Error(`bootstrap-state failed: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}
