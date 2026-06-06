// Matter Skills tab — two sections: Enabled in this matter / Available
// to enable. Enabling fires per-capability matter grants. Only
// matter-scoped capabilities are grantable — workspace and provider
// capabilities are inherited from workspace trust and not surfaced as
// per-matter actions. GrantsPanel below provides the operator-level
// permissions table for direct permission editing.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  createGrant,
  getMatterWorkflows,
  getModulesV2,
  listDocuments,
  listGrants,
  listInstalledModules,
  revokeGrant,
  type GrantRow,
  type InstalledModule,
  type MatterDocument,
  type MatterWorkflowsResponse,
  type V2ManifestEntry,
} from "../lib/api";
import { GenericSkillRunner } from "./GenericSkillRunner";
import {
  manifestCapabilities,
  manifestText,
  runnableMatterSkills,
  shortCapabilityList,
} from "./skillRunnerModel";

interface Props {
  slug: string;
}

function formatLastRun(iso: string | null): string {
  if (!iso) return "Not run yet on this matter";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `Last run ${d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

function capabilityStrings(
  entry: V2ManifestEntry,
  key: "reads" | "writes",
  opts: { matterOnly?: boolean } = {},
): string[] {
  const out = new Set<string>();
  for (const cap of manifestCapabilities(entry)) {
    if (opts.matterOnly && cap.scope !== "matter") continue;
    for (const value of cap[key]) out.add(value);
  }
  return [...out].sort();
}

// The runtime only grants capabilities with scope === "matter" at
// matter level; create_grants_for_capability rejects scope ≠ "matter"
// with 422 (see GrantsPanel for the canonical filter at line 441).
// Returning only those keeps the enable action honest: provider /
// workspace / other-scope capabilities are inherited from workspace
// trust and are not per-matter actions.
function matterCapabilityIds(entry: V2ManifestEntry): string[] {
  return manifestCapabilities(entry)
    .filter((cap) => cap.scope === "matter")
    .map((cap) => cap.id);
}

function friendlyCapabilitySummary(values: string[]): string {
  if (values.length === 0) return "Project context";
  const labels = new Set<string>();
  for (const value of values) {
    if (value.includes("document")) labels.add("Documents");
    else if (value.includes("chronology")) labels.add("Chronology");
    else if (value.includes("artifact") || value.includes("output")) labels.add("Outputs");
    else if (value.includes("model")) labels.add("Model");
    else if (value.includes("matter")) labels.add("Matter record");
    else labels.add(value.replaceAll(".", " "));
  }
  const list = [...labels];
  if (list.length <= 2) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} +${list.length - 2} more`;
}

function workflowStatus(workflow: MatterWorkflowsResponse["workflows"][number]) {
  if (workflow.grant === "granted" && workflow.availability === "ok") {
    return "Ready in this project";
  }
  return "Needs setup";
}

