/**
 * /matters/:slug/signoffs/:signoffId — sign-off confirmation / record.
 *
 * Renders the sign-off exactly as it sits in the permanent record:
 * signer, timestamp, decision, reasoning, the pinned artifact hash. Loads
 * by id so a reload / deep-link is stable. Copy stays inside the boundary.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getSignoff, type Signoff } from "../lib/api";
import { ErrorCallout, LoadingLine, PageHeader } from "../ui/primitives";

const DECISION_LABEL: Record<string, string> = {
  signed: "Signed",
  signed_with_observations: "Signed with observations",
  rejected: "Rejected",
};

export function SignOffConfirmation({
  slug,
  signoffId,
}: {
  slug: string;
  signoffId: string;
}) {
  const [signoff, setSignoff] = useState<Signoff | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSignoff(slug, signoffId)
      .then((s) => !cancelled && setSignoff(s))
      .catch((e: unknown) => !cancelled && setErr(String(e)));
    return () => {
      cancelled = true;
    };
  }, [slug, signoffId]);

  if (err) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <ErrorCallout message={`Sign-off not found: ${err}`} />
      </div>
    );
  }
  if (signoff === null) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <LoadingLine label="loading sign-off record" />
      </div>
    );
  }

  const rejected = signoff.decision === "rejected";

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-ink">
      <PageHeader
        eyebrow="Sign-off record"
        title={rejected ? "Draft rejected — recorded" : "Signed in Legalise"}
        description={
          rejected
            ? "This draft was not signed. The decision and reasoning are part of the matter's permanent audit trail."
            : "This records your professional ownership of the output. It is permanent and forms part of the matter's audit trail."
        }
      />

      <dl className="mt-6 divide-y divide-rule rounded-md border border-rule" data-testid="signoff-record">
        <Row label="Decision">
          <span className="font-medium">{DECISION_LABEL[signoff.decision] ?? signoff.decision}</span>
          {!signoff.is_current && (
            <span className="ml-2 text-[11px] text-muted">(superseded by a later sign-off)</span>
          )}
        </Row>
        <Row label="Signed by">{signoff.signer_email ?? signoff.signer_id}</Row>
        <Row label="When">{signoff.signed_at.replace("T", " ").slice(0, 19)}</Row>
        <Row label="Output">
          <span className="tech-token text-xs">
            {signoff.kind} · {signoff.module_id} / {signoff.capability_id}
          </span>
        </Row>
        {signoff.reasoning && <Row label="Reasoning">{signoff.reasoning}</Row>}
        <Row label="Output hash (pinned)">
          <span className="break-all tech-token text-[11px]">{signoff.artifact_hash}</span>
        </Row>
      </dl>

      <p className="mt-4 text-xs text-muted">
        The output hash pins the exact payload that was signed — the record cannot
        silently come to mean a different output.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          to="/matters/$slug/artifacts/$artifactId"
          params={{ slug, artifactId: signoff.artifact_id }}
          className="text-muted underline underline-offset-4 hover:text-ink"
        >
          ← Back to output
        </Link>
        <Link
          to="/matters/$slug/audit"
          params={{ slug }}
          search={{ invocation_id: signoff.invocation_id }}
          className="text-muted underline underline-offset-4 hover:text-ink"
          data-testid="signoff-trail-link"
        >
          See it in the Record →
        </Link>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-xs uppercase tracking-widest text-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
