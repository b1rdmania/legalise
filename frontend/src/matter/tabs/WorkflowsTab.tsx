// WorkflowsTab - historical filename for the matter Skills page.
// Built-in legal actions (Pre-Motion / Letters / Contract Review /
// Tabular Review / Case Law) render as cards linking to their surfaces;
// the sidebar highlights Skills when one is open.
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
import { LoadingLine } from "../../ui/primitives";

const GRANT_LABEL: Record<WorkflowGrant, string> = {
  granted: "granted",
  partial: "partial",
  blocked: "blocked",
};

const AVAILABILITY_LABEL: Record<WorkflowAvailability, string> = {
  ok: "ok",
  "blocked-by-posture": "blocked by privilege",
  "blocked-by-grant": "blocked by permission",
};

function availabilityClasses(value: WorkflowAvailability): string {
  switch (value) {
    case "ok":
      return "text-[#00A35C]";
    case "blocked-by-posture":
      return "text-[#E67E22]";
    case "blocked-by-grant":
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
          if (msg.includes("401")) {
            setError("Sign in to see which skills are runnable on this matter.");
          } else {
            setError("Skills could not be loaded. Try again, or open the skill catalogue.");
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-prose max-w-2xl leading-relaxed mb-8">
        Run the installed legal skills for this matter. Each card says whether
        it is ready before you open it.
      </p>

      {error && (
        <div className="rounded-card border border-rule bg-paper p-5 text-sm">
          <p className="font-semibold text-ink">Skills are available inside your workspace.</p>
          <p className="mt-2 text-muted">{error}</p>
          <a
            href="/auth/signup"
            className="mt-4 inline-flex bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-black"
          >
            Create account
          </a>
        </div>
      )}
      {!data && !error && <LoadingLine label="loading skills" />}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.workflows.map((w) => (
            <WorkflowCard key={w.key} workflow={w} slug={slug} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted mt-8">
        Browse all available skills in the{" "}
        <a href="/skills" className="text-[#0066CC] hover:underline">
          skill catalogue
        </a>
        .
      </p>
    </div>
  );
}

function WorkflowCard({ workflow, slug }: { workflow: WorkflowState; slug: string }) {
  return (
    <a
      href={`/matters/${slug}/${workflow.key}`}
      className="block rounded-item border border-rule p-5 hover:border-ink hover:bg-wash transition-colors group"
      title={workflow.reason ?? undefined}
    >
      <div className="text-sm font-semibold text-ink mb-2">{workflow.title}</div>
      <p className="text-xs text-prose leading-relaxed">{workflow.description}</p>

      <dl className="mt-4 grid grid-cols-[88px_1fr] gap-y-1 text-[11px] tech-token">
        <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Permission</dt>
        <dd className={grantClasses(workflow.grant)}>{GRANT_LABEL[workflow.grant]}</dd>
        <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Last run</dt>
        <dd className="text-prose">{formatLastRun(workflow.last_run_at)}</dd>
        <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Availability</dt>
        <dd className={availabilityClasses(workflow.availability)}>
          {AVAILABILITY_LABEL[workflow.availability]}
        </dd>
      </dl>

      <div className="mt-4 tech-token uppercase tracking-track2 text-[10px] text-muted group-hover:text-ink transition-colors">
        Open
      </div>
    </a>
  );
}
