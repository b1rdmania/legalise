// Anonymisation module — local API client.
//
// Lives here (not in `src/lib/api.ts`) by Phase B / W3 precedent: keeps
// the central api.ts uncluttered while modules churn. Wraps the four
// backend endpoints under `/api/documents/{id}/anonymise[...]`.

import { API, apiFetch } from "../../lib/api";

export type AnonymisationEngine = "presidio" | "claude" | "auto";

export interface AnonymiseRequestPayload {
  engine?: AnonymisationEngine;
  entity_types?: string[] | null;
  threshold?: number;
}

export interface TokenMapping {
  token: string;
  entity_type: string;
  original: string;
  occurrences: number;
}

export interface AnonymisationResult {
  document_id: string;
  redacted_text: string;
  engine: string;
  anonymised_at: string;
  char_count: number;
  entity_count: number;
  tokens: TokenMapping[];
}

export interface AnonymisationSpan {
  start: number;
  end: number;
  token: string;
  original: string;
  entity_type: string;
}

export interface MappingRead {
  document_id: string;
  tokens: TokenMapping[];
  spans: AnonymisationSpan[];
}

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      detail = await res.text();
    }
    throw new Error(`${res.status} ${res.statusText}: ${detail}`.trim());
  }
  return (await res.json()) as T;
}

export const anonymiseDocument = (
  documentId: string,
  body: AnonymiseRequestPayload = {},
): Promise<AnonymisationResult> =>
  apiFetch(`${API}/documents/${documentId}/anonymise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ engine: "auto", threshold: 0.4, ...body }),
  }).then((r) => readJsonOrThrow<AnonymisationResult>(r));

export const getAnonymisation = (documentId: string): Promise<AnonymisationResult> =>
  apiFetch(`${API}/documents/${documentId}/anonymise`).then((r) =>
    readJsonOrThrow<AnonymisationResult>(r),
  );

export const getAnonymisationMapping = (documentId: string): Promise<MappingRead> =>
  apiFetch(`${API}/documents/${documentId}/anonymise/mapping`).then((r) =>
    readJsonOrThrow<MappingRead>(r),
  );

export const deleteAnonymisation = async (documentId: string): Promise<void> => {
  const res = await apiFetch(`${API}/documents/${documentId}/anonymise`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
};
