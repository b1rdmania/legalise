import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getModulesV2,
  listGrants,
  listAssistantMessages,
  listInstalledModules,
  postAssistantMessage,
  ProviderKeyMissingError,
  ProviderUpstreamError,
  providerUpstreamMessage,
  type AssistantMessage,
  type ChronologyEvent,
  type GrantRow,
  type InstalledModule,
  type Matter,
  type MatterDocument,
  type SuggestedAction,
  type V2ManifestEntry,
} from "../../lib/api";
import { InlineSpinner, ProviderKeyMissingBanner, primaryBtn } from "../../ui/primitives";
import { InlineAgentStatus, MessageBubble } from "../MessageBubble";
import { GenericSkillRunner } from "../GenericSkillRunner";
import {
  runnableMatterSkills,
  type RunnableMatterSkill,
} from "../skillRunnerModel";
import type { TabKey } from "./types";

interface AssistantTabProps {
  matter: Matter;
  docs: MatterDocument[] | null;
  chronology: ChronologyEvent[];
  setTabAndHash: (next: TabKey) => void;
  // Accepted but unused. Callers (DemoMatter, MatterDetail) still
  // pass these; the Chat front door no longer surfaces a readiness
  // widget.
  auditCount?: number;
  workflowsGrantedCount?: number;
  showPostureInPulse?: boolean;
  // Demo override: prefilled messages + disabled input + custom placeholder.
  initialMessages?: AssistantMessage[];
  disabled?: boolean;
  disabledPlaceholder?: string;
  showDisabledFooter?: boolean;
  showContextRail?: boolean;
  // Called when a Suggested Action chip is clicked in disabled (demo) mode.
  onDisabledAction?: () => void;
  // Optional route override for read-only/public shells. Normal matters
  // route source chips into the authenticated matter document reader.
  onDocumentChip?: (documentId: string) => void;
  initialDocumentId?: string | null;
}

// Three concrete first-actions per matter type. Per JOY.md "Suggested
// Actions": not generic. Matter-shaped starters that prefill the composer.
const SUGGESTED_BY_TYPE: Record<string, string[]> = {
  employment_tribunal: [
    "Draft a Letter Before Action for the dismissal",
    "Run pre-motion against the conduct framing",
    "Summarise the witness statement",
  ],
  civil: [
    "Draft a CPR pre-action letter",
    "Run contract review on the NDA",
    "Build the chronology from the documents",
  ],
};
const SUGGESTED_DEFAULT = [
  "Summarise this matter",
  "List the documents and what they say",
  "What deadlines should I be tracking?",
];

const ACTION_TARGET: Record<SuggestedAction["type"], TabKey> = {
  run_pre_motion: "premotion",
  draft_letter: "letters",
  review_contract: "contract-review",
  view_document: "documents",
  view_audit: "audit",
  view_chronology: "chronology",
  anonymise_document: "documents",
};

