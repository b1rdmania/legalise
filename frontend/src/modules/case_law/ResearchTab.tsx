// ResearchTab — host for case-law search (§4e).
//
// Layout: results pane left, citations sidebar right. Banner up top declares
// the v0.1 caveat: results are model-fabricated, verify on the Find Case
// Law site before relying on them. v0.2 swaps in real Find Case Law via MCP.

import { useState } from "react";
import {
  CaseLawSearchResponse,
  Matter,
  searchCaseLaw,
} from "./api";
import { CaseLawCard } from "./CaseLawCard";
import { CitationsSidebar } from "./CitationsSidebar";

type Props = {
  matter: Matter;
};

// Find Case Law's court set — keep these stable per skill spec.
const COURT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any court" },
  { value: "uksc", label: "Supreme Court (UKSC)" },
  { value: "ewca", label: "Court of Appeal (EWCA)" },
  { value: "ewhc", label: "High Court (EWHC)" },
  { value: "eat", label: "Employment Appeal Tribunal (EAT)" },
  { value: "ukut", label: "Upper Tribunal (UKUT)" },
];

export function ResearchTab({ matter }: Props) {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Research</h2>
      </div>

      <div className="text-xs border border-amber-300 bg-amber-50 text-amber-900 rounded p-2">
        Results are synthesised from model knowledge for v0.1. Verify each
        citation on{" "}
        <a
          href="https://caselaw.nationalarchives.gov.uk"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          caselaw.nationalarchives.gov.uk
        </a>{" "}
        before relying on it.
      </div>

      <form
        onSubmit={onSearch}
        className="flex flex-wrap items-end gap-2 p-3 border border-neutral-200 rounded bg-neutral-50"
      >
        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs text-neutral-600 mb-1">Query</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. unfair dismissal Burchell test"
            className="w-full px-2 py-1 border border-neutral-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-600 mb-1">Court</label>
          <select
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            className="px-2 py-1 border border-neutral-300 rounded text-sm bg-white"
          >
            {COURT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-600 mb-1">Year</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            min={1900}
            max={2100}
            placeholder="YYYY"
            className="w-24 px-2 py-1 border border-neutral-300 rounded text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy || query.trim().length < 2}
          className="px-3 py-1.5 text-sm rounded bg-neutral-900 text-white disabled:opacity-50"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <div className="text-sm text-red-700 border border-red-300 bg-red-50 rounded p-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
        <div className="space-y-2">
          {resp === null ? (
            <div className="text-sm text-neutral-500">
              Run a search to see authorities.
            </div>
          ) : resp.results.length === 0 ? (
            <div className="space-y-2">
              <div className="text-sm text-neutral-600">
                No structured results returned for "{resp.query}".
              </div>
              {resp.raw_response_excerpt && (
                <pre className="text-xs whitespace-pre-wrap border border-neutral-200 rounded p-2 bg-neutral-50">
                  {resp.raw_response_excerpt}
                </pre>
              )}
            </div>
          ) : (
            <>
              <div className="text-xs text-neutral-500">
                {resp.results.length} result{resp.results.length === 1 ? "" : "s"}
                {resp.truncated ? " (truncated)" : ""} ·{" "}
                {resp.model_used} · {resp.latency_ms}ms
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
          <CitationsSidebar slug={matter.slug} refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  );
}
