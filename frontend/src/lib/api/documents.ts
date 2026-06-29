// Document listing/upload, body + workspace, versions, tracked-change
// edits, comments, edit sessions, working drafts, and anonymisation.
// Moved verbatim from `lib/api.ts` (Fluff C1 / audit M2.1).

import { API, BACKEND_ROOT, apiFetch, jsonOrThrow } from "./_core";

export interface MatterDocument {
  id: string;
  matter_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  tag: string | null;
  from_disclosure: boolean;
  uploaded_at: string;
  uploaded_by_id: string;
  comment_count?: number;
  open_comment_count?: number;
  version_count?: number;
  edit_count?: number;
  pending_edit_count?: number;
}

export const listDocuments = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/documents`).then((r) => jsonOrThrow<MatterDocument[]>(r));

// Typed upload error. Lets the UI show a friendly inline banner for
// the three validation failures the backend enforces: unsupported MIME
// (415), declared MIME doesn't match magic bytes (415), and over the
// 25 MB cap (413). Anything else flows through as a generic Error
// from `jsonOrThrow`.
export type UploadErrorKind =
  | "unsupported_mime"
  | "magic_byte_mismatch"
  | "upload_too_large";

export class UploadError extends Error {
  kind: UploadErrorKind;
  status: number;
  constructor(kind: UploadErrorKind, status: number, message: string) {
    super(message);
    this.name = "UploadError";
    this.kind = kind;
    this.status = status;
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const uploadDocument = async (
  slug: string,
  file: File,
  tag?: string,
  fromDisclosure?: boolean,
): Promise<MatterDocument> => {
  const fd = new FormData();
  fd.append("file", file);
  if (tag) fd.append("tag", tag);
  if (fromDisclosure) fd.append("from_disclosure", "true");
  const res = await apiFetch(`${API}/matters/${slug}/documents`, {
    method: "POST",
    body: fd,
  });
  if (res.status === 413 || res.status === 415) {
    let detail: Record<string, unknown> | null = null;
    try {
      const body = (await res.json()) as { detail?: Record<string, unknown> };
      detail = body?.detail ?? null;
    } catch {
      detail = null;
    }
    if (res.status === 415) {
      const errKind = (detail?.error as string | undefined) ?? "unsupported_mime";
      if (errKind === "magic_byte_mismatch") {
        const declared = (detail?.declared_mime as string | null) || file.type || "the declared type";
        const inferred = (detail?.inferred_format as string | null) ?? "something else";
        throw new UploadError(
          "magic_byte_mismatch",
          415,
          `File contents do not match its declared type. Declared as ${declared}; the bytes look like ${inferred}. Re-export from the source app and try again.`,
        );
      }
      const got = (detail?.got as string | null) || file.type || "unknown";
      throw new UploadError(
        "unsupported_mime",
        415,
        `That file type is not supported (${got}). Upload a PDF, DOCX, DOC, TXT, MD, or RTF.`,
      );
    }
    const maxBytes = Number(detail?.max_bytes ?? 25 * 1024 * 1024);
    const gotBytes = Number(detail?.got_bytes ?? file.size);
    throw new UploadError(
      "upload_too_large",
      413,
      `File is too large (${formatMb(gotBytes)}). The limit is ${formatMb(maxBytes)} per document.`,
    );
  }
  return jsonOrThrow<MatterDocument>(res);
};

// ----- Document body + edit instructions ---------------------------------

export interface DocumentBody {
  document_id: string;
  kind: string;
  extracted_text: string;
  extraction_method: string;
  extracted_at: string;
  char_count: number;
  page_count: number | null;
  error_reason: string | null;
}

export interface DocumentWorkspaceBlock {
  id: string;
  type: "paragraph" | "table_cell";
  ordinal: number;
  text: string;
}

export interface DocumentWorkspace {
  document_id: string;
  filename: string;
  mime_type: string;
  source: "original_docx" | "latest_version" | "extracted_body";
  source_version_id: string | null;
  source_version_number: number | null;
  extraction_method: string | null;
  blocks: DocumentWorkspaceBlock[];
  text: string;
  char_count: number;
  notes: string[];
}

export type EditMode =
  | "tighten"
  | "rewrite"
  | "summarise"
  | "free-text"
  | "uk-jurisdiction-sweep";

export interface DocumentVersionRead {
  id: string;
  document_id: string;
  version_number: number;
  kind: string;
  created_by_id: string;
  created_at: string;
  storage_uri: string | null;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  notes: string | null;
  resolved_text: string | null;
  resolved_json?: Record<string, unknown> | null;
}

export interface DocumentEditRead {
  id: string;
  document_version_id: string;
  change_id: string;
  correlation_id: string | null;
  deleted_text: string;
  inserted_text: string;
  context_before: string;
  context_after: string;
  rationale: string | null;
  status: string;
  created_at: string;
}

export interface EditInstructionResponse {
  version: DocumentVersionRead;
  pending_edits: DocumentEditRead[];
  model_used: string;
  model_notes: string;
  instruction_hash: string;
  parse_ok: boolean;
}

export const getDocumentBody = (documentId: string) =>
  apiFetch(`${API}/documents/${documentId}/body`).then((r) =>
    jsonOrThrow<DocumentBody>(r),
  );

export const getDocumentWorkspace = (documentId: string) =>
  apiFetch(`${API}/documents/${documentId}/workspace`).then((r) =>
    jsonOrThrow<DocumentWorkspace>(r),
  );

export const saveDocumentWorkspace = (
  documentId: string,
  text: string,
  notes?: string,
  resolvedJson?: Record<string, unknown> | null,
) =>
  apiFetch(`${API}/documents/${documentId}/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      notes: notes?.trim() || null,
      resolved_json: resolvedJson ?? null,
    }),
  }).then((r) =>
    resolutionJsonOrThrow<{
      version: DocumentVersionRead;
      workspace: DocumentWorkspace;
    }>(r),
  );

