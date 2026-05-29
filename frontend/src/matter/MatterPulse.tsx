import { useEffect, useState } from "react";
import { getMatterWorkflows, type Matter } from "../lib/api";

// Matter Pulse - the calm-power readiness line on the Assistant landing.
// Per JOY.md, this should prove the workspace already understands the
// file. It must not become a dashboard strip competing with the answer.
//
// Counts are passed in from MatterDetail / DemoMatter (already in scope).
// Workflows count is fetched here unless `workflowsGrantedCount` is supplied
// (demo path can pass a static number; an unauth 401 falls back to "-").

const POSTURE_LABEL: Record<string, string> = {
  A_cleared: "Cleared",
  B_mixed: "Mixed",
  C_paused: "Paused",
};
const POSTURE_BLURB: Record<string, string> = {
  A_cleared: "A_cleared - privileged material excluded; cloud providers permitted",
  B_mixed: "B_mixed - cloud providers allowed for this matter",
  C_paused: "C_paused - local models only; cloud calls refused",
};

interface Props {
  matter: Matter;
  documentsCount: number;
  chronologyCount: number;
  auditCount: number;
  // Pre-resolved workflows count (demo path). If undefined, fetch.
  workflowsGrantedCount?: number;
  // Skip the network call entirely (demo / unauth).
  skipFetch?: boolean;
  showPosture?: boolean;
}

export function MatterPulse({
  matter,
  documentsCount,
  chronologyCount,
  workflowsGrantedCount,
  skipFetch = false,
  showPosture = true,
}: Props) {
  const [workflowsGranted, setWorkflowsGranted] = useState<number | null>(
    workflowsGrantedCount ?? null,
  );

  useEffect(() => {
    if (workflowsGrantedCount !== undefined) {
      setWorkflowsGranted(workflowsGrantedCount);
      return;
    }
    if (skipFetch) return;
    let cancelled = false;
    getMatterWorkflows(matter.slug)
      .then((res) => {
        if (cancelled) return;
        const granted = res.workflows.filter((w) => w.grant === "granted").length;
        setWorkflowsGranted(granted);
      })
      .catch(() => {
        if (!cancelled) setWorkflowsGranted(null);
      });
    return () => {
      cancelled = true;
    };
  }, [matter.slug, workflowsGrantedCount, skipFetch]);

  const postureLabel = POSTURE_LABEL[matter.privilege_posture] ?? matter.privilege_posture;
  const postureBlurb = POSTURE_BLURB[matter.privilege_posture] ?? matter.privilege_posture;

  const hasDocuments = documentsCount > 0;
  const hasChronology = chronologyCount > 0;
  const hasActions = workflowsGranted !== 0;
  const actionLabel =
    workflowsGranted === null
      ? "Actions checked on sign-in"
      : `${workflowsGranted} governed action${workflowsGranted === 1 ? "" : "s"} ready`;

  return (
    <section
      aria-label="Matter readiness"
      className="mx-auto w-full max-w-[920px] border border-rule bg-paper-sunken p-5 text-sm text-prose"
      title={postureBlurb}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Matter ready
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight2 text-ink">
            {matter.title} is loaded for supervised AI work.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-prose">
            The workspace has the documents, a chronology, and governed actions.
            Every AI step is recorded in the Activity Trail.
          </p>
        </div>
        <div className="grid min-w-[280px] grid-cols-1 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-1">
          <StatusLine label="Documents" value={hasDocuments ? `${documentsCount} loaded` : "Add documents"} />
          <StatusLine label="Timeline" value={hasChronology ? `${chronologyCount} events` : "Not started"} />
          <StatusLine label="Actions" value={hasActions ? actionLabel : "Setup needed"} />
        </div>
      </div>
      {showPosture ? (
        <p className="mt-4 border-t border-rule pt-3 text-xs text-muted">
          {postureLabel} posture. This demo is safe to inspect; create an account
          to run the same loop on your own matter.
        </p>
      ) : (
        <p className="mt-4 border-t border-rule pt-3 text-xs text-muted">
          This demo is safe to inspect; create an account to run the same loop
          on your own matter.
        </p>
      )}
    </section>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-rule bg-paper px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </div>
      <div className="mt-0.5 font-medium text-ink">{value}</div>
    </div>
  );
}
