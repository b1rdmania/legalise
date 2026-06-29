import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getModulesV2,
  documentOriginalUrl,
  listGrants,
  listAssistantMessages,
  listInstalledModules,
  postAssistantMessageStream,
  ProviderKeyMissingError,
  ProviderUpstreamError,
  providerKeyMissingFromBody,
  providerUpstreamMessage,
  tryParseProviderUpstream,
  type AssistantMessage,
  type AssistantSource,
  type AssistantStreamEvent,
  type ChronologyEvent,
  type GrantRow,
  type InstalledModule,
  type Matter,
  type MatterDocument,
  type SuggestedAction,
  type V2ManifestEntry,
} from "../../lib/api";
import { InlineSpinner, ProviderKeyMissingBanner, primaryBtn } from "../../ui/primitives";
import { posturePaused } from "../../lib/posture";
import { InlineAgentStatus, MessageBubble, type InlineAgentStep } from "../MessageBubble";
import { GenericSkillRunner } from "../GenericSkillRunner";
import {
  runnableMatterSkills,
  withInstalledEntries,
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
  // Where a `view_signed_output` action lands. Only the demo emits the
  // action today; shells that omit this simply ignore it.
  onOpenSignedOutput?: () => void;
  initialDocumentId?: string | null;
  // Pause/resume entry point in the header meta line. Same plumbing as
  // PostureBanner: the callback owns setPrivilege + matter refetch
  // (MatterDetail.onPostureChange). Omitted by demo/read-only shells,
  // which hides the action. Messaging stays with PostureBanner — this
  // is only the always-reachable entry point.
  onPostureChange?: (next: string) => Promise<void>;
}

// Three concrete first-actions per matter type. Per JOY.md "Suggested
// Actions": not generic. Matter-shaped starters that prefill the composer.
// P22: exactly 3 matter-type-aware starters, plain rows.
const SUGGESTED_BY_TYPE: Record<string, string[]> = {
  employment_tribunal: [
    "Stress-test the dismissal claim",
    "Draft a letter before action",
    "Summarise the witness statement",
  ],
  civil: [
    "Stress-test this case",
    "Draft a pre-action letter",
    "Summarise a document",
  ],
};
const SUGGESTED_DEFAULT = [
  "Stress-test this case",
  "Draft a letter",
  "Summarise a document",
];

const ACTION_TARGET: Partial<Record<SuggestedAction["type"], TabKey>> = {
  view_document: "documents",
  view_audit: "audit",
  view_chronology: "chronology",
};

