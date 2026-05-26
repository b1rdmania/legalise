/**
 * Phase 14 B — /modules/{module_id} detail.
 *
 * Renders the v2 manifest in three sections:
 *   1. Header — name / id / version / publisher / visibility / description
 *   2. Capabilities — table of declared capabilities
 *   3. Lifecycle controls — Install CTA (always), Update + Revoke (admin)
 *
 * Reviewer-narrow:
 *   - No live "installed vs not" badge (substrate gap, see
 *     BACKEND_GAP_AUDIT finding 14-B-#1). Update + Revoke surface 404
 *     inline if the module isn't installed yet.
 *   - Install CTA POSTs to /api/modules/install and navigates to
 *     /modules/install/{ceremony_id}. The stepper UI lives in
 *     InstallCeremony.tsx — this page does NOT inline the ceremony.
 *
 * Authority gating (load-bearing — no smuggled authority per
 * ACCEPTANCE.md §12):
 *   - Install   → superuser only (substrate enforces via
 *                 require_admin at modules.py:678)
 *   - Update    → superuser only (require_admin at modules.py:997)
 *   - Revoke    → superuser only (require_admin at modules.py:911)
 *   Non-admins see an explainer and the CTAs are hidden / disabled —
 *   we don't render an Install button that 403s.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getModuleV2,
  revokeModuleV2,
  startInstall,
  updateModuleV2,
  type V2ManifestEntry,
} from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

type DetailQuery =
  | { status: "loading" }
  | { status: "ready"; entry: V2ManifestEntry }
  | { status: "error"; message: string };

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

  if (q.status === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted">
        Loading module…
      </div>
    );
  }
  if (q.status === "error") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-xl font-serif">Module not found</h1>
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
  const isAdmin = auth.user?.is_superuser === true;

  const onInstall = async () => {
    setLife({ kind: "installing" });
    try {
      const ceremony = await startInstall({
        source: "registry",
        module_id: entry.module_id,
      });
      void nav({
        to: "/modules/install/$ceremonyId",
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
          to: "/modules/install/$ceremonyId",
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
        message: `Revoked. ${res.disabled_rows} installed row(s) disabled, ${res.revoked_grants} grant(s) removed.`,
      });
    } catch (err) {
      const msg = String(err);
      // 404 = not installed; surface a friendly inline message.
      if (/404/.test(msg) || /not.*install/i.test(msg)) {
        setLife({
          kind: "info",
          message: "Module is not currently installed.",
        });
      } else {
        setLife({ kind: "error", message: msg });
      }
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">Module</p>
      <h1 className="mt-2 text-3xl font-serif">{name}</h1>
      <p className="mt-1 text-xs font-mono text-muted">{entry.module_id}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        {version && <span>v{version}</span>}
        {publisher && <span>by {publisher}</span>}
        {visibility && (
          <span className="rounded-sm border border-line px-1.5 py-0.5 text-xs">
            {visibility}
          </span>
        )}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-4 hover:text-ink"
          >
            source
          </a>
        )}
      </div>

      {description && (
        <p className="mt-6 text-muted">{description}</p>
      )}

      {!entry.is_valid && (
        <div className="mt-6 rounded-md border border-seal/40 bg-seal/5 px-4 py-3">
          <p className="text-sm font-medium text-seal">Manifest invalid</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted">
            {entry.validation_errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.path}</span>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Capabilities */}
      <section className="mt-10">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Capabilities
        </h2>
        {caps.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No capabilities declared.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-md border border-line">
            <table className="min-w-full text-sm">
              <thead className="bg-paper-sunken text-xs uppercase tracking-widest text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Id</th>
                  <th className="px-3 py-2 text-left">Kind</th>
                  <th className="px-3 py-2 text-left">Scope</th>
                  <th className="px-3 py-2 text-left">Advice tier</th>
                  <th className="px-3 py-2 text-left">Network</th>
                </tr>
              </thead>
              <tbody>
                {caps.map((c, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-2 font-mono text-xs">{c.id ?? "—"}</td>
                    <td className="px-3 py-2">{c.kind ?? "—"}</td>
                    <td className="px-3 py-2">{c.scope ?? "—"}</td>
                    <td className="px-3 py-2">{c.advice_tier_max ?? "—"}</td>
                    <td className="px-3 py-2">
                      {c.external_network ? "external" : "internal"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Lifecycle controls */}
      <section className="mt-10">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Lifecycle
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={onInstall}
                disabled={life.kind === "installing" || !entry.is_valid}
                className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-paper hover:opacity-90 disabled:opacity-50"
              >
                {life.kind === "installing" ? "Starting ceremony…" : "Install"}
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
            <p className="text-sm text-muted">
              Install, update, and revoke require superuser. Ask your
              workspace administrator to install this module.
            </p>
          )}
        </div>
        {updateOpen && isAdmin && (
          <div className="mt-4 rounded-md border border-line p-3">
            <p className="text-xs text-muted">
              Paste the new v2 manifest JSON. If the new permissions
              expand on the installed snapshot, a fresh trust ceremony
              starts. Otherwise the row updates in place.
            </p>
            <textarea
              value={updateJson}
              onChange={(e) => setUpdateJson(e.target.value)}
              rows={8}
              spellCheck={false}
              className="mt-2 w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs"
              placeholder='{ "schema_version": "2.0.0", "id": "...", "version": "...", "publisher": "...", "visibility": "...", "runtime": "...", "entrypoint": {...}, "capabilities": [...] }'
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onUpdate}
                disabled={life.kind === "updating" || !updateJson.trim()}
                className="inline-flex items-center rounded-md bg-ink px-3 py-1.5 text-paper hover:opacity-90 disabled:opacity-50"
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
    </div>
  );
}
