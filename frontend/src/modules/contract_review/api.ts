// Contract Review module — module-local API client.
// Mirrors the lib/api.ts shape (apiFetch + jsonOrThrow) but stays
// module-scoped because lib/api.ts is owned by other workstreams.

import { API, apiFetch } from "../../lib/api";

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
  risk_score: number; // 0-5
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

export type StageState =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "skipped";

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

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
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

// ----- Streaming (SSE) ----------------------------------------------------

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

/**
 * StreamPreflightError — thrown when the SSE preflight fails (422/409)
 * BEFORE the stream is opened. Carries status + parsed body so the caller
 * can render provider_key_missing / privilege-paused messages inline.
 */
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
    // Prefer FastAPI's `detail.message` if present, fall back to text.
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
