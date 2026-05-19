import type { ReactNode } from "react";
import type { Matter } from "../../lib/api";

export function OverviewTab({
  matter,
  docCount,
  eventCount,
  auditRecent,
}: {
  matter: Matter;
  docCount?: number;
  eventCount?: number;
  auditRecent?: number;
}) {
  const slug = matter.slug;
  const actions: { label: string; href: string }[] = [
    { label: "Ask the assistant", href: `#/matters/${slug}/assistant` },
    { label: "Run Pre-Motion", href: `#/matters/${slug}/premotion` },
    { label: "Draft letter", href: `#/matters/${slug}/letters` },
    { label: "Review contract", href: `#/matters/${slug}/contract-review` },
    { label: "View audit", href: `#/matters/${slug}/audit` },
  ];

  return (
    <div className="max-w-4xl">
      {/* Action strip */}
      <div className="flex flex-wrap gap-3">
        {actions.map((a) => (
          <a
            key={a.label}
            href={a.href}
            className="border border-rule hover:border-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium min-h-[44px] inline-flex items-center text-ink"
          >
            {a.label}
          </a>
        ))}
      </div>

      {/* Dashboard grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
        {/* Left column: pivot fact + theory */}
        <section>
          {matter.pivot_fact && (
            <div className="border-b border-rule pb-8 mb-8">
              <div className="eyebrow mb-3">Pivot fact</div>
              <p className="text-base text-prose italic leading-relaxed m-0 whitespace-pre-wrap">
                {matter.pivot_fact}
              </p>
            </div>
          )}
          {matter.case_theory && (
            <div className="border-b border-rule pb-8 mb-8">
              <div className="eyebrow mb-3">Theory of case</div>
              <p className="text-sm text-prose leading-relaxed m-0 whitespace-pre-wrap">
                {matter.case_theory}
              </p>
            </div>
          )}
          {!matter.case_theory && !matter.pivot_fact && (
            <div className="border-b border-rule pb-8 mb-8">
              <div className="eyebrow mb-3">Theory of case</div>
              <p className="text-sm text-prose leading-relaxed m-0">
                No case theory recorded. Theory and pivot fact set at matter
                creation feed downstream Pre-Motion synthesis and letter
                drafting.
              </p>
            </div>
          )}
        </section>

        {/* Right column: quick facts */}
        <section>
          <div className="border-b border-rule pb-8 mb-8">
            <div className="eyebrow mb-4">Quick facts</div>
            <dl className="space-y-4">
              <FactRow label="Cause" value={matter.cause || "-"} />
              <FactRow
                label="Pivot fact"
                value={<YesNo on={Boolean(matter.pivot_fact)} />}
              />
              <FactRow
                label="Case theory"
                value={<YesNo on={Boolean(matter.case_theory)} />}
              />
              {typeof docCount === "number" && (
                <FactRow label="Documents" value={String(docCount)} />
              )}
              {typeof eventCount === "number" && (
                <FactRow label="Chronology events" value={String(eventCount)} />
              )}
              {typeof auditRecent === "number" && (
                <FactRow label="Recent audit entries" value={String(auditRecent)} />
              )}
              <FactRow label="Privilege posture" value={matter.privilege_posture} />
              <FactRow label="Default model" value={matter.default_model_id} mono />
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}

function FactRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd
        className={
          "text-sm font-semibold text-ink m-0 " + (mono ? "font-mono" : "")
        }
      >
        {value}
      </dd>
    </div>
  );
}

function YesNo({ on }: { on: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center px-2 py-0.5 border text-[10px] font-bold uppercase tracking-track2 " +
        (on
          ? "border-ink text-ink"
          : "border-rule text-muted")
      }
    >
      {on ? "Yes" : "No"}
    </span>
  );
}
