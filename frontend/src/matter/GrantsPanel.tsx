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
  listApiKeys,
  listGrants,
  listInstalledModules,
  ModuleDisabledError,
  ModuleNotInstalledError,
  revokeGrant,
  type GrantRow,
  type InstalledModule,
  type UserApiKeyRead,
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
  modelAccess?: string;
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
        modelAccess: typeof c.model_access === "string" ? c.model_access : undefined,
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

function installedModuleEntry(row: InstalledModule): V2ManifestEntry {
  return {
    module_id: row.module_id,
    source_kind: "installed",
    manifest: {
      name: row.module_id,
      capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    },
    is_valid: true,
    validation_errors: [],
  };
}

function providerForModel(modelId: string | null | undefined): string | null {
  const value = (modelId ?? "").trim().toLowerCase();
  if (!value || value === "stub-echo" || value.includes("ollama")) return null;
  if (value.includes("claude") || value.includes("anthropic")) return "anthropic";
  if (
    value.includes("openai") ||
    value.includes("gpt") ||
    /^o[134](?:-|$)/.test(value)
  ) {
    return "openai";
  }
  return null;
}

function moduleRequiresModel(entry: V2ManifestEntry, cap: ManifestCapability): boolean {
  if (cap.modelAccess === "required") return true;
  return capabilitiesOf(entry).some(
    (c) => c.kind === "provider" || c.modelAccess === "required",
  );
}

type KeyQuery =
  | { status: "loading" }
  | { status: "ready"; keys: UserApiKeyRead[] }
  | { status: "error" };

type RunReadiness = {
  disabled: boolean;
  title: string;
  body: string;
  provider?: string | null;
};

function readinessFor(opts: {
  defaultModelId?: string | null;
  requiresModel: boolean;
  keyQuery: KeyQuery;
}): RunReadiness {
  if (!opts.requiresModel) {
    return {
      disabled: false,
      title: "Ready to run",
      body: "This capability does not declare model access.",
    };
  }

  const provider = providerForModel(opts.defaultModelId);
  if (provider === null) {
    return {
      disabled: false,
      title: "Ready: keyless/local model",
      body: `Matter model ${opts.defaultModelId || "stub-echo"} does not need a BYO provider key.`,
      provider,
    };
  }

  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);
  if (opts.keyQuery.status === "loading") {
    return {
      disabled: true,
      title: `Checking ${providerLabel} key`,
      body: "Legalise is checking whether your account has the provider key this matter needs.",
      provider,
    };
  }
  if (opts.keyQuery.status === "error") {
    return {
      disabled: false,
      title: "Provider key status unavailable",
      body: `This action uses ${providerLabel}. Run may fail if no key is configured.`,
      provider,
    };
  }

  const hasKey = opts.keyQuery.keys.some((k) => k.provider === provider);
  if (!hasKey) {
    return {
      disabled: true,
      title: `${providerLabel} key needed`,
      body: `This matter uses ${opts.defaultModelId}. Add your ${providerLabel} key before running this action.`,
      provider,
    };
  }

  return {
    disabled: false,
    title: `${providerLabel} key configured, not tested`,
    body: "A key is on file. Legalise has not validated it against the provider until the run starts.",
    provider,
  };
}

