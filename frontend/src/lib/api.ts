// Thin fetch wrapper for the Legalise backend.
// All endpoints live under /api.

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
  facts: Record<string, unknown>;
  opened_at: string;
  closed_at: string | null;
  retention_until: string | null;
  created_by_id: string;
}

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

// API prefix. In dev/self-host the Vite proxy or compose network resolves
// `/api/...` to the backend. On a split live deploy (Cloudflare Pages +
// Fly.io backend), set VITE_API_BASE_URL at build time to the absolute
// API root including the `/api` segment — e.g.
// `VITE_API_BASE_URL=https://api.legalise.dev/api`. Backend routes are
// mounted under `/api/...` regardless of host, so the env var carries
// both the origin and the `/api` segment.
export const API = import.meta.env.VITE_API_BASE_URL || "/api";

// Backend origin (no `/api` suffix). The health endpoint lives at the
// backend root, not under /api, so it needs the origin alone.
export const BACKEND_ROOT = API.replace(/\/api\/?$/, "") || "";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// Every authenticated cross-origin call MUST send the session cookie
// Cookie/CORS coherence invariant. All app fetches
// route through `apiFetch` so `credentials: "include"` is uniform.
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { credentials: "include", ...init });
}

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

export const listDocuments = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/documents`).then((r) => jsonOrThrow<MatterDocument[]>(r));

export const uploadDocument = (slug: string, file: File, tag?: string, fromDisclosure?: boolean) => {
  const fd = new FormData();
  fd.append("file", file);
  if (tag) fd.append("tag", tag);
  if (fromDisclosure) fd.append("from_disclosure", "true");
  return apiFetch(`${API}/matters/${slug}/documents`, { method: "POST", body: fd }).then((r) =>
    jsonOrThrow<MatterDocument>(r),
  );
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

export const setPrivilege = (slug: string, posture: string) =>
  apiFetch(`${API}/matters/${slug}/privilege`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ privilege_posture: posture }),
  }).then((r) => jsonOrThrow<Matter>(r));

export interface PluginInvokeResponse {
  plugin: string;
  skill: string;
  matter_slug: string;
  response_text: string;
  model_used: string;
  token_count: number;
  latency_ms: number;
}

export const invokePlugin = (slug: string, plugin: string, skill: string, inputs: Record<string, unknown> = {}) =>
  apiFetch(`${API}/matters/${slug}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plugin, skill, inputs }),
  }).then((r) => jsonOrThrow<PluginInvokeResponse>(r));

// ----- Installed skill catalogue -----

export interface ModuleSkill {
  plugin: string;
  skill: string;
  name: string;
  description: string;
  source_url: string | null;
  argument_hint: string | null;
  capabilities: string[];
  trust_posture: string | null;
  enabled: boolean;
}

export interface ModulesResponse {
  plugins_root: string;
  source: {
    repo: string | null;
    ref: string | null;
  };
  skills: ModuleSkill[];
  broken: {
    plugin: string;
    skill: string;
    errors: { path: string; message: string }[];
  }[];
}

export const getModules = () =>
  apiFetch(`${API}/modules`).then((r) => jsonOrThrow<ModulesResponse>(r));

// Public, unauth-safe view of the catalogue. No workspace state - no
// `granted_capabilities`, no `enabled`. Backed by the same manifest
// resolver as `getModules`. Backend sends Cache-Control: max-age=300.
export interface PublicModuleSkill {
  plugin: string;
  skill: string;
  name: string;
  description: string;
  declared_capabilities: string[];
  trust_posture: string | null;
  source_url: string | null;
}

export interface PublicModulesResponse {
  source: {
    repo: string | null;
    ref: string | null;
  };
  skills: PublicModuleSkill[];
  broken: {
    plugin: string;
    skill: string;
    errors: { path: string; message: string }[];
  }[];
}

export const getPublicModules = () =>
  apiFetch(`${API}/modules/public`).then((r) => jsonOrThrow<PublicModulesResponse>(r));

// Per-matter workflows catalogue. State (grant, availability, last_run_at)
// is derived live on the backend from grants + audit + matter posture.
export type WorkflowGrant = "granted" | "partial" | "blocked" | "not-installed";
export type WorkflowAvailability =
  | "ok"
  | "blocked-by-posture"
  | "blocked-by-grant"
  | "not-installed";

