/**
 * Phase 14 D — /matters/{slug}/artifacts.
 *
 * Hits Phase 13b A's `GET /api/matters/{slug}/artifacts` and renders
 * the list as a table. The substrate returns rows desc by created_at
 * (artifacts.py:121) so no client-side sort is needed.
 *
 * Reviewer-narrow: no audit deep-link inline (Phase 14 E will land
 * the audit page; the artifact detail page links to it once a single
 * row is open). No archive / pin / share affordances. List + click
 * into detail.
 *
 * Per Phase 13b Decision #1, reads do NOT emit audit. This page
 * triggers two reads (the list + matter fetch on the matter route)
 * and no audit row should land — that contract is substrate-verified.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listArtifacts, listSignoffs, type ArtifactSummary } from "../lib/api";
import { PageHeader } from "../ui/primitives";

type Query =
  | { status: "loading" }
  | { status: "ready"; rows: ArtifactSummary[] }
  | { status: "error"; message: string };

// artifact_id -> current sign-off decision (absent = unsigned/draft).
type SignoffMap = Map<string, string>;

function SignoffBadge({ decision }: { decision: string | undefined }) {
  if (decision === "signed" || decision === "signed_with_observations") {
    return (
      <span className="inline-flex items-center rounded-full border border-ink px-2 py-0.5 text-[11px] text-ink">
        {decision === "signed_with_observations" ? "Signed (obs.)" : "Signed"}
      </span>
    );
  }
  if (decision === "rejected") {
    return (
      <span className="inline-flex items-center rounded-full border border-seal/50 px-2 py-0.5 text-[11px] text-seal">
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
      Draft
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
    <div className="mx-auto max-w-4xl px-6 py-12 text-ink">
      <PageHeader
        eyebrow="Matter"
        title="Artifacts"
        subId={slug}
        description="Outputs written by capabilities invoked on this matter. Each row links to a structured payload view."
      />

      {q.status === "loading" && (
        <p className="mt-8 text-sm text-muted">Loading artifacts…</p>
      )}
      {q.status === "error" && (
        <p className="mt-8 text-sm text-seal">
          Could not load artifacts: {q.message}
        </p>
      )}
      {q.status === "ready" && q.rows.length === 0 && (
        <p className="mt-8 text-sm text-muted">
          No artifacts yet on this matter. Run a capability to produce
          one.
        </p>
      )}
      {q.status === "ready" && q.rows.length > 0 && (
        <div className="mt-8 overflow-x-auto rounded-md border border-line">
          <table className="min-w-full text-sm">
            <thead className="bg-paper-sunken text-xs uppercase tracking-widest text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Kind</th>
                <th className="px-3 py-2 text-left">Sign-off</th>
                <th className="px-3 py-2 text-left">Module</th>
                <th className="px-3 py-2 text-left">Capability</th>
                <th className="px-3 py-2 text-left">Invocation</th>
                <th className="px-3 py-2 text-right">Size</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {q.rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-3 py-2 font-mono text-xs">{r.kind}</td>
                  <td className="px-3 py-2" data-testid={`signoff-badge-${r.id}`}>
                    <SignoffBadge decision={signoffs.get(r.id)} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.module_id}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.capability_id}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.invocation_id.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted">
                    {r.size_bytes.toLocaleString()} B
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {r.created_at.slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/matters/$slug/artifacts/$artifactId"
                      params={{ slug, artifactId: r.id }}
                      className="text-xs underline underline-offset-4 hover:text-seal"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
