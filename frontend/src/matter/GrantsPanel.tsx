/**
 * Phase 14 C — matter-scoped grants panel.
 *
 * Renders:
 *   - Current grants on this matter (one row per plugin/skill/capability)
 *     with a Revoke button per row.
 *   - Add-grant control: pick a module → pick a capability → POST.
 *
 * Substrate truth (backend/app/api/grants.py):
 *   - POST /api/matters/{slug}/grants {module_id, capability_id}
 *       → 201 GrantCreateResponse on write
 *       → 200 was_idempotent_noop=true on duplicate (no audit row)
 *       → 404 module_not_installed
 *       → 409 module_disabled (installed but admin disabled it)
 *   - DELETE /api/matters/{slug}/grants/{grant_id} → 204 (or 404)
 *
 * Reviewer-narrow per the Phase 14 C brief:
 *   - No invoke UI here (Phase 14 D)
 *   - No reconstruction deep-link (Phase 14 E target; tracked as
 *     BACKEND_GAP_AUDIT 14-B-#2 for a workspace-scoped audit view)
 *   - No admin lifecycle (install/revoke module) — those live on the
 *     module detail page (Phase 14 B)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createGrant,
  getModulesV2,
  listGrants,
  ModuleDisabledError,
  ModuleNotInstalledError,
  revokeGrant,
  type GrantRow,
  type V2ManifestEntry,
} from "../lib/api";

type GrantsQuery =
  | { status: "loading" }
  | { status: "ready"; grants: GrantRow[] }
  | { status: "error"; message: string };

type CatalogQuery =
  | { status: "loading" }
  | { status: "ready"; modules: V2ManifestEntry[] }
  | { status: "error"; message: string };

type CreateState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "noop" }
  | { kind: "ok"; count: number }
  | { kind: "not_installed"; moduleId: string }
  | { kind: "disabled"; moduleId: string; message: string }
  | { kind: "error"; message: string };

type RevokeState =
  | { kind: "idle" }
  | { kind: "revoking"; grantId: string }
  | { kind: "error"; message: string };

interface ManifestCapability {
  id: string;
  scope?: string;
  kind?: string;
}

function capabilitiesOf(entry: V2ManifestEntry): ManifestCapability[] {
  const caps = (entry.manifest as Record<string, unknown>).capabilities;
  if (!Array.isArray(caps)) return [];
  return caps
    .map((raw): ManifestCapability | null => {
      const c = (raw ?? {}) as Record<string, unknown>;
      const id =
        typeof c.id === "string"
          ? c.id
          : typeof c.capability_id === "string"
            ? c.capability_id
            : null;
      if (!id) return null;
      return {
        id,
        scope: typeof c.scope === "string" ? c.scope : undefined,
        kind: typeof c.kind === "string" ? c.kind : undefined,
      };
    })
    .filter((c): c is ManifestCapability => c !== null);
}

function manifestName(entry: V2ManifestEntry): string {
  const n = (entry.manifest as Record<string, unknown>).name;
  return typeof n === "string" ? n : entry.module_id;
}

export function GrantsPanel({ slug }: { slug: string }) {
  const [grants, setGrants] = useState<GrantsQuery>({ status: "loading" });
  const [catalog, setCatalog] = useState<CatalogQuery>({ status: "loading" });
  const [createState, setCreateState] = useState<CreateState>({ kind: "idle" });
  const [revokeState, setRevokeState] = useState<RevokeState>({ kind: "idle" });

  const [selectedModule, setSelectedModule] = useState<string>("");
  const [selectedCap, setSelectedCap] = useState<string>("");

  const refresh = useCallback(async () => {
    try {
      const list = await listGrants(slug);
      setGrants({ status: "ready", grants: list.grants });
    } catch (err) {
      setGrants({ status: "error", message: String(err) });
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    getModulesV2()
      .then((res) => {
        if (!cancelled) {
          setCatalog({ status: "ready", modules: res.modules });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCatalog({ status: "error", message: String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const moduleOptions = useMemo(() => {
    if (catalog.status !== "ready") return [];
    // Only modules with at least one declared capability are useful
    // here. Grant-scope filtering (matter vs workspace) is enforced
    // server-side at create_grants_for_capability; the UI just picks.
    return catalog.modules.filter(
      (m) => m.is_valid && capabilitiesOf(m).length > 0,
    );
  }, [catalog]);

  const selectedManifest = useMemo(
    () => moduleOptions.find((m) => m.module_id === selectedModule) ?? null,
    [moduleOptions, selectedModule],
  );

  const capOptions = useMemo<ManifestCapability[]>(
    () => (selectedManifest ? capabilitiesOf(selectedManifest) : []),
    [selectedManifest],
  );

  const onAdd = async () => {
    if (!selectedModule || !selectedCap) return;
    setCreateState({ kind: "submitting" });
    try {
      const res = await createGrant(slug, {
        module_id: selectedModule,
        capability_id: selectedCap,
      });
      if (res.was_idempotent_noop) {
        setCreateState({ kind: "noop" });
      } else {
        setCreateState({ kind: "ok", count: res.grants.length });
      }
      // Refresh the list so the new rows appear.
      await refresh();
    } catch (err) {
      if (err instanceof ModuleNotInstalledError) {
        setCreateState({ kind: "not_installed", moduleId: err.moduleId });
        return;
      }
      if (err instanceof ModuleDisabledError) {
        setCreateState({
          kind: "disabled",
          moduleId: err.moduleId,
          message: err.message,
        });
        return;
      }
      setCreateState({ kind: "error", message: String(err) });
    }
  };

  const onRevoke = async (grantId: string) => {
    setRevokeState({ kind: "revoking", grantId });
    try {
      await revokeGrant(slug, grantId);
      setRevokeState({ kind: "idle" });
      await refresh();
    } catch (err) {
      setRevokeState({ kind: "error", message: String(err) });
    }
  };

  return (
    <section className="mt-10">
      <h2 className="text-sm uppercase tracking-widest text-muted">
        Grants on this matter
      </h2>
      <p className="mt-2 text-sm text-muted">
        Capabilities granted to you on this matter. Each row corresponds
        to a plugin/skill/capability triple the substrate uses to gate
        invocations.
      </p>

      {/* Current grants */}
      {grants.status === "loading" && (
        <p className="mt-4 text-sm text-muted">Loading grants…</p>
      )}
      {grants.status === "error" && (
        <p className="mt-4 text-sm text-seal">
          Could not load grants: {grants.message}
        </p>
      )}
      {grants.status === "ready" && grants.grants.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          No capabilities granted on this matter yet. Use the form below
          to grant from an installed module.
        </p>
      )}
      {grants.status === "ready" && grants.grants.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-md border border-line">
          <table className="min-w-full text-sm">
            <thead className="bg-paper-sunken text-xs uppercase tracking-widest text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Plugin</th>
                <th className="px-3 py-2 text-left">Skill</th>
                <th className="px-3 py-2 text-left">Capability</th>
                <th className="px-3 py-2 text-left">Granted</th>
                <th className="px-3 py-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {grants.grants.map((g) => (
                <tr key={g.id} className="border-t border-line">
                  <td className="px-3 py-2 font-mono text-xs">{g.plugin}</td>
                  <td className="px-3 py-2 font-mono text-xs">{g.skill}</td>
                  <td className="px-3 py-2 font-mono text-xs">{g.capability}</td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {g.granted_at ? g.granted_at.slice(0, 19).replace("T", " ") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onRevoke(g.id)}
                      disabled={
                        revokeState.kind === "revoking" &&
                        revokeState.grantId === g.id
                      }
                      className="text-xs text-muted underline underline-offset-4 hover:text-seal disabled:opacity-50"
                    >
                      {revokeState.kind === "revoking" &&
                      revokeState.grantId === g.id
                        ? "Revoking…"
                        : "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {revokeState.kind === "error" && (
        <p className="mt-3 text-sm text-seal">
          Revoke failed: {revokeState.message}
        </p>
      )}

      {/* Add-grant control */}
      <div className="mt-6 rounded-md border border-line p-4">
        <h3 className="text-xs uppercase tracking-widest text-muted">
          Grant a capability
        </h3>
        {catalog.status === "loading" && (
          <p className="mt-3 text-sm text-muted">Loading module catalog…</p>
        )}
        {catalog.status === "error" && (
          <p className="mt-3 text-sm text-seal">{catalog.message}</p>
        )}
        {catalog.status === "ready" && moduleOptions.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            No modules with declared capabilities are discoverable. Ask
            an administrator to install a module from the catalog first.
          </p>
        )}
        {catalog.status === "ready" && moduleOptions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs text-muted">
              <span className="mb-1">Module</span>
              <select
                value={selectedModule}
                onChange={(e) => {
                  setSelectedModule(e.target.value);
                  setSelectedCap("");
                  setCreateState({ kind: "idle" });
                }}
                className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm text-ink"
              >
                <option value="">— select —</option>
                {moduleOptions.map((m) => (
                  <option key={m.module_id} value={m.module_id}>
                    {manifestName(m)} ({m.module_id})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-muted">
              <span className="mb-1">Capability</span>
              <select
                value={selectedCap}
                onChange={(e) => {
                  setSelectedCap(e.target.value);
                  setCreateState({ kind: "idle" });
                }}
                disabled={!selectedModule}
                className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm text-ink disabled:opacity-50"
              >
                <option value="">— select —</option>
                {capOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}
                    {c.scope ? ` · ${c.scope}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={onAdd}
              disabled={
                !selectedModule ||
                !selectedCap ||
                createState.kind === "submitting"
              }
              className="inline-flex items-center rounded-md bg-ink px-4 py-1.5 text-sm text-paper hover:opacity-90 disabled:opacity-50"
            >
              {createState.kind === "submitting" ? "Granting…" : "Grant"}
            </button>
          </div>
        )}

        {createState.kind === "ok" && (
          <p className="mt-3 text-sm text-muted">
            Granted. {createState.count} row(s) created.
          </p>
        )}
        {createState.kind === "noop" && (
          <p className="mt-3 text-sm text-muted">
            Already granted — no change. Idempotent grants do not emit
            audit rows.
          </p>
        )}
        {createState.kind === "not_installed" && (
          <p className="mt-3 text-sm text-seal">
            Module{" "}
            <span className="font-mono">{createState.moduleId}</span> is
            not installed on this workspace. Ask an administrator to
            install it from{" "}
            <code className="font-mono text-xs">/modules</code> first.
          </p>
        )}
        {createState.kind === "disabled" && (
          <p className="mt-3 text-sm text-seal">
            Module{" "}
            <span className="font-mono">{createState.moduleId}</span> is
            installed but currently disabled. {createState.message}
          </p>
        )}
        {createState.kind === "error" && (
          <p className="mt-3 text-sm text-seal">{createState.message}</p>
        )}
      </div>
    </section>
  );
}
