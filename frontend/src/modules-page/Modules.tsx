import { useEffect, useMemo, useState } from "react";
import {
  getModules,
  getSkillBody,
  type ModuleSkill,
  type ModulesResponse,
} from "../lib/api";
import { ErrorCallout, LoadingLine } from "../ui/primitives";

export function Modules() {
  const [data, setData] = useState<ModulesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [promptBody, setPromptBody] = useState<Record<string, string>>({});
  const [promptError, setPromptError] = useState<Record<string, string>>({});

  useEffect(() => {
    getModules()
      .then((d) => {
        setData(d);
        if (d.skills.length > 0) {
          const first = d.skills[0];
          setSelectedKey(`${first.plugin}/${first.skill}`);
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  // load prompt body when selection changes
  useEffect(() => {
    if (!selectedKey || !data) return;
    if (promptBody[selectedKey] || promptError[selectedKey]) return;
    const [plugin, skill] = selectedKey.split("/", 2);
    getSkillBody(plugin, skill)
      .then((body) => setPromptBody((prev) => ({ ...prev, [selectedKey]: body })))
      .catch((e) => setPromptError((prev) => ({ ...prev, [selectedKey]: String(e) })));
  }, [selectedKey, data, promptBody, promptError]);

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

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-12">
      {error && <ErrorCallout message={error} />}
      {!data && !error && <LoadingLine label="loading installed skills" />}

      {data && data.skills.length === 0 && (
        <div className="bg-yellow-100 border border-rule p-4 text-ink text-sm">
          No SKILL.md files found under {data.plugins_root}.
        </div>
      )}

      {data && data.skills.length > 0 && (
        <div className="flex gap-12">
          {/* P2 sidebar TOC */}
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
                          "py-2 border-l-2 pl-4 text-sm transition-all text-left " +
                          (active
                            ? "border-ink text-ink font-semibold"
                            : "border-transparent text-muted hover:text-ink")
                        }
                      >
                        {s.name}
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

          {/* Main column */}
          <main className="flex-1 min-w-0">
            {/* Mobile fallback — stacked list */}
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
                        />
                      </article>
                    );
                  })}
                </section>
              ))}
            </div>

            {/* Desktop — single selected skill */}
            <div className="hidden lg:block">
              {selectedSkill && (
                <SkillBlock
                  skill={selectedSkill}
                  body={promptBody[selectedKey!]}
                  error={promptError[selectedKey!]}
                  onLoad={() => undefined}
                  isLoaded={!!promptBody[selectedKey!] || !!promptError[selectedKey!]}
                />
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function SkillBlock({
  skill,
  body,
  error,
  onLoad,
  isLoaded,
}: {
  skill: ModuleSkill;
  body: string | undefined;
  error: string | undefined;
  onLoad: () => void;
  isLoaded: boolean;
}) {
  useEffect(() => {
    if (!isLoaded) onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mb-8">
        <div className="eyebrow font-mono text-muted mb-4">
          INSTALLED SKILL — {skill.plugin}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink leading-[1.1] mb-4">
          {skill.name}
        </h1>
        <p className="text-xl text-muted leading-relaxed max-w-2xl">{skill.description}</p>
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-4 mb-10 pb-10 border-b border-rule">
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
