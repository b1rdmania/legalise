/**
 * /matters/:slug/signoffs/:signoffId — sign-off confirmation / record.
 *
 * Renders the sign-off exactly as it sits in the permanent record — the
 * executed certificate (DESIGN.md P27): a CertCard with the decision as
 * the eyebrow's right mark (rejected carries the seal), then signer,
 * timestamp, output, reasoning, and the pinned artifact hash as ledger
 * rows. Loads by id so a reload / deep-link is stable. Copy stays
 * inside the boundary.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getSignoff, type Signoff } from "../lib/api";
import { ErrorCallout, LoadingLine } from "../ui/primitives";
import { CertCard, CertEyebrow, LedgerRow } from "../ui/certificate";

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
      <div className="page-shell">
        <ErrorCallout message={`Sign-off not found: ${err}`} />
      </div>
    );
  }
  if (signoff === null) {
    return (
      <div className="page-shell">
        <LoadingLine label="loading sign-off record" />
      </div>
    );
  }

  const rejected = signoff.decision === "rejected";

  return (
    <div className="page-shell">
      {/* The executed certificate. Seal tone only for a rejection — the
          one refused state this record can hold. */}
      <CertCard tone={rejected ? "seal" : "ink"} testid="signoff-record">
        <CertEyebrow
          left="Sign-off record"
          right={DECISION_LABEL[signoff.decision] ?? signoff.decision}
          rightTone={rejected ? "seal" : "ink"}
        />
        <h1 className="mt-3 text-[22px] leading-tight tracking-tight2">
          {rejected ? "Draft rejected — recorded" : "Signed in Legalise"}
        </h1>
        <p className="mt-1 text-xs text-muted">
          {rejected
            ? "This draft was not signed. The decision and reasoning are part of the matter's permanent audit trail."
            : "This records your professional ownership of the output. It is permanent and forms part of the matter's audit trail."}
        </p>

        <dl className="mt-4 space-y-1 border-t border-rule pt-3 text-[11px] text-muted">
          <LedgerRow label="Signed by" tone="ink">
            {signoff.signer_email ?? signoff.signer_id}
          </LedgerRow>
          <LedgerRow label="When">
            {signoff.signed_at.replace("T", " ").slice(0, 19)}
          </LedgerRow>
          <LedgerRow label="Output">
            <span className="tech-token">
              {signoff.kind} · {signoff.module_id} / {signoff.capability_id}
            </span>
          </LedgerRow>
        </dl>

        {(signoff.signer_is_author || !signoff.is_current) && (
          <p className="mt-2 text-[11px] text-muted">
            {signoff.signer_is_author &&
              "Author — self-signed, not independent review. "}
            {!signoff.is_current && "Superseded by a later sign-off."}
          </p>
        )}

        {signoff.reasoning && (
          <div className="mt-3 border-t border-rule pt-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
              Reasoning
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink">
              {signoff.reasoning}
            </p>
          </div>
        )}

        <div className="mt-3 border-t border-rule pt-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
            Output hash (pinned)
          </p>
          <p className="mt-1 break-all tech-token text-[11px]">
            {signoff.artifact_hash}
          </p>
        </div>
      </CertCard>

      <p className="mt-4 text-xs text-muted">
        The output hash pins the exact payload that was signed — the record cannot
        silently come to mean a different output.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          to="/matters/$slug/artifacts/$artifactId"
          params={{ slug, artifactId: signoff.artifact_id }}
          className="text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
        >
          ← Back to output
        </Link>
        <Link
          to="/matters/$slug/audit"
          params={{ slug }}
          search={{ invocation_id: signoff.invocation_id }}
          className="text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          data-testid="signoff-trail-link"
        >
          See it in Activity →
        </Link>
      </div>
    </div>
  );
}
