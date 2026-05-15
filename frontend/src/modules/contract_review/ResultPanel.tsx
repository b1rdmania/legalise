// Three-accordion result panel: Summary / Analysis / Redlines.
// Visual tokens mirror Paper Ink Workspace conventions
// (bg-paper, border-rule, text-ink, font-sans).

import { useState } from "react";

import type {
  ClauseAnalysis,
  ContractReviewResult,
  Redline,
  RiskSeverity,
  UkIssueCategory,
} from "./api";

interface Props {
  result: ContractReviewResult;
  onExportDocx: () => void;
  exporting?: boolean;
  exportError?: string | null;
  exportLink?: string | null;
}

const UK_BADGE_LABEL: Record<UkIssueCategory, string> = {
  ucta_s2_s3: "UCTA",
  cra_s62: "CRA s.62",
  uk_gdpr_art28: "UK GDPR 28",
  governing_law: "Governing law",
  jurisdiction: "Jurisdiction",
  arbitration: "Arbitration",
  liability_cap: "Cap",
  indemnity: "Indemnity",
  ip_assignment: "IP",
  termination: "Termination",
  boilerplate: "Boilerplate",
  other: "Other",
};

const SEV_CLS: Record<RiskSeverity, string> = {
  high: "border-red-600 text-red-700 bg-red-50",
  medium: "border-amber-500 text-amber-700 bg-amber-50",
  low: "border-rule text-ink/70 bg-paper",
};

function Accordion({
  title,
  open,
  onToggle,
  children,
  count,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="border border-rule">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between bg-paper px-4 py-3 text-left text-sm sm:text-base font-medium text-ink hover:bg-paper/60 transition-colors"
      >
        <span>
          {title}
          {typeof count === "number" && (
            <span className="ml-2 text-ink/50 text-xs">({count})</span>
          )}
        </span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="border-t border-rule px-4 py-4">{children}</div>}
    </div>
  );
}

function riskBar(score: number): string {
  if (score <= 0) return "—";
  if (score >= 4) return "⚠⚠⚠⚠";
  if (score === 3) return "⚠⚠⚠";
  if (score === 2) return "⚠⚠";
  return "⚠";
}

