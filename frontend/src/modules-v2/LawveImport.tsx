/**
 * /modules/lawve — Lawve Skill Importer v1.
 *
 * Browse `lawve-ai/awesome-legal-skills`, inspect a skill (metadata,
 * provenance, licence, SKILL.md, refs/scripts), and convert it into a
 * **governed Legalise module draft** — validated via the existing
 * validator, never installed, scripts never executed. A draft is not a
 * module until reviewed, validated, signed, and installed.
 */

import { useEffect, useMemo, useState } from "react";
import {
  draftLawveModule,
  getLawveSkill,
  listLawveSkills,
  type LawveDraftResult,
  type LawveSkillDetail,
  type LawveSkillRow,
} from "../lib/api";
import { Badge, ErrorCallout, LoadingLine, PageHeader } from "../ui/primitives";

type ListQuery =
  | { status: "loading" }
  | { status: "ready"; skills: LawveSkillRow[] }
  | { status: "error"; message: string };

// Derive the headline trust state from validity + warnings.
function trustState(d: LawveDraftResult): string {
  const codes = new Set(d.warnings.map((w) => w.code));
  if (codes.has("needs_runtime_decision") || !d.valid) return "Imported draft — not yet valid";
  if (codes.has("license_review") || codes.has("license_unknown")) return "Needs licence review";
  if (codes.has("script_review")) return "Needs script review";
  return "Ready to sign";
}

