// Case-law API client (Phase C W1).
//
// Module-local per the tabular_review precedent — keeps cross-workstream
// coupling on lib/api.ts minimal. Folds into lib/api.ts as a follow-up.

import { API, apiFetch } from "../../lib/api";
export type { Matter } from "../../lib/api";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// -- types ------------------------------------------------------------------

export interface CaseLawSearchRequest {
  query: string;
  court?: string | null;
  year?: number | null;
}

export interface CaseLawResult {
  case_name: string;
  citation_ref: string;
  court: string | null;
  judgment_date: string | null;
  parties: string | null;
  summary: string | null;
  source_url: string | null;
  relevance_score: number | null;
}

export interface CaseLawSearchResponse {
  query: string;
  results: CaseLawResult[];
  truncated: boolean;
  raw_response_excerpt: string | null;
  model_used: string;
  latency_ms: number;
}

export interface CitationCreateRequest {
  case_name: string;
  citation_ref: string;
  citation_text: string;
  source_url?: string | null;
}

export interface MatterCitationRead {
  id: string;
  matter_id: string;
  case_name: string | null;
  citation_ref: string | null;
  citation_text: string;
  source_url: string | null;
  added_by_id: string;
  added_at: string;
}

// -- calls ------------------------------------------------------------------

const base = (slug: string) => `${API}/matters/${slug}`;

export const searchCaseLaw = (slug: string, body: CaseLawSearchRequest) =>
  apiFetch(`${base(slug)}/case-law/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<CaseLawSearchResponse>(r));

export const createCitation = (slug: string, body: CitationCreateRequest) =>
  apiFetch(`${base(slug)}/citations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<MatterCitationRead>(r));

export const listCitations = (slug: string) =>
  apiFetch(`${base(slug)}/citations`).then((r) =>
    jsonOrThrow<MatterCitationRead[]>(r),
  );

export const deleteCitation = (slug: string, citationId: string) =>
  apiFetch(`${base(slug)}/citations/${citationId}`, { method: "DELETE" }).then(
    (r) => {
      if (!r.ok && r.status !== 204) {
        throw new Error(`${r.status} ${r.statusText}`);
      }
    },
  );