function AnalysisRow({
  analysis,
  clauseTitle,
}: {
  analysis: ClauseAnalysis;
  clauseTitle: string;
}) {
  return (
    <div className="border-t border-rule/60 py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-medium text-ink">
          {analysis.clause_id}
          {clauseTitle ? ` — ${clauseTitle}` : ""}
        </h4>
        <span className="text-xs text-ink/70">
          risk {analysis.risk_score}/5 {riskBar(analysis.risk_score)}
        </span>
      </div>
      {analysis.summary && (
        <p className="mt-2 text-sm text-ink/80 leading-relaxed">
          {analysis.summary}
        </p>
      )}
      {analysis.uk_issues.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {analysis.uk_issues.map((issue, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] sm:text-xs ${SEV_CLS[issue.severity]}`}
              title={`${issue.statute_ref ? issue.statute_ref + " — " : ""}${issue.description}`}
            >
              <span className="font-semibold">
                {UK_BADGE_LABEL[issue.category] || issue.category}
              </span>
              {issue.statute_ref && (
                <span className="opacity-70">· {issue.statute_ref}</span>
              )}
            </span>
          ))}
        </div>
      )}
      {analysis.uk_issues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {analysis.uk_issues.map((issue, i) => (
            <li key={i} className="text-sm text-ink/85">
              <span className="font-medium">{issue.severity.toUpperCase()}:</span>{" "}
              {issue.description}
            </li>
          ))}
        </ul>
      )}
      {analysis.posture_note && (
        <p className="mt-2 text-xs italic text-ink/60">{analysis.posture_note}</p>
      )}
    </div>
  );
}

function RedlineRow({ redline }: { redline: Redline }) {
  const pillCls: Record<string, string> = {
    must: "border-red-600 text-red-700 bg-red-50",
    suggested: "border-amber-500 text-amber-700 bg-amber-50",
    nice_to_have: "border-rule text-ink/60 bg-paper",
  };
  const labels: Record<string, string> = {
    must: "MUST",
    suggested: "Suggested",
    nice_to_have: "Nice-to-have",
  };
  return (
    <div className="border-t border-rule/60 py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-medium text-ink">{redline.clause_id}</h4>
        <span
          className={`inline-flex items-center border px-2 py-0.5 text-[11px] ${pillCls[redline.priority] || pillCls.suggested}`}
        >
          {labels[redline.priority] || redline.priority}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="border border-rule/60 bg-paper p-3">
          <div className="text-[11px] uppercase tracking-wide text-ink/60 mb-1">
            Original
          </div>
          <div className="whitespace-pre-wrap text-sm text-ink/80 leading-relaxed">
            {redline.original_text || (
              <em className="text-ink/50">(no original — clause to be inserted)</em>
            )}
          </div>
        </div>
        <div className="border border-ink bg-paper p-3">
          <div className="text-[11px] uppercase tracking-wide text-ink/60 mb-1">
            Suggested
          </div>
          <div className="whitespace-pre-wrap text-sm text-ink leading-relaxed">
            {redline.suggested_text || <em className="text-ink/50">(no suggestion)</em>}
          </div>
        </div>
      </div>
      {redline.explanation && (
        <p className="mt-2 text-xs italic text-ink/70">
          Why: {redline.explanation}
        </p>
      )}
    </div>
  );
}

export function ResultPanel({
  result,
  onExportDocx,
  exporting,
  exportError,
  exportLink,
}: Props) {
  const [openSummary, setOpenSummary] = useState(true);
  const [openAnalysis, setOpenAnalysis] = useState(true);
  const [openRedlines, setOpenRedlines] = useState(true);

  const clauseLookup = new Map(result.parsed.clauses.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      {/* Header row + export */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-rule bg-paper px-4 py-3">
        <div className="text-sm text-ink">
          <div className="font-medium">
            {result.parsed.title || result.document_filename}
          </div>
          <div className="text-xs text-ink/60">
            {result.parsed.parties.length > 0 && (
              <>parties: {result.parsed.parties.join(" / ")} · </>
            )}
            type: {result.parsed.document_type} · posture: {result.posture} · {" "}
            governing law: {result.parsed.governing_law_stated || "not stated"} · {" "}
            {result.total_token_count} tok · {(result.total_duration_ms / 1000).toFixed(1)}s
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exportLink && (
            <a
              href={exportLink}
              className="text-xs underline text-ink/70 hover:text-ink"
              target="_blank"
              rel="noreferrer"
            >
              latest .docx
            </a>
          )}
          <button
            type="button"
            onClick={onExportDocx}
            disabled={exporting}
            className="bg-ink text-paper px-3 py-2 hover:bg-black transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px]"
          >
            {exporting ? "Exporting…" : "Export .docx"}
          </button>
        </div>
      </div>
      {exportError && (
        <div className="border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {exportError}
        </div>
      )}

      {/* Summary */}
      <Accordion
        title="Summary"
        open={openSummary}
        onToggle={() => setOpenSummary((v) => !v)}
      >
        {result.summary.executive_summary ? (
          <p className="whitespace-pre-wrap text-sm text-ink/85 leading-relaxed">
            {result.summary.executive_summary}
          </p>
        ) : (
          <p className="italic text-ink/50 text-sm">(no executive summary)</p>
        )}
        {result.summary.recommendation && (
          <div className="mt-3 border-l-2 border-ink pl-3 text-sm font-medium text-ink">
            Recommendation: {result.summary.recommendation}
          </div>
        )}
        {result.summary.risk_overview && (
          <div className="mt-4">
            <h4 className="text-xs uppercase tracking-wide text-ink/60 mb-1">
              Risk overview
            </h4>
            <p className="whitespace-pre-wrap text-sm text-ink/80 leading-relaxed">
              {result.summary.risk_overview}
            </p>
          </div>
        )}
        {result.summary.uk_specific_callouts.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs uppercase tracking-wide text-ink/60 mb-1">
              UK callouts
            </h4>
            <ul className="space-y-1 text-sm text-ink/85 list-disc pl-5">
              {result.summary.uk_specific_callouts.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {result.summary.key_terms.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs uppercase tracking-wide text-ink/60 mb-1">
              Key terms
            </h4>
            <ul className="space-y-1 text-sm text-ink/80 list-disc pl-5">
              {result.summary.key_terms.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </Accordion>

      {/* Analysis */}
      <Accordion
        title="Analysis"
        open={openAnalysis}
        onToggle={() => setOpenAnalysis((v) => !v)}
        count={result.analyses.length}
      >
        {result.analyses.length === 0 ? (
          <p className="italic text-ink/50 text-sm">
            No clause-level analysis produced.
          </p>
        ) : (
          <div className="divide-y divide-rule/40">
            {result.analyses.map((a) => {
              const clause = clauseLookup.get(a.clause_id);
              const title = clause
                ? `${clause.section ? clause.section + " " : ""}${clause.title}`.trim()
                : "";
              return (
                <AnalysisRow key={a.clause_id} analysis={a} clauseTitle={title} />
              );
            })}
          </div>
        )}
      </Accordion>

      {/* Redlines */}
      <Accordion
        title="Redlines"
        open={openRedlines}
        onToggle={() => setOpenRedlines((v) => !v)}
        count={result.redlines.length}
      >
        {result.redlines.length === 0 ? (
          <p className="italic text-ink/50 text-sm">
            No redlines proposed — no clause scored at risk 3+ or carried a
            high-severity UK issue.
          </p>
        ) : (
          <div className="divide-y divide-rule/40">
            {result.redlines.map((r, i) => (
              <RedlineRow key={`${r.clause_id}-${i}`} redline={r} />
            ))}
          </div>
        )}
      </Accordion>
    </div>
  );
}
