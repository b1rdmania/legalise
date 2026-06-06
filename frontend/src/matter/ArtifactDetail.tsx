/**
 * Output detail page — `/matters/{slug}/artifacts/{artifactId}`.
 *
 * Hits `GET /api/matters/{slug}/artifacts/{id}` (returns ArtifactSummary
 * fields + parsed `payload`). Kind-aware rendering via ArtifactPreview.
 *
 * Deep-link to the Record: this page links to
 * `/matters/{slug}/audit?invocation_id=<id>`. The query-param contract
 * is preserved for signed/exported output chains.
 *
 * Reads do NOT emit audit (substrate-verified in artifacts.py).
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  listSignoffs,
  readArtifact,
  requestReview,
  REVIEW_ELIGIBLE_KINDS,
  type ArtifactRead,
  type Signoff,
} from "../lib/api";
import { ArtifactPreview } from "./ArtifactPreview";
import { DescItem as DT, PageHeader } from "../ui/primitives";

type Query =
  | { status: "loading" }
  | { status: "ready"; artifact: ArtifactRead }
  | { status: "error"; message: string };

function outputLabel(kind: string): string {
  switch (kind) {
    case "findings_pack":
      return "Findings pack";
    case "motion_draft":
      return "Draft motion";
    case "evidence_list":
      return "Evidence list";
    case "skill_response":
      return "Skill response";
    default:
      return kind.replace(/_/g, " ");
  }
}

export function ArtifactDetail({
  slug,
  artifactId,
}: {
  slug: string;
  artifactId: string;
}) {
  const [q, setQ] = useState<Query>({ status: "loading" });
  const [review, setReview] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "ok" } | { kind: "err"; msg: string }
  >({ kind: "idle" });
  // Current sign-off for this artifact: undefined=loading, null=none.
  const [signoff, setSignoff] = useState<Signoff | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    readArtifact(slug, artifactId)
      .then((artifact) => {
        if (!cancelled) setQ({ status: "ready", artifact });
      })
      .catch((err: unknown) => {
        if (!cancelled) setQ({ status: "error", message: String(err) });
      });
    listSignoffs(slug)
      .then((res) => {
        if (cancelled) return;
        const current = res.signoffs.find(
          (s) => s.artifact_id === artifactId && s.is_current,
        );
        setSignoff(current ?? null);
      })
      .catch(() => !cancelled && setSignoff(null));
    return () => {
      cancelled = true;
    };
  }, [slug, artifactId]);

  if (q.status === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted">
        Loading artifact…
      </div>
    );
  }
  if (q.status === "error") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-xl font-bold tracking-tight2">Output not found</h1>
        <p className="mt-3 text-sm text-muted">{q.message}</p>
        <p className="mt-4 text-sm">
          <Link
            to="/matters/$slug/artifacts"
            params={{ slug }}
            className="underline underline-offset-4 hover:text-ink"
          >
            ← All signed outputs
          </Link>
        </p>
      </div>
    );
  }

  const a = q.artifact;
  const auditHref = `/matters/${encodeURIComponent(slug)}/audit?invocation_id=${encodeURIComponent(a.invocation_id)}`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-ink">
      <PageHeader
        eyebrow="Output"
        title={outputLabel(a.kind)}
        subId={a.id}
        description="Review the output, check its sources, and sign it when you are ready to take professional ownership."
      />

      {/* Sign-off status + the hero action. Author sign-off (distinct from
          supervisor review): the solicitor takes ownership of this output. */}
      <section className="mt-8 rounded-card border border-rule bg-paper p-4" data-testid="signoff-status">
        <h2 className="text-sm uppercase tracking-widest text-muted">Sign-off</h2>
        {signoff === undefined ? (
          <p className="mt-2 text-sm text-muted">Checking sign-off status…</p>
        ) : signoff === null ? (
          <p className="mt-2 text-sm text-muted">
            <span className="font-medium text-ink">Draft — prepared by AI, not yet signed.</span>{" "}
            No one has taken professional ownership of this output yet.
          </p>
        ) : signoff.decision === "rejected" ? (
          <p className="mt-2 text-sm">
            <span className="font-medium text-seal">Rejected</span> by{" "}
            {signoff.signer_email ?? "a user"} · {signoff.signed_at.slice(0, 10)}
          </p>
        ) : (
          <p className="mt-2 text-sm" data-testid="signoff-signed">
            <span className="font-medium text-ink">
              {signoff.decision === "signed_with_observations"
                ? "Signed with observations"
                : "Signed in Legalise"}
            </span>{" "}
            by {signoff.signer_email ?? "a user"} · {signoff.signed_at.slice(0, 10)}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <Link
            to="/matters/$slug/artifacts/$artifactId/sign"
            params={{ slug, artifactId }}
            className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90"
            data-testid="signoff-cta"
          >
            {signoff ? "Review & sign again" : "Review & sign"}
          </Link>
          {signoff && (
            <Link
              to="/matters/$slug/signoffs/$signoffId"
              params={{ slug, signoffId: signoff.id }}
              className="text-muted underline underline-offset-4 hover:text-ink"
            >
              View sign-off record
            </Link>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Output
        </h2>
        <ArtifactPreview payload={a.payload} kindHint={a.kind} matterSlug={slug} />
      </section>

      {REVIEW_ELIGIBLE_KINDS.includes(a.kind) && (
        <details className="mt-8 rounded-card border border-rule p-4">
          <summary className="cursor-pointer text-sm uppercase tracking-widest text-muted">
            Optional separate review
          </summary>
          <div className="mt-3">
            {review.kind === "ok" ? (
              <p className="text-sm text-muted">
                Sent for review.{" "}
                <Link
                  to="/matters/$slug/$tab"
                  params={{ slug, tab: "approvals" }}
                  className="underline underline-offset-4 hover:text-ink"
                >
                  Open Approvals
                </Link>{" "}
                to record a second-person decision.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Use this when a separate reviewer should record a decision.
                  Your own professional sign-off remains the main route for
                  taking ownership of this output.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    setReview({ kind: "busy" });
                    try {
                      await requestReview(slug, a.id);
                      setReview({ kind: "ok" });
                    } catch (err) {
                      setReview({ kind: "err", msg: String(err) });
                    }
                  }}
                  disabled={review.kind === "busy"}
                  className="mt-3 inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-50"
                >
                  {review.kind === "busy" ? "Requesting…" : "Request review"}
                </button>
                {review.kind === "err" && (
                  <p className="mt-2 text-sm text-seal">{review.msg}</p>
                )}
              </>
            )}
          </div>
        </details>
      )}

      <details className="mt-8 border border-line bg-paper-sunken p-4">
        <summary className="cursor-pointer text-sm uppercase tracking-widest text-muted">
          Technical record
        </summary>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <DT label="Kind">
            <code className="tech-token text-xs">{a.kind}</code>
          </DT>
          <DT label="Skill source">
            <code className="tech-token text-xs">{a.module_id}</code>
          </DT>
          <DT label="Permission">
            <code className="tech-token text-xs">{a.capability_id}</code>
          </DT>
          <DT label="Run id">
            <code className="tech-token text-xs">{a.invocation_id}</code>
          </DT>
          <DT label="Size">
            <span>{a.size_bytes.toLocaleString()} bytes</span>
          </DT>
          <DT label="Created">
            <span>{a.created_at.replace("T", " ").slice(0, 19)}</span>
          </DT>
        </dl>
      </details>

      <section className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          to="/matters/$slug/artifacts"
          params={{ slug }}
          className="text-muted underline underline-offset-4 hover:text-ink"
        >
          ← All signed outputs
        </Link>
        <a
          href={auditHref}
          className="text-muted underline underline-offset-4 hover:text-ink"
        >
          See activity for this output
        </a>
      </section>
    </div>
  );
}
