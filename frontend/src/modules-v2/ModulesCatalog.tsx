/**
 * /modules — the standalone Modules / Integrations home
 * (Module Standalone v1).
 *
 * Two distinct concepts, kept separate (ratified — no unification):
 *   1. PRIMARY: governed reference modules from the v2 registry
 *      (getModulesV2). These are what you install / trust / run. Each
 *      card shows its workspace state (Available / Installed / Installed
 *      · disabled) derived from listInstalledModules.
 *   2. SECONDARY: the open UK-legal skill library (getPublicModules) —
 *      browse only, NOT an install path. Collapsed by default.
 *
 * Enablement is per-matter: installing a module at the workspace does
 * not make it "ready everywhere" — running it is granted from a matter.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  getModulesV2,
  getPublicModules,
  listInstalledModules,
  type InstalledModule,
  type PublicModuleSkill,
  type V2ManifestEntry,
} from "../lib/api";
import { PageHeader } from "../ui/primitives";
import { useAuth } from "../auth/AuthProvider";

type ModuleState = "available" | "installed" | "disabled";
type StateFilter = "all" | ModuleState;

function manifestStr(entry: V2ManifestEntry, key: string): string | undefined {
  const v = (entry.manifest as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}
function capCount(entry: V2ManifestEntry): number {
  const caps = (entry.manifest as Record<string, unknown>).capabilities;
  return Array.isArray(caps) ? caps.length : 0;
}
function capabilityStrings(entry: V2ManifestEntry, key: "reads" | "writes"): string[] {
  const caps = (entry.manifest as Record<string, unknown>).capabilities;
  if (!Array.isArray(caps)) return [];
  const out = new Set<string>();
  for (const raw of caps) {
    if (!raw || typeof raw !== "object") continue;
    const values = (raw as Record<string, unknown>)[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value === "string") out.add(value);
    }
  }
  return [...out].sort();
}
function shortPermissionList(values: string[]): string {
  if (values.length === 0) return "None declared";
  if (values.length <= 2) return values.join(", ");
  return `${values.slice(0, 2).join(", ")} +${values.length - 2}`;
}
function suiteLabel(plugin: string): string {
  return plugin
    .replace(/-legal$/, "")
    .split("-")
    .map((w) => (w === "uk" ? "UK" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const STATE_LABEL: Record<ModuleState, string> = {
  available: "Available",
  installed: "Installed",
  disabled: "Installed · disabled",
};

export function ModulesCatalog() {
  // /modules is a public route (anyone can browse). The v2 registry +
  // installed-state calls are authed, so only fire them for a signed-in
  // user; anon browsers still get the open skill library below.
  const auth = useAuth();
  const authed = !!auth.user;
  const [modules, setModules] = useState<V2ManifestEntry[] | null>(null);
  const [installed, setInstalled] = useState<Map<string, InstalledModule>>(new Map());
  const [skills, setSkills] = useState<PublicModuleSkill[] | null>(null);
  const [skillsRepo, setSkillsRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSkills, setShowSkills] = useState(false);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");

  useEffect(() => {
    let cancelled = false;
    if (authed) {
      getModulesV2()
        .then((res) => {
          if (!cancelled) setModules(res.modules);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(String(err));
        });
      listInstalledModules()
        .then((rows) => {
          if (cancelled) return;
          const idx = new Map<string, InstalledModule>();
          for (const r of rows) idx.set(r.module_id, r);
          setInstalled(idx);
        })
        .catch(() => undefined);
    }
    getPublicModules()
      .then((res) => {
        if (cancelled) return;
        setSkills(res.skills);
        setSkillsRepo(res.source.repo);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authed]);

  const stateOf = (moduleId: string): ModuleState => {
    const row = installed.get(moduleId);
    if (!row) return "available";
    return row.enabled ? "installed" : "disabled";
  };

  const filteredModules = useMemo(() => {
    if (modules === null) return null;
    const q = query.trim().toLowerCase();
    return modules.filter((m) => {
      const st = stateOf(m.module_id);
      if (stateFilter !== "all" && st !== stateFilter) return false;
      if (!q) return true;
      const haystack = [
        m.module_id,
        manifestStr(m, "name") ?? "",
        manifestStr(m, "publisher") ?? "",
        manifestStr(m, "description") ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [installed, modules, query, stateFilter]);

  const stateCounts = useMemo(() => {
    const counts: Record<ModuleState, number> = {
      available: 0,
      installed: 0,
      disabled: 0,
    };
    if (modules) {
      for (const m of modules) counts[stateOf(m.module_id)] += 1;
    }
    return counts;
  }, [installed, modules]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-ink">
      <PageHeader
        eyebrow="Workspace"
        title="Skills"
        description="Governed legal skills. Install a reference skill at the workspace, then enable and run it per matter — installing here does not make it ready everywhere."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/modules/lawve"
              className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:border-ink"
            >
              Import from Lawve
            </Link>
            <Link
              to="/modules/create"
              className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:border-ink"
            >
              Create module
            </Link>
          </div>
        }
      />

      {error && (
        <p className="text-sm text-seal">Could not load modules: {error}</p>
      )}

      {/* Primary: reference modules (v2 registry) */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted">
              Reference modules
            </h2>
            {modules && (
              <p className="mt-1 text-sm text-muted">
                {stateCounts.installed} installed · {stateCounts.disabled} disabled ·{" "}
                {stateCounts.available} available
              </p>
            )}
          </div>
          {authed && modules && modules.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search modules"
                aria-label="Search modules"
                className="min-h-[38px] w-48 border border-rule bg-paper px-3 text-[16px] text-ink focus:border-ink focus:outline-none"
              />
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value as StateFilter)}
                aria-label="Filter module state"
                className="min-h-[38px] border border-rule bg-paper px-3 text-sm text-ink focus:border-ink focus:outline-none"
              >
                <option value="all">All states</option>
                <option value="installed">Installed</option>
                <option value="available">Available</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          )}
        </div>
        {!authed ? (
          <p className="mt-3 text-sm text-muted" data-testid="modules-signin-prompt">
            Sign in to install and manage governed reference modules. The open
            skill library below is browsable without an account.
          </p>
        ) : modules === null ? (
          <p className="mt-3 text-sm text-muted">Loading modules…</p>
        ) : modules.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No reference modules in the registry yet.
          </p>
        ) : filteredModules?.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No modules match that search and state filter.
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-px bg-rule border border-rule sm:grid-cols-2">
            {filteredModules?.map((m) => {
              const st = stateOf(m.module_id);
              const caps = capCount(m);
              const reads = capabilityStrings(m, "reads");
              const writes = capabilityStrings(m, "writes");
              return (
                <li key={m.module_id} className="bg-paper p-4 hover:bg-wash transition-colors">
                  <Link
                    to="/modules/$moduleId"
                    params={{ moduleId: m.module_id }}
                    className="block"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-sm font-medium text-ink">
                        {manifestStr(m, "name") ?? m.module_id}
                      </h3>
                      <span
                        className={
                          "shrink-0 text-[10px] uppercase tracking-widest " +
                          (st === "available"
                            ? "text-muted"
                            : st === "installed"
                              ? "text-ink"
                              : "text-seal")
                        }
                        data-testid={`module-state-${m.module_id}`}
                      >
                        {STATE_LABEL[st]}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {m.module_id}
                      {manifestStr(m, "publisher") ? ` · ${manifestStr(m, "publisher")}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {caps} capabilit{caps === 1 ? "y" : "ies"}
                      {!m.is_valid ? " · manifest invalid" : ""}
                    </p>
                    <dl className="mt-3 grid grid-cols-1 gap-2 border-t border-rule pt-3 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="font-mono uppercase tracking-widest text-[9px] text-muted">
                          Reads
                        </dt>
                        <dd className="mt-1 text-ink">
                          {shortPermissionList(reads)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono uppercase tracking-widest text-[9px] text-muted">
                          Writes
                        </dt>
                        <dd className="mt-1 text-ink">
                          {shortPermissionList(writes)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-xs text-muted">
                      Running happens inside a matter after permissions are
                      granted. Install state here is workspace-level.
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Secondary: open skill library (browse only, not an install path) */}
      <section className="mt-10">
        <button
          type="button"
          onClick={() => setShowSkills((v) => !v)}
          className="text-xs uppercase tracking-widest text-muted hover:text-ink"
          data-testid="toggle-skills"
          aria-expanded={showSkills}
        >
          {showSkills ? "Hide" : "Browse"} UK legal skills
          {skills ? ` (${skills.length})` : ""}
        </button>
        {showSkills && (
          <div className="mt-3">
            <p className="text-xs text-muted">
              The open skill library — browse what's available. These are not
              installed from here; reference modules above are the install path.
              {skillsRepo ? (
                <>
                  {" "}
                  <a
                    href={
                      skillsRepo.startsWith("http")
                        ? skillsRepo
                        : `https://github.com/${skillsRepo}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-ink"
                  >
                    {skillsRepo.replace(/^https?:\/\/github\.com\//, "")}
                  </a>
                </>
              ) : null}
            </p>
            {skills === null ? (
              <p className="mt-3 text-sm text-muted">Loading skills…</p>
            ) : skills.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No skills in the library yet.</p>
            ) : (
              <SkillsBySuite skills={skills} />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SkillsBySuite({ skills }: { skills: PublicModuleSkill[] }) {
  const groups = new Map<string, PublicModuleSkill[]>();
  for (const s of skills) {
    const arr = groups.get(s.plugin) ?? [];
    arr.push(s);
    groups.set(s.plugin, arr);
  }
  const suites = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="mt-4 space-y-6">
      {suites.map(([plugin, suiteSkills]) => (
        <section key={plugin}>
          <h3 className="text-[11px] uppercase tracking-widest text-muted border-b border-rule pb-2">
            {suiteLabel(plugin)}
          </h3>
          <ul className="mt-3 grid grid-cols-1 gap-px bg-rule border border-rule sm:grid-cols-2">
            {suiteSkills
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => (
                <li
                  key={`${s.plugin}/${s.skill}`}
                  className="bg-paper p-4"
                >
                  <h4 className="text-sm font-medium text-ink">{s.name}</h4>
                  <p className="mt-1 font-mono text-[11px] text-muted">{s.skill}</p>
                  <p className="mt-2 text-sm text-muted line-clamp-2">{s.description}</p>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
