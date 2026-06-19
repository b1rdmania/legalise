import {
  nicheLabel,
  FACT_LABEL,
  DIM_LABEL,
  PENALTY_BADGE,
  type Company,
} from "../data/scorecard";

function factValue(v: string | string[]) {
  if (Array.isArray(v))
    return (
      <ul className="list-disc pl-5 space-y-1">
        {v.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    );
  return <span>{v}</span>;
}

export function CompanyDetail({ id, rows }: { id: string; rows: Company[] }) {
  const co = rows.find((r) => r.id === id);

  if (!co)
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <a href="#watching" className="text-sm underline decoration-rule underline-offset-4">
          ← back
        </a>
        <p className="prose-p mt-6">Not found.</p>
      </div>
    );

  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <a href="#watching" className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
        ← back to the list
      </a>

      <div className="mt-6 flex items-center gap-3">
        <img src={co.logo} alt="" width={40} height={40} className="rounded bg-paper shrink-0" />
        <h1 className="font-redaction35 text-3xl md:text-4xl tracking-tight2 flex-1">{co.name}</h1>
        <a
          href="#scores"
          className="tech-token whitespace-nowrap text-right leading-none no-underline"
          title="Jump to the scores"
        >
          <span className="block text-[10px] uppercase tracking-track1 text-muted">Score</span>
          <span className="text-4xl font-bold text-ink">{co.comp.toFixed(0)}</span>
          <span className="text-muted font-normal text-xl">/35</span>
        </a>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>{nicheLabel(co.cat)}</span>
        <a href={co.site} target="_blank" rel="noopener noreferrer" className="underline decoration-rule underline-offset-4 hover:text-ink">
          visit site ↗
        </a>
        {co.penalties?.map((p) => (
          <span key={p.type} className="text-[10px] uppercase tracking-track1 text-seal border border-seal px-1 py-0.5">
            {PENALTY_BADGE[p.type]} {p.points}
          </span>
        ))}
      </div>

      <img
        src={co.screenshot}
        alt={`${co.name} website`}
        className="mt-6 w-full max-w-sm rounded-card border border-rule bg-wash"
        loading="lazy"
      />

      {/* The take — collapsible so it doesn't clog the top of the page. */}
      <details className="group mt-6 border-y border-rule">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3">
          <span className="italic text-muted">My take</span>
          <span className="text-sm text-muted group-open:hidden">read →</span>
          <span className="hidden text-sm text-muted group-open:inline">hide ↑</span>
        </summary>
        <p className="pb-4 text-[1.15rem] leading-[1.6] text-ink">
          {co.my_take || co.verdict}
        </p>
        {co.geo_note && <p className="prose-p text-sm pb-4 italic">{co.geo_note}</p>}
      </details>

      {co.premortem && (
        <a
          href={`#/premortem/${co.id}`}
          className="mt-6 flex items-center justify-between gap-3 bg-seal text-paper rounded-card px-5 py-4 hover:opacity-90 transition-opacity"
        >
          <span className="font-bold text-lg">⚠ Why this could fail</span>
          <span className="text-sm opacity-90">Read the pre-mortem →</span>
        </a>
      )}

      {/* How I rated it */}
      {Object.keys(co.scores).length > 0 && (
        <section id="scores" className="mt-10 scroll-mt-16">
          <h2 className="eyebrow mb-4">How I rated it</h2>
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

      {co.red_flags.length > 0 && (
        <section className="mt-10">
          <h2 className="eyebrow mb-4 text-seal">Where it&apos;s weak</h2>
          <ul className="prose-p space-y-2 list-disc pl-5 text-sm">
            {co.red_flags.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      {co.sources.length > 0 && (
        <section className="mt-10">
          <h2 className="eyebrow mb-4">Sources</h2>
          <ul className="space-y-2 text-sm">
            {co.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-rule underline-offset-4 hover:text-ink break-all">
                  {s.url}
                </a>
                <span className="text-muted"> — {s.what_it_supports}{s.accessed ? ` (${s.accessed})` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-12 border-t border-rule pt-6">
        <a href="#watching" className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
          ← back to the list
        </a>
      </div>
    </article>
  );
}
