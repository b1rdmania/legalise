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

import { useEffect, useMemo, useState } from "react";
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
  Colophon,
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

type ModuleState = "available" | "installed" | "disabled";
type SkillTab = "installed" | "available" | "revoked";
// Shelf sort keys. The catalogue's real metadata is marketplace.json's
// name / author / licence (the SKILL.md frontmatter vocabulary carries
// nothing beyond it — surveyed upstream), so those are the facets.
type ShelfSort = "name" | "author" | "licence";

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

  // Schedule B shelf controls — client-side search, facets, and sort
  // over the open catalogue, in the importer's filter idiom.
  const [shelfQuery, setShelfQuery] = useState("");
  const [shelfLicense, setShelfLicense] = useState("");
  const [shelfAuthor, setShelfAuthor] = useState("");
  const [shelfSort, setShelfSort] = useState<ShelfSort>("name");

  const shelfLicenses = useMemo(
    () =>
      [...new Set((lawve ?? []).map((s) => s.license).filter((l): l is string => !!l))].sort(),
    [lawve],
  );
  const shelfAuthors = useMemo(
    () =>
      [...new Set((lawve ?? []).map((s) => s.author_name).filter((a): a is string => !!a))].sort(),
    [lawve],
  );
  const shelf = useMemo(() => {
    const term = shelfQuery.trim().toLowerCase();
    const rows = (lawve ?? []).filter((s) => {
      if (shelfLicense && s.license !== shelfLicense) return false;
      if (shelfAuthor && s.author_name !== shelfAuthor) return false;
      if (!term) return true;
      return (
        s.name.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term) ||
        (s.author_name ?? "").toLowerCase().includes(term) ||
        (s.license ?? "").toLowerCase().includes(term)
      );
    });
    const key = (s: LawveSkillRow) =>
      shelfSort === "author"
        ? (s.author_name ?? "")
        : shelfSort === "licence"
          ? (s.license ?? "")
          : s.name;
    return rows.sort(
      (a, b) => key(a).localeCompare(key(b)) || a.name.localeCompare(b.name),
    );
  }, [lawve, shelfQuery, shelfLicense, shelfAuthor, shelfSort]);

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
        whisper="Browse and add skills"
        description={
          authed
            ? "Browse skills and add them to your workspace. A skill is a piece of legal work — review an NDA, screen a dismissal, draft a letter. Once added, enable it on a matter and run it from Chat. To see the skills you've already added, with their track record, go to Your skills."
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
                  Your skills →
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

      {/* Intro band — the plain-English value proposition, set as a
          register leaf: headline, two short lines, then the three steps
          every skill goes through here. Composed from existing tokens
          (ink / paper / rule / muted / seal) — no new colours or media. */}
      <section
        className="mb-12 border border-ink/70 bg-paper p-6 sm:p-8"
        data-testid="skills-intro"
      >
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
          Skills, kept on the record
        </p>
        <h2 className="mt-3 max-w-2xl text-[30px] leading-tight tracking-tight2 text-ink sm:text-[34px]">
          Skills are powerful. Run loose, they make a mess.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-prose">
          Legalise adds a skill, scans it for safety, and puts every run
          behind an audit step and a human sign-off.
        </p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-prose">
          You control the model. It does not control you.
        </p>

        <div className="mt-6 grid gap-px border border-rule bg-rule sm:grid-cols-3">
          <IntroStep
            step="01"
            title="Install"
            body="Add a skill from the catalogue into your workspace."
          />
          <IntroStep
            step="02"
            title="Scan"
            body="We check its signature and what it is allowed to touch."
          />
          <IntroStep
            step="03"
            title="Sign off"
            body="Every run is audited, then signed off by a person."
          />
        </div>

        <p className="mt-6 text-sm text-muted">
          Looking for more?{" "}
          <a
            href="https://lawve.ai"
            target="_blank"
            rel="noreferrer"
            className="text-ink underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
            data-testid="lawve-link"
          >
            Browse community skills on Lawve →
          </a>
        </p>
      </section>

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
          (Revoked is operator-only). */}
      {authed && (
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
                    <span className="ml-1.5 tech-token text-xs text-muted">
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
            label="The open catalogue"
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
                  Create a workspace to import →
                </a>
              )
            }
          />
          {lawve == null ? (
            <p className="mt-3 text-sm text-muted">Loading catalogue…</p>
          ) : lawve.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Catalogue unavailable right now.
            </p>
          ) : (
            <>
              {/* Shelf controls — search, licence/author facets, sort.
                  Facets are the catalogue's real metadata (the upstream
                  SKILL.md frontmatter carries nothing beyond name /
                  description / author / licence / version). */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <input
                  value={shelfQuery}
                  onChange={(e) => setShelfQuery(e.target.value)}
                  placeholder="Search the catalogue"
                  aria-label="Search the catalogue"
                  className="min-h-[34px] w-48 border border-rule bg-paper px-3 text-[13px] text-ink focus:border-ink focus:outline-none"
                  data-testid="shelf-search"
                />
                <select
                  value={shelfLicense}
                  onChange={(e) => setShelfLicense(e.target.value)}
                  className="rounded-md border border-rule bg-paper px-2 py-1 text-ink"
                  aria-label="Filter by licence"
                  data-testid="shelf-license-filter"
                >
                  <option value="">any licence</option>
                  {shelfLicenses.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <select
                  value={shelfAuthor}
                  onChange={(e) => setShelfAuthor(e.target.value)}
                  className="rounded-md border border-rule bg-paper px-2 py-1 text-ink"
                  aria-label="Filter by author"
                  data-testid="shelf-author-filter"
                >
                  <option value="">any author</option>
                  {shelfAuthors.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <select
                  value={shelfSort}
                  onChange={(e) => setShelfSort(e.target.value as ShelfSort)}
                  className="rounded-md border border-rule bg-paper px-2 py-1 text-ink"
                  aria-label="Sort catalogue"
                  data-testid="shelf-sort"
                >
                  <option value="name">sort: name</option>
                  <option value="author">sort: author</option>
                  <option value="licence">sort: licence</option>
                </select>
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
                  shelf.map((s, i) => (
                    <LedgerLine
                      key={s.slug}
                      index={i + 1}
                      label={s.license ?? "licence ?"}
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
                      <span className="text-ink">{s.name}</span>
                      <span className="ml-2 hidden text-[12px] text-muted sm:inline">
                        {s.author_name ?? "unknown"}
                      </span>
                    </LedgerLine>
                  ))
                )}
              </div>
              {/* The honest gap strip — the directory is larger than the
                  importable feed today; say so plainly. Hidden whenever
                  the count could not be fetched. */}
              {directory && (
                <p
                  className="mt-3 text-[11px] text-muted"
                  data-testid="shelf-gap-strip"
                >
                  {directory.count} skills on{" "}
                  <a
                    href={directory.skills_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                  >
                    Lawve
                  </a>{" "}
                  · {lawve.length} importable here today · the catalogue feed
                  is being arranged
                </p>
              )}
            </>
          )}
          <Colophon>
            Adding a skill takes a few steps: review it, check its
            signature, grant its permissions. After that it shows up in
            Your skills.
          </Colophon>
      </section>
    </div>
  );
}

function IntroStep({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-paper p-4">
      <div className="flex items-baseline gap-2">
        <span className="tech-token text-[11px] text-muted">{step}</span>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-prose">{body}</p>
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