// Original File Retrieval v1 — browser-navigable URL for the streamed
// backend proxy. Used directly as an <a href> (open inline) or with
// download=1 (attachment); the browser handles the response, so this
// returns a URL rather than fetching bytes through React state.
export const documentOriginalUrl = (
  documentId: string,
  opts?: { download?: boolean },
): string =>
  `${API}/documents/${encodeURIComponent(documentId)}/original${
    opts?.download ? "?download=1" : ""
  }`;

export async function fetchDocumentOriginalBlob(documentId: string): Promise<Blob> {
  const resp = await apiFetch(documentOriginalUrl(documentId));
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `Could not load original document (${resp.status})`);
  }
  return resp.blob();
}

export const documentVersionDocxUrl = (
  documentId: string,
  versionId: string,
): string =>
  `${API}/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(
    versionId,
  )}/docx`;

export const documentVersionPdfUrl = (
  documentId: string,
  versionId: string,
): string =>
  `${API}/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(
    versionId,
  )}/pdf`;

export const documentVersionOriginalUrl = (
  documentId: string,
  versionId: string,
  opts?: { download?: boolean },
): string =>
  `${API}/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(
    versionId,
  )}/original${opts?.download ? "?download=1" : ""}`;

export const postEditInstruction = (
  documentId: string,
  instruction: string,
  mode: EditMode,
) =>
  apiFetch(`${API}/documents/${documentId}/edit-instructions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, mode }),
  }).then((r) => jsonOrThrow<EditInstructionResponse>(r));

// ----- Generated .docx export --------------------------------------------

export interface GeneratedDocxResponse {
  file_uuid: string;
  storage_uri: string;
  byte_count: number;
  download_url: string;
}

export async function downloadGeneratedDocx(fileUuid: string): Promise<Blob> {
  const resp = await apiFetch(`${API}/documents/generated/${fileUuid}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
  }
  return resp.blob();
}

