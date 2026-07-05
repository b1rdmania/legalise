// External packs — imported read-only matter bundles.
//
// An external workspace's export, ingested as a read-only matter and
// supervised here: per-document hash manifest (verified-at-source /
// attested-at-ingest / claimed-by-source), sign-off through the
// existing signoffs surface.

import { API, apiFetch, jsonOrThrow } from "./_core";

export interface ExternalPackSignoffSummary {
  total: number;
  signed: number;
  signed_with_observations: number;
  rejected: number;
}

export interface ExternalPack {
  matter_id: string;
  matter_slug: string;
  title: string;
  adapter: string;
  source: string;
  exported_at: string | null;
  ingested_at: string | null;
  // documents / versions / edits / verified_at_source /
  // attested_at_ingest / claimed_by_source / unhashed / hash_mismatches
  counts: Record<string, number>;
  manifest_artifact_id: string;
  document_artifact_ids: string[];
  signoffs: ExternalPackSignoffSummary;
}

export const listExternalPacks = () =>
  apiFetch(`${API}/external/packs`).then((r) =>
    jsonOrThrow<{ packs: ExternalPack[] }>(r),
  );

export const ingestExternalPack = (params: {
  adapter: string;
  exportJson: File | Blob;
  documentsZip?: File | Blob | null;
  title?: string;
}) => {
  const fd = new FormData();
  fd.append("adapter", params.adapter);
  fd.append("export", params.exportJson, "export.json");
  if (params.documentsZip) fd.append("documents", params.documentsZip, "documents.zip");
  if (params.title) fd.append("title", params.title);
  return apiFetch(`${API}/external/packs`, { method: "POST", body: fd }).then(
    (r) => jsonOrThrow<ExternalPack>(r),
  );
};
