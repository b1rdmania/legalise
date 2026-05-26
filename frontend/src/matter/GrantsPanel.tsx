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
import { InvocationRunner } from "./InvocationRunner";

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
  // Substrate-truth: when a capability is granted via
  // create_grants_for_capability (grants_lifecycle.py:355-389), it
  // creates one WorkspaceSkillCapabilityGrant row per string in
  // `reads + writes`. Each row's `capability` column carries the
  // string verbatim; `plugin` = module_id; `skill` = capability_id.
  // The frontend mirrors this expansion so we never offer Run for
  // a capability whose required strings aren't all granted.
  reads: string[];
  writes: string[];
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
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
        reads: stringArray(c.reads),
        writes: stringArray(c.writes),
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

  // This is the matter-scoped grants UI. The substrate's
  // create_grants_for_capability rejects scope ≠ "matter" with 422 by
  // design (Phase 7 Decision #5), so workspace/global capabilities
  // can never be granted via this endpoint. Filter them out here so
  // the user is never offered an impossible choice. The 422 path is
  // retained server-side as defence-in-depth.
  const moduleOptions = useMemo(() => {
    if (catalog.status !== "ready") return [];
    return catalog.modules.filter(
      (m) =>
        m.is_valid &&
        capabilitiesOf(m).some((c) => c.scope === "matter"),
    );
  }, [catalog]);

  const selectedManifest = useMemo(
    () => moduleOptions.find((m) => m.module_id === selectedModule) ?? null,
    [moduleOptions, selectedModule],
  );

  const capOptions = useMemo<ManifestCapability[]>(
    () =>
      selectedManifest
        ? capabilitiesOf(selectedManifest).filter((c) => c.scope === "matter")
        : [],
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

  // Phase 14 D Reviewer-fix — runnable pairs are derived strictly,
  // not from plugin membership.
  //
  // A capability is runnable iff:
  //   1. The module is in the v2 catalog (= discoverable).
  //   2. The capability is scope === "matter".
  //   3. The capability declares at least one entry in reads ∪ writes
  //      (capabilities with no required strings cannot be granted in
  //      the substrate sense; Phase 7 expansion would create zero
  //      grant rows).
  //   4. EVERY string in reads ∪ writes has a corresponding grant
  //      row on this matter where:
  //         g.plugin === module_id
  //         g.skill  === capability_id
  //         g.capability === required_string
  //         g.scope_type === "matter"
  //   This mirrors the Phase 7 expansion at
  //   grants_lifecycle.py:355-389 (plugin = installed_module.module_id,
  //   skill = capability_id, capability = each entry from
  //   reads + writes). A partially-revoked capability — where one of
  //   the required strings has been deleted — must NOT be runnable;
  //   the substrate would 403 at dispatch, potentially after a
  //   provider call.
  const runnablePairs = useMemo<
    Array<{ moduleId: string; capabilityId: string; moduleName: string }>
  >(() => {
    if (catalog.status !== "ready" || grants.status !== "ready") return [];
    const matterGrantsBySkill = new Map<string, Set<string>>();
    for (const g of grants.grants) {
      if (g.scope_type !== "matter") continue;
      const key = `${g.plugin}::${g.skill}`;
      let bag = matterGrantsBySkill.get(key);
      if (bag === undefined) {
        bag = new Set<string>();
        matterGrantsBySkill.set(key, bag);
      }
      bag.add(g.capability);
    }
    const out: Array<{
      moduleId: string;
      capabilityId: string;
      moduleName: string;
    }> = [];
    for (const m of catalog.modules) {
      if (!m.is_valid) continue;
      const name = manifestName(m);
      for (const c of capabilitiesOf(m)) {
        if (c.scope !== "matter") continue;
        const required = [...c.reads, ...c.writes];
        if (required.length === 0) continue;
        const bag = matterGrantsBySkill.get(`${m.module_id}::${c.id}`);
        if (bag === undefined) continue;
        const allGranted = required.every((s) => bag.has(s));
        if (!allGranted) continue;
        out.push({
          moduleId: m.module_id,
          capabilityId: c.id,
          moduleName: name,
        });
      }
    }
    return out;
  }, [catalog, grants]);

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

      {/* Phase 14 D — runnable capabilities */}
      {runnablePairs.length > 0 && (
        <div
          className="mt-4 rounded-md border border-line p-4"
          data-testid="runnable-capabilities"
        >
          <h3 className="text-xs uppercase tracking-widest text-muted">
            Run a capability
          </h3>
          <ul className="mt-3 space-y-3">
            {runnablePairs.map((p) => (
              <li
                key={`${p.moduleId}::${p.capabilityId}`}
                className="border-t border-line pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="text-sm">{p.moduleName}</p>
                    <p className="text-xs font-mono text-muted">
                      {p.moduleId} · {p.capabilityId}
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  <InvocationRunner
                    slug={slug}
                    moduleId={p.moduleId}
                    capabilityId={p.capabilityId}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
