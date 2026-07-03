/**
 * /register — "My skills": the skills installed in this workspace,
 * each with what it can read, what it can write, its advice limit, and
 * its track record.
 *
 * A pure renderer over the installed manifests — no second database, no
 * new writes. Each card states what the record already holds: publisher,
 * permissions, advice limit, signature status, source, date added. The
 * standing/admission metaphor lives on the public /architecture page;
 * this is a working tool, so the copy is plain.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  formatReviewDuration,
  listInstalledModules,
  type InstalledModule,
} from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { ExternalPacksSection } from "./ExternalPacks";

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
    <div className="page-shell">
      <h1 className="font-redaction35 text-[64px] leading-none tracking-tight2 sm:text-[88px]">
        My skills
      </h1>

      <p className="mt-8 max-w-xl text-sm leading-relaxed text-prose">
        The skills installed in this workspace. Each one shows what it can
        read, what it can write, its advice limit, and its track record. To
        browse and add more, go to the Skill library.
      </p>

      {q.status === "loading" && (
        <p className="mt-12 text-sm text-muted">Loading your skills…</p>
      )}
      {q.status === "error" && (
        <p className="mt-12 text-sm text-seal">
          Could not load your skills: {q.message}
        </p>
      )}

      {q.status === "ready" && q.rows.length === 0 && (
        <div className="mt-12 border border-rule bg-paper p-6">
          <p className="text-sm text-prose">
            You haven't added any skills to this workspace yet.
          </p>
          <Link
            to="/skills/lawve"
            className="mt-3 inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-seal"
          >
            Add your first skill
          </Link>
        </div>
      )}

      {q.status === "ready" && q.rows.length > 0 && (
        <>
          <p className="mt-12 text-[11px] text-muted" data-testid="advice-ceiling-legend">
            Advice ceiling — how far a skill may go, from factual extraction
            (●○○○○) to approved final advice (●●●●●).
          </p>
          <div className="mt-4 grid gap-6 sm:grid-cols-2" data-testid="register-grid">
          {q.rows.map((row, i) => (
            <Certificate key={row.module_id} row={row} index={i} />
          ))}
          </div>
        </>
      )}

      <ExternalPacksSection />

      <p className="mt-14 border-t border-rule pt-3 text-[10px] uppercase tracking-[0.2em] text-muted">
        Refusals and removals are recorded the same way as approvals.
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
  // "verified" = real ed25519 provenance; "structure_verified" = shape-only
  // check against the publisher registry. Both carry standing on the register.
  const verified =
    row.signature_status === "verified" ||
    row.signature_status === "structure_verified";
  const revoked = !row.enabled;
  const admitted = new Date(row.installed_at);

  return (
    <Link
      to="/skills/$moduleId"
      params={{ moduleId: row.module_id }}
      className={
        "relative block border bg-paper p-5 transition-opacity hover:opacity-80 " +
        (revoked ? "border-seal/40" : "border-ink/70")
      }
      data-testid={`certificate-${row.module_id}`}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
          Skill {String(index + 1).padStart(2, "0")}
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
        {row.publisher} · v{row.version}
      </p>

      {/* What this skill may read and write. */}
      <div className="mt-4 space-y-2">
        <Band label="Reads" values={reads} />
        <Band label="Writes" values={writes} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-rule pt-3">
        <span
          aria-label={`advice ceiling: ${tier.replaceAll("_", " ")}`}
          title={`Advice ceiling — how far this skill may go: ${tier.replaceAll("_", " ")} (${tierIdx + 1} of ${TIERS.length}, from factual extraction to approved final advice)`}
          className="tracking-[0.25em] text-ink text-sm"
        >
          {TIERS.map((_t, i) => (i <= tierIdx ? "●" : "○")).join("")}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
          {tier.replaceAll("_", " ")}
        </span>
      </div>

      <TrackRecord
        record={row.track_record ?? {}}
        medianReviewSeconds={row.track_median_review_seconds ?? null}
        latencyN={row.track_review_latency_n ?? 0}
      />

      <dl className="mt-3 space-y-1 text-[11px] text-muted">
        <div className="flex justify-between gap-3">
          <dt className="uppercase tracking-[0.18em]">Signature</dt>
          <dd className={verified ? "text-ink" : ""}>
            {(row.signature_status ?? "unknown").replaceAll("_", " ")}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="uppercase tracking-[0.18em]">Added</dt>
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
            <dd className="truncate tech-token">{src.label}</dd>
          </div>
        )}
        {revoked && (
          <div className="flex justify-between gap-3 text-seal">
            <dt className="uppercase tracking-[0.18em]">Status</dt>
            <dd>removed</dd>
          </div>
        )}
      </dl>

      {revoked && (
        <p className="mt-2 text-[11px] text-muted" data-testid="superseded-note">
          Superseded — re-import from its current source to use again.
        </p>
      )}

      {/* The seal — only a skill with a verified signature carries it. */}
      {verified && !revoked && (
        <span
          aria-label="verified signature"
          className="absolute -right-2 -top-2 flex h-12 w-12 rotate-12 items-center justify-center rounded-full border-2 border-seal text-[8px] uppercase tracking-[0.15em] text-seal"
        >
          Signed
        </span>
      )}
    </Link>
  );
}

// Idea C — the supervised track record. What this counsel has done
// under supervision, from the sign-off table: approvals and refusals
// recorded with the same fidelity. The moat is the venue's, not the
// model's.
// A track record with fewer than this many decisions carries the
// honesty label — sub-n=30 medians are anecdotes, not statistics
// (docs/spec/SUPERVISION_LEGIBILITY_M13.md).
const TRACK_RECORD_HONEST_N = 30;

export function TrackRecord({
  record,
  medianReviewSeconds = null,
  latencyN = 0,
}: {
  record: Record<string, number>;
  medianReviewSeconds?: number | null;
  latencyN?: number;
}) {
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
        <>
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
          {/* Median review latency — evidence of attention, not proof
              of quality. "—" = no derivable review window yet. */}
          <p className="mt-1 text-[11px] text-muted" data-testid="track-record-latency">
            median review{" "}
            {medianReviewSeconds === null
              ? "—"
              : formatReviewDuration(medianReviewSeconds)}{" "}
            · n={latencyN}
            {latencyN < TRACK_RECORD_HONEST_N && (
              <span data-testid="track-record-low-n"> — too few to mean much</span>
            )}
          </p>
        </>
      )}
    </div>
  );
}

function Band({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-12 shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      {values.length === 0 ? (
        <span className="text-[11px] text-muted">nothing</span>
      ) : (
        <span className="min-w-0 flex-1 text-[11px] text-ink">
          {values.map((v) => v.replaceAll("_", " ")).join(" · ")}
        </span>
      )}
    </div>
  );
}