export interface WorkflowState {
  key: string;
  title: string;
  description: string;
  declared_capabilities: string[];
  granted_capabilities: string[];
  grant: WorkflowGrant;
  last_run_at: string | null;
  availability: WorkflowAvailability;
  reason: string | null;
}

export interface MatterWorkflowsResponse {
  workflows: WorkflowState[];
}

export const getMatterWorkflows = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/workflows`).then((r) =>
    jsonOrThrow<MatterWorkflowsResponse>(r),
  );

export const getSkillBody = (plugin: string, skill: string) =>
  apiFetch(`${API}/modules/${encodeURIComponent(plugin)}/${encodeURIComponent(skill)}`).then(async (r) => {
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`${r.status} ${r.statusText}: ${text}`);
    }
    return r.text();
  });

// ----- Pre-Motion -----

export interface PreMotionStageStatus {
  name: string;
  sub_agent_count: number;
  duration_ms: number;
  token_count: number;
  errors: string[];
}

export interface PreMotionFailureScenario {
  category: "procedural" | "substantive" | "evidentiary" | "strategic";
  scenario: string;
  probability: "High" | "Medium" | "Low";
  impact: "High" | "Medium" | "Low";
  mitigation: string;
}

export interface PreMotionEvidenceFlag {
  flag: string;
  severity: "high" | "medium" | "low";
  category: string;
  source_document?: string | null;
  source_documents?: string[] | null;
  event?: string | null;
  date?: string | null;
}

export interface PreMotionSynthesis {
  verdict: "steelman" | "borderline" | "strawman";
  verdict_reasoning: string;
  summary: string;
  failure_scenarios: PreMotionFailureScenario[];
  evidence_inconsistencies: { claim: string; issue: string; severity: "high" | "medium" | "low" }[];
  blind_spots: string[];
  if_we_lose_this_will_be_why: string;
}

export interface PreMotionOptimistic {
  key_arguments: { argument: string; supporting_evidence: string; case_law: string }[];
  supporting_evidence: { item: string; weight: "high" | "medium" | "low"; what_it_proves: string }[];
  expected_counterarguments: string[];
  optimistic_outcome: string;
}

export interface PreMotionRunResult {
  matter_slug: string;
  started_at: string;
  completed_at: string;
  total_duration_ms: number;
  total_token_count: number;
  model_used: string;
  stages: PreMotionStageStatus[];
  optimistic: PreMotionOptimistic;
  evidence_flags: PreMotionEvidenceFlag[];
  synthesis: PreMotionSynthesis;
}

export const runPreMotion = (slug: string, inputs: { depth?: "fast" | "thorough" } = {}) =>
  apiFetch(`${API}/matters/${slug}/pre-motion/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  }).then((r) => jsonOrThrow<PreMotionRunResult>(r));

export type PreMotionStreamEvent =
  | { event: "stage.start"; data: { stage: string; index: number; sub_agent_count: number } }
  | {
      event: "stage.end";
      data: {
        stage: string;
        index: number;
        name: string;
        sub_agent_count: number;
        duration_ms: number;
        token_count: number;
        errors: string[];
      };
    }
  | { event: "run.complete"; data: { verdict: string; total_duration_ms: number; total_token_count: number } }
  | { event: "result"; data: PreMotionRunResult }
  | { event: "error"; data: { message: string; code?: number } };

/**
 * Run Pre-Motion as an SSE stream. Returns an async iterator over typed
 * events. The pipeline keeps running server-side even if the iterator is
 * abandoned — audit rows always land.
 */
export async function* runPreMotionStream(
  slug: string,
  inputs: { depth?: "fast" | "thorough" } = {},
  signal?: AbortSignal,
): AsyncIterableIterator<PreMotionStreamEvent> {
  const resp = await apiFetch(`${API}/matters/${slug}/pre-motion/run-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
    signal,
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const data = JSON.parse(dataLines.join("\n"));
      yield { event, data } as PreMotionStreamEvent;
    }
  }
}

export async function exportPreMotionPdf(slug: string, result: PreMotionRunResult): Promise<Blob> {
  const resp = await apiFetch(`${API}/matters/${slug}/pre-motion/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
  }
  return resp.blob();
}

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

// ----- Letters -----

export interface LetterType {
  id: string;
  label: string;
  plugin: string;
  skill: string;
  summary: string;
  is_default: boolean;
}

