import { useEffect, useState } from "react";
import {
  loadCompanies,
  nicheLabel,
  THESIS2_IDS,
  FACT_LABEL,
  DIM_LABEL,
  type Company,
} from "../data/scorecard";

const confDot: Record<string, string> = {
  high: "bg-ink",
  medium: "bg-muted",
  low: "bg-rule",
};

function factValue(v: string | string[]) {
  if (Array.isArray(v)) {
    return (
      <ul className="list-disc pl-5 space-y-1">
        {v.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    );
  }
  return <span>{v}</span>;
}

export function CompanyDetail({ id }: { id: string }) {
  const [co, setCo] = useState<Company | null | undefined>(undefined);

  useEffect(() => {
    loadCompanies()
      .then((rows) => setCo(rows.find((r) => r.id === id) ?? null))
      .catch(() => setCo(null));
  }, [id]);

  if (co === undefined)
    return <p className="mx-auto max-w-2xl px-6 py-16 prose-p">Loading…</p>;
  if (co === null)
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <a href="#floor" className="text-sm underline decoration-rule underline-offset-4">
          ← all companies
        </a>
        <p className="prose-p mt-6">Company not found.</p>
      </div>
    );

  const isT2 = THESIS2_IDS.has(co.id);

  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <a href="#floor" className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
        ← all companies
      </a>

      <div className="mt-6 flex items-baseline justify-between gap-4">
        <h1 className="font-redaction35 text-3xl md:text-4xl tracking-tight2">{co.name}</h1>
        <span className="tech-token text-xl font-bold whitespace-nowrap">
          {co.comp.toFixed(0)}
          <span className="text-muted font-normal">/35</span>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>{nicheLabel(co.cat)}</span>
        <span className="inline-flex items-center">
          <span className={`inline-block w-2 h-2 mr-1 ${confDot[co.conf] ?? "bg-rule"}`} />
          {co.conf} confidence
        </span>
        {isT2 && (
          <span className="text-[10px] uppercase tracking-track1 text-seal border border-seal px-1 py-0.5">
            Thesis 2
          </span>
        )}
        <a
          href={co.site}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-rule underline-offset-4 hover:text-ink"
        >
          visit site ↗
        </a>
      </div>

      <p className="prose-p mt-6 text-[1.05rem] leading-[1.7]">{co.verdict}</p>

      {/* Score breakdown */}
      {Object.keys(co.scores).length > 0 && (
        <section className="mt-10">
          <h2 className="eyebrow mb-4">Score breakdown</h2>
          <div className="divide-y divide-rule border-y border-rule">
            {DIM_LABEL.filter(([k]) => co.scores[k]).map(([k, label]) => (
              <div key={k} className="py-3 flex gap-4">
                <div className="w-32 shrink-0">
                  <span className="font-bold">{label}</span>
                  <span className="tech-token text-muted"> {co.scores[k].score}/5</span>
                </div>
                <p className="prose-p !mb-0 text-sm">{co.scores[k].justification}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Facts */}
      <section className="mt-10">
        <h2 className="eyebrow mb-4">The facts</h2>
        <dl className="divide-y divide-rule border-y border-rule">
          {FACT_LABEL.filter(([k]) => co.facts[k]).map(([k, label]) => (
            <div key={k} className="py-3 flex gap-4">
              <dt className="w-32 shrink-0 font-bold">{label}</dt>
              <dd className="prose-p !mb-0 text-sm flex-1">{factValue(co.facts[k])}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Red flags */}
      {co.red_flags.length > 0 && (
        <section className="mt-10">
          <h2 className="eyebrow mb-4 text-seal">Red flags</h2>
          <ul className="prose-p space-y-2 list-disc pl-5 text-sm">
            {co.red_flags.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Sources */}
      {co.sources.length > 0 && (
        <section className="mt-10">
          <h2 className="eyebrow mb-4">Sources</h2>
          <ul className="space-y-2 text-sm">
            {co.sources.map((s, i) => (
              <li key={i}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-rule underline-offset-4 hover:text-ink break-all"
                >
                  {s.url}
                </a>
                <span className="text-muted">
                  {" "}
                  — {s.what_it_supports}
                  {s.accessed ? ` (accessed ${s.accessed})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-12 border-t border-rule pt-6">
        <a href="#floor" className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
          ← all companies
        </a>
      </div>
    </article>
  );
}
