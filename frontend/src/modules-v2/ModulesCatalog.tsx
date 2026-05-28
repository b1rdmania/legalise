/**
 * /modules — marketplace home (Phase 17-IA-C).
 *
 * Uses the PUBLIC catalog (`getPublicModules`) so the page is a
 * browse-anyone-can-see marketplace, not a per-user authed registry
 * view. This fixes the 401/NetworkError the production walkthrough hit
 * (MOD-1) and matches the "modules are the module's home page" intent.
 *
 * Skills are grouped by plugin suite (uk-employment-legal, etc.) as
 * labeled sub-sections. Install / trust ceremony is a separate authed
 * per-matter flow (Matter actions panel), not triggered here — this
 * page's job is browse + link to source.
 *
 * Canonical tokens only (border-rule, square, no shadow) to match the
 * Audit page density.
 */

import { useEffect, useState } from "react";
import { getPublicModules, type PublicModuleSkill } from "../lib/api";

type CatalogQuery =
  | { status: "loading" }
  | {
      status: "ready";
      skills: PublicModuleSkill[];
      broken: number;
      repo: string | null;
    }
  | { status: "error"; message: string };

// Prettify a plugin slug into a suite label, e.g.
// "uk-employment-legal" → "UK Employment".
function suiteLabel(plugin: string): string {
  return plugin
    .replace(/-legal$/, "")
    .split("-")
    .map((w) => (w === "uk" ? "UK" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function ModulesCatalog() {
  const [q, setQ] = useState<CatalogQuery>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getPublicModules()
      .then((res) => {
        if (!cancelled)
          setQ({
            status: "ready",
            skills: res.skills,
            broken: res.broken.length,
            repo: res.source.repo,
          });
      })
      .catch((err: unknown) => {
        if (!cancelled) setQ({ status: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-ink">
      <p className="text-[11px] uppercase tracking-widest text-muted">Workspace</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight2">Modules</h1>
      <p className="mt-2 text-sm text-muted">
        The open catalogue of legal skills. Install a module against a
        matter to grant it capabilities under the runtime gates.
      </p>

      {q.status === "loading" && (
        <p className="mt-8 text-sm text-muted">Loading catalogue…</p>
      )}
      {q.status === "error" && (
        <p className="mt-8 text-sm text-seal">
          Could not load the catalogue: {q.message}
        </p>
      )}
      {q.status === "ready" && <Catalogue {...q} />}
    </div>
  );
}

function Catalogue({
  skills,
  broken,
  repo,
}: {
  skills: PublicModuleSkill[];
  broken: number;
  repo: string | null;
}) {
  if (skills.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted">
        No skills in the catalogue yet.
      </p>
    );
  }

  // Group by plugin suite, sorted by suite then skill name.
  const groups = new Map<string, PublicModuleSkill[]>();
  for (const s of skills) {
    const arr = groups.get(s.plugin) ?? [];
    arr.push(s);
    groups.set(s.plugin, arr);
  }
  const suites = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>{skills.length} skills</span>
        {broken > 0 && (
          <span className="text-seal">{broken} with manifest issues</span>
        )}
        {repo && (
          <a
            href={`https://github.com/${repo}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink underline"
          >
            {repo}
          </a>
        )}
      </div>

      {suites.map(([plugin, suiteSkills]) => (
        <section key={plugin}>
          <h2 className="text-[11px] uppercase tracking-widest text-muted border-b border-rule pb-2">
            {suiteLabel(plugin)}
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-px bg-rule border border-rule sm:grid-cols-2">
            {suiteSkills
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => (
                <SkillCard key={`${s.plugin}/${s.skill}`} skill={s} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SkillCard({ skill }: { skill: PublicModuleSkill }) {
  const caps = skill.declared_capabilities.length;
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">{skill.name}</h3>
        {skill.trust_posture && (
          <span className="text-[10px] uppercase tracking-widest text-muted">
            {skill.trust_posture}
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-[11px] text-muted">{skill.skill}</p>
      <p className="mt-2 text-sm text-muted line-clamp-2">{skill.description}</p>
      <p className="mt-3 text-xs text-muted">
        {caps} capabilit{caps === 1 ? "y" : "ies"}
      </p>
    </>
  );

  return (
    <li className="bg-paper p-4 hover:bg-wash transition-colors">
      {skill.source_url ? (
        <a href={skill.source_url} target="_blank" rel="noreferrer" className="block">
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  );
}
