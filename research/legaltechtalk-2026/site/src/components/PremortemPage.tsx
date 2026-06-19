import type { Company } from "../data/scorecard";

export function PremortemPage({ id, rows }: { id: string; rows: Company[] }) {
  const co = rows.find((r) => r.id === id);

  if (!co || !co.premortem)
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <a href="#watching" className="text-sm underline decoration-rule underline-offset-4">
          ← back
        </a>
        <p className="prose-p mt-6">No pre-mortem on file.</p>
      </div>
    );

  const pm = co.premortem;

  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <a
        href={`#/c/${co.id}`}
        className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink"
      >
        ← back to {co.name}
      </a>

      <p className="eyebrow mt-6 mb-3 text-seal">⚠ Pre-mortem</p>
      <h1 className="font-redaction35 text-3xl md:text-4xl tracking-tight2">
        Why {co.name} could fail
      </h1>
      <p className="prose-p text-[1.05rem] leading-[1.7] mt-6">{pm.intro}</p>

      <div className="mt-8 divide-y divide-rule border-y border-rule">
        {pm.risks.map((r, i) => (
          <div key={i} className="py-5">
            <h2 className="font-bold text-ink text-lg flex gap-3">
              <span className="text-seal tech-token">{String(i + 1).padStart(2, "0")}</span>
              <span>{r.h}</span>
            </h2>
            <p className="prose-p !mb-0 mt-2 pl-8 text-sm">{r.body}</p>
          </div>
        ))}
      </div>

      <p className="text-muted text-sm mt-8 italic">
        Written ahead of seeing the deck or the tech — these are the risks in the
        model to pressure-test, not predictions.
      </p>

      <div className="mt-10 border-t border-rule pt-6">
        <a href={`#/c/${co.id}`} className="text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink">
          ← back to {co.name}
        </a>
      </div>
    </article>
  );
}