export function AssistantTab({
  matter,
  docs,
  chronology,
  setTabAndHash,
  initialMessages,
  disabled = false,
  disabledPlaceholder,
  showDisabledFooter = true,
  showContextRail = true,
  onDisabledAction,
  onDocumentChip,
  initialDocumentId,
  // back-compat — see AssistantTabProps; deliberately unused.
  auditCount: _auditCount,
  workflowsGrantedCount: _workflowsGrantedCount,
  showPostureInPulse: _showPostureInPulse,
}: AssistantTabProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyMissingProvider, setKeyMissingProvider] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(Boolean(initialMessages));
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [moduleEntries, setModuleEntries] = useState<V2ManifestEntry[]>([]);
  const [installedModules, setInstalledModules] = useState<Map<string, InstalledModule>>(
    new Map(),
  );
  const [grantRows, setGrantRows] = useState<GrantRow[] | null>(null);
  const [activeRunnerSkill, setActiveRunnerSkill] =
    useState<RunnableMatterSkill | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Initial fetch (skip in demo: initialMessages provided).
  useEffect(() => {
    if (initialMessages) return;
    let cancelled = false;
    listAssistantMessages(matter.slug)
      .then((rows) => {
        if (!cancelled) {
          setMessages(rows);
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(formatError(err));
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [matter.slug, initialMessages]);

  // Auto-scroll to newest message.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    void Promise.all([
      getModulesV2(),
      listInstalledModules(),
      listGrants(matter.slug),
    ])
      .then(([moduleResponse, installedRows, grantsResponse]) => {
        if (cancelled) return;
        const installedIndex = new Map<string, InstalledModule>();
        for (const row of installedRows) installedIndex.set(row.module_id, row);
        setModuleEntries(moduleResponse.modules);
        setInstalledModules(installedIndex);
        setGrantRows(grantsResponse.grants);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [matter.slug, disabled]);

  const runnableModuleSkills = useMemo(
    () =>
      runnableMatterSkills({
        modules: moduleEntries,
        installed: installedModules,
        grants: grantRows,
      }),
    [moduleEntries, installedModules, grantRows],
  );

  const runnableSkillCount = runnableModuleSkills.length;

  const docsById = useMemo(() => {
    const map = new Map<string, MatterDocument>();
    for (const d of docs ?? []) map.set(d.id, d);
    return map;
  }, [docs]);

  useEffect(() => {
    if (!initialDocumentId || !docsById.has(initialDocumentId)) return;
    setSelectedDocIds((prev) => {
      if (prev.has(initialDocumentId)) return prev;
      const next = new Set(prev);
      next.add(initialDocumentId);
      return next;
    });
  }, [initialDocumentId, docsById]);

  const recentDocs = useMemo(() => {
    if (!docs) return [];
    return [...docs]
      .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1))
      .slice(0, 5);
  }, [docs]);

  const attachedDocs = useMemo(() => {
    const arr: MatterDocument[] = [];
    for (const id of selectedDocIds) {
      const d = docsById.get(id);
      if (d) arr.push(d);
    }
    return arr;
  }, [selectedDocIds, docsById]);

  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const onSend = async () => {
    const content = input.trim();
    if (!content || pending || disabled) return;
    setError(null);
    setKeyMissingProvider(null);
    setPending(true);
    setThinking(true);
    const optimistic: AssistantMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content,
      suggested_actions: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    try {
      const res = await postAssistantMessage(matter.slug, {
        content,
        selected_document_ids: selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined,
      });
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== optimistic.id);
        return [...without, res.user, res.assistant];
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      if (err instanceof ProviderKeyMissingError) {
        setKeyMissingProvider(err.provider);
      } else {
        setError(formatError(err));
      }
    } finally {
      setPending(false);
      setThinking(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSend();
    }
  };

  const dispatchAction = (a: SuggestedAction) => {
    const target = ACTION_TARGET[a.type];
    if (target) setTabAndHash(target);
  };

  // Source-anchor click-through: a document chip in chat takes you
  // straight to the document reader for that file, not just to the
  // Documents tab. ?from=assistant tells the reader to surface the
  // honest note that exact-passage anchoring isn't supported yet.
  const navigate = useNavigate();
  const dispatchDocChip = (documentId: string) => {
    if (onDocumentChip) {
      onDocumentChip(documentId);
      return;
    }
    void navigate({
      to: "/matters/$slug/documents/$documentId",
      params: { slug: matter.slug, documentId },
      search: { from: "assistant" },
    });
  };
  // The timeline doesn't yet carry per-event anchoring, so the
  // chronology chip still drops the user on the Chronology tab.
  // Accepting the eventId keeps the callback shape future-proof
  // for when per-event deep links land.
  const dispatchChronChip = (_eventId: string) => setTabAndHash("chronology");

  const suggestions = useMemo(
    () => SUGGESTED_BY_TYPE[matter.matter_type] ?? SUGGESTED_DEFAULT,
    [matter.matter_type],
  );

  const onSuggestion = (s: string) => {
    if (disabled) {
      onDisabledAction?.();
      return;
    }
    setInput(s);
    // Defer focus so the textarea has rendered the new value.
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const [attachOpen, setAttachOpen] = useState(false);

  const onPickRunnerSkill = (skill: RunnableMatterSkill) => {
    setSkillsOpen(false);
    if (disabled) {
      onDisabledAction?.();
      return;
    }
    setActiveRunnerSkill(skill);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const openOutputs = () => {
    void navigate({ to: "/matters/$slug/artifacts", params: { slug: matter.slug } });
  };

  const openWorkingPack = () => {
    void navigate({ to: "/matters/$slug/lifecycle", params: { slug: matter.slug } });
  };

  const openRecord = () => {
    void navigate({ to: "/matters/$slug/audit", params: { slug: matter.slug } });
  };

  return (
    <div className="mx-auto grid w-full max-w-[1220px] gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-h-[620px] min-w-0 flex-col">
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-widest text-muted">
            Legal project
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight2 text-ink">
            {matter.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Ask about the documents, or run a skill. Outputs can be signed and
            traced in the Record.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span data-testid="docs-context-status">
              {docs === null
                ? "Loading documents…"
                : docs.length > 0
                  ? `${docs.length} document${docs.length === 1 ? "" : "s"}`
                  : "No documents yet"}
            </span>
            {showContextRail && (
              <>
                <span aria-hidden="true">·</span>
                <span>{runnableSkillCount} runnable skill{runnableSkillCount === 1 ? "" : "s"}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={openRecord}
              className="underline underline-offset-4 hover:text-ink"
              data-testid="open-record-link"
            >
              View Record →
            </button>
          </div>
        </div>

        {attachedDocs.length > 0 && (
          <section
            className="mb-4 border border-rule bg-paper-sunken px-4 py-3"
            data-testid="chat-attached-document-context"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest text-muted">
                  Asking about
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {attachedDocs.map((doc) => (
                    <span
                      key={doc.id}
                      className="inline-flex max-w-full items-center gap-2 border border-rule bg-paper px-2 py-1 font-mono text-xs text-ink"
                    >
                      <span className="max-w-[360px] truncate">{doc.filename}</span>
                      <button
                        type="button"
                        onClick={() => removeDoc(doc.id)}
                        className="text-muted hover:text-ink"
                        aria-label={`Remove ${doc.filename}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              {attachedDocs.length === 1 && (
                <button
                  type="button"
                  onClick={() => dispatchDocChip(attachedDocs[0].id)}
                  className="shrink-0 text-xs text-muted underline underline-offset-4 hover:text-ink"
                >
                  Open file →
                </button>
              )}
            </div>
          </section>
        )}

        <div
          ref={scrollRef}
          className="flex-1 space-y-5 overflow-y-auto border-y border-rule py-6 lg:max-h-[62vh]"
        >
        {!loaded && (
          <p className="font-mono text-xs text-muted flex items-center gap-2">
            <InlineSpinner />
            loading conversation
          </p>
        )}
        {loaded && messages.length === 0 && (
          <div className="space-y-6 border border-rule bg-paper-sunken p-5" data-testid="chat-empty-state">
            <div className="text-sm text-prose space-y-2">
              <p>
                This is the folder for <strong>{matter.title}</strong>. Ask
                anything about the documents in here, or run a skill enabled
                on this matter.
              </p>
              <p className="text-xs text-muted">
                Sources appear as chips below each answer. Outputs you sign
                off land in the matter Record.
              </p>
            </div>
            <div>
              <div className="eyebrow mb-2">Try one of these</div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSuggestion(s)}
                    className="border border-rule text-ink bg-paper px-3 py-1.5 text-xs font-medium hover:border-ink transition-colors text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            docs={docs}
            chronology={chronology}
            onDocChip={dispatchDocChip}
            onChronChip={dispatchChronChip}
            onAction={dispatchAction}
          />
        ))}
        {activeRunnerSkill && (
          <GenericSkillRunner
            slug={matter.slug}
            skill={activeRunnerSkill}
            documents={docs}
            initialDocumentIds={Array.from(selectedDocIds)}
            initialInput={input.trim() || undefined}
            onClose={() => setActiveRunnerSkill(null)}
            compact
          />
        )}
        {thinking && (
          <div className="flex justify-start">
            <InlineAgentStatus
              steps={[
                { label: "Read chronology", status: "complete" },
                { label: "Checked documents", status: "complete" },
                { label: "Drafting answer", status: "running" },
              ]}
            />
          </div>
        )}
        </div>

        {keyMissingProvider && <ProviderKeyMissingBanner provider={keyMissingProvider} />}
        {error && (
          <div className="border border-[#D9304F] bg-[#FEF2F2] text-[#B91C1C] text-sm p-3 mt-3">
            <div className="font-semibold mb-1">Could not send message</div>
            <p className="leading-relaxed whitespace-pre-wrap">{error}</p>
          </div>
        )}

        {disabled ? (
          // Compact unauth state - sticky strip, attached to chat column.
          showDisabledFooter ? (
          <div className="mt-3 sticky bottom-0 bg-paper pt-3">
          <div className="border-t border-rule py-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-prose m-0 flex-1 min-w-[200px]">
              {disabledPlaceholder ?? "Create an evaluation account to use the assistant on this matter."}
            </p>
            <div className="flex items-center gap-3">
              <a
                href="/auth/signup"
                className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[40px] inline-flex items-center"
              >
                Create account
              </a>
              <a
                href="/auth/signin"
                className="text-sm text-muted hover:text-ink transition-colors"
              >
                Sign in
              </a>
            </div>
          </div>
          </div>
          ) : null
        ) : (
          <div className="mt-3 sticky bottom-0 bg-paper pt-3">
          {/* Context attachments as chips ABOVE the composer */}
          {attachedDocs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachedDocs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => removeDoc(d.id)}
                  title={`Remove ${d.filename}`}
                  className="inline-flex items-center gap-1.5 border border-rule bg-paper px-2 py-1 font-mono text-[11px] text-ink hover:border-ink transition-colors"
                >
                  <span className="text-muted">Document</span>
                  <span className="max-w-[180px] truncate">{d.filename}</span>
                  <span className="text-muted ml-1" aria-hidden>x</span>
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={pending}
            rows={3}
            placeholder={`Ask about ${matter.title}. Cmd/Ctrl+Enter to send.`}
            className="w-full bg-paper border border-rule px-4 py-3 text-[15px] focus:border-ink focus:outline-none transition-colors font-sans text-ink resize-y disabled:bg-wash disabled:text-muted disabled:cursor-not-allowed"
          />
          <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
            {/* Left: attachment chips + workflows stub */}
            <div className="flex items-center gap-3 relative">
              <button
                type="button"
                onClick={() => setAttachOpen((v) => !v)}
                className="font-mono text-[11px] text-muted hover:text-ink transition-colors"
              >
                + Documents
              </button>
              <button
                type="button"
                onClick={() => setSkillsOpen((v) => !v)}
                aria-expanded={skillsOpen}
                aria-haspopup="menu"
                data-testid="chat-skills-toggle"
                className="font-mono text-[11px] text-muted hover:text-ink transition-colors"
              >
                Skills{runnableSkillCount > 0 ? ` (${runnableSkillCount})` : ""}
              </button>
              {skillsOpen && (
                <div
                  role="menu"
                  aria-label="Skills enabled in this matter"
                  className="absolute bottom-full left-0 mb-2 border border-rule bg-paper p-3 w-[300px] z-10"
                  data-testid="chat-skills-popover"
                >
                  <div className="eyebrow mb-2">Run a skill</div>
                  {runnableSkillCount === 0 ? (
                    <p className="text-xs text-muted">
                      Nothing runnable here right now.{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setSkillsOpen(false);
                          setTabAndHash("workflows");
                        }}
                        className="underline underline-offset-4 hover:text-ink"
                      >
                      Open Skills →
                      </button>
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {runnableModuleSkills.length > 0 && (
                        <ul className="space-y-2">
                          {runnableModuleSkills.map((skill) => (
                            <li key={`${skill.moduleId}:${skill.capabilityId}`}>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => onPickRunnerSkill(skill)}
                                className="flex w-full items-start justify-between gap-2 border border-rule px-2 py-1.5 text-left text-xs hover:border-ink"
                                data-testid={`chat-runner-skill-${skill.moduleId}-${skill.capabilityId}`}
                              >
                                <span className="block">
                                  <span className="block text-ink font-medium">
                                    {skill.title}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] text-muted">
                                    Ready in this project
                                  </span>
                                </span>
                                <span aria-hidden="true" className="text-muted">
                                  →
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSkillsOpen(false);
                      setTabAndHash("workflows");
                    }}
                    className="mt-3 text-xs text-muted underline underline-offset-4 hover:text-ink"
                  >
                    Manage skills →
                  </button>
                </div>
              )}
              {attachOpen && recentDocs.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 border border-rule bg-paper p-3 w-[280px] z-10">
                  <div className="eyebrow mb-2">Attach documents</div>
                  <ul className="space-y-2">
                    {recentDocs.map((d) => {
                      const checked = selectedDocIds.has(d.id);
                      return (
                        <li key={d.id}>
                          <label className="flex items-start gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDoc(d.id)}
                              className="mt-0.5"
                            />
                            <span className="font-mono text-ink truncate">{d.filename}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setAttachOpen(false)}
                    className="mt-3 font-mono text-[10px] text-muted hover:text-ink"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>

            {/* Right: Send */}
            <div className="flex items-center gap-3">
              <button
                onClick={onSend}
                disabled={pending || !input.trim()}
                className={primaryBtn}
              >
                {pending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
          </div>
        )}
      </div>

      {showContextRail && (
        <MatterContextRail
          docs={docs}
          recentDocs={recentDocs}
          runnableSkillCount={runnableSkillCount}
          readySkillLabels={[
            ...runnableModuleSkills.map((skill) => skill.title),
          ]}
          selectedCount={selectedDocIds.size}
          onOpenDocuments={() => setTabAndHash("documents")}
          onOpenSkills={() => setTabAndHash("workflows")}
          onOpenRecord={openRecord}
          onOpenOutputs={openOutputs}
          onOpenPack={openWorkingPack}
        />
      )}
    </div>
  );
}

function MatterContextRail({
  docs,
  recentDocs,
  runnableSkillCount,
  readySkillLabels,
  selectedCount,
  onOpenDocuments,
  onOpenSkills,
  onOpenRecord,
  onOpenOutputs,
  onOpenPack,
}: {
  docs: MatterDocument[] | null;
  recentDocs: MatterDocument[];
  runnableSkillCount: number;
  readySkillLabels: string[];
  selectedCount: number;
  onOpenDocuments: () => void;
  onOpenSkills: () => void;
  onOpenRecord: () => void;
  onOpenOutputs: () => void;
  onOpenPack: () => void;
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start" data-testid="matter-context-rail">
      <RailPanel
        eyebrow="Documents"
        actionLabel="Open"
        onAction={onOpenDocuments}
        actionTestId="open-documents-link"
      >
        {docs === null ? (
          <p className="text-sm text-muted">Loading project files…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted">No documents loaded yet.</p>
        ) : (
          <>
            <p className="text-sm font-medium text-ink">
              {docs.length} loaded{selectedCount > 0 ? ` · ${selectedCount} attached` : ""}
            </p>
            <ul className="mt-3 space-y-2">
              {recentDocs.slice(0, 4).map((doc) => (
                <li key={doc.id} className="truncate font-mono text-xs text-muted">
                  {doc.filename}
                </li>
              ))}
            </ul>
          </>
        )}
      </RailPanel>

      <RailPanel eyebrow="Skills" actionLabel="Manage" onAction={onOpenSkills}>
        <p className="text-sm font-medium text-ink">
          {runnableSkillCount} runnable
        </p>
        {readySkillLabels.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {readySkillLabels.slice(0, 4).map((label) => (
              <li key={label} className="text-xs text-muted">
                {label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Enable a skill to run it here.</p>
        )}
      </RailPanel>

      <RailPanel eyebrow="Proof" actionLabel="Record" onAction={onOpenRecord}>
        <p className="text-sm text-muted">
          Every skill run writes to the matter Record. Signed outputs and the
          working pack sit behind it.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <button
            type="button"
            onClick={onOpenOutputs}
            className="underline underline-offset-4 hover:text-ink"
          >
            Signed outputs
          </button>
          <button
            type="button"
            onClick={onOpenPack}
            className="underline underline-offset-4 hover:text-ink"
          >
            Working pack
          </button>
        </div>
      </RailPanel>
    </aside>
  );
}

function RailPanel({
  eyebrow,
  actionLabel,
  onAction,
  actionTestId,
  children,
}: {
  eyebrow: string;
  actionLabel: string;
  onAction: () => void;
  actionTestId?: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-rule bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-widest text-muted">{eyebrow}</p>
        <button
          type="button"
          onClick={onAction}
          data-testid={actionTestId}
          className="text-xs text-muted underline underline-offset-4 hover:text-ink"
        >
          {actionLabel}
        </button>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function formatError(err: unknown): string {
  if (err instanceof ProviderUpstreamError) return providerUpstreamMessage(err);
  const text = err instanceof Error ? err.message : String(err);
  const m = text.match(/^Error:\s*(\d{3})\s+([^:]+):\s*(.*)$/s);
  if (!m) return text.replace(/^Error:\s*/, "");
  const [, status, , raw] = m;
  let body = raw.trim();
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.detail === "string") body = parsed.detail;
  } catch {
    // not JSON
  }
  if (status === "401") return "You need to sign in again to use the assistant.";
  if (status === "409") return body || "This matter's privilege state blocks cloud model calls. Change privilege or use a local model.";
  if (status === "422") return body || "The request was rejected. Check your API key and try again.";
  return `HTTP ${status}: ${body}`;
}
