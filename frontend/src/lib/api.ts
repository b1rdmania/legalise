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

export const listMatters = () =>
  fetch(`${API}/matters`).then((r) => jsonOrThrow<Matter[]>(r));

export const getMatter = (slug: string) =>
  fetch(`${API}/matters/${slug}`).then((r) => jsonOrThrow<Matter>(r));

export const createMatter = (body: MatterCreate) =>
  fetch(`${API}/matters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<Matter>(r));

export const listDocuments = (slug: string) =>
  fetch(`${API}/matters/${slug}/documents`).then((r) => jsonOrThrow<MatterDocument[]>(r));

export const uploadDocument = (slug: string, file: File, tag?: string, fromDisclosure?: boolean) => {
  const fd = new FormData();
  fd.append("file", file);
  if (tag) fd.append("tag", tag);
  if (fromDisclosure) fd.append("from_disclosure", "true");
  return fetch(`${API}/matters/${slug}/documents`, { method: "POST", body: fd }).then((r) =>
    jsonOrThrow<MatterDocument>(r),
  );
};

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor_id: string | null;
  matter_id: string | null;
  action: string;
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
  fetch(`${API}/matters/${slug}/audit?limit=${limit}`).then((r) => jsonOrThrow<AuditEntry[]>(r));

export const setPrivilege = (slug: string, posture: string) =>
  fetch(`${API}/matters/${slug}/privilege`, {
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
  fetch(`${API}/matters/${slug}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plugin, skill, inputs }),
  }).then((r) => jsonOrThrow<PluginInvokeResponse>(r));

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
  fetch(`${API}/matters/${slug}/pre-motion/run`, {
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
  const resp = await fetch(`${API}/matters/${slug}/pre-motion/run-stream`, {
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
  const resp = await fetch(`${API}/matters/${slug}/pre-motion/pdf`, {
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
  fetch(`${API}/matters/${slug}/chronology`).then((r) => jsonOrThrow<ChronologyResponse>(r));

export const confirmGate = (slug: string, acknowledgement: string) =>
  fetch(`${API}/matters/${slug}/chronology/gate`, {
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
  fetch(`${API}/matters/${slug}/letters/catalog`).then((r) => jsonOrThrow<LetterCatalogue>(r));

export const draftLetter = (slug: string, letterType: string, inputs: Record<string, string> = {}) =>
  fetch(`${API}/matters/${slug}/letters/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ letter_type: letterType, inputs }),
  }).then((r) => jsonOrThrow<LetterDraft>(r));