const WORKFLOW_ACTION_PROMPT: Partial<Record<SuggestedAction["type"], string>> = {
  anonymise_document: "Anonymise the selected document now.",
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
  showContextRail = false,
  onDisabledAction,
  onDocumentChip,
  onOpenSignedOutput,
  initialDocumentId,
  onPostureChange,
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
  const [agentSteps, setAgentSteps] = useState<InlineAgentStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [keyMissingProvider, setKeyMissingProvider] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(Boolean(initialMessages));
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  // Per-assistant-message retrieval note, keyed by message id. Populated
  // from the SSE context.loaded event when the turn searched the matter.
  const [retrievalNotes, setRetrievalNotes] = useState<
    Map<string, { docs: number; chunks: number }>
  >(new Map());
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [moduleEntries, setModuleEntries] = useState<V2ManifestEntry[]>([]);
  const [installedModules, setInstalledModules] = useState<Map<string, InstalledModule>>(
    new Map(),
  );
  const [grantRows, setGrantRows] = useState<GrantRow[] | null>(null);
  const [activeRunnerSkill, setActiveRunnerSkill] =
    useState<RunnableMatterSkill | null>(null);
  const [workPane, setWorkPane] = useState<AssistantWorkPaneState | null>(null);
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
        modules: withInstalledEntries(moduleEntries, installedModules),
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

  const sendMessage = async (content: string, selectedIds = selectedDocIds) => {
    content = content.trim();
    if (!content || pending || disabled) return;
    setError(null);
    setKeyMissingProvider(null);
    setPending(true);
    setThinking(true);
    setAgentSteps([{ label: "Starting turn", status: "running" }]);
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
      const stream = postAssistantMessageStream(matter.slug, {
        content,
        selected_document_ids: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
      });
      let sawResult = false;
      let retrieval: { docs: number; chunks: number } | null = null;
      for await (const event of stream) {
        if (event.event === "error") {
          throw streamEventError(event);
        }
        setAgentSteps((prev) => nextAgentSteps(prev, event));
        if (event.event === "context.loaded") {
          const docs = event.data.retrieved_document_count ?? 0;
          const chunks = event.data.retrieved_chunk_count ?? 0;
          if (docs > 0 || chunks > 0) retrieval = { docs, chunks };
        }
        if (event.event !== "result") continue;
        sawResult = true;
        const assistantId = event.data.assistant.id;
        if (retrieval) {
          const note = retrieval;
          setRetrievalNotes((prev) => {
            const next = new Map(prev);
            next.set(assistantId, note);
            return next;
          });
        }
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== optimistic.id);
          return [...without, event.data.user, event.data.assistant];
        });
      }
      if (!sawResult) {
        throw new Error("Assistant stream ended before returning a result.");
      }
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
      setAgentSteps([]);
    }
  };

  const onSend = async () => {
    await sendMessage(input);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSend();
    }
  };

  const dispatchAction = (a: SuggestedAction) => {
    if (a.type === "view_signed_output") {
      onOpenSignedOutput?.();
      return;
    }
    const workflowPrompt = WORKFLOW_ACTION_PROMPT[a.type];
    if (workflowPrompt) {
      const selectedIds = new Set(selectedDocIds);
      const documentId = a.params.document_id;
      if (documentId && docsById.has(documentId)) selectedIds.add(documentId);
      void sendMessage(`${workflowPrompt}\n\nRequested from: ${a.label}`, selectedIds);
      return;
    }
    // "Open document" is a secondary action on an inline summary: take
    // the user to the specific document reader rather than dropping them
    // on the Documents tab (which loses the file). The summary stays in chat.
    if (a.type === "view_document" && a.params.document_id) {
      dispatchDocChip(a.params.document_id);
      return;
    }
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
  // A retrieved source: open the document reader at the cited passage,
  // passing the char range so the reader can highlight the exact slice.
  // Read-only/public shells (onDocumentChip) only get the document id.
  const dispatchSource = (source: AssistantSource) => {
    if (onDocumentChip) {
      onDocumentChip(source.document_id);
      return;
    }
    void navigate({
      to: "/matters/$slug/documents/$documentId",
      params: { slug: matter.slug, documentId: source.document_id },
      search: {
        from: "assistant",
        hl_start: source.char_start,
        hl_end: source.char_end,
      },
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

  const openAddSkill = () => {
    void navigate({ to: "/skills/lawve" });
  };

  // Pause/resume from the meta line. Mirrors PostureBanner's
  // ChangePostureControl: paused resumes to B_mixed, anything else
  // pauses to C_paused. The paused-state messaging itself stays with
  // PostureBanner once the parent refetches the matter.
  const [postureSubmitting, setPostureSubmitting] = useState(false);
  const onTogglePause = async () => {
    if (!onPostureChange || postureSubmitting) return;
    const next = posturePaused(matter.privilege_posture) ? "B_mixed" : "C_paused";
    setPostureSubmitting(true);
    try {
      await onPostureChange(next);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setPostureSubmitting(false);
    }
  };

  return (
    <div
      className="mx-auto flex min-h-[calc(100vh-96px)] w-full max-w-[760px] flex-col px-1"
      data-testid="chat-led-workspace"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-6 pt-1">
          <h1 className="max-w-2xl text-[30px] font-semibold leading-[1.05] tracking-tight2 text-ink sm:text-[34px]">
            {matter.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
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
            {/* Activity lives on the matter rail (WS1); the old faint
                header link was redundant chrome and has been removed.
                openRecord is still used by the work pane + context rail. */}
            {onPostureChange && !disabled && (
              <>
                <span aria-hidden="true">·</span>
                {/* Shortcut to the SAME posture state owned by PostureBanner.
                    Reflects matter.privilege_posture and calls the shared
                    onPostureChange — not an independent toggle. The status
                    word makes that legible; full messaging stays with the
                    banner. */}
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={
                      posturePaused(matter.privilege_posture)
                        ? "text-seal"
                        : "text-muted"
                    }
                  >
                    {posturePaused(matter.privilege_posture) ? "AI paused" : "AI active"}
                  </span>
                  <button
                    type="button"
                    onClick={onTogglePause}
                    disabled={postureSubmitting}
                    className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal disabled:opacity-50"
                    data-testid="chat-pause-toggle"
                  >
                    {posturePaused(matter.privilege_posture) ? "Resume AI" : "Pause AI"}
                  </button>
                </span>
              </>
            )}
          </div>
        </div>

        {attachedDocs.length > 0 && (
          <section
            className="mb-4 border-t border-rule py-2"
            data-testid="chat-attached-document-context"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  {attachedDocs.map((doc) => (
                    <span
                      key={doc.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-item border border-rule bg-paper px-2 py-1 tech-token text-xs text-ink"
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
                  className="shrink-0 text-xs text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                >
                  Preview →
                </button>
              )}
            </div>
          </section>
        )}

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto border-t border-rule py-6"
        >
        {!loaded && (
          <p className="tech-token text-xs text-muted flex items-center gap-2">
            <InlineSpinner />
            loading conversation
          </p>
        )}
        {loaded && messages.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2" data-testid="chat-empty-state">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestion(s)}
                className="group flex min-h-[44px] items-center justify-between gap-3 rounded-item border border-rule bg-paper px-3 text-left text-[14px] leading-5 text-ink transition-colors hover:border-ink hover:bg-paper-sunken"
              >
                <span>{s}</span>
                <span className="text-muted transition-colors group-hover:text-ink" aria-hidden>
                  →
                </span>
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => {
          const note = m.role === "assistant" ? retrievalNotes.get(m.id) : undefined;
          return (
            <div key={m.id}>
              <MessageBubble
                message={m}
                docs={docs}
                chronology={chronology}
                onDocChip={dispatchDocChip}
                onChronChip={dispatchChronChip}
                onAction={dispatchAction}
                onSources={(message) => setWorkPane({ kind: "sources", message })}
                onVersions={(message) => setWorkPane({ kind: "versions", message })}
                onRecord={(message) => setWorkPane({ kind: "activity", message })}
              />
              {m.role === "assistant" && (
                <AssistantSawPanel
                  note={note}
                  sources={m.sources}
                  onSource={dispatchSource}
                />
              )}
            </div>
          );
        })}
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
            <InlineAgentStatus steps={agentSteps} />
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
          <div className="sticky bottom-0 mt-3 bg-paper pt-3">
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
                className="text-sm text-muted hover:text-seal transition-colors"
              >
                Sign in
              </a>
            </div>
          </div>
          </div>
          ) : null
        ) : (
          <div className="sticky bottom-0 bg-paper pt-2">
          {/* Context attachments as chips ABOVE the composer */}
          {attachedDocs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachedDocs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => removeDoc(d.id)}
                  title={`Remove ${d.filename}`}
                  className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors"
                >
                  <span className="max-w-[200px] truncate">{d.filename}</span>
                  <span aria-hidden>×</span>
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
            rows={2}
            data-testid="chat-composer-input"
            placeholder={`Ask about ${matter.title}`}
            className="w-full resize-none rounded-item border border-rule bg-paper px-4 py-3 text-[17px] leading-6 text-ink transition-colors placeholder:text-muted focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted"
          />
          <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
            {/* Left: attachment chips + workflows stub */}
            <div className="flex items-center gap-3 relative">
              {/* Single attach affordance: this control opens the picker
                  popover below. Label says exactly what it does so there
                  is only one obvious way to attach documents. */}
              <button
                type="button"
                onClick={() => setAttachOpen((v) => !v)}
                aria-expanded={attachOpen}
                aria-haspopup="menu"
                data-testid="chat-documents-toggle"
                className="tech-token text-[11px] text-muted hover:text-ink transition-colors"
              >
                Attach documents{selectedDocIds.size > 0 ? ` (${selectedDocIds.size})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setSkillsOpen((v) => !v)}
                aria-expanded={skillsOpen}
                aria-haspopup="menu"
                data-testid="chat-skills-toggle"
                className="tech-token text-[11px] text-muted hover:text-ink transition-colors"
              >
                Skills{runnableSkillCount > 0 ? ` (${runnableSkillCount})` : ""}
              </button>
              {skillsOpen && (
                <div
                  role="menu"
                  aria-label="Skills enabled in this matter"
                  className="absolute bottom-full left-0 mb-2 rounded-item border border-rule bg-paper p-2 w-[300px] z-10"
                  data-testid="chat-skills-popover"
                >
                  {runnableSkillCount === 0 ? (
                    <p className="text-xs text-muted">
                      Nothing runnable here right now.{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setSkillsOpen(false);
                          openAddSkill();
                        }}
                        className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                      >
                      Add a skill →
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
                                className="flex w-full items-start justify-between gap-2 rounded-item px-2 py-1.5 text-left text-xs hover:bg-panel-hover"
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
                  {runnableSkillCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSkillsOpen(false);
                        openAddSkill();
                      }}
                      className="mt-3 text-xs text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                    >
                      Add skill →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSkillsOpen(false);
                      setTabAndHash("workflows");
                    }}
                    className="ml-3 mt-3 text-xs text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                  >
                    Manage matter skills →
                  </button>
                </div>
              )}
              {attachOpen && recentDocs.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 rounded-item border border-rule bg-paper p-2 w-[280px] z-10">
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
                            <span className="tech-token text-ink truncate">{d.filename}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setAttachOpen(false)}
                    className="mt-3 tech-token text-[10px] text-muted hover:text-ink"
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
                data-testid="chat-composer-send"
                className={primaryBtn + " px-4 py-1.5 text-[14px]"}
              >
                {pending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
          </div>
        )}
      </div>

      {workPane ? (
        <AssistantWorkPane
          state={workPane}
          matter={matter}
          docs={docs}
          onClose={() => setWorkPane(null)}
          onOpenDocument={dispatchDocChip}
          onOpenRecord={openRecord}
        />
      ) : showContextRail ? (
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
      ) : null}
    </div>
  );
}

type AssistantWorkPaneState = {
  kind: "sources" | "versions" | "activity";
  message: AssistantMessage;
};

// The audited-retrieval affordance: "what the AI actually saw" for a
// single reply. This is the product's differentiator, so it reads as a
// first-class part of the answer — a bordered panel with a heading, the
// retrieval note as a clear line (not a grey 11px aside), and readable
// rows that stay click-through to the cited passage via onSource
// (dispatchSource). Visible/obvious by default when sources exist;
// collapsible when a reply cites many of them.
function AssistantSawPanel({
  note,
  sources,
  onSource,
}: {
  note?: { docs: number; chunks: number };
  sources?: AssistantSource[];
  onSource: (source: AssistantSource) => void;
}) {
  const list = sources ?? [];
  const hasSources = list.length > 0;
  const collapsible = list.length > 5;
  const [open, setOpen] = useState(!collapsible);

  if (!note && !hasSources) return null;

  const heading = hasSources
    ? `Sources the assistant used (${list.length})`
    : "What the AI saw";

  return (
    <section
      className="mt-3 rounded-card border border-rule bg-paper-sunken px-3 py-2.5"
      data-testid="assistant-sources"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-track2 text-ink">
          {heading}
        </p>
        {hasSources && collapsible && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-[11px] text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
            data-testid="assistant-sources-toggle"
          >
            {open ? "Hide" : `Show all ${list.length}`}
          </button>
        )}
      </div>
      {note && (
        <p className="mt-1.5 text-xs leading-5 text-prose" data-testid="retrieval-note">
          Searched the matter — {note.chunks} passage
          {note.chunks === 1 ? "" : "s"} from {note.docs} document
          {note.docs === 1 ? "" : "s"}.
        </p>
      )}
      {hasSources && open && (
        <ul className="mt-2 space-y-2">
          {list.map((source, i) => (
            <li key={`${source.document_id}-${source.char_start}-${i}`}>
              <button
                type="button"
                onClick={() => onSource(source)}
                className="group block w-full rounded-item border border-rule bg-paper px-2.5 py-2 text-left transition-colors hover:border-ink"
                data-testid="assistant-source-row"
              >
                <span className="block text-xs font-semibold text-ink underline underline-offset-4 decoration-rule group-hover:decoration-seal group-hover:text-seal">
                  {source.title}
                </span>
                {source.snippet.trim() && (
                  <span className="mt-1 block text-xs leading-5 text-muted">
                    {sourceExcerpt(source.snippet)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function streamEventError(event: Extract<AssistantStreamEvent, { event: "error" }>): Error {
  const keyMissing = providerKeyMissingFromBody(event.data);
  if (keyMissing) return keyMissing;
  const upstream = tryParseProviderUpstream(event.data);
  if (upstream) return upstream;
  return new Error(event.data.message || "Assistant stream failed.");
}

function nextAgentSteps(
  previous: InlineAgentStep[],
  event: AssistantStreamEvent,
): InlineAgentStep[] {
  switch (event.event) {
    case "context.loaded":
      return [
        completeStep("Loaded matter context"),
        runningStep(
          event.data.tool_count > 0
            ? `Found ${event.data.tool_count} tool${event.data.tool_count === 1 ? "" : "s"}`
            : "Reading request",
        ),
      ];
    case "turn.accepted":
      return [...completeRunning(previous), runningStep("Planning answer")];
    case "turn.deterministic":
      return [...completeRunning(previous), runningStep("Preparing summary")];
    case "model.start":
      return [
        ...completeRunning(previous),
        runningStep(event.data.stage === "assistant.final" ? "Writing answer" : "Asking model"),
      ];
    case "tool.start":
      return [
        ...completeRunning(previous),
        runningStep(toolLabel(event.data.module_id, event.data.capability_id)),
      ];
    case "tool.end":
      return [
        ...completeRunning(previous),
        completeStep(toolLabel(event.data.module_id, event.data.capability_id)),
        runningStep("Writing answer"),
      ];
    case "tool.error":
      return [
        ...completeRunning(previous),
        completeStep("Tool returned a recoverable error"),
        runningStep("Writing answer"),
      ];
    case "turn.end":
      return [...completeRunning(previous), runningStep("Saving reply")];
    case "result":
      return [...completeRunning(previous), completeStep("Saved reply")];
    case "turn.start":
    case "error":
    default:
      return previous;
  }
}

function completeRunning(steps: InlineAgentStep[]): InlineAgentStep[] {
  return steps.map((step) =>
    step.status === "running" ? { ...step, status: "complete" } : step,
  );
}

function completeStep(label: string): InlineAgentStep {
  return { label, status: "complete" };
}

function runningStep(label: string): InlineAgentStep {
  return { label, status: "running" };
}

function toolLabel(moduleId: string, capabilityId: string): string {
  const moduleLabel = moduleId.split(".").at(-1)?.replace(/[-_]/g, " ") || moduleId;
  const capabilityLabel = capabilityId.replace(/[-_]/g, " ");
  return `Running ${moduleLabel}: ${capabilityLabel}`;
}

function sourceExcerpt(snippet: string, max = 160): string {
  const compact = snippet.trim().replace(/\s+/g, " ");
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}…`;
}

const DOC_CITATION_RE = /\[doc:([A-Za-z0-9_.\-]+)\]/g;

function citedDocuments(
  message: AssistantMessage,
  docs: MatterDocument[] | null,
): MatterDocument[] {
  const byId = new Map((docs ?? []).map((doc) => [doc.id, doc]));
  const seen = new Set<string>();
  const out: MatterDocument[] = [];
  let match: RegExpExecArray | null;
  DOC_CITATION_RE.lastIndex = 0;
  while ((match = DOC_CITATION_RE.exec(message.content)) !== null) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const doc = byId.get(id);
    if (doc) out.push(doc);
  }
  return out;
}

function AssistantWorkPane({
  state,
  matter,
  docs,
  onClose,
  onOpenDocument,
  onOpenRecord,
}: {
  state: AssistantWorkPaneState;
  matter: Matter;
  docs: MatterDocument[] | null;
  onClose: () => void;
  onOpenDocument: (documentId: string) => void;
  onOpenRecord: () => void;
}) {
  const cited = citedDocuments(state.message, docs);
  const title =
    state.kind === "sources"
      ? "Sources"
      : state.kind === "versions"
        ? "Versions"
        : "Activity";

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-rule bg-paper shadow-panel"
      data-testid={`assistant-work-pane-${state.kind}`}
      aria-label={`${title} pane`}
    >
      <section className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-track2 text-muted">
              Inspect
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight2 text-ink">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-item border border-rule bg-paper-sunken px-2 py-1 text-xs text-muted hover:border-ink hover:text-ink"
            aria-label="Close work pane"
          >
            Close
          </button>
        </div>

        {state.kind === "sources" && (
          <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
            {cited.length === 0 ? (
              <p className="text-sm leading-6 text-muted">
                This answer did not cite a file. Attach one above the composer
                and ask again to keep sources close to the answer.
              </p>
            ) : (
              cited.map((doc) => (
                <DocumentPaneCard
                  key={doc.id}
                  doc={doc}
                  primaryLabel="Preview"
                  onPrimary={() => onOpenDocument(doc.id)}
                  secondaryHref={documentOriginalUrl(doc.id)}
                  secondaryLabel="Original"
                />
              ))
            )}
          </div>
        )}

        {state.kind === "versions" && (
          <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
            {cited.length === 0 ? (
              <p className="text-sm leading-6 text-muted">
                No cited file is attached to this answer, so there is no version
                history to open from here.
              </p>
            ) : (
              cited.map((doc) => (
                <DocumentPaneCard
                  key={doc.id}
                  doc={doc}
                  primaryLabel="Open versions"
                  onPrimary={() => onOpenDocument(doc.id)}
                  secondaryHref={documentOriginalUrl(doc.id)}
                  secondaryLabel="Original file"
                />
              ))
            )}
          </div>
        )}

        {state.kind === "activity" && (
          <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
            <p className="text-sm leading-6 text-muted">
              This answer was saved in the thread. Activity shows the assistant
              call, file context, model, posture, and any later output events.
            </p>
            <button
              type="button"
              onClick={onOpenRecord}
              className="inline-flex min-h-[40px] items-center rounded-md border border-ink bg-ink px-3 text-sm font-medium text-paper hover:bg-black"
            >
              Open Activity
            </button>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-card border border-rule bg-paper-sunken p-2">
                <dt className="uppercase tracking-track2 text-muted">Matter</dt>
                <dd className="mt-1 font-semibold text-ink">{matter.title}</dd>
              </div>
              <div className="rounded-card border border-rule bg-paper-sunken p-2">
                <dt className="uppercase tracking-track2 text-muted">State</dt>
                <dd className="mt-1 font-semibold text-ink">
                  {matter.privilege_posture}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </section>
    </aside>
  );
}

function DocumentPaneCard({
  doc,
  primaryLabel,
  onPrimary,
  secondaryHref,
  secondaryLabel,
}: {
  doc: MatterDocument;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <article className="rounded-card border border-rule bg-paper-sunken p-3">
      <p className="tech-token text-xs font-semibold text-ink">{doc.filename}</p>
      <p className="mt-1 text-xs text-muted">
        {doc.tag || "untagged"} · {doc.mime_type}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPrimary}
          className="rounded-md border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:border-ink"
        >
          {primaryLabel}
        </button>
        {secondaryHref && secondaryLabel && (
          <a
            href={secondaryHref}
            className="rounded-md border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:border-ink"
          >
            {secondaryLabel}
          </a>
        )}
      </div>
    </article>
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
                <li key={doc.id} className="truncate tech-token text-xs text-muted">
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

      <RailPanel eyebrow="Activity" actionLabel="Open" onAction={onOpenRecord}>
        <p className="text-sm text-muted">
          Skill runs, saved outputs, and exports are visible from the matter activity.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <button
            type="button"
            onClick={onOpenOutputs}
            className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          >
            Outputs
          </button>
          <button
            type="button"
            onClick={onOpenPack}
            className="underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          >
            Export
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
    <section className="rounded-card border border-rule bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-widest text-muted">{eyebrow}</p>
        <button
          type="button"
          onClick={onAction}
          data-testid={actionTestId}
          className="text-xs text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
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
