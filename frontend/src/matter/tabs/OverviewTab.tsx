import type { Matter } from "../../lib/api";
import { DescItem } from "../../ui/primitives";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Turn a snake_case / lower token into a Title Case label.
function humanise(value: string): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function OverviewTab({ matter }: { matter: Matter }) {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink">Overview</h1>
        <p className="mt-1 text-sm text-muted">
          The matter at a glance. Everything below is recorded against this matter.
        </p>
      </div>

      <div className="rounded-card border border-rule bg-paper p-5">
        <dl className="grid gap-5 sm:grid-cols-2">
          <DescItem label="Title">{matter.title}</DescItem>
          <DescItem label="Matter type">{humanise(matter.matter_type)}</DescItem>
          <DescItem label="Status">{humanise(matter.status)}</DescItem>
          <DescItem label="Privilege posture">
            {humanise(matter.privilege_posture)}
          </DescItem>
          <DescItem label="Opened">{formatDate(matter.opened_at)}</DescItem>
          <DescItem label="Retention until">
            {formatDate(matter.retention_until)}
          </DescItem>
        </dl>

        {(matter.case_theory || matter.pivot_fact) && (
          <dl className="mt-6 grid gap-5 border-t border-rule pt-6">
            {matter.case_theory && (
              <DescItem label="Case theory">
                <p className="text-sm text-ink">{matter.case_theory}</p>
              </DescItem>
            )}
            {matter.pivot_fact && (
              <DescItem label="Pivot fact">
                <p className="text-sm text-ink">{matter.pivot_fact}</p>
              </DescItem>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}
