// Audit log, hash-chain verification, and timeline reconstruction.
// Moved verbatim from `lib/api.ts` (Fluff C1 / audit M2.1).

import { API, apiFetch, jsonOrThrow } from "./_core";

// ---------------------------------------------------------------------------
// Reconstruction
// ---------------------------------------------------------------------------

// The three legal source values per backend/app/core/audit_reconstruction.py.
export type ReconstructionSource = "audit" | "state_machine" | "advice_boundary";

export const ALL_RECONSTRUCTION_SOURCES: ReconstructionSource[] = [
  "audit",
  "state_machine",
  "advice_boundary",
];

export interface TimelineActor {
  user_id?: string;
  role?: string;
  email?: string;
  // Substrate-side actor dict can carry arbitrary keys.
  [k: string]: unknown;
}

export interface TimelineEntry {
  source: ReconstructionSource;
  occurred_at: string;
  action: string;
  actor: TimelineActor;
  matter_id: string | null;
  module_id: string | null;
  capability_id: string | null;
  payload: Record<string, unknown>;
  refs: Record<string, unknown>;
  source_row_id: string;
}

export interface ReconstructionResponse {
  entries: TimelineEntry[];
  next_cursor: string | null;
  total_in_window_estimate: number;
}

export interface ReconstructionOptions {
  since?: string;
  until?: string;
  include?: ReconstructionSource[];
  cursor?: string;
  limit?: number;
  // Substrate-side filters. Earlier the frontend filtered these
  // client-side, which produced false-negatives on dense matter
  // timelines. They're now server-pushdown filters that apply
  // BEFORE pagination.
  invocation_id?: string;
  action?: string;
}

// Workspace / admin reconstruction. Same shape as
// the matter endpoint; no slug. Substrate gates on superuser; UI
// also gates upstream to avoid pointless 403s.
export const getAdminReconstruction = (
  opts: ReconstructionOptions = {},
): Promise<ReconstructionResponse> => {
  const params = new URLSearchParams();
  if (opts.since) params.set("since", opts.since);
  if (opts.until) params.set("until", opts.until);
  if (opts.include && opts.include.length > 0) {
    params.set("include", opts.include.join(","));
  }
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.invocation_id) params.set("invocation_id", opts.invocation_id);
  if (opts.action) params.set("action", opts.action);
  const qs = params.toString();
  return apiFetch(
    `${API}/admin/audit/reconstruction${qs ? `?${qs}` : ""}`,
  ).then((r) => jsonOrThrow<ReconstructionResponse>(r));
};

export const getReconstruction = (
  slug: string,
  opts: ReconstructionOptions = {},
): Promise<ReconstructionResponse> => {
  const params = new URLSearchParams();
  if (opts.since) params.set("since", opts.since);
  if (opts.until) params.set("until", opts.until);
  if (opts.include && opts.include.length > 0) {
    params.set("include", opts.include.join(","));
  }
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.invocation_id) params.set("invocation_id", opts.invocation_id);
  if (opts.action) params.set("action", opts.action);
  const qs = params.toString();
  return apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/audit/reconstruction${qs ? `?${qs}` : ""}`,
  ).then((r) => jsonOrThrow<ReconstructionResponse>(r));
};

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor_id: string | null;
  matter_id: string | null;
  action: string;
  module: string | null;
  resource_type: string | null;
  resource_id: string | null;
  model_used: string | null;
  prompt_hash: string | null;
  response_hash: string | null;
  token_count: number | null;
  latency_ms: number | null;
  payload: Record<string, unknown>;
}

export const listAudit = (slug: string, limit = 50) =>
  apiFetch(`${API}/matters/${slug}/audit?limit=${limit}`).then((r) => jsonOrThrow<AuditEntry[]>(r));

// Audit hash-chain verification (notary-minimal). Substrate truth:
// GET /api/matters/{slug}/audit/chain recomputes every link in the
// matter scope; `head.chain_hash` is the record's fingerprint.
export interface AuditChainHead {
  chain_hash: string;
  scope_sequence: number;
  entry_hash: string;
}

export interface AuditChainIssue {
  code: string;
  message: string;
  audit_entry_id: string | null;
  chain_id: number | null;
}

export interface AuditChainStatus {
  verified: boolean;
  scope: string;
  length: number;
  head: AuditChainHead | null;
  issues: AuditChainIssue[];
}

export const getAuditChainStatus = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/audit/chain`).then((r) =>
    jsonOrThrow<AuditChainStatus>(r),
  );
