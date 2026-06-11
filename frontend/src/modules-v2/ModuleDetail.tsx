/**
 * /modules/{module_id} detail.
 *
 * Renders the v2 manifest in three sections:
 *   1. Header — name / id / version / publisher / visibility / description
 *   2. Capabilities — table of declared capabilities
 *   3. Lifecycle controls — Add CTA (always), Update + Revoke (admin)
 *
 * The installed/disabled state IS derivable frontend-side via
 * listInstalledModules() — GrantsPanel already consumes it — so this
 * page shows a truthful add-status badge. No backend work
 * required.
 *
 * Reviewer-narrow:
 *   - Add CTA POSTs to /api/modules/install and navigates to
 *     /modules/install/{ceremony_id}. The stepper UI lives in
 *     InstallCeremony.tsx — this page does NOT inline the ceremony.
 *
 * Authority gating (load-bearing — no smuggled authority):
 *   - Add       → superuser only (substrate enforces via
 *                 require_admin at modules.py:678)
 *   - Update    → superuser only (require_admin at modules.py:997)
 *   - Revoke    → superuser only (require_admin at modules.py:911)
 *   Non-admins see an explainer and the CTAs are hidden / disabled —
 *   we don't render an Add button that 403s.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getModuleV2,
  listInstalledModules,
  revokeModuleV2,
  startInstall,
  updateModuleV2,
  type InstalledModule,
  type V2ManifestEntry,
} from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import {
  CertCard,
  CertEyebrow,
  InkBands,
  LedgerRow,
  SectionRule,
} from "../ui/certificate";
import { RequestSkillButton } from "./RequestSkillButton";

type DetailQuery =
  | { status: "loading" }
  | { status: "ready"; entry: V2ManifestEntry }
  | { status: "error"; message: string };

// Add status is best-effort: if the installed-modules fetch fails
// (anon race, network blip) we render nothing rather than guess.
type InstallStatus =
  | { kind: "unknown" }
  | { kind: "not_installed" }
  | { kind: "installed"; row: InstalledModule };

type LifecycleState =
  | { kind: "idle" }
  | { kind: "installing" }
  | { kind: "revoking" }
  | { kind: "updating" }
  | { kind: "error"; message: string }
  | { kind: "info"; message: string };

interface CapabilityRow {
  id?: string;
  kind?: string;
  scope?: string;
  ui_slot?: string;
  reads?: string[];
  writes?: string[];
  external_network?: boolean;
  advice_tier_max?: string;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function capabilitiesOf(entry: V2ManifestEntry): CapabilityRow[] {
  const caps = (entry.manifest as Record<string, unknown>).capabilities;
  if (!Array.isArray(caps)) return [];
  return caps.map((raw) => {
    const c = (raw ?? {}) as Record<string, unknown>;
    return {
      id: asString(c.id) ?? asString(c.capability_id),
      kind: asString(c.kind),
      scope: asString(c.scope),
      ui_slot: asString(c.ui_slot),
      reads: asStringArray(c.reads),
      writes: asStringArray(c.writes),
      external_network: c.external_network === true,
      advice_tier_max: asString(c.advice_tier_max),
    };
  });
}

export function ModuleDetail({ moduleId }: { moduleId: string }) {
  const auth = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState<DetailQuery>({ status: "loading" });
  const [life, setLife] = useState<LifecycleState>({ kind: "idle" });
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateJson, setUpdateJson] = useState("");
  const [installStatus, setInstallStatus] = useState<InstallStatus>({
    kind: "unknown",
  });

  useEffect(() => {
    let cancelled = false;
    getModuleV2(moduleId)
      .then((entry) => {
        if (!cancelled) setQ({ status: "ready", entry });
      })
      .catch((err: unknown) => {
        if (!cancelled) setQ({ status: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  // Derive install status from the existing installed-
  // modules listing. Best-effort: on any failure stay "unknown" and
  // render no badge rather than imply a state we can't confirm.
  useEffect(() => {
    let cancelled = false;
    listInstalledModules()
      .then((rows) => {
        if (cancelled) return;
        const row = rows.find((r) => r.module_id === moduleId);
        setInstallStatus(row ? { kind: "installed", row } : { kind: "not_installed" });
      })
      .catch(() => {
        if (!cancelled) setInstallStatus({ kind: "unknown" });
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId, life.kind]);

  if (q.status === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted">
        Loading skill…
      </div>
    );
  }
  if (q.status === "error") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-xl font-bold tracking-tight2">Skill not found</h1>
        <p className="mt-3 text-sm text-muted">{q.message}</p>
      </div>
    );
  }

  const entry = q.entry;
  const name = asString((entry.manifest as Record<string, unknown>).name) ?? entry.module_id;
  const version = asString((entry.manifest as Record<string, unknown>).version);
  const publisher = asString((entry.manifest as Record<string, unknown>).publisher);
  const visibility = asString((entry.manifest as Record<string, unknown>).visibility);
  const description = asString((entry.manifest as Record<string, unknown>).description);
  const sourceUrl = asString((entry.manifest as Record<string, unknown>).source_url);
  const caps = capabilitiesOf(entry);
  const reads = [...new Set(caps.flatMap((c) => c.reads ?? []))].sort();
  const writes = [...new Set(caps.flatMap((c) => c.writes ?? []))].sort();
  const installedRow = installStatus.kind === "installed" ? installStatus.row : null;
  const revoked = installedRow !== null && !installedRow.enabled;
  const isAdmin = auth.user?.is_superuser === true;

  const onInstall = async () => {
    setLife({ kind: "installing" });
    try {
      const ceremony = await startInstall({
        source: "registry",
        module_id: entry.module_id,
      });
      void nav({
        to: "/skills/install/$ceremonyId",
        params: { ceremonyId: ceremony.ceremony_id },
      });
    } catch (err) {
      setLife({ kind: "error", message: String(err) });
    }
  };

  const onUpdate = async () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(updateJson) as Record<string, unknown>;
    } catch (err) {
      setLife({ kind: "error", message: `Manifest is not valid JSON: ${String(err)}` });
      return;
    }
    setLife({ kind: "updating" });
    try {
      const res = await updateModuleV2(entry.module_id, { new_manifest: parsed });
      if (res.expansion_detected && res.ceremony_id) {
        void nav({
          to: "/skills/install/$ceremonyId",
          params: { ceremonyId: res.ceremony_id },
        });
        return;
      }
      setLife({
        kind: "info",
        message: `Updated to v${res.new_version}. No permission expansion; no re-grant needed.`,
      });
      setUpdateOpen(false);
    } catch (err) {
      setLife({ kind: "error", message: String(err) });
    }
  };

  const onRevoke = async () => {
    setLife({ kind: "revoking" });
    try {
      const res = await revokeModuleV2(entry.module_id);
      setLife({
        kind: "info",
        message: `Revoked. ${res.disabled_rows} added row(s) disabled, ${res.revoked_grants} grant(s) removed.`,
      });
    } catch (err) {
      const msg = String(err);
      // 404 = not added; surface a friendly inline message.
      if (/404/.test(msg) || /not.*install/i.test(msg)) {
        setLife({
          kind: "info",
          message: "Skill is not currently added.",
        });
      } else {
        setLife({ kind: "error", message: msg });
      }
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-ink">
      {/* Masthead — ruled eyebrow row; the certificate below is the hero. */}
      <div className="flex items-baseline justify-between border-b border-ink pb-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
          From the skill library
        </p>
        <p className="text-[10px] uppercase tracking-[0.3em] text-ink">
          Legalise
        </p>
      </div>

      {description && (
        <p className="mt-8 max-w-xl text-sm leading-relaxed text-prose">
          {description}
        </p>
      )}

      {/* The certificate — this page is the skill's entry, stated the way
          the register states it. Every field below is already held by the
          manifest or the installed row; nothing is invented. */}
      <div className="mt-8">
        <CertCard tone={revoked ? "seal" : "ink"} testid="skill-certificate">
          <CertEyebrow
            left="Skill"
            right={visibility ? visibility.replaceAll("_", " ") : undefined}
          />
          <h1
            className={
              "mt-3 text-[22px] leading-tight tracking-tight2 " +
              (revoked ? "text-seal line-through decoration-1" : "text-ink")
            }
          >
            {name}
          </h1>
          <p className="mt-1 text-xs text-muted">
            {publisher ? `${publisher} (chambers) · ` : ""}
            <span className="tech-token">{entry.module_id}</span>
          </p>
          <div className="mt-4 space-y-2">
            <InkBands label="Reads" values={reads} />
            <InkBands label="Writes" values={writes} />
          </div>
          <dl className="mt-4 space-y-1 border-t border-rule pt-3 text-[11px] text-muted">
            <LedgerRow label="Permission sets">
              {caps.length}
              {!entry.is_valid ? " · manifest invalid" : ""}
            </LedgerRow>
            <LedgerRow
              label="Signature"
              tone={
                installedRow &&
                (installedRow.signature_status === "verified" ||
                  installedRow.signature_status === "structure_verified")
                  ? "ink"
                  : "muted"
              }
            >
              {(installedRow?.signature_status ?? "not yet inspected").replaceAll(
                "_",
                " ",
              )}
            </LedgerRow>
            {version && <LedgerRow label="Version">v{version}</LedgerRow>}
            {installStatus.kind !== "unknown" && (
              <LedgerRow
                label="Standing"
                tone={revoked ? "seal" : installedRow ? "ink" : "muted"}
              >
                {installedRow
                  ? installedRow.enabled
                    ? "Added"
                    : "Added · disabled"
                  : "Not added"}
              </LedgerRow>
            )}
            {sourceUrl && (
              <LedgerRow label="Source">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="tech-token hover:underline"
                >
                  {sourceUrl.replace(/^https?:\/\//, "")}
                </a>
              </LedgerRow>
            )}
          </dl>
        </CertCard>
      </div>

      {/* Lifecycle controls */}
      <section className="mt-6">
        <SectionRule label="Lifecycle" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={onInstall}
                disabled={life.kind === "installing" || !entry.is_valid}
                className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-paper hover:bg-seal disabled:opacity-50"
              >
                {life.kind === "installing" ? "Starting ceremony…" : "Add skill"}
              </button>
              <button
                type="button"
                onClick={() => setUpdateOpen((v) => !v)}
                className="inline-flex items-center rounded-md border border-line px-4 py-2 hover:border-ink"
              >
                Update
              </button>
              <button
                type="button"
                onClick={onRevoke}
                disabled={life.kind === "revoking"}
                className="inline-flex items-center rounded-md border border-line px-4 py-2 hover:border-ink disabled:opacity-50"
              >
                {life.kind === "revoking" ? "Revoking…" : "Revoke"}
              </button>
            </>
          ) : (
            <div>
              <p className="text-sm text-muted">
                Adding a skill is an administrator action.
              </p>
              <div className="mt-2">
                <RequestSkillButton moduleId={entry.module_id} source="registry" />
              </div>
            </div>
          )}
        </div>
        {updateOpen && isAdmin && (
          <div className="mt-4 rounded-md border border-line p-3">
            <p className="text-xs text-muted">
              Paste the new v2 manifest JSON. If the new permissions
              expand on the added snapshot, a fresh trust ceremony
              starts. Otherwise the row updates in place.
            </p>
            <textarea
              value={updateJson}
              onChange={(e) => setUpdateJson(e.target.value)}
              rows={8}
              spellCheck={false}
              className="mt-2 w-full rounded-md border border-line bg-paper px-3 py-2 tech-token text-xs"
              placeholder='{ "schema_version": "2.0.0", "id": "...", "version": "...", "publisher": "...", "visibility": "...", "runtime": "...", "entrypoint": {...}, "capabilities": [...] }'
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onUpdate}
                disabled={life.kind === "updating" || !updateJson.trim()}
                className="inline-flex items-center rounded-md bg-ink px-3 py-1.5 text-paper hover:bg-seal disabled:opacity-50"
              >
                {life.kind === "updating" ? "Submitting…" : "Submit update"}
              </button>
              <button
                type="button"
                onClick={() => setUpdateOpen(false)}
                className="inline-flex items-center rounded-md px-3 py-1.5 text-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {life.kind === "error" && (
          <p className="mt-3 text-sm text-seal">{life.message}</p>
        )}
        {life.kind === "info" && (
          <p className="mt-3 text-sm text-muted">{life.message}</p>
        )}
      </section>

      {!entry.is_valid && (
        <div className="mt-6 rounded-md border border-seal/40 bg-seal/5 px-4 py-3">
          <p className="text-sm font-medium text-seal">Manifest invalid</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted">
            {entry.validation_errors.map((e, i) => (
              <li key={i}>
                <span className="tech-token">{e.path}</span>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* What this module needs access to — capabilities framed as a
          permission summary rather than a raw manifest table. Raw
          identifiers stay available in small mono so nothing is hidden. */}
      <section className="mt-10">
        <SectionRule
          label="What this skill needs access to"
          right={caps.length > 0 ? String(caps.length) : undefined}
        />
        {caps.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No permissions declared.
          </p>
        ) : (
          <ul className="mt-3 space-y-px bg-rule border border-rule">
            {caps.map((c, i) => (
              <CapabilityCard key={c.id ?? i} cap={c} />
            ))}
          </ul>
        )}
      </section>

      {/* Manifest & signature disclosure (blueprint §4A.5 step 5).
          Collapsed by default; opens to show signer status, version,
          add metadata, and validity. Nothing is hidden — these
          fields are all already returned by the substrate. */}
      <ManifestDisclosure entry={entry} installStatus={installStatus} />

    </div>
  );
}

function CapabilityCard({ cap }: { cap: CapabilityRow }) {
  const reads = cap.reads ?? [];
  const writes = cap.writes ?? [];
  return (
    <li className="bg-paper p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="tech-token text-sm text-ink">{cap.id ?? "—"}</p>
        {cap.scope && (
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
            {cap.scope}
          </span>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {reads.length > 0 && <Access label="Reads" items={reads} />}
        {writes.length > 0 && <Access label="Writes" items={writes} />}
        <div>
          <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">Network</dt>
          <dd className="mt-0.5 text-muted">
            {cap.external_network
              ? "Needs external network access"
              : "No external network"}
          </dd>
        </div>
        {cap.advice_tier_max && (
          <div>
            <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">
              Max advice tier
            </dt>
            <dd className="mt-0.5 text-muted">{cap.advice_tier_max}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}

function Access({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">{label}</dt>
      <dd className="mt-0.5 tech-token text-xs text-muted">{items.join(", ")}</dd>
    </div>
  );
}

function ManifestDisclosure({
  entry,
  installStatus,
}: {
  entry: V2ManifestEntry;
  installStatus: InstallStatus;
}) {
  const [open, setOpen] = useState(false);
  const manifest = entry.manifest as Record<string, unknown>;
  const version = typeof manifest.version === "string" ? manifest.version : "—";
  const publisher = typeof manifest.publisher === "string" ? manifest.publisher : "—";
  const visibility = typeof manifest.visibility === "string" ? manifest.visibility : "—";
  const sourceUrl = typeof manifest.source_url === "string" ? manifest.source_url : null;
  const installed = installStatus.kind === "installed" ? installStatus.row : null;
  const signature = installed?.signature_status ?? "not yet inspected";

  return (
    <section className="mt-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="manifest-disclosure-toggle"
        className="flex w-full items-center justify-between border-b border-rule pb-2 text-left"
      >
        <h2 className="text-[10px] uppercase tracking-[0.25em] text-muted">
          Manifest &amp; signature
        </h2>
        <span aria-hidden="true" className="text-xs text-muted">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Field label="Module id" value={entry.module_id} mono />
          <Field label="Version" value={version} mono />
          <Field label="Publisher" value={publisher} />
          <Field label="Visibility" value={visibility} />
          <Field
            label="Signature"
            value={signature}
            mono
            hint={
              installStatus.kind === "installed"
                ? undefined
                : "Signature is verified when a skill is added."
            }
          />
          <Field
            label="Manifest"
            value={entry.is_valid ? "valid" : "invalid"}
          />
          {installed && (
            <>
              <Field
                label="Added"
                value={new Date(installed.installed_at).toLocaleString()}
              />
              <Field
                label="Added by"
                value={installed.installed_by_user_id ?? "—"}
                mono
              />
            </>
          )}
          {sourceUrl && (
            <div className="sm:col-span-2">
              <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">
                Source
              </dt>
              <dd className="mt-0.5">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                >
                  {sourceUrl}
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  mono = false,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-muted">{label}</dt>
      <dd className={"mt-0.5 " + (mono ? "tech-token text-xs" : "text-sm")}>
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
