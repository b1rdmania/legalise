import { useEffect, useMemo, useState } from "react";
import {
  loadCompanies,
  byTier,
  nicheLabel,
  nichesIn,
  THESIS2_IDS,
  type Company,
} from "../data/scorecard";

const confDot: Record<string, string> = {
  high: "bg-ink",
  medium: "bg-muted",
  low: "bg-rule",
};

function Card({ row }: { row: Company }) {
  const isT2 = THESIS2_IDS.has(row.id);
  return (
    <a
      href={`#/c/${row.id}`}
      className="block border border-rule rounded-card p-5 bg-panel/40 hover:border-ink transition-colors"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold text-lg leading-tight underline decoration-rule underline-offset-4">
          {row.name}
        </span>
        <span className="tech-token font-bold whitespace-nowrap">
          {row.comp.toFixed(0)}
          <span className="text-muted font-normal">/35</span>
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm text-muted">
        <span>{nicheLabel(row.cat)}</span>
        <span className="inline-flex items-center">
          <span className={`inline-block w-2 h-2 mr-1 ${confDot[row.conf] ?? "bg-rule"}`} />
          {row.conf}
        </span>
        {isT2 && (
          <span className="text-[10px] uppercase tracking-track1 text-seal border border-seal px-1 py-0.5">
            Thesis 2
          </span>
        )}
      </div>
      <p className="prose-p !mb-0 mt-3 text-sm line-clamp-4">{row.verdict}</p>
      <span className="text-muted text-xs tech-token mt-3 inline-block">Read the full dossier →</span>
    </a>
  );
}

export function Scorecard() {
  const [rows, setRows] = useState<Company[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [niche, setNiche] = useState<string>("all");

  useEffect(() => {
    // The Map shows only the 20 that carry the screen; featured + parked are
    // rendered in their own sections (Thesis-2 callout, the prize, the footer).
    loadCompanies()
      .then((all) => setRows(byTier(all, "scorecard")))
      .catch((e) => setErr(String(e)));
  }, []);

  const niches = useMemo(() => (rows ? nichesIn(rows) : []), [rows]);

  const groups = useMemo(() => {
    if (!rows) return [];
    const cats = niche === "all" ? niches.map((n) => n.cat) : [niche];
    return cats.map((cat) => ({
      cat,
      items: rows.filter((r) => r.cat === cat).sort((a, b) => b.comp - a.comp),
    }));
  }, [rows, niche, niches]);

  if (err) return <p className="prose-p text-seal">Could not load companies: {err}</p>;
  if (!rows) return <p className="prose-p">Loading the screen…</p>;

  const chip = (key: string, label: string, count: number) => {
    const active = niche === key;
    return (
      <button
        key={key}
        onClick={() => setNiche(key)}
        className={`text-sm border px-3 py-1 transition-colors ${
          active ? "bg-ink text-paper border-ink" : "border-rule text-prose hover:border-ink"
        }`}
      >
        {label} <span className="tech-token opacity-60">{count}</span>
      </button>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-8">
        {chip("all", "All niches", rows.length)}
        {niches.map((n) => chip(n.cat, nicheLabel(n.cat), n.count))}
      </div>

      <div className="space-y-10">
        {groups.map((g) => (
          <section key={g.cat}>
            <h3 className="eyebrow mb-4">
              {nicheLabel(g.cat)} · {g.items.length}
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {g.items.map((r) => (
                <Card key={r.id} row={r} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