// ----- Tracked changes accept/reject -------------------------------------

export interface EditResolutionResponse {
  edit: DocumentEditRead;
  new_version: DocumentVersionRead | null;
  resolved_text: string | null;
}

export interface BulkResolutionResponse {
  affected_count: number;
  new_version: DocumentVersionRead;
  resolved_text: string;
}

export interface DocumentVersionSummary {
  version: DocumentVersionRead;
  pending_count: number;
  accepted_count: number;
  rejected_count: number;
}

export interface DocumentCommentRead {
  id: string;
  document_id: string;
  author_id: string;
  quote_text: string | null;
  body_sha256: string | null;
  anchor_start: number | null;
  anchor_end: number | null;
  body: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
  resolved_by_id: string | null;
}

export interface DocumentEditSessionRead {
  id: string;
  document_id: string;
  user_id: string;
  client_id: string;
  user_label: string;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
}

export interface DocumentEditSessionResponse {
  current: DocumentEditSessionRead;
  active: DocumentEditSessionRead[];
}

export interface DocumentWorkingDraftRead {
  document_id: string;
  updated_by_id: string | null;
  updated_at: string | null;
  plain_text: string;
  editor_json: Record<string, unknown> | null;
  base_version_id: string | null;
  version_counter: number;
  client_id: string | null;
}

export interface DocumentAssetUploadRead {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  url: string;
}

export class ConflictError extends Error {
  status = 409;
  detail: unknown;
  constructor(message = "edit already resolved", detail: unknown = null) {
    super(message);
    this.name = "ConflictError";
    this.detail = detail;
  }
}

async function resolutionJsonOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 409) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as unknown;
      const detail =
        parsed && typeof parsed === "object" && "detail" in parsed
          ? (parsed as { detail?: unknown }).detail
          : parsed;
      const message =
        detail && typeof detail === "object" && "message" in detail
          ? String((detail as { message?: unknown }).message || "")
          : "";
      throw new ConflictError(message || "edit already resolved", detail);
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      throw new ConflictError(text || "edit already resolved");
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface PendingEditsResponse {
  version: EditInstructionResponse["version"] | null;
  pending_edits: EditInstructionResponse["pending_edits"];
}

// Pending redlines survive reload: the substrate stores proposed edits
// in document_edits; this rehydrates them on document open.
export const getPendingEdits = (documentId: string) =>
  apiFetch(`${API}/documents/${encodeURIComponent(documentId)}/edits/pending`).then(
    (r) => jsonOrThrow<PendingEditsResponse>(r),
  );

export const acceptEdit = (editId: string) =>
  apiFetch(`${API}/documents/edits/${editId}/accept`, { method: "POST" }).then(
    (r) => resolutionJsonOrThrow<EditResolutionResponse>(r),
  );

export const rejectEdit = (editId: string) =>
  apiFetch(`${API}/documents/edits/${editId}/reject`, { method: "POST" }).then(
    (r) => resolutionJsonOrThrow<EditResolutionResponse>(r),
  );

export const acceptAll = (versionId: string) =>
  apiFetch(`${API}/documents/versions/${versionId}/accept-all`, {
    method: "POST",
  }).then((r) => resolutionJsonOrThrow<BulkResolutionResponse>(r));

export const rejectAll = (versionId: string) =>
  apiFetch(`${API}/documents/versions/${versionId}/reject-all`, {
    method: "POST",
  }).then((r) => resolutionJsonOrThrow<BulkResolutionResponse>(r));

export const getDocumentVersions = (documentId: string) =>
  apiFetch(`${API}/documents/${documentId}/versions`).then((r) =>
    resolutionJsonOrThrow<DocumentVersionSummary[]>(r),
  );

export const getDocumentWorkingDraft = (documentId: string) =>
  apiFetch(`${API}/documents/${documentId}/draft`).then((r) =>
    resolutionJsonOrThrow<DocumentWorkingDraftRead>(r),
  );

