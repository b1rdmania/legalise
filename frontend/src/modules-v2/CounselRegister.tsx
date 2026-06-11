/**
 * /register — the Counsel Register.
 *
 * Idea A from the standing reframe: render the workspace's installed
 * skills as entries in a register of AI counsel. A pure renderer over
 * the installed manifests — no second database, no new writes. Each
 * certificate states what the record already holds: publisher
 * (chambers), permission bands, advice ceiling, signature status,
 * pinned source, date of admission.
 *
 * Design: Standing Order (the artist pass) — ink/paper/seal only,
 * Didone monument + clerk's ledger, red spent like money. A revoked
 * counsel is shown struck, with the same fidelity as the admitted.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listInstalledModules, type InstalledModule } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

const TIERS = [
  "factual_extraction",
  "legal_information",
  "draft_advice",
  "supervised_legal_advice",
  "approved_final_advice",
] as const;

type Query =
  | { status: "loading" }
  | { status: "ready"; rows: InstalledModule[] }
  | { status: "error"; message: string };

function capList(row: InstalledModule, key: "reads" | "writes"): string[] {
  const out = new Set<string>();
  for (const raw of row.capabilities ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const values = (raw as Record<string, unknown>)[key];
    if (!Array.isArray(values)) continue;
    for (const v of values) if (typeof v === "string") out.add(v);
  }
  return [...out].sort();
}

function adviceTier(row: InstalledModule): string {
  let highest = 0;
  for (const raw of row.capabilities ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const t = (raw as Record<string, unknown>).advice_tier_max;
    const idx = TIERS.indexOf(t as (typeof TIERS)[number]);
    if (idx > highest) highest = idx;
  }
  return TIERS[highest];
}

function displayName(row: InstalledModule): string {
  if (row.name) return row.name;
  const tail = row.module_id.split(".").pop() ?? row.module_id;
  return tail
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function sourceRef(row: InstalledModule): { label: string; href: string } | null {
  const p = row.install_path;
  if (!p || !p.startsWith("http")) return null;
  const m = p.match(/github\.com\/([^/]+\/[^/]+)(?:\/tree\/([^/]+))?/);
  if (!m) return { label: p.replace(/^https?:\/\//, ""), href: p };
  return {
    label: `${m[1]}${m[2] ? ` @ ${m[2].slice(0, 8)}` : ""}`,
    href: p,
  };
}

export function CounselRegister() {
  const auth = useAuth();
  const [q, setQ] = useState<Query>({ status: "loading" });

  useEffect(() => {
    if (!auth.user) return;
    let cancelled = false;
    listInstalledModules()
      .then((rows) => {
        if (!cancelled) setQ({ status: "ready", rows });
      })
      .catch((err: unknown) => {
        if (!cancelled) setQ({ status: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [auth.user]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-14 text-ink">
      <div className="flex items-baseline justify-between border-b border-ink pb-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
          The register of AI counsel · series 1
        </p>
        <p className="text-[10px] uppercase tracking-[0.3em] text-ink">
          Legalise
        </p>
      </div>

      <h1 className="mt-8 font-redaction35 text-[64px] leading-none tracking-tight2 sm:text-[88px]">
        Standing
      </h1>
      <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-muted">
        over capability
      </p>

      <p className="mt-8 max-w-xl text-sm leading-relaxed text-prose">
        The register does not say what counsel can do. It says what counsel
        has been admitted to do under supervision — which matters it may
        read, what it may write, the ceiling on its advice, and who vouched
        for it. Admission is the trust ceremony; every entry below is
        derived from the signed record, nothing else.
      </p>

      {q.status === "loading" && (
        <p className="mt-12 text-sm text-muted">Opening the register…</p>
      )}
      {q.status === "error" && (
        <p className="mt-12 text-sm text-seal">
          Could not open the register: {q.message}
        </p>
      )}

      {q.status === "ready" && q.rows.length === 0 && (
        <div className="mt-12 border border-rule bg-paper p-6">
          <p className="text-sm text-prose">
            No counsel hold standing in this workspace yet.
          </p>
          <Link
            to="/skills/lawve"
            className="mt-3 inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-seal"
          >
            Instruct your first counsel
          </Link>
        </div>
      )}

      {q.status === "ready" && q.rows.length > 0 && (
        <div className="mt-12 grid gap-6 sm:grid-cols-2" data-testid="register-grid">
          {q.rows.map((row, i) => (
            <Certificate key={row.module_id} row={row} index={i} />
          ))}
        </div>
      )}

      <p className="mt-14 border-t border-rule pt-3 text-[10px] uppercase tracking-[0.2em] text-muted">
        Refusals and revocations are recorded with the same fidelity as
        admissions — the record testifies against itself when it must.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Certificate({ row, index }: { row: InstalledModule; index: number }) {
  const reads = capList(row, "reads");
  const writes = capList(row, "writes");
  const tier = adviceTier(row);
  const tierIdx = TIERS.indexOf(tier as (typeof TIERS)[number]);
  const src = sourceRef(row);
  const verified = row.signature_status === "structure_verified";
  const revoked = !row.enabled;
  const admitted = new Date(row.installed_at);

  return (
    <article
      className={
        "relative border bg-paper p-5 " +
        (revoked ? "border-seal/40" : "border-ink/70")
      }
      data-testid={`certificate-${row.module_id}`}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
          Counsel {String(index + 1).padStart(2, "0")}
        </p>
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
          {row.visibility?.replaceAll("_", " ")}
        </p>
      </div>

      <h2
        className={
          "mt-3 text-[22px] leading-tight tracking-tight2 " +
          (revoked ? "text-seal line-through decoration-1" : "text-ink")
        }
      >
        {displayName(row)}
      </h2>
      <p className="mt-1 text-xs text-muted">
        {row.publisher} (chambers) · v{row.version}
      </p>

      {/* Practice bands — what the counsel may read and write. */}
      <div className="mt-4 space-y-2">
        <Band label="Reads" values={reads} />
        <Band label="Writes" values={writes} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-rule pt-3">
        <span
          aria-label={`advice ceiling: ${tier.replaceAll("_", " ")}`}
          className="tracking-[0.25em] text-ink text-sm"
        >
          {TIERS.map((_t, i) => (i <= tierIdx ? "●" : "○")).join("")}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
          {tier.replaceAll("_", " ")}
        </span>
      </div>

      <TrackRecord record={row.track_record ?? {}} />

      <dl className="mt-3 space-y-1 text-[11px] text-muted">
        <div className="flex justify-between gap-3">
          <dt className="uppercase tracking-[0.18em]">Signature</dt>
          <dd className={verified ? "text-ink" : ""}>
            {(row.signature_status ?? "unknown").replaceAll("_", " ")}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="uppercase tracking-[0.18em]">Admitted</dt>
          <dd>
            {admitted.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </dd>
        </div>
        {src && (
          <div className="flex justify-between gap-3">
            <dt className="uppercase tracking-[0.18em]">Source</dt>
            <dd className="truncate">
              <a
                href={src.href}
                target="_blank"
                rel="noreferrer"
                className="tech-token hover:underline"
              >
                {src.label}
              </a>
            </dd>
          </div>
        )}
        {revoked && (
          <div className="flex justify-between gap-3 text-seal">
            <dt className="uppercase tracking-[0.18em]">Standing</dt>
            <dd>revoked</dd>
          </div>
        )}
      </dl>

      {/* The seal — only counsel with a verified signature carry it. */}
      {verified && !revoked && (
        <span
          aria-label="verified standing"
          className="absolute -right-2 -top-2 flex h-12 w-12 rotate-12 items-center justify-center rounded-full border-2 border-seal text-[8px] uppercase tracking-[0.15em] text-seal"
        >
          Signed
        </span>
      )}
    </article>
  );
}