export interface LetterCatalogue {
  matter_slug: string;
  matter_type: string;
  letter_types: LetterType[];
}

export interface LetterDraft {
  matter_slug: string;
  letter_type: string;
  plugin: string;
  skill: string;
  draft_markdown: string;
  model_used: string;
  token_count: number;
  latency_ms: number;
}

export const getLetterCatalogue = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/letters/catalog`).then((r) => jsonOrThrow<LetterCatalogue>(r));

export const draftLetter = (slug: string, letterType: string, inputs: Record<string, string> = {}) =>
  apiFetch(`${API}/matters/${slug}/letters/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ letter_type: letterType, inputs }),
  }).then((r) => jsonOrThrow<LetterDraft>(r));

// ----- Document body + edit instructions (Phase A) -----------------------

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
  notes: string | null;
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

// ----- Generated .docx export (Phase B W1) ------------------------------

export interface GeneratedDocxResponse {
  file_uuid: string;
  storage_uri: string;
  byte_count: number;
  download_url: string;
}

export const exportLetterDocx = (
  slug: string,
  payload: { letter_type: string; title: string; draft_markdown: string },
) =>
  apiFetch(`${API}/matters/${slug}/letters/draft/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => jsonOrThrow<GeneratedDocxResponse>(r));

export const exportPreMotionDocx = (slug: string, result: PreMotionRunResult) =>
  apiFetch(`${API}/matters/${slug}/pre-motion/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  }).then((r) => jsonOrThrow<GeneratedDocxResponse>(r));

export async function downloadGeneratedDocx(fileUuid: string): Promise<Blob> {
  const resp = await apiFetch(`${API}/documents/generated/${fileUuid}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
  }
  return resp.blob();
}

// ----- Tracked changes accept/reject (Phase B W2) -----------------------

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

export class ConflictError extends Error {
  status = 409;
}

async function resolutionJsonOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 409) {
    const text = await res.text();
    throw new ConflictError(text || "edit already resolved");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

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

// ----- Auth + user --------------------------------------------------------

// Auth endpoints sit at the backend origin, NOT under /api. See main.py:
//   app.include_router(auth_router, prefix="/auth", ...)
export const AUTH = BACKEND_ROOT ? `${BACKEND_ROOT}/auth` : "/auth";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  default_model_id: string | null;
  default_privilege_posture: string | null;
  is_active: boolean;
  is_verified: boolean;
  is_superuser: boolean;
}

export interface AuthError extends Error {
  status: number;
  detail: unknown;
}

async function readDetail(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function authJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await readDetail(res);
    const err = new Error(
      `${res.status} ${res.statusText}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
    ) as AuthError;
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  // Some endpoints (logout, verify) return 204 no body.
  if (res.status === 204 || res.headers.get("Content-Length") === "0") {
    return undefined as unknown as T;
  }
  const ct = res.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) {
    return undefined as unknown as T;
  }
  return res.json() as Promise<T>;
}

export const getCurrentUser = async (): Promise<CurrentUser | null> => {
  const res = await apiFetch(`${AUTH}/users/me`);
  if (res.status === 401) return null;
  return authJsonOrThrow<CurrentUser>(res);
};

export const signin = (email: string, password: string) =>
  apiFetch(`${AUTH}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }).toString(),
  }).then((r) => authJsonOrThrow<unknown>(r));

export const signout = () =>
  apiFetch(`${AUTH}/logout`, { method: "POST" }).then((r) => authJsonOrThrow<unknown>(r));

export const signup = (email: string, password: string, name: string = "") =>
  apiFetch(`${AUTH}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  }).then((r) => authJsonOrThrow<CurrentUser>(r));

export const forgotPassword = (email: string) =>
  apiFetch(`${AUTH}/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }).then((r) => authJsonOrThrow<unknown>(r));

export const resetPassword = (token: string, password: string) =>
  apiFetch(`${AUTH}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  }).then((r) => authJsonOrThrow<unknown>(r));

export const verifyEmail = (token: string) =>
  apiFetch(`${AUTH}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).then((r) => authJsonOrThrow<CurrentUser>(r));

export const requestVerifyToken = (email: string) =>
  apiFetch(`${AUTH}/request-verify-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }).then((r) => authJsonOrThrow<unknown>(r));