export const saveDocumentWorkingDraft = (
  documentId: string,
  body: {
    plain_text: string;
    editor_json?: Record<string, unknown> | null;
    base_version_id?: string | null;
    client_id?: string | null;
    expected_version_counter?: number | null;
  },
) =>
  apiFetch(`${API}/documents/${documentId}/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => resolutionJsonOrThrow<DocumentWorkingDraftRead>(r));

export const commitDocumentWorkingDraft = (
  documentId: string,
  notes?: string,
  clearDraft = true,
  expectedVersionCounter?: number | null,
) =>
  apiFetch(`${API}/documents/${documentId}/draft/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      notes: notes?.trim() || null,
      clear_draft: clearDraft,
      expected_version_counter: expectedVersionCounter ?? null,
    }),
  }).then((r) => resolutionJsonOrThrow<DocumentVersionRead>(r));

export const saveDocumentVersion = (
  documentId: string,
  resolvedText: string,
  notes?: string,
  resolvedJson?: Record<string, unknown> | null,
) =>
  apiFetch(`${API}/documents/${documentId}/versions/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resolved_text: resolvedText,
      resolved_json: resolvedJson ?? null,
      notes,
    }),
  }).then((r) => resolutionJsonOrThrow<DocumentVersionRead>(r));

export const uploadDocumentVersion = async (
  documentId: string,
  file: File,
  notes?: string,
): Promise<DocumentVersionRead> => {
  const fd = new FormData();
  fd.append("file", file);
  if (notes?.trim()) fd.append("notes", notes.trim());
  const res = await apiFetch(`${API}/documents/${documentId}/versions/upload`, {
    method: "POST",
    body: fd,
  });
  if (res.status === 413 || res.status === 415) {
    let detail: Record<string, unknown> | null = null;
    try {
      const body = (await res.json()) as { detail?: Record<string, unknown> };
      detail = body?.detail ?? null;
    } catch {
      detail = null;
    }
    if (res.status === 415) {
      const errKind = (detail?.error as string | undefined) ?? "unsupported_mime";
      if (errKind === "magic_byte_mismatch") {
        const declared = (detail?.declared_mime as string | null) || file.type || "the declared type";
        const inferred = (detail?.inferred_format as string | null) ?? "something else";
        throw new UploadError(
          "magic_byte_mismatch",
          415,
          `File contents do not match its declared type. Declared as ${declared}; the bytes look like ${inferred}. Re-export from the source app and try again.`,
        );
      }
      const got = (detail?.got as string | null) || file.type || "unknown";
      throw new UploadError(
        "unsupported_mime",
        415,
        `That file type is not supported (${got}). Upload a PDF, DOCX, DOC, TXT, MD, or RTF.`,
      );
    }
    const maxBytes = Number(detail?.max_bytes ?? 25 * 1024 * 1024);
    const gotBytes = Number(detail?.got_bytes ?? file.size);
    throw new UploadError(
      "upload_too_large",
      413,
      `File is too large (${formatMb(gotBytes)}). The limit is ${formatMb(maxBytes)} per document.`,
    );
  }
  return resolutionJsonOrThrow<DocumentVersionRead>(res);
};

export const uploadDocumentAsset = async (
  documentId: string,
  file: File,
): Promise<DocumentAssetUploadRead> => {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch(`${API}/documents/${documentId}/assets`, {
    method: "POST",
    body: fd,
  });
  if (res.status === 413 || res.status === 415) {
    if (res.status === 415) {
      throw new UploadError(
        "unsupported_mime",
        415,
        "That image type is not supported. Upload PNG, JPEG, WebP, or GIF.",
      );
    }
    throw new UploadError(
      "upload_too_large",
      413,
      `Image is too large (${formatMb(file.size)}). The limit is ${formatMb(
        5 * 1024 * 1024,
      )} per image.`,
    );
  }
  const uploaded = await resolutionJsonOrThrow<DocumentAssetUploadRead>(res);
  return {
    ...uploaded,
    url: uploaded.url.startsWith("/api/") ? `${BACKEND_ROOT}${uploaded.url}` : uploaded.url,
  };
};

export const restoreDocumentVersion = (
  documentId: string,
  versionId: string,
  notes?: string,
) =>
  apiFetch(`${API}/documents/${documentId}/versions/${versionId}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: notes?.trim() || null }),
  }).then((r) => resolutionJsonOrThrow<DocumentVersionRead>(r));

