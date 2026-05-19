import { useEffect, useState } from "react";
import { getMatterWorkflows, type Matter } from "../lib/api";

// Matter Pulse - the calm-power data strip on the Assistant landing.
// Per JOY.md "Required Patterns / Matter Pulse": at a glance, show that
// the workspace already understands the file. Five cells, no shouting.
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
}

export function MatterPulse({
  matter,
  documentsCount,
  chronologyCount,
  auditCount,
  workflowsGrantedCount,
  skipFetch = false,
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

  return (
    <section
      aria-label="Matter pulse"
      className="mx-auto w-full max-w-[920px] border border-rule bg-paper grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y divide-rule sm:divide-y-0 sm:divide-x sm:divide-rule"
    >
      <PulseCell label="Documents" value={fmt(documentsCount)} />
      <PulseCell label="Chronology" value={fmt(chronologyCount)} />
      <PulseCell
        label="Workflows"
        value={workflowsGranted === null ? "-" : fmt(workflowsGranted)}
        title={
          workflowsGranted === null
            ? "Workflows unavailable in this view"
            : `${workflowsGranted} granted workflow${workflowsGranted === 1 ? "" : "s"}`
        }
      />
      <PulseCell label="Audit rows" value={fmt(auditCount)} />
      <PulseCell label="Posture" value={postureLabel} title={postureBlurb} mono={false} />
    </section>
  );
}

function PulseCell({
  label,
  value,
  title,
  mono = true,
}: {
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
}) {
  return (
    <div className="px-4 py-3" title={title}>
      <div className="eyebrow">{label}</div>
      <div
        className={
          (mono ? "font-mono tabular-nums " : "") +
          "text-[18px] text-ink leading-tight mt-1"
        }
      >
        {value}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return Number.isFinite(n) ? String(n) : "-";
}
