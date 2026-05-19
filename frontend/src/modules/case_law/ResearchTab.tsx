// ResearchTab - host for case-law search (§4e).
//
// Layout: results pane left, citations sidebar right. Banner up top declares
// the v0.1 caveat: results are model-fabricated, verify on the Find Case
// Law site before relying on them. v0.2 swaps in real Find Case Law via MCP.

import { useState } from "react";
import {
  CaseLawSearchResponse,
  Matter,
  MatterCitationRead,
  searchCaseLaw,
} from "./api";
import { CaseLawCard } from "./CaseLawCard";
import { CitationsSidebar } from "./CitationsSidebar";

type Props = {
  matter: Matter;
  // Demo path - pre-loaded citations for `#/demo`.
  initialCitations?: MatterCitationRead[];
};

// Find Case Law's court set - keep these stable per skill spec.
const COURT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any court" },
  { value: "uksc", label: "Supreme Court (UKSC)" },
  { value: "ewca", label: "Court of Appeal (EWCA)" },
  { value: "ewhc", label: "High Court (EWHC)" },
  { value: "eat", label: "Employment Appeal Tribunal (EAT)" },
  { value: "ukut", label: "Upper Tribunal (UKUT)" },
];

export function ResearchTab({ matter, initialCitations }: Props) {
  const [query, setQuery] = useState("");
  const [court, setCourt] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<CaseLawSearchResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchCaseLaw(matter.slug, {
        query: query.trim(),
        court: court || null,
        year: year ? Number(year) : null,
      });
      setResp(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "bg-paper border border-rule px-3 py-2 text-sm focus:border-ink focus:outline-none transition-colors min-h-[40px] font-sans text-ink";

  return (
    <div className="max-w-5xl">
      <div className="mb-10 pb-8 border-b border-rule max-w-4xl">
        <div className="eyebrow mb-3">04 · Research</div>
        <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-3">
          Research
        </h2>
        <p className="text-sm text-prose max-w-2xl leading-relaxed">
          Search reported authorities and cite them into the matter.
          Results in v0.1 are synthesised from model knowledge. Verify
          each citation on{" "}
          <a
            href="https://caselaw.nationalarchives.gov.uk"
            target="_blank"
            rel="noreferrer"
            className="text-[#0066CC] hover:underline"
          >
            caselaw.nationalarchives.gov.uk
          </a>{" "}
          before relying on it. v0.2 swaps in Find Case Law via MCP.
        </p>
      </div>

      <form
        onSubmit={onSearch}
        className="flex flex-wrap items-end gap-3 mb-6"
      >
        <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
          <span className="eyebrow">Query</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. unfair dismissal Burchell test"
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Court</span>
          <select
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            className={inputCls}
          >
            {COURT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Year</span>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            min={1900}
            max={2100}
            placeholder="YYYY"
            className={`${inputCls} w-28`}
          />
        </div>
        <button
          type="submit"
          disabled={busy || query.trim().length < 2}
          className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[40px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <div className="border border-[#D9304F] bg-[#FEF2F2] p-4 text-sm text-[#B91C1C] mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-8">
        <div className="space-y-3">
          {resp === null ? (
            <div className="border border-rule p-6 text-sm text-muted">
              Run a search to see authorities.
            </div>
          ) : resp.results.length === 0 ? (
            <div className="space-y-3">
              <div className="text-sm text-prose">
                No structured results returned for "{resp.query}".
              </div>
              {resp.raw_response_excerpt && (
                <pre className="text-xs whitespace-pre-wrap border border-rule bg-wash p-4 font-mono text-prose">
                  {resp.raw_response_excerpt}
                </pre>
              )}
            </div>
          ) : (
            <>
              <div className="font-mono text-xs text-muted mb-2">
                {resp.results.length} result{resp.results.length === 1 ? "" : "s"}
                {resp.truncated ? " (truncated)" : ""} · {resp.model_used} ·{" "}
                {resp.latency_ms}ms
              </div>
              {resp.results.map((r, i) => (
                <CaseLawCard
                  key={`${r.citation_ref || r.case_name}-${i}`}
                  slug={matter.slug}
                  result={r}
                  onCited={() => setRefreshKey((k) => k + 1)}
                />
              ))}
            </>
          )}
        </div>
        <div>
          <CitationsSidebar
            slug={matter.slug}
            refreshKey={refreshKey}
            initialCitations={initialCitations}
          />
        </div>
      </div>
    </div>
  );
}
