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
type SkillTab = "installed" | "available" | "revoked";

// "disabled" in the substrate (InstalledModule.enabled === false) is the
// user-facing "Revoked" state per blueprint §7: a skill that was
// previously trusted in this workspace and is no longer active.
function tabOf(state: ModuleState): SkillTab {
  return state === "disabled" ? "revoked" : state;
}

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
  disabled: "Revoked",
};

const TAB_LABEL: Record<SkillTab, string> = {
  installed: "Installed",
  available: "Available",
  revoked: "Revoked",
};

// Compatibility badge per blueprint §7 Marketplace Compatibility Badge.
// V1 ships a Claude-native skill format; every skill in the V2 registry
// is tested against Sonnet 4.6+, so the badge is unconditional here.
// When the manifest grows a compatibility field it can move to per-skill.
function CompatibilityBadge() {
  return (
    <span
      title="Tested against Anthropic Claude Sonnet 4.6 or newer. Legalise can support other approved model providers; the skill format is Claude-native in V1."
      className="inline-flex items-center gap-1 rounded-full border border-rule px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted"
    >
      Tested with Claude Sonnet 4.6+
    </span>
  );
}

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
  const [tab, setTab] = useState<SkillTab>("installed");
  const isOperator = !!auth.user?.is_superuser;

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
      if (tabOf(stateOf(m.module_id)) !== tab) return false;
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
  }, [installed, modules, query, tab]);

  const tabCounts = useMemo(() => {
    const counts: Record<SkillTab, number> = {
      installed: 0,
      available: 0,
      revoked: 0,
    };
    if (modules) {
      for (const m of modules) counts[tabOf(stateOf(m.module_id))] += 1;
    }
    return counts;
  }, [installed, modules]);

  // Default to Installed if anything is installed, otherwise show
  // Available so a fresh workspace lands on the discovery view.
  useEffect(() => {
    if (modules === null) return;
    if (tabCounts.installed === 0 && tabCounts.available > 0 && tab === "installed") {
      setTab("available");
    }
  }, [modules, tab, tabCounts.installed, tabCounts.available]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 text-ink">
      <PageHeader
        eyebrow={authed ? "Workspace" : "Skill library"}
        title="Skills"
        description={
          authed
            ? "Install legal skills at the workspace, then enable them inside the matter where they should run."
            : "Legal skills are small pieces of legal work: review an NDA, test a claim, draft a letter, check authorities. Browse the library, then open the demo to see one run against a matter."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {authed ? (
              <>
                <Link
                  to="/skills/lawve"
                  className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:border-ink"
                >
                  Import from Lawve
                </Link>
                <Link
                  to="/skills/create"
                  className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:border-ink"
                >
                  Create skill
                </Link>
              </>
            ) : (
              <a
                href="/demo"
                className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-black"
              >
                Open demo
              </a>
            )}
          </div>
        }
      />

      {!authed && (
        <section className="mb-10 grid gap-px border border-rule bg-rule sm:grid-cols-3">
          <DemoStep
            title="1. Pick a skill"
            body="A skill is a governed action with declared inputs and outputs."
          />
          <DemoStep
            title="2. Run it in a matter"
            body="The skill works against the project documents, not a loose prompt."
          />
          <DemoStep
            title="3. Check the record"
            body="The output, sources, and sign-off become part of the matter record."
          />
        </section>
      )}

      {error && (
        <p className="text-sm text-seal">Could not load skills: {error}</p>
      )}

      {/* Primary: reference skills (v2 registry).
          §7 tab structure: Installed / Available / Revoked
          (Revoked is operator-only). */}
      {authed && (
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xs uppercase tracking-widest text-muted">
            Workspace skills
          </h2>
          {authed && modules && modules.length > 0 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills"
              aria-label="Search skills"
              className="min-h-[38px] w-48 border border-rule bg-paper px-3 text-[16px] text-ink focus:border-ink focus:outline-none"
            />
          )}
        </div>

        {authed && modules && modules.length > 0 && (
          <div
            role="tablist"
            aria-label="Skill state"
            className="mt-3 flex border-b border-rule"
          >
            {(["installed", "available", ...(isOperator ? (["revoked"] as const) : [])] as SkillTab[]).map(
              (t) => {
                const active = tab === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t)}
                    data-testid={`skills-tab-${t}`}
                    className={
                      "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
                      (active
                        ? "border-ink text-ink"
                        : "border-transparent text-muted hover:text-ink")
                    }
                  >
                    {TAB_LABEL[t]}
                    <span className="ml-1.5 font-mono text-xs text-muted">
                      {tabCounts[t]}
                    </span>
                  </button>
                );
              },
            )}
          </div>
        )}
        {modules === null ? (
          <p className="mt-3 text-sm text-muted">Loading skills…</p>
        ) : modules.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No reference skills in the registry yet.
          </p>
        ) : filteredModules?.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {tab === "installed"
              ? "No skills installed in this workspace yet. Switch to Available to browse the registry."
              : tab === "revoked"
                ? "No skills have been revoked in this workspace."
                : query
                  ? "No skills match that search."
                  : "Nothing to install — all reference skills are already trusted in this workspace."}
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
                    to="/skills/$moduleId"
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
                    <div className="mt-2">
                      <CompatibilityBadge />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {caps} permission set{caps === 1 ? "" : "s"}
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
      )}

      {/* Secondary: open skill library (browse only, not an install path) */}
      <section className={authed ? "mt-10" : "mt-4"}>
        {authed ? (
          <button
            type="button"
            onClick={() => setShowSkills((v) => !v)}
            className="text-xs uppercase tracking-widest text-muted hover:text-ink"
            data-testid="toggle-skills"
            aria-expanded={showSkills}
          >
            {showSkills ? "Hide" : "Browse"} open skill library
            {skills ? ` (${skills.length})` : ""}
          </button>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xs uppercase tracking-widest text-muted">
                Browse legal skills{skills ? ` (${skills.length})` : ""}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-prose">
                These examples come from the open legal skills library. Legalise
                turns this kind of skill into something a firm can install, run
                inside a matter, review, sign, and audit.
              </p>
            </div>
            <a
              href="https://github.com/lawve-ai/awesome-legal-skills"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted underline underline-offset-4 hover:text-ink"
            >
              View source
            </a>
          </div>
        )}
        {(showSkills || !authed) && (
          <div className="mt-3">
            {authed && (
            <p className="text-xs text-muted">
              The open skill library — browse what's available. These are not
              installed from here; reference skills above are the install path.
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
            )}
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

function DemoStep({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-paper p-4">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-prose">{body}</p>
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