export function MatterSkillsTab({ slug }: Props) {
  const [workflows, setWorkflows] = useState<MatterWorkflowsResponse | null>(
    null,
  );
  const [modules, setModules] = useState<V2ManifestEntry[]>([]);
  const [installed, setInstalled] = useState<Map<string, InstalledModule>>(
    new Map(),
  );
  const [grants, setGrants] = useState<GrantRow[] | null>(null);
  const [documents, setDocuments] = useState<MatterDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enableTarget, setEnableTarget] = useState<V2ManifestEntry | null>(null);

  const refresh = () => {
    void getMatterWorkflows(slug)
      .then(setWorkflows)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("401")) setError(msg);
      });
    void listGrants(slug)
      .then((r) => setGrants(r.grants))
      .catch(() => undefined);
    void listDocuments(slug)
      .then(setDocuments)
      .catch(() => setDocuments([]));
    void getModulesV2()
      .then((r) => setModules(r.modules))
      .catch(() => undefined);
    void listInstalledModules()
      .then((rows) => {
        const idx = new Map<string, InstalledModule>();
        for (const r of rows) idx.set(r.module_id, r);
        setInstalled(idx);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    return () => undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // A module is "enabled in this matter" if any grant row references
  // it on this matter. Grants are per (module_id, capability)
  // tuple, so any presence implies the skill has been enabled at least
  // partially.)
  const grantedModuleIds = useMemo(() => {
    const set = new Set<string>();
    for (const g of grants ?? []) set.add(g.plugin);
    return set;
  }, [grants]);

  const enabledModules = useMemo(
    () =>
      modules.filter((m) => {
        const inst = installed.get(m.module_id);
        return inst?.enabled === true && grantedModuleIds.has(m.module_id);
      }),
    [modules, installed, grantedModuleIds],
  );

  const runnableSkills = useMemo(
    () => runnableMatterSkills({ modules, installed, grants }),
    [modules, installed, grants],
  );

  const runnableModuleIds = useMemo(
    () => new Set(runnableSkills.map((skill) => skill.moduleId)),
    [runnableSkills],
  );

  const setupOnlyModules = useMemo(
    () => enabledModules.filter((module) => !runnableModuleIds.has(module.module_id)),
    [enabledModules, runnableModuleIds],
  );

  const availableModules = useMemo(
    () =>
      modules.filter((m) => {
        const inst = installed.get(m.module_id);
        return inst?.enabled === true && !grantedModuleIds.has(m.module_id);
      }),
    [modules, installed, grantedModuleIds],
  );

  return (
    <section>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted">
          Matter skills
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight2 text-ink">
          What you can run on this matter
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-prose">
          Each skill below names what it reads, what it writes, and when
          it last ran here. Enabling a skill on this matter is a
          matter-scoped decision — workspace trust is inherited, not
          re-asked.
        </p>
      </header>

      {error && (
        <p className="mb-4 text-sm text-seal" data-testid="matter-skills-error">
          {error}
        </p>
      )}

      {/* Section 1 — Enabled in this matter */}
      <SectionHeader
        title="Enabled in this matter"
        hint="Generic skills run in Chat. Legacy built-in actions stay available below, but are not the product model."
      />

      {workflows === null ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {runnableSkills.map((skill) => (
            <GenericSkillRunner
              key={`${skill.moduleId}:${skill.capabilityId}`}
              slug={slug}
              skill={skill}
              documents={documents}
            />
          ))}
          {setupOnlyModules.map((m) => (
            <EnabledModuleRow
              key={m.module_id}
              slug={slug}
              entry={m}
              grants={
                (grants ?? []).filter((g) => g.plugin === m.module_id) ?? []
              }
              onRevoked={refresh}
            />
          ))}
          {runnableSkills.length === 0 && enabledModules.length === 0 && (
            <p className="text-sm text-muted">
              No skills are enabled in this matter yet. Pick one from
              Available to enable below.
            </p>
          )}
          {workflows.workflows.length > 0 && (
            <details className="rounded-card border border-rule bg-paper p-4">
              <summary className="cursor-pointer text-sm font-medium text-muted hover:text-ink">
                Legacy built-in actions ({workflows.workflows.length})
              </summary>
              <p className="mt-2 text-xs text-muted">
                These routes remain for compatibility while first-party work is
                migrated into the generic runner. Use Chat for normal work.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3">
                {workflows.workflows.map((w) => (
                  <WorkflowRow key={w.key} slug={slug} workflow={w} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Section 2 — Available to enable */}
      <div className="mt-10">
        <SectionHeader
          title="Available to enable"
          hint="Trusted in this workspace; not yet enabled here. Enable to make a skill runnable inside this matter."
        />
        {availableModules.length === 0 ? (
          <p className="mt-3 text-sm text-muted" data-testid="available-empty">
            Everything trusted in the workspace is already enabled here.{" "}
            <Link
              to="/skills"
              className="underline underline-offset-4 hover:text-ink"
            >
              Manage workspace skills →
            </Link>
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3">
            {availableModules.map((m) => (
              <AvailableModuleRow
                key={m.module_id}
                entry={m}
                onEnable={() => setEnableTarget(m)}
              />
            ))}
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-muted">
        Workspace install, signature, and trust details live on{" "}
        <Link to="/skills" className="underline underline-offset-4 hover:text-ink">
          Workspace skills
        </Link>
        . This page only covers what runs inside this matter.
      </p>

      {enableTarget && (
        <EnableSkillModal
          slug={slug}
          entry={enableTarget}
          installed={installed.get(enableTarget.module_id) ?? null}
          onClose={() => setEnableTarget(null)}
          onEnabled={() => {
            setEnableTarget(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="border-b border-rule pb-2">
      <h3 className="text-sm uppercase tracking-widest text-muted">{title}</h3>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

function WorkflowRow({
  slug,
  workflow,
}: {
  slug: string;
  workflow: MatterWorkflowsResponse["workflows"][number];
}) {
  return (
    <article className="rounded-card border border-rule bg-paper p-4" data-testid={`enabled-builtin-${workflow.key}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{workflow.title}</p>
          <p className="mt-0.5 text-xs text-muted">{workflow.description}</p>
        </div>
        <Link
          to="/matters/$slug/$tab"
          params={{ slug, tab: workflow.key }}
          className="shrink-0 rounded-md border border-line px-3 py-1 text-xs hover:border-ink"
        >
          Open
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3">
        <Meta label="Reads" value={friendlyCapabilitySummary(workflow.declared_capabilities)} />
        <Meta
          label="Status"
          value={workflowStatus(workflow)}
        />
        <Meta label="Last run" value={formatLastRun(workflow.last_run_at)} />
      </dl>
      {workflow.reason && workflow.availability !== "ok" && (
        <p className="mt-2 text-xs text-muted">{workflow.reason}</p>
      )}
    </article>
  );
}

function EnabledModuleRow({
  slug,
  entry,
  grants,
  onRevoked,
}: {
  slug: string;
  entry: V2ManifestEntry;
  grants: GrantRow[];
  onRevoked: () => void;
}) {
  const [revoking, setRevoking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reads = capabilityStrings(entry, "reads");
  const writes = capabilityStrings(entry, "writes");
  const name = manifestText(entry, "name") ?? entry.module_id;

  const onRevoke = async () => {
    if (grants.length === 0) return;
    setRevoking(true);
    setErr(null);
    try {
      // Revoke the parent grant first; the runtime cascades the
      // expanded per-string rows.
      await Promise.all(grants.map((g) => revokeGrant(slug, g.id)));
      onRevoked();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <article
      className="rounded-card border border-rule bg-paper p-4"
      data-testid={`enabled-module-${entry.module_id}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{name}</p>
          <p className="mt-0.5 tech-token text-[11px] text-muted">
            {entry.module_id}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
            Needs setup
          </span>
          <button
            type="button"
            onClick={onRevoke}
            disabled={revoking}
            className="rounded-md px-3 py-1 text-xs text-muted hover:text-seal disabled:opacity-50"
          >
            {revoking ? "Revoking…" : "Revoke"}
          </button>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3">
        <Meta label="Reads" value={friendlyCapabilitySummary(reads)} />
        <Meta label="Writes" value={friendlyCapabilitySummary(writes)} />
        <Meta label="Status" value="Needs setup" />
      </dl>
      {err && <p className="mt-2 text-xs text-seal">{err}</p>}
    </article>
  );
}

function AvailableModuleRow({
  entry,
  onEnable,
}: {
  entry: V2ManifestEntry;
  onEnable: () => void;
}) {
  const reads = capabilityStrings(entry, "reads");
  const writes = capabilityStrings(entry, "writes");
  const name = manifestText(entry, "name") ?? entry.module_id;
  const publisher = manifestText(entry, "publisher");
  const matterCaps = matterCapabilityIds(entry);
  const hasMatterCaps = matterCaps.length > 0;
  const enableDisabled = !entry.is_valid || !hasMatterCaps;
      const disabledReason = !entry.is_valid
    ? "This skill needs setup in the workspace before enabling."
    : !hasMatterCaps
      ? "This skill cannot be enabled inside a project yet."
      : null;

  return (
    <article
      className="rounded-card border border-rule bg-paper p-4"
      data-testid={`available-module-${entry.module_id}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{name}</p>
          <p className="mt-0.5 tech-token text-[11px] text-muted">
            {entry.module_id}
            {publisher ? ` · ${publisher}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onEnable}
          disabled={enableDisabled}
          title={disabledReason ?? undefined}
          className="shrink-0 rounded-md bg-ink px-3 py-1 text-xs text-paper hover:opacity-90 disabled:opacity-50"
          data-testid={`enable-${entry.module_id}`}
        >
          Enable in matter
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3">
        <Meta label="Reads" value={friendlyCapabilitySummary(reads)} />
        <Meta label="Writes" value={friendlyCapabilitySummary(writes)} />
        <Meta label="Project actions" value={String(matterCaps.length)} />
      </dl>
      {disabledReason && (
        <p
          className="mt-2 text-xs text-muted"
          data-testid={`available-disabled-reason-${entry.module_id}`}
        >
          {disabledReason}
        </p>
      )}
    </article>
  );
}

function Meta({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <dt className="tech-token uppercase tracking-widest text-[9px] text-muted">
        {label}
      </dt>
      <dd className={"mt-1 " + (tone ?? "text-ink")}>{value}</dd>
    </div>
  );
}

// Enable modal — grants every matter-scoped capability. Non-matter
// capabilities (workspace / provider / etc.) are NOT posted: the
// runtime rejects them with 422 at matter scope. If a skill has
// no matter-scoped capabilities the modal isn't reachable
// (AvailableModuleRow disables the Enable button with an honest
// reason). Any grant failure aborts the rest, keeps the modal open,
// and surfaces the real error.

function EnableSkillModal({
  slug,
  entry,
  installed,
  onClose,
  onEnabled,
}: {
  slug: string;
  entry: V2ManifestEntry;
  installed: InstalledModule | null;
  onClose: () => void;
  onEnabled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = manifestText(entry, "name") ?? entry.module_id;
  // Modal copy is matter-scoped: what enabling here actually does, not
  // what the skill could do at other scopes.
  const reads = capabilityStrings(entry, "reads", { matterOnly: true });
  const writes = capabilityStrings(entry, "writes", { matterOnly: true });
  const matterCaps = matterCapabilityIds(entry);

  const onSubmit = async () => {
    if (matterCaps.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      // createGrant is idempotent (was_idempotent_noop
      // on a no-op rerun), so re-enable on an already-granted skill is
      // safe. Any real failure halts the run so the modal can show
      // honest state instead of silently closing as "enabled."
      for (const cap of matterCaps) {
        await createGrant(slug, {
          module_id: entry.module_id,
          capability_id: cap,
        });
      }
      onEnabled();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="enable-skill-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[480px] rounded-card border border-rule bg-paper p-5 shadow-xl">
        <p className="text-[11px] uppercase tracking-widest text-muted">
          Enable skill
        </p>
        <h2 id="enable-skill-title" className="mt-1 text-lg font-semibold text-ink">
          Enable {name} in this matter
        </h2>
        <p className="mt-1 tech-token text-[11px] text-muted">{entry.module_id}</p>

        {/* Step 3 — document scope */}
        <Block label="Documents this skill will see">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              checked
              readOnly
              aria-label="All documents in this matter"
              className="mt-1"
            />
            <span>
              <span className="text-ink">All documents in this matter</span>
              <span className="mt-0.5 block text-xs text-muted">
                Per-document narrowing can be added later without changing this permission.
              </span>
            </span>
          </label>
        </Block>

        {/* Step 4 — output scope */}
        <Block label="What this skill writes">
          <p className="text-sm text-ink">{shortCapabilityList(writes)}</p>
          <p className="mt-1 text-xs text-muted">
            Outputs land in the matter Record. Per-output narrowing arrives
            once output-specific permissions are available.
          </p>
        </Block>

        {/* Step 5 — inherited workspace trust */}
        <Block label="Inherited from workspace trust">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Pair label="Reads" value={shortCapabilityList(reads)} />
            <Pair label="Signature" value={installed?.signature_status ?? "—"} />
            <Pair label="Publisher" value={manifestText(entry, "publisher") ?? "—"} />
            <Pair
              label="Trusted on"
              value={
                installed?.installed_at
                  ? new Date(installed.installed_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"
              }
            />
          </dl>
        </Block>

        {err && (
          <p className="mt-3 text-xs text-seal" data-testid="enable-modal-error">
            {err}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={busy || matterCaps.length === 0}
            data-testid="enable-modal-submit"
            className="rounded-md bg-ink px-4 py-1.5 text-sm text-paper hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Enabling…" : "Enable"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-4 border-t border-rule pt-3">
      <p className="text-[11px] uppercase tracking-widest text-muted">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-xs text-ink">{value}</dd>
    </div>
  );
}
