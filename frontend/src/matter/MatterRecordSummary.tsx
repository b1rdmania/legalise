import type { ReactNode } from "react";
import type { AuditEntry, Matter, MatterDocument } from "../lib/api";
import type { TabKey } from "./tabs/types";

interface Props {
  matter: Matter;
  docs: MatterDocument[] | null;
  audit: AuditEntry[] | null;
  onSelectTab: (tab: TabKey) => void;
}

function postureLabel(posture: string): string {
  if (posture === "A_cleared") return "Cleared";
  if (posture === "B_mixed") return "Mixed";
  if (posture === "C_paused") return "Paused";
  return posture;
}

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  return value.slice(0, 10);
}

function countLabel(count: number | null, singular: string, plural: string): string {
  if (count === null) return "Loading";
  return `${count} ${count === 1 ? singular : plural}`;
}

export function MatterRecordSummary({ matter, docs, audit, onSelectTab }: Props) {
  const documentCount = docs ? docs.length : null;
  const auditCount = audit ? audit.length : null;

  return (
    <section
      aria-label="Matter record summary"
      className="mb-6 rounded-md border border-line bg-paper p-4 shadow-sm"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted">
            Matter record
          </p>
          <h1 className="mt-1 font-serif text-2xl text-ink">
            {matter.title}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-md border border-line bg-paper-sunken px-2 py-1 font-mono">
              {matter.slug}
            </span>
            <span className="rounded-md border border-line bg-paper-sunken px-2 py-1">
              {matter.matter_type}
            </span>
            <span className="rounded-md border border-line bg-paper-sunken px-2 py-1">
              {matter.status}
            </span>
          </div>
        </div>

        <div className="grid min-w-[280px] grid-cols-2 gap-2 text-sm sm:grid-cols-4 xl:grid-cols-2">
          <SummaryMetric label="Posture" value={postureLabel(matter.privilege_posture)} />
          <SummaryMetric label="Documents" value={countLabel(documentCount, "doc", "docs")} />
          <SummaryMetric label="Audit window" value={countLabel(auditCount, "row", "rows")} />
          <SummaryMetric label="Opened" value={formatDate(matter.opened_at)} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-line pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="text-sm font-medium text-ink">Run the matter loop</p>
          <p className="mt-1 text-sm text-muted">
            Check source documents, grant module permissions, run a governed action,
            then inspect the artifact and audit trail.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SummaryAction onClick={() => onSelectTab("documents")}>
            Documents
          </SummaryAction>
          <SummaryAction onClick={() => onSelectTab("workflows")}>
            Workflows
          </SummaryAction>
          <a
            href={`/matters/${matter.slug}/artifacts`}
            className="inline-flex items-center rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:border-ink"
          >
            Artifacts
          </a>
          <a
            href={`/matters/${matter.slug}/audit`}
            className="inline-flex items-center rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:border-ink"
          >
            Audit trail
          </a>
        </div>
      </div>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper-sunken px-3 py-2">
      <p className="text-[11px] uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function SummaryAction({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:border-ink"
    >
      {children}
    </button>
  );
}
