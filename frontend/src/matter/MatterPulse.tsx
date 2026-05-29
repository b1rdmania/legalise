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
}

export function MatterPulse({
  matter,
  documentsCount,
  chronologyCount,
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

  const hasDocuments = documentsCount > 0;
  const hasChronology = chronologyCount > 0;
  const hasActions = workflowsGranted !== 0;

  return (
    <section
      aria-label="Matter readiness"
      className="mx-auto w-full max-w-[920px] border-l-2 border-ink pl-4 py-2 text-sm text-prose"
      title={postureBlurb}
    >
      <span className="font-semibold text-ink">Workspace ready.</span>{" "}
      <span>
        {hasDocuments ? "Documents are loaded" : "Add documents to begin"}
        {hasChronology ? ", the chronology is available" : ""}
        {hasActions ? ", and governed actions are ready" : ""}.
      </span>{" "}
      <span className="text-muted">
        Every AI step writes to the Activity Trail. {postureLabel} posture.
      </span>
    </section>
  );
}
