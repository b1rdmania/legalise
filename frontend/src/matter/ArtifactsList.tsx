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
import { listArtifacts, type ArtifactSummary } from "../lib/api";

type Query =
  | { status: "loading" }
  | { status: "ready"; rows: ArtifactSummary[] }
  | { status: "error"; message: string };

export function ArtifactsList({ slug }: { slug: string }) {
  const [q, setQ] = useState<Query>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    listArtifacts(slug)
      .then((rows) => {
        if (!cancelled) setQ({ status: "ready", rows });
      })
      .catch((err: unknown) => {
        if (!cancelled) setQ({ status: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">Matter</p>
      <h1 className="mt-2 text-3xl font-serif">Artifacts</h1>
      <p className="mt-1 text-xs font-mono text-muted">{slug}</p>
      <p className="mt-3 text-sm text-muted">
        Outputs written by capabilities invoked on this matter. Each row
        links to a structured payload view.
      </p>

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