export function GrantsPanel({
  slug,
  defaultModelId,
}: {
  slug: string;
  defaultModelId?: string | null;
}) {
  const [grants, setGrants] = useState<GrantsQuery>({ status: "loading" });
  const [catalog, setCatalog] = useState<CatalogQuery>({ status: "loading" });
  // Phase 14.5 B — installed-module state. ONE extra AND clause for
  // runnablePairs: a capability is runnable only if its module is
  // installed AND enabled. This SUPPLEMENTS the Phase 14 D strict
  // manifest × per-string-grants derivation; it does not replace it.
  const [installed, setInstalled] = useState<Map<string, InstalledModule> | null>(
    null,
  );
  const [keys, setKeys] = useState<KeyQuery>({ status: "loading" });
  const [createState, setCreateState] = useState<CreateState>({ kind: "idle" });
  const [revokeState, setRevokeState] = useState<RevokeState>({ kind: "idle" });
  const [setupOpen, setSetupOpen] = useState(false);

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
    listInstalledModules()
      .then((rows) => {
        if (cancelled) return;
        const idx = new Map<string, InstalledModule>();
        for (const row of rows) idx.set(row.module_id, row);
        setInstalled(idx);
      })
      .catch(() => {
        // Phase 14.5 B — if the installed-listing fetch fails (anon
        // race, network blip), fail closed: empty map → no module
        // looks installed → no runnable pairs render. Safer than
        // assuming everything is installed.
        if (!cancelled) setInstalled(new Map());
      });
    listApiKeys()
      .then((rows) => {
        if (!cancelled) setKeys({ status: "ready", keys: rows });
      })
      .catch(() => {
        if (!cancelled) setKeys({ status: "error" });
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
    const byId = new Map<string, V2ManifestEntry>();
    for (const m of catalog.modules) byId.set(m.module_id, m);
    if (installed !== null) {
      for (const row of installed.values()) {
        if (!byId.has(row.module_id)) {
          byId.set(row.module_id, installedModuleEntry(row));
        }
      }
    }
    return Array.from(byId.values()).filter(
      (m) =>
        m.is_valid &&
        capabilitiesOf(m).some((c) => c.scope === "matter"),
    );
  }, [catalog, installed]);

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
    Array<{
      moduleId: string;
      capabilityId: string;
      moduleName: string;
      readiness: RunReadiness;
    }>
  >(() => {
    // Wait until installed state has resolved before deriving. Pre-
    // resolution we don't know if a module is installed/enabled,
    // and rendering Run for a row whose module is disabled would
    // race-condition past the substrate's invocation 409 guard.
    if (
      catalog.status !== "ready" ||
      grants.status !== "ready" ||
      installed === null
    ) {
      return [];
    }
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
      readiness: RunReadiness;
    }> = [];
    const byId = new Map<string, V2ManifestEntry>();
    for (const m of catalog.modules) byId.set(m.module_id, m);
    for (const row of installed.values()) {
      if (!byId.has(row.module_id)) {
        byId.set(row.module_id, installedModuleEntry(row));
      }
    }
    for (const m of byId.values()) {
      if (!m.is_valid) continue;
      // Phase 14.5 B — extra AND clause: module must be installed
      // AND enabled. Strictly an addition to the Phase 14 D
      // derivation; per-capability reads/writes grant existence
      // stays exactly as before.
      const inst = installed.get(m.module_id);
      if (!inst || !inst.enabled) continue;
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
          readiness: readinessFor({
            defaultModelId,
            requiresModel: moduleRequiresModel(m, c),
            keyQuery: keys,
          }),
        });
      }
    }
    return out;
  }, [catalog, defaultModelId, grants, installed, keys]);

  const setupSuggestions = useMemo<
    Array<{
      moduleId: string;
      capabilityId: string;
      moduleName: string;
      granted: number;
      required: number;
      status: "ready" | "needs_permissions";
    }>
  >(() => {
    if (
      catalog.status !== "ready" ||
      grants.status !== "ready" ||
      installed === null
    ) {
      return [];
    }
    const matterGrantsBySkill = new Map<string, Set<string>>();
    for (const g of grants.grants) {
      if (g.scope_type !== "matter") continue;
      const key = `${g.plugin}::${g.skill}`;
      const bag = matterGrantsBySkill.get(key) ?? new Set<string>();
      bag.add(g.capability);
      matterGrantsBySkill.set(key, bag);
    }
    const byId = new Map<string, V2ManifestEntry>();
    for (const m of catalog.modules) byId.set(m.module_id, m);
    for (const row of installed.values()) {
      if (!byId.has(row.module_id)) byId.set(row.module_id, installedModuleEntry(row));
    }
    const out: Array<{
      moduleId: string;
      capabilityId: string;
      moduleName: string;
      granted: number;
      required: number;
      status: "ready" | "needs_permissions";
    }> = [];
    for (const m of byId.values()) {
      if (!m.is_valid) continue;
      const inst = installed.get(m.module_id);
      if (!inst || !inst.enabled) continue;
      for (const c of capabilitiesOf(m)) {
        if (c.scope !== "matter") continue;
        const required = [...c.reads, ...c.writes];
        if (required.length === 0) continue;
        const bag = matterGrantsBySkill.get(`${m.module_id}::${c.id}`) ?? new Set<string>();
        const granted = required.filter((s) => bag.has(s)).length;
        out.push({
          moduleId: m.module_id,
          capabilityId: c.id,
          moduleName: manifestName(m),
          granted,
          required: required.length,
          status: granted === required.length ? "ready" : "needs_permissions",
        });
      }
    }
    return out.sort((a, b) => {
      if (a.status !== b.status) return a.status === "ready" ? -1 : 1;
      return `${a.moduleName} ${a.capabilityId}`.localeCompare(`${b.moduleName} ${b.capabilityId}`);
    });
  }, [catalog, grants, installed]);

  return (
    <section className="mt-10 rounded-md border border-line bg-paper p-4">
      <h2 className="text-sm uppercase tracking-widest text-muted">
        Actions on this matter
      </h2>
      <p className="mt-2 text-sm text-muted">
        Run governed actions from installed modules. The Activity Trail
        records what each action touched, which model ran, what output
        was written, and how it was reviewed.
      </p>

      {setupSuggestions.length > 0 && (
        <div className="mt-4 grid gap-px border border-line bg-line sm:grid-cols-2">
          {setupSuggestions.slice(0, 4).map((item) => (
            <div key={`${item.moduleId}::${item.capabilityId}`} className="bg-paper p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{item.capabilityId}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">
                    {item.moduleName === item.moduleId
                      ? "Installed module"
                      : item.moduleName}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                    item.status === "ready"
                      ? "border-line text-muted"
                      : "border-amber-500/40 bg-amber-50 text-amber-900"
                  }`}
                >
                  {item.status === "ready" ? "Runnable" : "Needs grant"}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">
                {item.granted}/{item.required} permissions granted on this matter.
              </p>
              {item.status === "needs_permissions" && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModule(item.moduleId);
                    setSelectedCap(item.capabilityId);
                    setSetupOpen(true);
                  }}
                  className="mt-3 text-xs underline underline-offset-4 hover:text-seal"
                >
                  Grant permissions
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Phase 14 D — runnable capabilities */}
      {runnablePairs.length > 0 && (
        <div
          className="mt-4 rounded-md border border-line p-4"
          data-testid="runnable-capabilities"
        >
          <h3 className="text-xs uppercase tracking-widest text-muted">
            Available actions
          </h3>
          <p className="mt-2 text-xs text-muted">
            These actions are installed, enabled, and fully granted on this
            matter. Readiness shows the provider-key boundary before a run
            starts.
          </p>
          <ul className="mt-3 space-y-3">
            {runnablePairs.map((p) => (
              <li
                key={`${p.moduleId}::${p.capabilityId}`}
                className="border-t border-line pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm">{p.moduleName}</p>
                    <p className="text-xs font-mono text-muted">
                      {p.moduleId} · {p.capabilityId}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-widest ${
                      p.readiness.disabled
                        ? "border-amber-500/40 bg-amber-50 text-amber-900"
                        : "border-line bg-paper-sunken text-muted"
                    }`}
                  >
                    {p.readiness.disabled ? "Needs setup" : "Ready"}
                  </span>
                </div>
                <div className="mt-2">
                  <InvocationRunner
                    slug={slug}
                    moduleId={p.moduleId}
                    capabilityId={p.capabilityId}
                    readiness={p.readiness}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details
        className="mt-6 rounded-md border border-line bg-paper-sunken p-4"
        open={setupOpen}
        onToggle={(e) => setSetupOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer text-xs uppercase tracking-widest text-muted">
          Permissions and setup
        </summary>
        <p className="mt-2 text-sm text-muted">
          Technical grants are hidden by default. Open this when an
          action needs setup or you need to inspect/revoke exactly what
          a module may touch.
        </p>

        {/* Permissions on this matter */}
        <h3 className="mt-5 text-xs uppercase tracking-widest text-muted">
          Permissions on this matter
        </h3>
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
          <div className="mt-4 overflow-x-auto rounded-md border border-line bg-paper">
            <table className="min-w-full text-sm">
              <thead className="bg-paper-sunken text-xs uppercase tracking-widest text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Module</th>
                  <th className="px-3 py-2 text-left">Skill</th>
                  <th className="px-3 py-2 text-left">Permission</th>
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
        <div className="mt-6 rounded-md border border-line bg-paper p-4">
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
            Granted. This module may now use that permission on this
            matter.
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
      </details>
    </section>
  );
}
