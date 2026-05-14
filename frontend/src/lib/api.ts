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

const API = "/api";

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