export interface UserProfileUpdate {
  name?: string;
  default_model_id?: string | null;
  default_privilege_posture?: string | null;
  password?: string;
}

export const updateProfile = (body: UserProfileUpdate) =>
  apiFetch(`${AUTH}/users/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => authJsonOrThrow<CurrentUser>(r));

// ----- Settings: API keys ------------------------------------------------

export interface UserApiKeyRead {
  provider: string;
  last_used_at: string | null;
  created_at: string;
}

export const listApiKeys = () =>
  apiFetch(`${API}/settings/keys`).then((r) => jsonOrThrow<UserApiKeyRead[]>(r));

export const upsertApiKey = (provider: "anthropic" | "openai", apiKey: string) =>
  apiFetch(`${API}/settings/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, api_key: apiKey }),
  }).then((r) => jsonOrThrow<UserApiKeyRead>(r));

export const deleteApiKey = (provider: string) =>
  apiFetch(`${API}/settings/keys/${encodeURIComponent(provider)}`, {
    method: "DELETE",
  }).then(async (r) => {
    if (!r.ok && r.status !== 204) {
      const text = await r.text();
      throw new Error(`${r.status} ${r.statusText}: ${text}`);
    }
  });

// ----- Installed-skill catalogue extensions (Phase D W1) -----------------

export interface BrokenManifest {
  plugin: string;
  skill: string;
  errors: { path: string; message: string }[];
}

export const disableSkill = (plugin: string, skill: string) =>
  apiFetch(
    `${API}/workspace/skills/${encodeURIComponent(plugin)}/${encodeURIComponent(skill)}/disable`,
    { method: "POST" },
  ).then((r) => jsonOrThrow<{ plugin: string; skill: string; enabled: boolean }>(r));

export const enableSkill = (plugin: string, skill: string) =>
  apiFetch(
    `${API}/workspace/skills/${encodeURIComponent(plugin)}/${encodeURIComponent(skill)}/enable`,
    { method: "POST" },
  ).then((r) => jsonOrThrow<{ plugin: string; skill: string; enabled: boolean }>(r));

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

export const deleteAnonymisation = async (documentId: string): Promise<void> => {
  const res = await apiFetch(`${API}/documents/${documentId}/anonymise`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
};

// ----- Tabular review (folded from modules/tabular_review/api.ts) --------

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

const reviewsBase = (slug: string) => `${API}/matters/${slug}/reviews`;

export const listReviews = (slug: string) =>
  apiFetch(reviewsBase(slug)).then((r) => jsonOrThrow<ReviewSummary[]>(r));

export const createReview = (slug: string, body: ReviewCreateRequest) =>
  apiFetch(reviewsBase(slug), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<ReviewRead>(r));

export const getReview = (slug: string, reviewId: string) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}`).then((r) => jsonOrThrow<ReviewRead>(r));

export const updateReview = (
  slug: string,
  reviewId: string,
  body: ReviewUpdateRequest,
) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<ReviewRead>(r));

export const deleteReview = (slug: string, reviewId: string) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}`, { method: "DELETE" }).then((r) => {
    if (!r.ok && r.status !== 204) {
      throw new Error(`${r.status} ${r.statusText}`);
    }
  });

export const estimateReview = (slug: string, reviewId: string, body: RunRequest = {}) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}/estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<RunEstimate>(r));

export const runReview = (slug: string, reviewId: string, body: RunRequest) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<RunReport>(r));

export const exportReviewDocx = (slug: string, reviewId: string) =>
  apiFetch(`${reviewsBase(slug)}/${reviewId}/export.docx`, {
    method: "POST",
  }).then((r) => jsonOrThrow<ExportResponse>(r));

// Backend-relative URL → fully qualified download URL.
export const generatedDocxUrl = (downloadUrl: string) =>
  `${BACKEND_ROOT}${downloadUrl}`;

// ----- Case law (folded from modules/case_law/api.ts) --------------------

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

const caseLawBase = (slug: string) => `${API}/matters/${slug}`;

export const searchCaseLaw = (slug: string, body: CaseLawSearchRequest) =>
  apiFetch(`${caseLawBase(slug)}/case-law/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<CaseLawSearchResponse>(r));

export const createCitation = (slug: string, body: CitationCreateRequest) =>
  apiFetch(`${caseLawBase(slug)}/citations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<MatterCitationRead>(r));

