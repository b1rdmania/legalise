/**
 * Supervisor Review v1 (SR-3) — the Approvals tab.
 *
 * Makes supervised autonomy visible: a produced output enters human
 * review, a reviewer records a decision, and the audit reconstructs the
 * chain. Advisory + audited — a decision is recorded and links to the
 * reconstruction; it does not hard-gate downstream use.
 *
 * Named "Approvals" (not "Reviews" — that's Tabular Review).
 */

import { useCallback, useEffect, useState } from "react";
import {
  decideReview,
  listSupervisorReviews,
  readArtifact,
  type ArtifactRead,
  type ReviewDecision,
  type SupervisorReview,
} from "../../lib/api";
import { ArtifactPreview } from "../ArtifactPreview";
import { Badge, EmptyState, ErrorCallout, LoadingLine } from "../../ui/primitives";

type Query =
  | { status: "loading" }
  | { status: "ready"; reviews: SupervisorReview[] }
  | { status: "error"; message: string };

const STATE_LABEL: Record<string, string> = {
  pending: "Pending review",
  approved: "Approved in Legalise",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  overridden: "Overridden",
};

export function ApprovalsTab({ slug }: { slug: string }) {
  const [q, setQ] = useState<Query>({ status: "loading" });
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await listSupervisorReviews(slug);
      setQ({ status: "ready", reviews: res.reviews });
    } catch (err) {
      setQ({ status: "error", message: String(err) });
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending =
    q.status === "ready" ? q.reviews.filter((r) => r.state === "pending") : [];
  const decided =
    q.status === "ready" ? q.reviews.filter((r) => r.state !== "pending") : [];

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-muted">
        <span className="text-ink">
          "Approved in Legalise" records that a human reviewed an output —
          it is not legal advice certification or SRA approval.
        </span>
      </p>

      {q.status === "loading" && <LoadingLine label="loading reviews" />}
      {q.status === "error" && <ErrorCallout message={q.message} />}

      {q.status === "ready" && q.reviews.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No reviews yet"
            body='Open a Contract Review findings pack in Signed outputs and choose "Request review" to start one.'
          />
        </div>
      )}

      {pending.length > 0 && (
        <section className="mt-8">
          <h3 className="text-xs uppercase tracking-widest text-muted">Pending</h3>
          <ul className="mt-3 space-y-px bg-rule border border-rule">
            {pending.map((r) => (
              <ReviewRow
                key={r.id}
                review={r}
                open={openId === r.id}
                onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                slug={slug}
                onDecided={() => {
                  setOpenId(null);
                  void refresh();
                }}
              />
            ))}
          </ul>
        </section>
      )}

      {decided.length > 0 && (
        <section className="mt-8">
          <h3 className="text-xs uppercase tracking-widest text-muted">Decided</h3>
          <ul className="mt-3 space-y-px bg-rule border border-rule">
            {decided.map((r) => (
              <ReviewRow
                key={r.id}
                review={r}
                open={openId === r.id}
                onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                slug={slug}
                onDecided={() => undefined}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReviewRow({
  review,
  open,
  onToggle,
  slug,
  onDecided,
}: {
  review: SupervisorReview;
  open: boolean;
  onToggle: () => void;
  slug: string;
  onDecided: () => void;
}) {
  const isPending = review.state === "pending";
  return (
    <li className="bg-paper p-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm text-ink">{review.kind}</p>
          <p className="tech-token text-[11px] text-muted truncate">
            {review.capability_id} · {review.requested_at.slice(0, 16).replace("T", " ")}
          </p>
        </div>
        <Badge>{STATE_LABEL[review.state] ?? review.state}</Badge>
      </button>
      {open && (
        <ReviewScreen
          review={review}
          slug={slug}
          editable={isPending}
          onDecided={onDecided}
        />
      )}
    </li>
  );
}

function ReviewScreen({
  review,
  slug,
  editable,
  onDecided,
}: {
  review: SupervisorReview;
  slug: string;
  editable: boolean;
  onDecided: () => void;
}) {
  const [artifact, setArtifact] = useState<ArtifactRead | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readArtifact(slug, review.artifact_id)
      .then((a) => {
        if (!cancelled) setArtifact(a);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug, review.artifact_id]);

  const auditHref = `/matters/${encodeURIComponent(slug)}/audit?invocation_id=${encodeURIComponent(review.invocation_id)}`;

  const act = async (decision: ReviewDecision) => {
    const needsNote = decision !== "approve";
    if (needsNote && !note.trim()) {
      setError("A note is required to reject, request changes, or override.");
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      await decideReview(slug, review.id, decision, note.trim() || undefined);
      onDecided();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 border-t border-rule pt-4">
      {artifact ? (
        <ArtifactPreview payload={artifact.payload} kindHint={artifact.kind} />
      ) : (
        <LoadingLine label="loading output" />
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <div>
          <dt className="uppercase tracking-widest text-muted">Output hash</dt>
          <dd className="mt-0.5 tech-token text-muted break-all">{review.artifact_hash}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-widest text-muted">Invocation</dt>
          <dd className="mt-0.5 tech-token text-muted">{review.invocation_id}</dd>
        </div>
        {!editable && (
          <>
            <div>
              <dt className="uppercase tracking-widest text-muted">Decision</dt>
              <dd className="mt-0.5 text-ink">{STATE_LABEL[review.state]}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-widest text-muted">Note</dt>
              <dd className="mt-0.5 text-muted">{review.note || "—"}</dd>
            </div>
          </>
        )}
      </dl>

      <a
        href={auditHref}
        className="mt-3 inline-block text-xs text-muted underline underline-offset-4 hover:text-ink"
      >
        View audit reconstruction for this invocation
      </a>

      {editable && (
        <div className="mt-4">
          <label className="block text-xs uppercase tracking-widest text-muted">
            Note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Required to reject, request changes, or override"
              className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink"
            />
          </label>
          {error && <p className="mt-2 text-sm text-seal">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void act("approve")}
              disabled={busy !== null}
              className="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-50"
            >
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => void act("request_changes")}
              disabled={busy !== null}
              className="rounded-md border border-rule px-4 py-2 text-sm hover:border-ink disabled:opacity-50"
            >
              {busy === "request_changes" ? "Submitting…" : "Request changes"}
            </button>
            <button
              type="button"
              onClick={() => void act("reject")}
              disabled={busy !== null}
              className="rounded-md border border-rule px-4 py-2 text-sm text-seal hover:border-seal disabled:opacity-50"
            >
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </button>
            <button
              type="button"
              onClick={() => void act("override")}
              disabled={busy !== null}
              className="rounded-md border border-rule px-4 py-2 text-sm hover:border-ink disabled:opacity-50"
            >
              {busy === "override" ? "Overriding…" : "Override"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Decision recorded · not legal advice certification. Override = approve
            despite a flag, with a mandatory note — recorded in the audit trail.
          </p>
        </div>
      )}
    </div>
  );
}