export function LawveImport() {
  const [q, setQ] = useState<ListQuery>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [licenseFilter, setLicenseFilter] = useState("");
  const [scriptsOnly, setScriptsOnly] = useState(false);
  const [refsOnly, setRefsOnly] = useState(false);
  const [selected, setSelected] = useState<LawveSkillDetail | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [draft, setDraft] = useState<LawveDraftResult | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listLawveSkills()
      .then((res) => {
        if (!cancelled) setQ({ status: "ready", skills: res.skills });
      })
      .catch((err: unknown) => {
        if (!cancelled) setQ({ status: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const skills = q.status === "ready" ? q.skills : [];
  const licenses = useMemo(
    () => [...new Set(skills.map((s) => s.license).filter((l): l is string => !!l))].sort(),
    [skills],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return skills.filter((s) => {
      if (licenseFilter && s.license !== licenseFilter) return false;
      if (scriptsOnly && !s.has_scripts) return false;
      if (refsOnly && !s.has_references) return false;
      if (!term) return true;
      return (
        s.name.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term) ||
        (s.author_name ?? "").toLowerCase().includes(term) ||
        (s.license ?? "").toLowerCase().includes(term)
      );
    });
  }, [skills, search, licenseFilter, scriptsOnly, refsOnly]);

  const openSkill = async (slug: string) => {
    setSelecting(true);
    setDetailErr(null);
    setDraft(null);
    try {
      setSelected(await getLawveSkill(slug));
    } catch (err) {
      setDetailErr(String(err));
    } finally {
      setSelecting(false);
    }
  };

  const convert = async (slug: string) => {
    setDrafting(true);
    try {
      setDraft(await draftLawveModule(slug));
    } catch (err) {
      setDetailErr(String(err));
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 text-ink">
      <PageHeader
        eyebrow="Modules"
        title="Lawve skill import"
        description="Import open legal-AI skills from lawve-ai/awesome-legal-skills into Legalise as governed module drafts. A Lawve skill is not a Legalise module until it is converted, validated, signed, and installed — and imported scripts are never executed."
      />

      {q.status === "error" && (
        <ErrorCallout message={`Could not load Lawve skills: ${q.message}`} />
      )}
      {q.status === "loading" && <LoadingLine label="loading Lawve skills" />}

      {q.status === "ready" && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.1fr]">
          {/* List + filters */}
          <div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / description / author / licence"
              className="w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm"
              data-testid="lawve-search"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <select
                value={licenseFilter}
                onChange={(e) => setLicenseFilter(e.target.value)}
                className="rounded-md border border-rule bg-paper px-2 py-1 text-ink"
                data-testid="lawve-license-filter"
              >
                <option value="">any licence</option>
                {licenses.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-muted">
                <input type="checkbox" checked={scriptsOnly} onChange={(e) => setScriptsOnly(e.target.checked)} />
                has scripts
              </label>
              <label className="flex items-center gap-1 text-muted">
                <input type="checkbox" checked={refsOnly} onChange={(e) => setRefsOnly(e.target.checked)} />
                has references
              </label>
              <span className="text-muted">{filtered.length} of {skills.length}</span>
            </div>

            <ul className="mt-4 space-y-px bg-rule border border-rule">
              {filtered.map((s) => (
                <li key={s.slug}>
                  <button
                    type="button"
                    onClick={() => openSkill(s.slug)}
                    className={
                      "block w-full bg-paper p-4 text-left hover:bg-wash transition-colors " +
                      (selected?.slug === s.slug ? "ring-1 ring-ink" : "")
                    }
                    data-testid={`lawve-card-${s.slug}`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-ink">{s.name}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted">
                        {s.license ?? "licence?"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted line-clamp-2">{s.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted">
                      <span>{s.author_name ?? "unknown"}</span>
                      {s.version && <span>· {s.version}</span>}
                      {s.has_scripts && <Badge>scripts</Badge>}
                      {s.has_references && <Badge>refs</Badge>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Detail + convert */}
          <div>
            {detailErr && <ErrorCallout message={detailErr} compact />}
            {selecting && <LoadingLine label="loading skill" />}
            {!selected && !selecting && (
              <p className="text-sm text-muted">Select a skill to inspect and convert.</p>
            )}
            {selected && (
              <div data-testid="lawve-detail">
                <h2 className="text-lg font-bold tracking-tight2">{selected.name}</h2>
                <p className="mt-1 text-xs text-muted">
                  {selected.author_name ?? "unknown"} · {selected.version ?? "—"} ·{" "}
                  {selected.license ?? "licence unknown"}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  Source:{" "}
                  <a
                    href={selected.provenance.repo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-ink"
                  >
                    {selected.repo}
                  </a>{" "}
                  @ <span className="font-mono">{(selected.provenance.ref ?? "").slice(0, 8)}</span>{" "}
                  · {selected.provenance.source_path}
                </p>

                {selected.has_scripts && (
                  <p className="mt-3 border border-seal/40 bg-seal/5 p-2 text-xs text-seal" data-testid="lawve-script-flag">
                    Contains scripts ({selected.scripts.length}) — these are <span className="font-semibold">not imported or executed</span>; review them manually at the source.
                  </p>
                )}

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs uppercase tracking-widest text-muted">
                    SKILL.md
                  </summary>
                  <pre className="mt-2 max-h-[30vh] overflow-auto rounded-md border border-rule bg-paper px-2 py-1 text-[11px] whitespace-pre-wrap">
                    {selected.skill_markdown}
                  </pre>
                </details>

                <button
                  type="button"
                  onClick={() => convert(selected.slug)}
                  disabled={drafting}
                  className="mt-4 inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-50"
                  data-testid="convert-draft"
                >
                  {drafting ? "Converting…" : "Convert to module draft"}
                </button>

                {draft && <DraftReview draft={draft} slug={selected.slug} />}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DraftReview({ draft, slug }: { draft: LawveDraftResult; slug: string }) {
  const manifestJson = JSON.stringify(draft.manifest, null, 2);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(manifestJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const download = () => {
    const blob = new Blob([manifestJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-5 border-t border-rule pt-4" data-testid="draft-review">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm uppercase tracking-widest text-muted">Module draft</h3>
        <span
          className={
            "rounded-full border px-2 py-0.5 text-xs " +
            (draft.valid ? "border-ink text-ink" : "border-seal/50 text-seal")
          }
          data-testid="draft-trust-state"
        >
          {trustState(draft)}
        </span>
      </div>

      {draft.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {draft.warnings.map((w) => (
            <li key={w.code} className="text-muted">
              <span className="font-mono text-seal">{w.code}</span> — {w.message}
            </li>
          ))}
        </ul>
      )}

      {!draft.valid && draft.errors.length > 0 && (
        <div className="mt-3 text-xs">
          <p className="text-seal">Validation errors (the human-confirmed mapping must resolve these before signing):</p>
          <ul className="mt-1 space-y-1">
            {draft.errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono text-muted">{e.path || "/"}</span> — {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <pre className="mt-3 max-h-[40vh] overflow-auto rounded-md border border-rule bg-paper px-2 py-1 text-[11px]">
        {manifestJson}
      </pre>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className="rounded-md border border-rule px-3 py-1.5 text-xs hover:border-ink">
          {copied ? "Copied" : "Copy manifest"}
        </button>
        <button type="button" onClick={download} className="rounded-md border border-rule px-3 py-1.5 text-xs hover:border-ink">
          Download manifest
        </button>
      </div>

      <div className="mt-3 text-xs text-muted">
        <p className="font-semibold text-ink">Next steps (the importer never installs):</p>
        <ul className="mt-1 list-disc pl-4">
          {draft.next_steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <p className="mt-2">
          Validate + sign + install through the existing module flow —{" "}
          <a href="/modules/create" className="underline hover:text-ink">/modules/create</a>{" "}
          and the trust ceremony. No one-click install here.
        </p>
      </div>
    </div>
  );
}
