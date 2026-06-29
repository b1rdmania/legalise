// Matter CRUD, chronology, lifecycle (close/export/delete), bootstrap
// state, guided demo, and account deletion.
// Moved verbatim from `lib/api.ts` (Fluff C1 / audit M2.1).

import { API, apiFetch, jsonOrThrow } from "./_core";
import { AUTH } from "./auth";

export interface Matter {
  id: string;
  slug: string;
  title: string;
  matter_type: string;
  cause: string | null;
  status: string;
  case_theory: string | null;
  pivot_fact: string | null;
  privilege_posture: string;
  default_model_id: string;
  // Keyed provider the default model needs ("anthropic"/"openai"), or
  // null for keyless models. Backend-supplied truth (provider_for_model);
  // the FE no longer re-derives model families.
  required_provider: string | null;
  facts: Record<string, unknown>;
  opened_at: string;
  closed_at: string | null;
  retention_until: string | null;
  created_by_id: string;
}

export interface MatterCreate {
  title: string;
  matter_type?: string;
  cause?: string | null;
  case_theory?: string | null;
  pivot_fact?: string | null;
  privilege_posture?: string;
  default_model_id?: string;
  facts?: Record<string, unknown>;
  retention_until?: string | null;
}

// A selectable model, as the backend advertises it. `requires_key` ==
// true means the model only runs when the matching provider key is on
// file; `key_configured` is whether the *current user* has that key.
// `provider` is null for keyless models. `note` is optional backend copy.
export interface ModelOption {
  id: string;
  label: string;
  provider: string | null;
  requires_key: boolean;
  note: string | null;
  key_configured: boolean;
}

export const listModels = () =>
  apiFetch(`${API}/models`).then((r) => jsonOrThrow<ModelOption[]>(r));

// Change which model a matter runs on. Backend validates the id
// (422 on unknown). Returns the updated matter.
export const updateMatterModel = (slug: string, default_model_id: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ default_model_id }),
  }).then((r) => jsonOrThrow<Matter>(r));

export interface BootstrapState {
  user_count: number;
  has_superuser: boolean;
  // When false (default), the firm role hierarchy is dormant:
  // don't present B_mixed qualified-solicitor blockers.
  firm_role_gates_enabled?: boolean;
}

// No auth required. The /app first-run screen reads this to decide
// between empty-state / bootstrap-required / authed-home.
export const getBootstrapState = () =>
  apiFetch(`${API}/system/bootstrap-state`).then((r) =>
    jsonOrThrow<BootstrapState>(r),
  );

// Matter artifacts
// ---------------------------------------------------------------------------
// Guided Demo Loop v1 — keyless end-to-end proof
// ---------------------------------------------------------------------------

export interface GuidedDemoHandles {
  matter_slug: string;
  matter_title: string;
  module_id: string;
  capability_id: string;
  document_id: string;
  document_filename: string;
  model_id: string;
}

export const ensureGuidedLoop = () =>
  apiFetch(`${API}/demo/guided-loop`, { method: "POST" }).then((r) =>
    jsonOrThrow<GuidedDemoHandles>(r),
  );

export const listMatters = () =>
  apiFetch(`${API}/matters`).then((r) => jsonOrThrow<Matter[]>(r));

export const getMatter = (slug: string) =>
  apiFetch(`${API}/matters/${slug}`).then((r) => jsonOrThrow<Matter>(r));

export const createMatter = (body: MatterCreate) =>
  apiFetch(`${API}/matters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<Matter>(r));

export const setPrivilege = (slug: string, posture: string) =>
  apiFetch(`${API}/matters/${slug}/privilege`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ privilege_posture: posture }),
  }).then((r) => jsonOrThrow<Matter>(r));

export class AccountHasMattersError extends Error {
  readonly matterCount: number;
  constructor(matterCount: number) {
    super(
      `Account owns ${matterCount} matter${matterCount === 1 ? "" : "s"}. ` +
        "Export or delete matters before deleting the account.",
    );
    this.name = "AccountHasMattersError";
    this.matterCount = matterCount;
  }
}

export const deleteAccount = async (): Promise<void> => {
  const r = await apiFetch(`${AUTH}/users/me`, { method: "DELETE" });
  if (r.status === 204) return;
  if (r.status === 409) {
    let count = 0;
    try {
      const body = (await r.json()) as { detail?: { matter_count?: number } };
      count = body.detail?.matter_count ?? 0;
    } catch {
      // body parse failure — leave count at 0 and surface the generic message.
    }
    throw new AccountHasMattersError(count);
  }
  throw new Error(`deleteAccount: ${r.status} ${r.statusText}`);
};

export type ChronologyEventStatus = "proposed" | "accepted" | "rejected";

export interface ChronologyEvent {
  id: string;
  event_date: string;
  description: string;
  significance: number;
  source_doc_ids: string[];
  source_doc_filenames: string[];
  priv_flag: boolean;
  from_disclosure: boolean;
  proceedings_refs: string[];
  created_at: string;
  redacted: boolean;
  status?: ChronologyEventStatus;
  source_document_id?: string | null;
}

export interface GateState {
  required: boolean;
  confirmed: boolean;
  confirmed_at: string | null;
  tainted_event_count: number;
}

export interface ChronologyResponse {
  matter_slug: string;
  events: ChronologyEvent[];
  gate: GateState;
  statement_of_facts_variant: ChronologyEvent[];
}

export const getChronology = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/chronology`).then((r) => jsonOrThrow<ChronologyResponse>(r));

export const confirmGate = (slug: string, acknowledgement: string) =>
  apiFetch(`${API}/matters/${slug}/chronology/gate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acknowledgement }),
  }).then((r) => jsonOrThrow<GateState>(r));

// Auto-build proposes events from the matter's documents using its AI model.
// Returns the proposed events; a person must accept each before it counts.
export const buildChronology = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/chronology/build`, {
    method: "POST",
  }).then((r) => jsonOrThrow<ChronologyEvent[]>(r));

export const acceptChronologyEvent = (slug: string, eventId: string) =>
  apiFetch(`${API}/matters/${slug}/chronology/events/${eventId}/accept`, {
    method: "POST",
  }).then((r) => jsonOrThrow<ChronologyEvent>(r));

export const rejectChronologyEvent = (slug: string, eventId: string) =>
  apiFetch(`${API}/matters/${slug}/chronology/events/${eventId}/reject`, {
    method: "POST",
  }).then((r) => jsonOrThrow<ChronologyEvent>(r));

// ---------------------------------------------------------------------------
// Matter lifecycle + export (LMF UX v1) — over the stable LMF endpoints
// ---------------------------------------------------------------------------

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface JobRead {
  id: string;
  matter_id: string;
  kind: string;
  status: JobStatus;
  stage: string | null;
  progress: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  result_payload: Record<string, unknown> | null;
}

export const createMatterExport = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/export`, {
    method: "POST",
  }).then((r) => jsonOrThrow<JobRead>(r));

export const getJob = (slug: string, jobId: string) =>
  apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(jobId)}`,
  ).then((r) => jsonOrThrow<JobRead>(r));

// Browser-navigable download URL for a completed export (302 presigned
// on S3, or a streamed attachment locally — the browser handles it).
export const matterExportDownloadUrl = (slug: string, jobId: string): string =>
  `${API}/matters/${encodeURIComponent(slug)}/export/${encodeURIComponent(jobId)}`;

export const closeMatter = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/close`, {
    method: "POST",
  }).then((r) => jsonOrThrow<Matter>(r));

export const deleteMatter = async (slug: string): Promise<void> => {
  const res = await apiFetch(`${API}/matters/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
};
