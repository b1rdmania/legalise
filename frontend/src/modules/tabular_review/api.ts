// Tabular-review API client.
//
// Lives next to its components rather than in `lib/api.ts`. The delta
// sheet allows either ("or fold into lib/api.ts"); keeping it local
// avoids cross-workstream coupling on lib/api.ts during Phase B and
// lets the consolidation happen as a follow-up. Re-exports a couple
// of names from `lib/api.ts` so component files have one import path.

import { API, BACKEND_ROOT, apiFetch } from "../../lib/api";
export { API, BACKEND_ROOT } from "../../lib/api";
export type { Matter } from "../../lib/api";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// -- types ------------------------------------------------------------------

export type ColumnType = "text" | "date" | "yesno" | "number";

export interface ColumnSpec {
  key: string;
  label: string;
  prompt: string;
  type: ColumnType;
}

export interface ReviewRowRead {
  document_id: string;
  document_filename: string;
  extracted_values: Record<string, unknown>;
  last_run_at: string | null;
}

export interface ReviewRead {
  id: string;
  matter_slug: string;
  title: string;
  columns_config: ColumnSpec[];
  rows: ReviewRowRead[];
  created_at: string;
  updated_at: string;
}

export interface ReviewSummary {
  id: string;
  title: string;
  column_count: number;
  row_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewCreateRequest {
  title: string;
  columns_config: ColumnSpec[];
}

export interface ReviewUpdateRequest {
  title?: string;
  columns_config?: ColumnSpec[];
}

export interface RunRequest {
  document_ids?: string[];
  column_keys?: string[];
  confirm_above_50?: boolean;
}

export interface RunEstimate {
  total_calls: number;
  est_input_tokens: number;
  est_output_tokens: number;
  est_cost_pence_lower: number;
  est_cost_pence_upper: number;
  requires_confirm: boolean;
  provider: string | null;
  model_id: string | null;
}

export interface RunErrorRow {
  document_id: string;
  column_key: string;
  error_message: string;
}

export interface RunReport {
  cells_run: number;
  cells_failed: number;
  errors: RunErrorRow[];
  duration_ms: number;
}

export interface ExportResponse {
  file_uuid: string;
  download_url: string;
  byte_count: number;
}

// -- calls ------------------------------------------------------------------

const base = (slug: string) => `${API}/matters/${slug}/reviews`;

export const listReviews = (slug: string) =>
  apiFetch(base(slug)).then((r) => jsonOrThrow<ReviewSummary[]>(r));

export const createReview = (slug: string, body: ReviewCreateRequest) =>
  apiFetch(base(slug), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<ReviewRead>(r));

export const getReview = (slug: string, reviewId: string) =>
  apiFetch(`${base(slug)}/${reviewId}`).then((r) => jsonOrThrow<ReviewRead>(r));

export const updateReview = (
  slug: string,
  reviewId: string,
  body: ReviewUpdateRequest,
) =>
  apiFetch(`${base(slug)}/${reviewId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<ReviewRead>(r));

export const deleteReview = (slug: string, reviewId: string) =>
  apiFetch(`${base(slug)}/${reviewId}`, { method: "DELETE" }).then((r) => {
    if (!r.ok && r.status !== 204) {
      throw new Error(`${r.status} ${r.statusText}`);
    }
  });

export const estimateReview = (slug: string, reviewId: string, body: RunRequest = {}) =>
  apiFetch(`${base(slug)}/${reviewId}/estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<RunEstimate>(r));

export const runReview = (slug: string, reviewId: string, body: RunRequest) =>
  apiFetch(`${base(slug)}/${reviewId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<RunReport>(r));

export const exportReviewDocx = (slug: string, reviewId: string) =>
  apiFetch(`${base(slug)}/${reviewId}/export.docx`, {
    method: "POST",
  }).then((r) => jsonOrThrow<ExportResponse>(r));

// Backend-relative URL → fully qualified download URL.
export const generatedDocxUrl = (downloadUrl: string) =>
  `${BACKEND_ROOT}${downloadUrl}`;