export const listCitations = (slug: string) =>
  apiFetch(`${caseLawBase(slug)}/citations`).then((r) =>
    jsonOrThrow<MatterCitationRead[]>(r),
  );

// ----- Assistant ----------------------------------------------------------

export interface SuggestedAction {
  type: "run_pre_motion" | "draft_letter" | "review_contract"
      | "view_document" | "view_audit" | "view_chronology"
      | "anonymise_document";
  label: string;
  params: Record<string, string>;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggested_actions: SuggestedAction[];
  created_at: string;
}

export const listAssistantMessages = (slug: string) =>
  apiFetch(`${API}/matters/${slug}/assistant/messages`)
    .then((r) => jsonOrThrow<AssistantMessage[]>(r));

export const postAssistantMessage = (slug: string, body: { content: string; selected_document_ids?: string[] }) =>
  apiFetch(`${API}/matters/${slug}/assistant/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<{ user: AssistantMessage; assistant: AssistantMessage }>(r));

export const deleteCitation = (slug: string, citationId: string) =>
  apiFetch(`${caseLawBase(slug)}/citations/${citationId}`, { method: "DELETE" }).then(
    (r) => {
      if (!r.ok && r.status !== 204) {
        throw new Error(`${r.status} ${r.statusText}`);
      }
    },
  );

// ----- Contract Review (folded from modules/contract_review/api.ts) ------

export type Posture = "buyer" | "seller" | "balanced";
export type ContractKind =
  | "nda"
  | "saas"
  | "msa"
  | "dpa"
  | "consultancy"
  | "employment"
  | "settlement"
  | "other";

export interface ContractReviewInputs {
  document_id: string;
  posture?: Posture;
  contract_type?: ContractKind;
  counterparty_name?: string | null;
  deal_value?: string | null;
}

export type ClauseType =
  | "definitions"
  | "scope"
  | "term"
  | "payment"
  | "ip"
  | "confidentiality"
  | "data_protection"
  | "warranties"
  | "indemnity"
  | "liability"
  | "termination"
  | "governing_law"
  | "jurisdiction"
  | "arbitration"
  | "boilerplate"
  | "other";

export interface Clause {
  id: string;
  section: string;
  title: string;
  type: ClauseType;
  text: string;
  defined_terms_used: string[];
  cross_references: string[];
}

export interface ParsedContract {
  title: string;
  parties: string[];
  document_type: ContractKind;
  governing_law_stated: string | null;
  clauses: Clause[];
}

export type UkIssueCategory =
  | "ucta_s2_s3"
  | "cra_s62"
  | "uk_gdpr_art28"
  | "governing_law"
  | "jurisdiction"
  | "arbitration"
  | "liability_cap"
  | "indemnity"
  | "ip_assignment"
  | "termination"
  | "boilerplate"
  | "other";

export type RiskSeverity = "high" | "medium" | "low";

export interface UkIssue {
  category: UkIssueCategory;
  statute_ref: string;
  description: string;
  severity: RiskSeverity;
}

export interface ClauseAnalysis {
  clause_id: string;
  risk_score: number;
  summary: string;
  uk_issues: UkIssue[];
  posture_note: string;
}

export type RedlinePriority = "must" | "suggested" | "nice_to_have";

export interface Redline {
  clause_id: string;
  original_text: string;
  suggested_text: string;
  explanation: string;
  priority: RedlinePriority;
}

export interface ContractSummary {
  executive_summary: string;
  key_terms: string[];
  risk_overview: string;
  uk_specific_callouts: string[];
  recommendation: string;
}

export type StageState = "pending" | "running" | "done" | "error" | "skipped";

export interface StageStatus {
  name: string;
  status: StageState;
  sub_agent_count: number;
  duration_ms: number;
  token_count: number;
  errors: string[];
}

export interface ContractReviewResult {
  matter_slug: string;
  document_id: string;
  document_filename: string;
  started_at: string;
  completed_at: string;
  total_duration_ms: number;
  total_token_count: number;
  model_used: string;
  stages: StageStatus[];
  parsed: ParsedContract;
  analyses: ClauseAnalysis[];
  redlines: Redline[];
  summary: ContractSummary;
  posture: Posture;
  contract_type: ContractKind;
}

export const runContractReview = (
  slug: string,
  inputs: ContractReviewInputs,
): Promise<ContractReviewResult> =>
  apiFetch(`${API}/matters/${slug}/contract-review/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  }).then((r) => jsonOrThrow<ContractReviewResult>(r));

