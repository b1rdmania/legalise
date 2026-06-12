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
import { listLawveSkills, type LawveSkillRow } from "../lib/api";
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

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    listLawveSkills()
      .then((res) => {
        if (!cancelled) setLawve(res?.skills ?? []);
      })
      .catch(() => {
        if (!cancelled) setLawve([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);
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
        title="Skills"
        whisper="Instruments of practice"
        description={
          authed
            ? "A skill is a piece of legal work — review an NDA, screen a dismissal, draft a letter. Add one from the catalogue, enable it on a matter, run it from Chat. Every run leaves a signed, auditable record."
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
                  View the register →
                </Link>
              </>
            ) : (
              <a
                href="/demo"
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
          label="Schedule A — workspace skills"
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
                          ? `${manifestStr(m, "publisher")} (chambers) · `
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
          addable in two clicks. */}
      {authed && (
        <section className="mt-12" data-testid="lawve-catalogue">
          <SectionRule
            label="Schedule B — the open catalogue"
            right={
              <Link
                to="/skills/lawve"
                className="normal-case tracking-normal text-sm text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
              >
                Open full importer →
              </Link>
            }
          />
          {lawve == null ? (
            <p className="mt-3 text-sm text-muted">Loading catalogue…</p>
          ) : lawve.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Catalogue unavailable right now.
            </p>
          ) : (
            <div className="mt-1">
              {lawve.map((s, i) => (
                <LedgerLine
                  key={s.slug}
                  index={i + 1}
                  label={s.license ?? "licence ?"}
                  right={
                    <a
                      href={`/skills/lawve?skill=${encodeURIComponent(s.slug)}`}
                      className="text-sm text-muted hover:text-seal"
                    >
                      Review &amp; add →
                    </a>
                  }
                >
                  <span className="text-ink">{s.name}</span>
                  <span className="ml-2 hidden text-[12px] text-muted sm:inline">
                    {s.author_name ?? "unknown"}
                  </span>
                </LedgerLine>
              ))}
            </div>
          )}
          <Colophon>
            Skills hold no standing until admitted — review, signature,
            permissions, gates, then the register.
          </Colophon>
        </section>
      )}
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
