/**
 * Outputs list page — `/matters/{slug}/artifacts`.
 *
 * Hits `GET /api/matters/{slug}/artifacts` and renders the list as a
 * ledger (DESIGN.md P27): each artifact is a numbered LedgerLine with
 * its kind as the 0.18em label and the current sign-off status as a
 * small-caps mark on the right (Draft / Signed / Signed · obs. /
 * Rejected) derived from current sign-offs. The substrate returns rows
 * desc by created_at, so no client-side sort is needed.
 *
 * This is an inner matter surface — the matter shell owns the page, so
 * there is no masthead here, only the SectionRule + ledger anatomy.
 *
 * Audit-trail deep-links live on artifact detail, not on this list.
 * Reads do NOT emit audit (substrate-verified at artifacts.py).
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listArtifacts, listSignoffs, type ArtifactSummary } from "../lib/api";
import { LedgerLine, SectionRule } from "../ui/certificate";

type Query =
  | { status: "loading" }
  | { status: "ready"; rows: ArtifactSummary[] }
  | { status: "error"; message: string };

// artifact_id -> current sign-off decision (absent = unsigned/draft).
type SignoffMap = Map<string, string>;

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
    case "chat_draft":
      return "Draft from chat";
    default:
      return kind.replace(/_/g, " ");
  }
}

// Small-caps sign-off mark for the ledger's right column. Signed states
// read in ink; rejected carries the seal; unsigned drafts stay muted.
function SignoffMark({
  id,
  decision,
}: {
  id: string;
  decision: string | undefined;
}) {
  const label =
    decision === "signed"
      ? "Signed"
      : decision === "signed_with_observations"
        ? "Signed · obs."
        : decision === "rejected"
          ? "Rejected"
          : "Draft";
  const tone =
    decision === "rejected"
      ? "text-seal"
      : decision
        ? "text-ink"
        : "text-muted";
  return (
    <span
      className={"text-[10px] uppercase tracking-[0.18em] " + tone}
      data-testid={`signoff-badge-${id}`}
    >
      {label}
    </span>
  );
}

export function ArtifactsList({ slug }: { slug: string }) {
  const [q, setQ] = useState<Query>({ status: "loading" });
  const [signoffs, setSignoffs] = useState<SignoffMap>(new Map());

  useEffect(() => {
    let cancelled = false;
    listArtifacts(slug)
      .then((rows) => {
        if (!cancelled) setQ({ status: "ready", rows });
      })
      .catch((err: unknown) => {
        if (!cancelled) setQ({ status: "error", message: String(err) });
      });
    listSignoffs(slug)
      .then((res) => {
        if (cancelled) return;
        const m: SignoffMap = new Map();
        for (const s of res.signoffs) {
          if (s.is_current) m.set(s.artifact_id, s.decision);
        }
        setSignoffs(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="page-shell">
      {/* Same header tier as Documents — this tab previously opened with a
          bare section rule and no page name. Drafts appear here too
          (SignoffMark renders Draft), so the old "Signed outputs" label
          under-promised and hid the save-as-draft path. */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink">Outputs</h1>
        <p className="mt-1 text-sm text-muted">
          Drafts and signed outputs on this matter. Open one to review,
          sign, or export it.
        </p>
      </div>
      <SectionRule
        label="All outputs"
        right={q.status === "ready" ? String(q.rows.length) : undefined}
      />

      {q.status === "loading" && (
        <p className="mt-4 text-sm text-muted">Loading outputs…</p>
      )}
      {q.status === "error" && (
        <p className="mt-4 text-sm text-seal">
          Could not load outputs: {q.message}
        </p>
      )}
      {q.status === "ready" && q.rows.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          No outputs yet on this matter. Save an assistant answer as a draft, or run a skill.
        </p>
      )}
      {q.status === "ready" && q.rows.length > 0 && (
        <div className="mt-1">
          {q.rows.map((r, i) => (
            <LedgerLine
              key={r.id}
              index={i + 1}
              label={r.kind}
              right={
                <span className="flex items-baseline gap-3">
                  <SignoffMark id={r.id} decision={signoffs.get(r.id)} />
                  <span className="hidden tech-token text-[11px] text-muted sm:inline">
                    {r.created_at.slice(0, 10)}
                  </span>
                  <Link
                    to="/matters/$slug/artifacts/$artifactId"
                    params={{ slug, artifactId: r.id }}
                    className="text-[11px] text-muted hover:text-seal"
                  >
                    Open →
                  </Link>
                </span>
              }
            >
              <span className="text-ink">{outputLabel(r.kind)}</span>
              <span className="ml-2 hidden tech-token text-[11px] text-muted sm:inline">
                {r.module_id}
              </span>
              <span className="ml-1 hidden tech-token text-[11px] text-muted sm:inline">
                {r.capability_id}
              </span>
            </LedgerLine>
          ))}
        </div>
      )}
    </div>
  );
}
