/**
 * Supervised exports — the register sidecar's face on /register
 * Imported read-only matter bundles.
 *
 * Each certificate is an external workspace's export held under
 * supervision here: where it came from, how many documents, how each
 * hash claim grades (verified at source / attested at ingest /
 * claimed by source — the honesty boundary, counted, never blurred),
 * and what has been signed. "Verified" is only ever a hash this
 * workspace re-checked against received bytes; a manifest-only claim
 * renders as exactly that, a claim.
 * Rendered in the P27 certificate/ledger idiom from ui/certificate.tsx.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listExternalPacks, type ExternalPack } from "../lib/api";
import {
  CertCard,
  CertEyebrow,
  LedgerRow,
  SectionRule,
} from "../ui/certificate";

type Query =
  | { status: "loading" }
  | { status: "ready"; packs: ExternalPack[] }
  | { status: "error" };

export function ExternalPacksSection() {
  const [q, setQ] = useState<Query>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    listExternalPacks()
      .then(({ packs }) => {
        if (!cancelled) setQ({ status: "ready", packs });
      })
      .catch(() => {
        if (!cancelled) setQ({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The section earns its place only when a pack exists — the register
  // page does not advertise an empty drawer.
  if (q.status !== "ready" || q.packs.length === 0) return null;

  return (
    <section className="mt-16" data-testid="external-packs">
      <SectionRule
        label="External exports"
        right={String(q.packs.length).padStart(2, "0")}
      />
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-prose">
        Work done in another workspace, held to account in this one. Each
        pack below is an external export ingested read-only — no model may
        touch it here — with every document's hash claim graded: verified
        at source (the source's hash, re-checked here against the bytes
        the export carried), attested at ingest (hashed here from received
        bytes), or claimed by source (the source's own hash, nothing to
        check it against). Sign-off runs through the same register as
        native work.
      </p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {q.packs.map((pack, i) => (
          <PackCertificate key={pack.matter_id} pack={pack} index={i} />
        ))}
      </div>
    </section>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PackCertificate({
  pack,
  index,
}: {
  pack: ExternalPack;
  index: number;
}) {
  const c = pack.counts;
  const mismatches = c.hash_mismatches ?? 0;
  const signedTotal =
    pack.signoffs.signed + pack.signoffs.signed_with_observations;
  return (
    <CertCard
      tone={mismatches > 0 ? "seal" : "ink"}
      testid={`external-pack-${pack.matter_slug}`}
    >
      <CertEyebrow
        left={`Pack ${String(index + 1).padStart(2, "0")}`}
        right={pack.source}
      />
      <h2 className="mt-3 text-[22px] leading-tight tracking-tight2 text-ink">
        <Link
          to="/matters/$slug"
          params={{ slug: pack.matter_slug }}
          className="hover:underline"
        >
          {pack.title}
        </Link>
      </h2>
      <p className="mt-1 text-xs text-muted">
        ingested {formatDate(pack.ingested_at)} · exported{" "}
        {formatDate(pack.exported_at)}
      </p>

      <dl className="mt-4 space-y-1 text-[11px] text-muted">
        <LedgerRow label="Documents">
          <span data-testid="pack-doc-count">{c.documents ?? 0}</span>
        </LedgerRow>
        <LedgerRow label="Verified at source" tone="ink">
          <span
            data-testid="pack-verified-count"
            title="Source hash re-checked here against the bytes the export carried — matched"
          >
            {c.verified_at_source ?? 0}
          </span>
        </LedgerRow>
        <LedgerRow label="Attested at ingest">
          <span
            data-testid="pack-attested-count"
            title="Hashed here from the bytes the export carried"
          >
            {c.attested_at_ingest ?? 0}
          </span>
        </LedgerRow>
        {(c.claimed_by_source ?? 0) > 0 && (
          <LedgerRow label="Claimed by source — unchecked">
            <span
              data-testid="pack-claimed-count"
              title="The source's own hash; no bytes travelled, so nothing was checked"
            >
              {c.claimed_by_source}
            </span>
          </LedgerRow>
        )}
        {(c.unhashed ?? 0) > 0 && (
          <LedgerRow label="Unhashed">{c.unhashed}</LedgerRow>
        )}
        {mismatches > 0 && (
          <LedgerRow label="Hash mismatches" tone="seal">
            <span data-testid="pack-mismatch-count">{mismatches}</span>
          </LedgerRow>
        )}
        <LedgerRow label="Sign-offs" tone={signedTotal > 0 ? "ink" : "muted"}>
          <span data-testid="pack-signoffs">
            {pack.signoffs.total === 0
              ? "none yet"
              : [
                  pack.signoffs.signed > 0 &&
                    `${pack.signoffs.signed} signed`,
                  pack.signoffs.signed_with_observations > 0 &&
                    `${pack.signoffs.signed_with_observations} with observations`,
                  pack.signoffs.rejected > 0 &&
                    `${pack.signoffs.rejected} refused`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </LedgerRow>
      </dl>
    </CertCard>
  );
}
