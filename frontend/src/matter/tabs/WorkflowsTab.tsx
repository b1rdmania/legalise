// WorkflowsTab - catalogue of installed legal modules (v0.4).
// Replaces the v0.3.1 top-level slots for Pre-Motion / Letters /
// Contract review / Tabular Review / Case law. Each module is a card
// linking to its surface; the surface keeps its hash route for deep
// linking, and the sidebar highlights "Workflows" when one is open.
//
// State (grant + availability + last_run_at) is fetched from the
// backend per matter; no static placeholders.

import { useEffect, useState } from "react";

import {
  getMatterWorkflows,
  type MatterWorkflowsResponse,
  type WorkflowAvailability,
  type WorkflowGrant,
  type WorkflowState,
} from "../../lib/api";
import { ErrorCallout, LoadingLine } from "../../ui/primitives";

const GRANT_LABEL: Record<WorkflowGrant, string> = {
  granted: "granted",
  partial: "partial",
  blocked: "blocked",
  "not-installed": "not installed",
};

const AVAILABILITY_LABEL: Record<WorkflowAvailability, string> = {
  ok: "ok",
  "blocked-by-posture": "blocked by posture",
  "blocked-by-grant": "blocked by grant",
  "not-installed": "not installed",
};

function availabilityClasses(value: WorkflowAvailability): string {
  switch (value) {
    case "ok":
      return "text-[#00A35C]";
    case "blocked-by-posture":
      return "text-[#E67E22]";
    case "blocked-by-grant":
    case "not-installed":
    default:
      return "text-[#D9304F]";
  }
}

function grantClasses(value: WorkflowGrant): string {
  switch (value) {
    case "granted":
      return "text-[#00A35C]";
    case "partial":
      return "text-[#E67E22]";
    case "blocked":
    case "not-installed":
    default:
      return "text-[#D9304F]";
  }
}

function formatLastRun(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function WorkflowsTab({ slug }: { slug: string; posture?: string }) {
  const [data, setData] = useState<MatterWorkflowsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMatterWorkflows(slug)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(`Could not load workflows for this matter. ${msg}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-prose max-w-2xl leading-relaxed mb-8">
        Installed legal modules. Click to open.
      </p>

      {error && <ErrorCallout message={error} />}
      {!data && !error && <LoadingLine label="loading workflows" />}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.workflows.map((w) => (
            <WorkflowCard key={w.key} workflow={w} slug={slug} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted mt-8">
        Browse all available modules in the{" "}
        <a href="#/modules" className="text-[#0066CC] hover:underline">
          module catalogue
        </a>
        .
      </p>
    </div>
  );
}

function WorkflowCard({ workflow, slug }: { workflow: WorkflowState; slug: string }) {
  return (
    <a
      href={`#/matters/${slug}/${workflow.key}`}
      className="block border border-rule p-5 hover:border-ink hover:bg-wash transition-colors group"
      title={workflow.reason ?? undefined}
    >
      <div className="text-sm font-semibold text-ink mb-2">{workflow.title}</div>
      <p className="text-xs text-prose leading-relaxed">{workflow.description}</p>

      <dl className="mt-4 grid grid-cols-[88px_1fr] gap-y-1 text-[11px] font-mono">
        <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Grant</dt>
        <dd className={grantClasses(workflow.grant)}>{GRANT_LABEL[workflow.grant]}</dd>
        <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Last run</dt>
        <dd className="text-prose">{formatLastRun(workflow.last_run_at)}</dd>
        <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Availability</dt>
        <dd className={availabilityClasses(workflow.availability)}>
          {AVAILABILITY_LABEL[workflow.availability]}
        </dd>
      </dl>

      <div className="mt-4 font-mono uppercase tracking-track2 text-[10px] text-muted group-hover:text-ink transition-colors">
        Open
      </div>
    </a>
  );
}