export type ContractReviewStreamEvent =
  | { event: "stage.start"; data: { stage: string } }
  | {
      event: "stage.end";
      data: {
        stage: string;
        duration_ms: number;
        token_count: number;
        status: "ok" | "error" | "skipped";
        error?: string;
      };
    }
  | { event: "result"; data: ContractReviewResult }
  | {
      event: "error";
      data: {
        message: string;
        code?: number;
        error?: string;
        provider?: string;
      };
    };

export class StreamPreflightError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function* runContractReviewStream(
  slug: string,
  inputs: ContractReviewInputs,
  signal?: AbortSignal,
): AsyncIterableIterator<ContractReviewStreamEvent> {
  const resp = await apiFetch(
    `${API}/matters/${slug}/contract-review/run-stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
      signal,
    },
  );
  if (!resp.ok || !resp.body) {
    const text = await resp.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* leave as text */
    }
    let message = `${resp.status} ${resp.statusText}`;
    if (parsed && typeof parsed === "object") {
      const detail = (parsed as { detail?: unknown }).detail;
      if (typeof detail === "string") message = detail;
      else if (detail && typeof detail === "object") {
        const m = (detail as { message?: unknown }).message;
        if (typeof m === "string") message = m;
      }
    } else if (typeof parsed === "string" && parsed) {
      message = parsed;
    }
    throw new StreamPreflightError(resp.status, parsed, message);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:"))
          dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const data = JSON.parse(dataLines.join("\n"));
      yield { event, data } as ContractReviewStreamEvent;
    }
  }
}

export interface DocxExportResult {
  file_uuid: string;
  storage_uri: string;
  byte_count: number;
  download_url: string;
}

export const exportContractReviewDocx = (
  slug: string,
  result: ContractReviewResult,
): Promise<DocxExportResult> =>
  apiFetch(`${API}/matters/${slug}/contract-review/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  }).then((r) => jsonOrThrow<DocxExportResult>(r));

// Public module submission flow (Phase D W3). The submitter never
// supplies frontmatter — the backend synthesises the SKILL.md
// authoritatively via `frontmatter.dump`. Frontend preview is a UX
// aid, not a wire contract.
export const SUBMISSION_TRUST_POSTURES = [
  "trusted",
  "third_party",
  "experimental",
] as const;
export type SubmissionTrustPosture = (typeof SUBMISSION_TRUST_POSTURES)[number];

// Closed capability set — mirrors backend `ALLOWED_CAPABILITIES`
// and schemas/module.json. Keep in sync.
export const SUBMISSION_CAPABILITIES = [
  "matter.read",
  "document.body.read",
  "document.generated.write",
  "model.invoke",
  "chronology.read",
  "chronology.write",
  "citation.write",
  "audit.emit",
] as const;
export type SubmissionCapability = (typeof SUBMISSION_CAPABILITIES)[number];

export interface ModuleSubmissionRequest {
  plugin_name: string;
  skill_name: string;
  description: string;
  body_markdown: string;
  capabilities: SubmissionCapability[];
  trust_posture: SubmissionTrustPosture;
  submitter_handle: string;
  submitter_contact: string;
  turnstile_token: string;
}

export interface ModuleSubmissionResponse {
  submission_id: string;
  pull_request_url: string;
  branch_name: string;
}

export interface SubmissionConfig {
  submission_enabled: boolean;
  turnstile_site_key: string | null;
}

export const getSubmissionConfig = () =>
  apiFetch(`${API}/modules/submissions/config`).then((r) =>
    jsonOrThrow<SubmissionConfig>(r),
  );

// `submitModule` returns the parsed body on success and throws an
// `Error` whose `.message` carries the JSON error envelope from the
// backend on failure so the UI can branch on status.
export async function submitModule(
  body: ModuleSubmissionRequest,
): Promise<ModuleSubmissionResponse> {
  const res = await apiFetch(`${API}/modules/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    const err = new Error(`submission failed (${res.status})`);
    (err as Error & { status?: number; detail?: unknown }).status = res.status;
    (err as Error & { status?: number; detail?: unknown }).detail = detail;
    throw err;
  }
  return (await res.json()) as ModuleSubmissionResponse;
}
