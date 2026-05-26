/**
 * Phase 14 D — /matters/{slug}/artifacts/{artifactId}.
 *
 * Hits Phase 13b A's `GET /api/matters/{slug}/artifacts/{id}` which
 * returns ArtifactSummary fields + parsed `payload`. Kind-aware
 * rendering via ArtifactPreview.
 *
 * Deep-link to reconstruction: the result panel + this page both link
 * to `/matters/{slug}/audit?invocation_id=<id>`. That route is
 * registered (Phase 14 A0 placeholder); the query-param contract
 * here is the one Phase 14 E will honour. Unlike the Phase 14 B
 * `/admin/audit` redline, this link goes to a route that exists.
 *
 * Per Phase 13b Decision #1, reads do NOT emit audit — substrate-
 * verified at artifacts.py.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { readArtifact, type ArtifactRead } from "../lib/api";
import { ArtifactPreview } from "./ArtifactPreview";

type Query =
  | { status: "loading" }
  | { status: "ready"; artifact: ArtifactRead }
  | { status: "error"; message: string };

export function ArtifactDetail({
  slug,
  artifactId,
}: {
  slug: string;
  artifactId: string;
}) {
  const [q, setQ] = useState<Query>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    readArtifact(slug, artifactId)
      .then((artifact) => {
        if (!cancelled) setQ({ status: "ready", artifact });
      })
      .catch((err: unknown) => {
        if (!cancelled) setQ({ status: "error", message: String(err) });
      });
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
        <h1 className="text-xl font-serif">Artifact not found</h1>
        <p className="mt-3 text-sm text-muted">{q.message}</p>
        <p className="mt-4 text-sm">
          <Link
            to="/matters/$slug/artifacts"
            params={{ slug }}
            className="underline underline-offset-4 hover:text-ink"
          >
            ← All artifacts
          </Link>
        </p>
      </div>
    );
  }

  const a = q.artifact;
  const auditHref = `/matters/${encodeURIComponent(slug)}/audit?invocation_id=${encodeURIComponent(a.invocation_id)}`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">Artifact</p>
      <h1 className="mt-2 text-3xl font-serif">{a.kind}</h1>
      <p className="mt-1 text-xs font-mono text-muted">{a.id}</p>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <DT label="Module">
          <code className="font-mono text-xs">{a.module_id}</code>
        </DT>
        <DT label="Capability">
          <code className="font-mono text-xs">{a.capability_id}</code>
        </DT>
        <DT label="Invocation">
          <code className="font-mono text-xs">{a.invocation_id}</code>
        </DT>
        <DT label="Size">
          <span>{a.size_bytes.toLocaleString()} bytes</span>
        </DT>
        <DT label="Created">
          <span>{a.created_at.replace("T", " ").slice(0, 19)}</span>
        </DT>
      </dl>

      <section className="mt-8">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Payload
        </h2>
        <ArtifactPreview payload={a.payload} kindHint={a.kind} />
      </section>

      <section className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          to="/matters/$slug/artifacts"
          params={{ slug }}
          className="text-muted underline underline-offset-4 hover:text-ink"
        >
          ← All artifacts
        </Link>
        <a
          href={auditHref}
          className="text-muted underline underline-offset-4 hover:text-ink"
        >
          See audit trail for this invocation
        </a>
      </section>
    </div>
  );
}

function DT({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
