import type { Matter } from "../../lib/api";

export function OverviewTab({ matter }: { matter: Matter }) {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Document hero (DESIGN.md §P8) */}
      <div className="mb-16">
        <div className="text-xs font-mono text-muted mb-4 uppercase tracking-widest">
          Matter · {matter.matter_type.replace(/_/g, " ")}
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight2 text-ink mb-6 leading-[1.05]">
          {matter.title}
        </h1>
        <p className="text-xl text-muted leading-relaxed max-w-2xl">
          {matter.cause}
        </p>

        <div className="flex flex-wrap gap-x-10 gap-y-4 mt-10 pb-10 border-b border-rule">
          <div>
            <div className="eyebrow mb-1.5">Slug</div>
            <div className="text-sm font-semibold text-ink">{matter.slug}</div>
          </div>
          <div>
            <div className="eyebrow mb-1.5">Opened</div>
            <div className="text-sm font-semibold text-ink">
              {matter.opened_at.slice(0, 10)}
            </div>
          </div>
          <div>
            <div className="eyebrow mb-1.5">Retention</div>
            <div className="text-sm font-semibold text-ink">
              {matter.retention_until?.slice(0, 10) ?? "-"}
            </div>
          </div>
          <div>
            <div className="eyebrow mb-1.5">Status</div>
            <div className="text-sm font-semibold text-ink">{matter.status}</div>
          </div>
        </div>
      </div>

      {/* Pivot fact pull quote — Warp whitepaper pattern (DESIGN.md P-quote) */}
      {matter.pivot_fact && (
        <div className="bg-wash p-8 border-l-4 border-ink my-8">
          <p className="text-sm font-medium italic text-prose m-0 whitespace-pre-wrap">
            {matter.pivot_fact}
          </p>
        </div>
      )}

      {/* Case theory */}
      {matter.case_theory && (
        <section className="prose mb-16">
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            01. Theory of case
          </h2>
          <p className="prose-p whitespace-pre-wrap">{matter.case_theory}</p>
        </section>
      )}

      {!matter.case_theory && !matter.pivot_fact && (
        <p className="prose-p">
          No case theory recorded. Theory and pivot fact set at matter creation
          feed downstream Pre-Motion synthesis and letter drafting.
        </p>
      )}
    </div>
  );
}
