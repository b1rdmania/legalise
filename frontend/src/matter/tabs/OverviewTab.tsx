import type { Matter } from "../../lib/api";

export function OverviewTab({ matter }: { matter: Matter }) {
  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap gap-x-10 gap-y-4 mb-10 pb-10 border-b border-rule">
        <div>
          <div className="eyebrow mb-1.5">Cause</div>
          <div className="text-sm font-semibold text-ink">{matter.cause ?? "-"}</div>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Opened</div>
          <div className="text-sm font-semibold text-ink">{matter.opened_at.slice(0, 10)}</div>
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

      {matter.pivot_fact && (
        <div className="bg-wash p-8 border-l-4 border-ink my-8">
          <div className="eyebrow mb-3">Pivot fact</div>
          <p className="text-sm font-medium italic m-0 text-ink whitespace-pre-wrap">
            {matter.pivot_fact}
          </p>
        </div>
      )}

      {matter.case_theory && (
        <section className="prose mb-12">
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-6">
            01. Theory of case
          </h2>
          <p className="prose-p whitespace-pre-wrap">{matter.case_theory}</p>
        </section>
      )}

      {!matter.case_theory && !matter.pivot_fact && (
        <p className="prose-p">
          No case theory recorded yet. Theory and pivot fact set at matter creation feed downstream
          Pre-Motion synthesis and letter drafting.
        </p>
      )}

      {/* Contract Review v0.2 callout */}
      <div className="bg-wash border-l-4 border-ink p-6 my-12">
        <div className="eyebrow mb-3">ROADMAP - v0.2</div>
        <p className="text-sm text-ink leading-relaxed">
          Contract review graduates from counsel-mvp in v0.2. Four-agent orchestration over uploaded
          contracts - Parser, Analyst, Redliner, Summariser - same shape as Pre-Motion's bespoke
          pipeline. See{" "}
          <a
            href="https://github.com/b1rdmania/legalise/blob/master/docs/ROADMAP.md"
            target="_blank"
            rel="noreferrer"
            className="text-[#0066CC] hover:underline"
          >
            docs/ROADMAP.md
          </a>
          .
        </p>
      </div>
    </div>
  );
}
