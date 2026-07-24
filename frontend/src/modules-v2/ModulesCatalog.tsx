/**
 * /modules — the standalone Modules / Integrations home
 * (Module Standalone v1).
 *
 * Two distinct concepts, kept separate (ratified — no unification):
 *   1. PRIMARY: governed reference modules from the v2 registry
 *      (getModulesV2). These are what you add / trust / run. Each
 *      card shows its workspace state (Available / Added / Added
 *      · disabled) derived from listInstalledModules.
 *   2. SECONDARY: the Lawve catalogue (listLawveSkills) — the open
 *      legal skills library, with a Review-&-add path per skill.
 *
 * Enablement is per-matter: adding a module at the workspace does
 * not make it "ready everywhere" — running it is granted from a matter.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  getModulesV2,
  listInstalledModules,
  listModuleRequests,
  type InstalledModule,
  type ModuleRequestRow,
  type V2ManifestEntry,
} from "../lib/api";
import { PageHeader } from "../ui/primitives";
import {
  CertCard,
  CertEyebrow,
  InkBands,
  LedgerLine,
  LedgerRow,
  SectionRule,
} from "../ui/certificate";
import {
  getLawveDirectoryCount,
  listLawveSkills,
  type LawveDirectoryCount,
  type LawveSkillRow,
} from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import {
  groupSkills,
  licenceLabel,
  skillDisplayName,
} from "./skillDisplay";

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
const STATE_LABEL: Record<ModuleState, string> = {
  available: "Available",
  installed: "Added",
  disabled: "Revoked",
};

const TAB_LABEL: Record<SkillTab, string> = {
  installed: "Added",
  available: "Available",
  revoked: "Revoked",
};

// Compatibility badge per blueprint §7 Marketplace Compatibility Badge.
// V1 ships a Claude-native skill format; every skill in the V2 registry
// is tested against Sonnet 4.6+, so the badge is unconditional here.
// When the manifest grows a compatibility field it can move to per-skill.

export function ModulesCatalog() {
  // /modules is a public route (anyone can browse). The v2 registry +
  // installed-state calls are authed, so only fire them for a signed-in
  // user; anon browsers still get the open skill library below.
  const auth = useAuth();
  const authed = !!auth.user;
  const [modules, setModules] = useState<V2ManifestEntry[] | null>(null);
  const [installed, setInstalled] = useState<Map<string, InstalledModule>>(new Map());
  const [lawve, setLawve] = useState<LawveSkillRow[] | null>(null);
  // The honest gap strip — lawve.ai directory size vs importable here.
  // Degrades silently: null hides the strip entirely.
  const [directory, setDirectory] = useState<LawveDirectoryCount | null>(null);

  // The shelf is public (the catalogue GETs are open), so it stocks for
  // anonymous browsers too — no auth gate on these reads.
  useEffect(() => {
    let cancelled = false;
    listLawveSkills()
      .then((res) => {
        if (!cancelled) setLawve(res?.skills ?? []);
      })
      .catch(() => {
        if (!cancelled) setLawve([]);
      });
    getLawveDirectoryCount()
      .then((res) => {
        if (!cancelled && typeof res?.count === "number" && res.count > 0) {
          setDirectory(res);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SkillTab>("installed");
  const isOperator = !!auth.user?.is_superuser;

  // Workspace skill requests (admin only). Derived from the audit
  // chain server-side; section renders only when something is pending.
  const [requests, setRequests] = useState<ModuleRequestRow[]>([]);
  useEffect(() => {
    if (!authed || !isOperator) return;
    let cancelled = false;
    listModuleRequests()
      .then((rows) => {
        if (!cancelled) setRequests(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authed, isOperator]);

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

  // Shelf control — one search box over the open catalogue. Ordering
  // comes from the shared grouping (skillDisplay.ts): quiet what-they-do
  // sections, alphabetical by display name inside each.
  const [shelfQuery, setShelfQuery] = useState("");

  const shelf = useMemo(() => {
    const term = shelfQuery.trim().toLowerCase();
    if (!term) return lawve ?? [];
    return (lawve ?? []).filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        skillDisplayName(s.slug, s.author_name).toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term) ||
        (s.author_name ?? "").toLowerCase().includes(term),
    );
  }, [lawve, shelfQuery]);
  // A group with no surviving rows disappears with its header.
  const shelfGroups = useMemo(() => groupSkills(shelf), [shelf]);

  // Default to Added if anything is already trusted, otherwise show
  // Available so a fresh workspace lands on the discovery view.
  useEffect(() => {
    if (modules === null) return;
    if (tabCounts.installed === 0 && tabCounts.available > 0 && tab === "installed") {
      setTab("available");
    }
  }, [modules, tab, tabCounts.installed, tabCounts.available]);

  return (
    <div className="page-shell">
      <PageHeader
        display
        title="Skill library"
        description={
          authed
            ? "A skill is one piece of legal work — review an NDA, screen a dismissal, draft a letter. Add one, switch it on in a matter, run it from Chat."
            : "Legal skills are small pieces of legal work: review an NDA, test a claim, draft a letter, check authorities. Browse the library, then open the demo to see one run against a matter."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {authed ? (
              <>
                <Link
                  to="/skills/lawve"
                  className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-seal"
                >
                  Add skill
                </Link>
                <Link
                  to="/skills/create"
                  className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:border-ink"
                >
                  Create skill
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center px-2 py-2 text-sm text-muted hover:text-seal"
                >
                  My skills →
                </Link>
              </>
            ) : (
              <a
                href="/guided-demo"
                className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-seal"
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
            body="The skill works against the matter's documents, not a loose prompt."
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

      {/* Requested by your workspace — admin only, only when the
          audit chain holds pending requests. Each row links into the
          importer where the trust ceremony starts. */}
      {authed && isOperator && requests.length > 0 && (
        <section className="mb-12" data-testid="skill-requests">
          <SectionRule
            label="Requested by your workspace"
            right={String(requests.length)}
          />
          <div className="mt-1">
            {requests.map((r, i) => (
              <LedgerLine
                key={r.module_id}
                index={i + 1}
                label="Requested"
                testid={`skill-request-${r.module_id}`}
                right={
                  <a
                    href={
                      r.source === "lawve"
                        ? // Lawve draft ids are "lawve.{slug}"; the importer
                          // deep-link takes the bare slug.
                          `/skills/lawve?skill=${encodeURIComponent(r.module_id.replace(/^lawve\./, ""))}`
                        : r.source?.startsWith("github") && r.source_url
                          ? // GitHub-sourced requests carry their repo URL;
                            // the importer auto-fetches it on mount.
                            `/skills/lawve?github=${encodeURIComponent(r.source_url)}`
                          : "/skills/lawve"
                    }
                    className="text-sm text-muted hover:text-seal"
                  >
                    Review &amp; add →
                  </a>
                }
              >
                <span className="tech-token">{r.module_id}</span>
                <span className="ml-2 text-[11px] text-muted">
                  {r.source ? `via ${r.source} · ` : ""}
                  {new Date(r.requested_at).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </LedgerLine>
            ))}
          </div>
        </section>
      )}

      {/* Primary: reference skills (v2 registry).
          §7 tab structure: Added / Available / Revoked
          (Revoked is operator-only). Hidden entirely when the registry
          is empty — hosted has no filesystem reference modules, and an
          empty schedule is noise, not information. */}
      {authed && modules !== null && modules.length > 0 && (
      <section>
        <SectionRule
          label="Workspace skills"
          right={modules ? String(modules.length) : undefined}
        />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <span aria-hidden="true" />
          {authed && modules && modules.length > 0 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills"
              aria-label="Search skills"
              className="min-h-[38px] w-48 border border-rule bg-paper px-3 text-[16px] text-ink focus:border-ink focus:outline-hidden"
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
                    <span className="ml-1.5 tech-token text-xs text-muted">
                      {tabCounts[t]}
                    </span>
                  </button>
                );
              },
            )}
          </div>
        )}
        {filteredModules?.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {tab === "installed"
              ? "No skills added to this workspace yet. Switch to Available to browse the registry."
              : tab === "revoked"
                ? "No skills have been revoked in this workspace."
                : query
                  ? "No skills match that search."
                  : "Nothing to add — all reference skills are already trusted in this workspace."}
          </p>
        ) : (
          <ul className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {filteredModules?.map((m, i) => {
              const st = stateOf(m.module_id);
              const caps = capCount(m);
              const reads = capabilityStrings(m, "reads");
              const writes = capabilityStrings(m, "writes");
              return (
                <li key={m.module_id}>
                  <Link
                    to="/skills/$moduleId"
                    params={{ moduleId: m.module_id }}
                    className="block transition-opacity hover:opacity-80"
                  >
                    <CertCard tone={st === "disabled" ? "seal" : "ink"}>
                      <CertEyebrow
                        left={`Skill ${String(i + 1).padStart(2, "0")}`}
                        right={
                          <span data-testid={`module-state-${m.module_id}`}>
                            {STATE_LABEL[st]}
                          </span>
                        }
                        rightTone={
                          st === "available"
                            ? "muted"
                            : st === "installed"
                              ? "ink"
                              : "seal"
                        }
                      />
                      <h3 className="mt-3 text-[22px] leading-tight tracking-tight2 text-ink">
                        {manifestStr(m, "name") ?? m.module_id}
                      </h3>
                      <p className="mt-1 text-xs text-muted">
                        {manifestStr(m, "publisher")
                          ? `${manifestStr(m, "publisher")} · `
                          : ""}
                        <span className="tech-token">{m.module_id}</span>
                      </p>
                      <div className="mt-4 space-y-2">
                        <InkBands label="Reads" values={reads} />
                        <InkBands label="Writes" values={writes} />
                      </div>
                      <dl className="mt-4 space-y-1 border-t border-rule pt-3 text-[11px] text-muted">
                        <LedgerRow label="Permission sets">
                          {caps}
                          {!m.is_valid ? " · manifest invalid" : ""}
                        </LedgerRow>
                        <LedgerRow label="Tested with">
                          Claude Sonnet 4.6+
                        </LedgerRow>
                      </dl>
                    </CertCard>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      )}

      {/* The stocked shelf: the open Lawve catalogue, reviewable and
          addable in two clicks. Public — the anonymous /skills page is
          a real library, not three boxes (the catalogue GETs are open;
          importing still requires a workspace). */}
      <section className="mt-12" data-testid="lawve-catalogue">
          <SectionRule
            label="Catalogue"
            right={
              authed ? (
                <Link
                  to="/skills/lawve"
                  className="normal-case tracking-normal text-sm text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                >
                  Open full importer →
                </Link>
              ) : (
                <a
                  href="/auth/signup"
                  className="normal-case tracking-normal text-sm text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                >
                  Run locally to import →
                </a>
              )
            }
          />
          {/* The three ways in, then the one rule. No sub-heading —
              the cells say it themselves. */}
          <div
            className="mt-4 grid gap-px border border-rule bg-rule sm:grid-cols-3"
            data-testid="skill-sources"
          >
            <SourceRoute
              name={
                <a
                  href="https://lawve.ai"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                  data-testid="lawve-link"
                >
                  Lawve
                </a>
              }
              body="The community catalogue of legal skills."
            />
            <SourceRoute
              name="Any public GitHub repo"
              body={
                <>
                  Needs a SKILL.md file at the top of the repo. We pin the
                  exact version you imported. Community-built skills are
                  indexed in the{" "}
                  <a
                    href="https://github.com/b1rdmania/legalise/blob/master/docs/CATALOGUE.md"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                  >
                    community catalogue
                  </a>
                  .
                </>
              }
            />
            <SourceRoute
              name={
                <Link
                  to="/skills/create"
                  className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                >
                  Write your own
                </Link>
              }
              body="Author a skill for this workspace from scratch."
            />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Wherever a skill comes from, nothing runs until you have
            reviewed and approved it here.
          </p>

          {lawve == null ? (
            <p className="mt-3 text-sm text-muted">Loading catalogue…</p>
          ) : lawve.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Catalogue unavailable right now.
            </p>
          ) : (
            <>
              <p className="mt-5 text-sm text-prose" data-testid="shelf-lede">
                We've pulled {lawve.length} skills from Lawve's public
                GitHub feed. Lawve stopped updating that feed, so this is
                a partial set
                {directory ? (
                  <>
                    {" "}
                    —{" "}
                    <a
                      href={directory.skills_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                    >
                      lawve.ai
                    </a>{" "}
                    lists {directory.count}
                  </>
                ) : null}
                . Found one there that isn't below? Import it by its
                GitHub link.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <input
                  value={shelfQuery}
                  onChange={(e) => setShelfQuery(e.target.value)}
                  placeholder="Search the catalogue"
                  aria-label="Search the catalogue"
                  className="min-h-[34px] w-48 border border-rule bg-paper px-3 text-[13px] text-ink focus:border-ink focus:outline-hidden"
                  data-testid="shelf-search"
                />
                <span className="text-muted" data-testid="shelf-count">
                  {shelf.length} of {lawve.length}
                </span>
              </div>
              <div className="mt-1">
                {shelf.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">
                    No catalogue skills match that filter.
                  </p>
                ) : (
                  (() => {
                    // Continuous ledger numbering across the groups.
                    let n = 0;
                    return shelfGroups.map((group) => (
                      <div key={group.id} data-testid={`shelf-group-${group.id}`}>
                        <div className="mt-6 flex items-baseline justify-between border-b border-rule pb-1.5">
                          <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted">
                            {group.label}
                          </h3>
                          <span className="tech-token text-[11px] text-muted">
                            {group.skills.length}
                          </span>
                        </div>
                        {group.note && (
                          <p className="mt-1.5 text-[11px] text-muted">
                            {group.note}
                          </p>
                        )}
                        {group.skills.map((s) => {
                          n += 1;
                          return (
                            <LedgerLine
                              key={s.slug}
                              index={n}
                              label={licenceLabel(s.license)}
                              right={
                                <span className="flex items-baseline gap-4">
                                  {s.lawve_url && (
                                    <a
                                      href={s.lawve_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="hidden text-[12px] text-muted hover:text-seal sm:inline"
                                      data-testid={`shelf-lawve-link-${s.slug}`}
                                    >
                                      View on Lawve →
                                    </a>
                                  )}
                                  <a
                                    href={`/skills/lawve?skill=${encodeURIComponent(s.slug)}`}
                                    className="text-sm text-muted hover:text-seal"
                                  >
                                    Review &amp; add →
                                  </a>
                                </span>
                              }
                            >
                              <span className="block min-w-0">
                                <span className="text-ink">
                                  {skillDisplayName(s.slug, s.author_name)}
                                </span>
                                <span className="ml-2 hidden text-[11px] text-muted sm:inline">
                                  <span className="tech-token">{s.slug}</span>
                                  {" · "}
                                  {s.author_name ?? "unknown"}
                                  {(s.has_scripts || s.script_review_required) && (
                                    <span className="text-seal">
                                      {" · ships scripts — manual review"}
                                    </span>
                                  )}
                                </span>
                                <span className="block truncate text-[12px] text-muted">
                                  {s.description}
                                </span>
                              </span>
                            </LedgerLine>
                          );
                        })}
                      </div>
                    ));
                  })()
                )}
              </div>
            </>
          )}
      </section>
    </div>
  );
}


/** One admission route in the "Where skills come from" strip. */
function SourceRoute({ name, body }: { name: ReactNode; body: ReactNode }) {
  return (
    <div className="bg-paper p-4">
      <h3 className="text-sm font-semibold text-ink">{name}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">{body}</p>
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
