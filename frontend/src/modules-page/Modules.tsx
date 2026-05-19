import { useEffect, useMemo, useState } from "react";
import {
  disableSkill,
  enableSkill,
  getModules,
  getSkillBody,
  type ModuleSkill,
  type ModulesResponse,
} from "../lib/api";
import { ErrorCallout, LoadingLine } from "../ui/primitives";
import { useAuth } from "../auth/AuthProvider";
import { WORKFLOW_TABS } from "../matter/tabs/types";

export function Modules() {
  const auth = useAuth();
  const isAuthed = !!auth.user;
  const [data, setData] = useState<ModulesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [promptBody, setPromptBody] = useState<Record<string, string>>({});
  const [promptError, setPromptError] = useState<Record<string, string>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [toggleError, setToggleError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (auth.loading) return;
    if (!isAuthed) return;
    getModules()
      .then((d) => {
        setData(d);
        if (d.skills.length > 0) {
          const first = d.skills[0];
          setSelectedKey(`${first.plugin}/${first.skill}`);
        }
      })
      .catch((e) => {
        const msg = String(e);
        // 401 should never surface raw to a visitor. The unauth branch
        // already short-circuits above; this guards a race where the
        // session expires mid-fetch.
        if (/\b401\b/.test(msg)) return;
        setError(msg);
      });
  }, [auth.loading, isAuthed]);

  useEffect(() => {
    if (!isAuthed) return;
    if (!selectedKey || !data) return;
    if (promptBody[selectedKey] || promptError[selectedKey]) return;
    const [plugin, skill] = selectedKey.split("/", 2);
    getSkillBody(plugin, skill)
      .then((body) => setPromptBody((prev) => ({ ...prev, [selectedKey]: body })))
      .catch((e) => {
        const msg = String(e);
        if (/\b401\b/.test(msg)) return;
        setPromptError((prev) => ({ ...prev, [selectedKey]: msg }));
      });
  }, [selectedKey, data, promptBody, promptError, isAuthed]);

  const grouped = useMemo(() => {
    const m = new Map<string, ModuleSkill[]>();
    for (const skill of data?.skills ?? []) {
      const rows = m.get(skill.plugin) ?? [];
      rows.push(skill);
      m.set(skill.plugin, rows);
    }
    return m;
  }, [data]);

  const selectedSkill = useMemo(() => {
    if (!selectedKey || !data) return null;
    return data.skills.find((s) => `${s.plugin}/${s.skill}` === selectedKey) ?? null;
  }, [selectedKey, data]);

  const shortRef = data?.source.ref ? data.source.ref.slice(0, 7) : "unversioned";

  const onToggle = async (skill: ModuleSkill) => {
    const key = `${skill.plugin}/${skill.skill}`;
    setToggling((p) => ({ ...p, [key]: true }));
    setToggleError((p) => {
      const { [key]: _drop, ...rest } = p;
      return rest;
    });
    try {
      if (skill.enabled) {
        await disableSkill(skill.plugin, skill.skill);
      } else {
        await enableSkill(skill.plugin, skill.skill);
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              skills: prev.skills.map((s) =>
                s.plugin === skill.plugin && s.skill === skill.skill
                  ? { ...s, enabled: !skill.enabled }
                  : s,
              ),
            }
          : prev,
      );
    } catch (e) {
      setToggleError((p) => ({ ...p, [key]: String(e) }));
    } finally {
      setToggling((p) => {
        const { [key]: _drop, ...rest } = p;
        return rest;
      });
    }
  };

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-12">
      <div className="mb-10">
        <div className="eyebrow text-muted mb-3">MODULE CATALOGUE</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink leading-[1.1] mb-3">
          Modules
        </h1>
        <p className="text-sm text-prose max-w-2xl">
          {isAuthed
            ? "Modules are the legal skills installed on your workspace. Each declares the capabilities it needs; the runtime checks the grant before every privileged operation and writes an audit row. Revoke any capability you don't want a module to hold."
            : "Browse the legal skills available on Legalise. Each module declares the capabilities it needs and operates on a matter through the privilege-aware gateway. The catalogue is open; granting capabilities to a module needs a workspace."}
        </p>
        {!isAuthed && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href="#/modules/submit"
              className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium"
            >
              Submit a module
            </a>
            <a
              href="#/auth/signup"
              className="border border-rule hover:border-ink text-ink px-4 py-2 hover:bg-wash transition-colors text-sm font-medium"
            >
              Sign up free
            </a>
            <a
              href="#/demo"
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              Open the demo
            </a>
          </div>
        )}
      </div>

      {!isAuthed && (
        <>
          {/* TODO(public-modules): no unauth-safe modules endpoint exists.
              /api/modules requires auth. Until a public catalogue endpoint
              lands, render a static preview of the known workflow modules
              from WORKFLOW_TABS. */}
          <PublicCataloguePreview />
        </>
      )}

      {isAuthed && error && <ErrorCallout message={error} />}
      {isAuthed && !data && !error && <LoadingLine label="loading modules" />}

      {data && data.broken.length > 0 && (
        <div className="mb-10 border border-rule bg-yellow-100 p-4">
          <div className="eyebrow mb-2">Broken manifests</div>
          <ul className="text-sm text-ink space-y-2">
            {data.broken.map((b, i) => (
              <li key={`${b.plugin}-${b.skill}-${i}`} title={b.errors.map((e) => `${e.path} ${e.message}`).join("\n")}>
                <span className="font-mono text-xs">{b.plugin}/{b.skill}</span>{" "}
                - {b.errors[0]?.message ?? "manifest invalid"}
                {b.errors.length > 1 && (
                  <span className="text-muted"> (+{b.errors.length - 1} more)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && data.skills.length === 0 && data.broken.length === 0 && (
        <div className="bg-yellow-100 border border-rule p-4 text-ink text-sm">
          No SKILL.md files found under {data.plugins_root}.
        </div>
      )}

      {data && data.skills.length > 0 && (
        <div className="flex gap-12">
          <aside className="hidden lg:block w-80 sticky top-[88px] h-[calc(100vh-100px)] border-r border-rule pr-8 overflow-y-auto">
            <div className="eyebrow-sm mb-8">Installed skills</div>
            {Array.from(grouped.entries()).map(([plugin, skills]) => (
              <div key={plugin} className="mb-8">
                <div className="eyebrow-sm mb-4">{plugin}</div>
                <nav className="flex flex-col gap-1">
                  {skills.map((s) => {
                    const key = `${s.plugin}/${s.skill}`;
                    const active = selectedKey === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedKey(key)}
                        className={
                          "py-2 border-l-2 pl-4 text-sm transition-all text-left flex items-center justify-between gap-2 " +
                          (active
                            ? "border-ink text-ink font-semibold"
                            : "border-transparent text-muted hover:text-ink")
                        }
                      >
                        <span className="truncate">{s.name}</span>
                        {!s.enabled && (
                          <span className="text-[9px] font-mono uppercase tracking-track2 text-muted border border-rule px-1 py-0.5">
                            Disabled
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ))}
            <div className="mt-12 pt-8 border-t border-rule">
              <div className="eyebrow-sm mb-4">Catalogue</div>
              <ul className="flex flex-col gap-3 text-sm">
                <li>
                  <span className="text-muted">root</span>{" "}
                  <span className="text-ink font-mono text-xs break-all">{data.plugins_root}</span>
                </li>
                <li>
                  <span className="text-muted">repo</span>{" "}
                  <span className="text-ink font-mono text-xs break-all">
                    {data.source.repo ?? "unset"}
                  </span>
                </li>
                <li>
                  <span className="text-muted">ref</span>{" "}
                  <span className="text-ink font-mono text-xs">{shortRef}</span>
                </li>
              </ul>
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <div className="lg:hidden space-y-12">
              {Array.from(grouped.entries()).map(([plugin, skills]) => (
                <section key={plugin}>
                  <div className="eyebrow-sm mb-4">{plugin}</div>
                  {skills.map((s) => {
                    const key = `${s.plugin}/${s.skill}`;
                    return (
                      <article key={key} className="mb-12 pb-12 border-b border-rule last:border-b-0">
                        <SkillBlock
                          skill={s}
                          body={promptBody[key]}
                          error={promptError[key]}
                          onLoad={() => setSelectedKey(key)}
                          isLoaded={!!promptBody[key] || !!promptError[key]}
                          toggling={!!toggling[key]}
                          toggleError={toggleError[key]}
                          onToggle={() => onToggle(s)}
                        />
                      </article>
                    );
                  })}
                </section>
              ))}
            </div>

            <div className="hidden lg:block">
              {selectedSkill && (
                <SkillBlock
                  skill={selectedSkill}
                  body={promptBody[selectedKey!]}
                  error={promptError[selectedKey!]}
                  onLoad={() => undefined}
                  isLoaded={!!promptBody[selectedKey!] || !!promptError[selectedKey!]}
                  toggling={!!toggling[selectedKey!]}
                  toggleError={toggleError[selectedKey!]}
                  onToggle={() => onToggle(selectedSkill)}
                />
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function PublicCataloguePreview() {
  return (
    <section className="mb-12">
      <div className="eyebrow mb-3">Preview catalogue</div>
      <h2 className="text-xl font-bold tracking-tight2 text-ink mb-2">
        Installed legal modules
      </h2>
      <p className="text-sm text-prose max-w-2xl mb-6">
        A read-only preview of the workflow modules shipped with the
        workspace. Sign in to see your installed catalogue, grants, and
        per-module status.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {WORKFLOW_TABS.map((w) => {
          const key = `legalise.workflows/${w.key}`;
          return (
            <article key={w.key} className="border border-rule p-6">
              <div className="eyebrow font-mono text-muted mb-3">
                legalise.workflows
              </div>
              <h3 className="text-base font-bold text-ink mb-2">{w.label}</h3>
              <p className="text-xs text-prose leading-relaxed mb-5">{w.blurb}</p>

              <dl className="grid grid-cols-[96px_1fr] gap-y-1.5 text-[11px] font-mono mb-5">
                <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Reads</dt>
                <dd className="text-ink">{w.reads}</dd>
                <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Writes</dt>
                <dd className="text-ink">{w.writes}</dd>
                <dt className="text-muted uppercase tracking-track2 text-[9px] self-center">Calls</dt>
                <dd className="text-ink">{w.calls} per run</dd>
              </dl>

              <div className="mb-5">
                <div className="eyebrow mb-2">Capabilities (declared)</div>
                <div className="flex flex-wrap gap-2">
                  {w.capabilities.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center text-[11px] font-mono text-ink border border-rule bg-wash px-2 py-0.5"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-4 border-t border-rule">
                <span className="text-[10px] font-mono uppercase tracking-track2 text-muted truncate" title={key}>
                  {key}
                </span>
                <a
                  href="#/auth/signin"
                  className="text-xs text-[#0066CC] hover:underline whitespace-nowrap"
                >
                  Sign in to manage
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function trustPostureClasses(posture: string | null): string {
  // Subtle, boring borders. No emoji. The posture is a declaration - not
  // an enforcement claim.
  switch (posture) {
    case "trusted":
      return "border-[#00A35C] text-[#00A35C]";
    case "third_party":
      return "border-[#0066CC] text-[#0066CC]";
    case "experimental":
      return "border-[#E67E22] text-[#E67E22]";
    default:
      return "border-rule text-muted";
  }
}

function SkillBlock({
  skill,
  body,
  error,
  onLoad,
  isLoaded,
  toggling,
  toggleError,
  onToggle,
}: {
  skill: ModuleSkill;
  body: string | undefined;
  error: string | undefined;
  onLoad: () => void;
  isLoaded: boolean;
  toggling: boolean;
  toggleError: string | undefined;
  onToggle: () => void;
}) {
  useEffect(() => {
    if (!isLoaded) onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const postureLabel = skill.trust_posture ?? "unset";

  return (
    <>
      <div className="mb-8">
        <div className="eyebrow font-mono text-muted mb-4 flex items-center gap-3 flex-wrap">
          <span>INSTALLED SKILL - {skill.plugin}</span>
          {!skill.enabled && (
            <span className="text-[10px] uppercase tracking-track2 text-muted border border-rule px-2 py-0.5">
              Disabled
            </span>
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink leading-[1.1] mb-4">
          {skill.name}
        </h1>
        <p className="text-xl text-muted leading-relaxed max-w-2xl">{skill.description}</p>
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-4 mb-8">
        <div>
          <div className="eyebrow mb-1.5">Plugin</div>
          <div className="text-sm font-semibold font-mono">{skill.plugin}</div>
        </div>
        <div>
          <div className="eyebrow mb-1.5">Skill</div>
          <div className="text-sm font-semibold font-mono">{skill.skill}</div>
        </div>
        {skill.argument_hint && (
          <div>
            <div className="eyebrow mb-1.5">Arguments</div>
            <div className="text-sm font-semibold font-mono">{skill.argument_hint}</div>
          </div>
        )}
        {skill.source_url && (
          <div>
            <div className="eyebrow mb-1.5">Source</div>
            <a
              href={skill.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-[#0066CC] hover:underline break-all"
            >
              view
            </a>
          </div>
        )}
      </div>

      <div className="mb-10 pb-10 border-b border-rule space-y-5">
        <div>
          <div className="eyebrow mb-2">Trust posture (declared)</div>
          <span
            className={
              "inline-flex items-center text-[10px] uppercase tracking-track2 font-mono font-bold border px-2 py-0.5 " +
              trustPostureClasses(skill.trust_posture)
            }
          >
            {postureLabel}
          </span>
        </div>
        <div>
          <div className="eyebrow mb-2">Capabilities (declared)</div>
          {skill.capabilities.length === 0 ? (
            <span className="text-xs text-muted font-mono">none declared</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {skill.capabilities.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center text-[11px] font-mono text-ink border border-rule bg-wash px-2 py-0.5"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="eyebrow mb-2">Lifecycle</div>
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={onToggle}
              disabled={toggling}
              className="border border-rule hover:border-ink text-ink px-3 py-1.5 hover:bg-wash transition-colors text-xs font-medium min-h-[36px] disabled:opacity-40"
            >
              {toggling
                ? skill.enabled
                  ? "Disabling…"
                  : "Enabling…"
                : skill.enabled
                  ? "Disable skill"
                  : "Enable skill"}
            </button>
            <span className="text-xs text-muted">
              {skill.enabled
                ? "Enabled - invocations allowed for this workspace."
                : "Disabled - invocations blocked for this workspace."}
            </span>
          </div>
          {toggleError && (
            <div className="mt-3">
              <ErrorCallout message={toggleError} compact />
            </div>
          )}
        </div>
      </div>

      {error && <ErrorCallout message={error} compact />}
      {!body && !error && <LoadingLine label="loading prompt body" />}
      {body && (
        <pre className="bg-wash border border-rule font-mono text-[13px] p-6 my-4 overflow-x-auto whitespace-pre max-h-[60vh]">
          {body}
        </pre>
      )}
    </>
  );
}