// Idea C — the supervised track record. What this counsel has done
// under supervision, from the sign-off table: approvals and refusals
// recorded with the same fidelity. The moat is the venue's, not the
// model's.
function TrackRecord({ record }: { record: Record<string, number> }) {
  const signed = record.signed ?? 0;
  const observations = record.signed_with_observations ?? 0;
  const refused = record.rejected ?? 0;
  const total = signed + observations + refused;
  return (
    <div className="mt-3 border-t border-rule pt-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
        Track record
      </p>
      {total === 0 ? (
        <p className="mt-1 text-[11px] text-muted">
          No supervised work signed yet.
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-ink">
          {signed} signed
          {observations > 0 && <> · {observations} with observations</>}
          {refused > 0 && (
            <>
              {" · "}
              <span className="text-seal">{refused} refused</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function Band({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      {values.length === 0 ? (
        <span className="text-[11px] text-muted">—</span>
      ) : (
        <span className="flex min-w-0 flex-1 flex-wrap gap-1" title={values.join(", ")}>
          {values.map((v) => (
            <span
              key={v}
              className="h-2.5 bg-ink"
              style={{ width: `${Math.min(96, 18 + v.length * 4)}px` }}
              title={v}
            />
          ))}
        </span>
      )}
    </div>
  );
}