export const getDocumentComments = (documentId: string) =>
  apiFetch(`${API}/documents/${documentId}/comments`).then((r) =>
    resolutionJsonOrThrow<DocumentCommentRead[]>(r),
  );

export const getDocumentEditSessions = (documentId: string) =>
  apiFetch(`${API}/documents/${documentId}/edit-sessions`).then((r) =>
    resolutionJsonOrThrow<DocumentEditSessionRead[]>(r),
  );

export const startDocumentEditSession = (
  documentId: string,
  clientId: string,
) =>
  apiFetch(`${API}/documents/${documentId}/edit-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId }),
  }).then((r) => resolutionJsonOrThrow<DocumentEditSessionResponse>(r));

export const endDocumentEditSession = async (
  documentId: string,
  sessionId: string,
): Promise<void> => {
  const res = await apiFetch(
    `${API}/documents/${documentId}/edit-sessions/${sessionId}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
};

export const deleteDocument = async (documentId: string): Promise<void> => {
  const res = await apiFetch(`${API}/documents/${documentId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
};

export const createDocumentComment = (
  documentId: string,
  payload: {
    body: string;
    quote_text?: string | null;
    body_sha256?: string | null;
    anchor_start?: number | null;
    anchor_end?: number | null;
  },
) =>
  apiFetch(`${API}/documents/${documentId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => resolutionJsonOrThrow<DocumentCommentRead>(r));

export const updateDocumentComment = (
  documentId: string,
  commentId: string,
  payload: { body: string },
) =>
  apiFetch(
    `${API}/documents/${encodeURIComponent(documentId)}/comments/${encodeURIComponent(
      commentId,
    )}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  ).then((r) => resolutionJsonOrThrow<DocumentCommentRead>(r));

export const resolveDocumentComment = (documentId: string, commentId: string) =>
  apiFetch(
    `${API}/documents/${encodeURIComponent(documentId)}/comments/${encodeURIComponent(
      commentId,
    )}/resolve`,
    { method: "POST" },
  ).then((r) => resolutionJsonOrThrow<DocumentCommentRead>(r));

export const reopenDocumentComment = (documentId: string, commentId: string) =>
  apiFetch(
    `${API}/documents/${encodeURIComponent(documentId)}/comments/${encodeURIComponent(
      commentId,
    )}/reopen`,
    { method: "POST" },
  ).then((r) => resolutionJsonOrThrow<DocumentCommentRead>(r));


// ----- Installed-skill catalogue extensions ------------------------------

// ----- Anonymisation (folded from modules/anonymisation/api.ts) ----------

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

async function anonymisationJsonOrThrow<T>(res: Response): Promise<T> {
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
  }).then((r) => anonymisationJsonOrThrow<AnonymisationResult>(r));

export const getAnonymisation = (documentId: string): Promise<AnonymisationResult> =>
  apiFetch(`${API}/documents/${documentId}/anonymise`).then((r) =>
    anonymisationJsonOrThrow<AnonymisationResult>(r),
  );

export const getAnonymisationMapping = (documentId: string): Promise<MappingRead> =>
  apiFetch(`${API}/documents/${documentId}/anonymise/mapping`).then((r) =>
    anonymisationJsonOrThrow<MappingRead>(r),
  );
