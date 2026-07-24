import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getModulesV2,
  documentOriginalUrl,
  listApiKeys,
  listGrants,
  listAssistantMessages,
  listThreads,
  getThreadMessages,
  listInstalledModules,
  postAssistantMessageStream,
  saveMessageAsDraft,
  ProviderKeyMissingError,
  ProviderUpstreamError,
  providerKeyMissingFromBody,
  providerLabel,
  providerUpstreamMessage,
  tryParseProviderUpstream,
  type AssistantMessage,
  type AssistantSource,
  type AssistantStreamEvent,
  type AssistantThread,
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
import { indexStatusChip } from "../indexStatus";
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
  // Multiple chat threads per matter. In demo/disabled mode the switcher is
  // hidden and these stay empty/null — the existing single-thread UX.
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
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
  // Token-streamed draft of the answer being written. Streaming providers
  // fill this via model.delta events; the final message replaces it on
  // result. null = no draft (non-streaming providers never set it).
  const [draft, setDraft] = useState<string | null>(null);
  // True only while model.delta events are arriving — the guard for the
  // Stop affordance. Keyless/stub turns never stream, so Stop never
  // appears for them ("stream active", not "request active").
  const [streamActive, setStreamActive] = useState(false);
  // A user-stopped turn: the frozen partial draft. The turn keeps running
  // server-side (client disconnect never cancels it — the stream endpoint
  // runs the turn in a detached task) and the persisted reply replaces
  // this once the thread refresh finds it.
  const [stopped, setStopped] = useState<{ text: string } | null>(null);
  // One AbortController per in-flight streaming turn.
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  // Cancellation token for the post-stop thread poll: bumped by any new
  // send, thread switch, or unmount so a stale poll never writes state.
  const stopPollToken = useRef(0);
  const stopPollTimer = useRef<number | null>(null);

  useEffect(() => {
    // Reset on mount, not just initialisation: StrictMode's dev
    // mount/unmount/mount cycle runs the cleanup once, and the ref must
    // come back true for the real mount.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPollToken.current += 1;
      if (stopPollTimer.current !== null) window.clearTimeout(stopPollTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  const cancelStopPoll = () => {
    stopPollToken.current += 1;
    if (stopPollTimer.current !== null) {
      window.clearTimeout(stopPollTimer.current);
      stopPollTimer.current = null;
    }
  };
  // Fallback for non-streaming paths: after ~10s of a pending turn with no
  // draft text, one quiet honesty line appears under the step ticker.
  const [longWait, setLongWait] = useState(false);
  // Whether the user holds the key the matter's model needs. null =
  // unknown/not applicable; false drives the passive header notice. Same
  // source of truth as the Matters-page "Start here" banner (listApiKeys).
  const [hasRequiredKey, setHasRequiredKey] = useState<boolean | null>(null);

  useEffect(() => {
    if (!thinking) {
      setLongWait(false);
      return;
    }
    const timer = window.setTimeout(() => setLongWait(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [thinking]);

  useEffect(() => {
    if (disabled || !matter.required_provider) {
      setHasRequiredKey(null);
      return;
    }
    let cancelled = false;
    listApiKeys()
      .then((keys) => {
        if (cancelled) return;
        setHasRequiredKey(
          keys.some((k) => k.provider === matter.required_provider),
        );
      })
      // On error stay silent rather than nag (same call as MatterList).
      .catch(() => {
        if (!cancelled) setHasRequiredKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [disabled, matter.required_provider]);

  // Initial fetch (skip in demo: initialMessages provided). Load the
  // matter's threads and open the most-recently-active one. If retrieving
  // threads fails (older backend), fall back to the flat message list so
  // the chat still works.
  useEffect(() => {
    if (initialMessages) return;
    let cancelled = false;
    listThreads(matter.slug)
      .then(async (rows) => {
        if (cancelled) return;
        setThreads(rows);
        const active = rows[0] ?? null;
        if (active) {
          setActiveThreadId(active.id);
          const msgs = await getThreadMessages(matter.slug, active.id);
          if (!cancelled) setMessages(msgs);
        } else {
          setActiveThreadId(null);
          setMessages([]);
        }
        if (!cancelled) setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
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
      });
    return () => {
      cancelled = true;
    };
  }, [matter.slug, initialMessages]);

  const refreshThreads = async () => {
    try {
      const rows = await listThreads(matter.slug);
      setThreads(rows);
    } catch {
      // non-fatal: the switcher just won't refresh
    }
  };

  const switchThread = async (threadId: string) => {
    if (threadId === activeThreadId || pending) return;
    // Belt and braces: pending guards mean no stream can be in flight
    // here, but a stopped turn may still be polling for its reply.
    abortRef.current?.abort();
    cancelStopPoll();
    setStopped(null);
    setActiveThreadId(threadId);
    setError(null);
    setKeyMissingProvider(null);
    setLoaded(false);
    try {
      const msgs = await getThreadMessages(matter.slug, threadId);
      setMessages(msgs);
    } catch (err) {
      setError(formatError(err));
      setMessages([]);
    } finally {
      setLoaded(true);
    }
  };

  // Start a fresh conversation: clear the visible thread. The next sent
  // message creates the thread server-side; we then capture its id and
  // refresh the list.
  const startNewChat = () => {
    if (pending) return;
    abortRef.current?.abort();
    cancelStopPoll();
    setStopped(null);
    setActiveThreadId(null);
    setMessages([]);
    setError(null);
    setKeyMissingProvider(null);
    setInput("");
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // Auto-scroll to newest message (and follow the draft as it streams).
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking, draft]);

  // Composer autogrow: track content height up to ~8 rows, then scroll.
  // Runs on every input change (including programmatic sets from the
  // starter chips and the failed-send restore).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // 8 rows × 24px line-height + vertical padding (py-3 = 24px).
    const max = 8 * 24 + 24;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [input]);

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

  // All matter documents, newest first — the attach popover lists the lot
  // (with a client-side title filter); the context rail shows the head.
  const sortedDocs = useMemo(() => {
    if (!docs) return [];
    return [...docs].sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
  }, [docs]);

  const recentDocs = useMemo(() => sortedDocs.slice(0, 5), [sortedDocs]);

  const [attachFilter, setAttachFilter] = useState("");
  const filteredAttachDocs = useMemo(() => {
    const q = attachFilter.trim().toLowerCase();
    if (!q) return sortedDocs;
    return sortedDocs.filter((d) => (d.filename ?? "").toLowerCase().includes(q));
  }, [sortedDocs, attachFilter]);

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
    cancelStopPoll();
    setStopped(null);
    setPending(true);
    setThinking(true);
    setAgentSteps([{ label: "Starting turn", status: "running" }]);
    // How many persisted messages the thread showed before this turn —
    // the post-stop poll uses it to tell "reply landed" from "user row
    // only" (both rows commit together at the end of the turn).
    const baselineCount = messages.length;
    const optimistic: AssistantMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content,
      suggested_actions: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    const controller = new AbortController();
    abortRef.current = controller;
    // Local mirror of the draft text: the catch block needs the partial
    // answer at stop time, and reading React state there would be stale.
    let draftText = "";
    // The thread this turn runs in. turn.start carries the id even when
    // the server opened a new thread, so a stopped turn can still be
    // refreshed from the right thread.
    let turnThreadId: string | null = activeThreadId;
    try {
      const wasNewThread = activeThreadId === null;
      const stream = postAssistantMessageStream(
        matter.slug,
        {
          content,
          selected_document_ids: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
          thread_id: activeThreadId ?? undefined,
        },
        controller.signal,
      );
      let sawResult = false;
      let newThreadId: string | null = null;
      let retrieval: { docs: number; chunks: number } | null = null;
      for await (const event of stream) {
        if (event.event === "error") {
          throw streamEventError(event);
        }
        setAgentSteps((prev) => nextAgentSteps(prev, event));
        if (event.event === "turn.start" && event.data.thread_id) {
          turnThreadId = event.data.thread_id;
        }
        // Each model call starts a fresh draft (a tool turn writes twice);
        // deltas append the answer as it is written.
        if (event.event === "model.start") {
          setDraft(null);
          draftText = "";
        }
        if (event.event === "model.delta") {
          const text = event.data.text;
          setDraft((prev) => (prev ?? "") + text);
          draftText += text;
          setStreamActive(true);
        }
        if (event.event === "context.loaded") {
          const docs = event.data.retrieved_document_count ?? 0;
          const chunks = event.data.retrieved_chunk_count ?? 0;
          if (docs > 0 || chunks > 0) retrieval = { docs, chunks };
        }
        if (event.event !== "result") continue;
        sawResult = true;
        newThreadId = event.data.thread_id ?? null;
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
      // The server may have opened a new thread for this turn. Adopt its id
      // and refresh the switcher so the new conversation appears.
      if (newThreadId && newThreadId !== activeThreadId) {
        setActiveThreadId(newThreadId);
      }
      if (wasNewThread || newThreadId) {
        void refreshThreads();
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // User Stop (or unmount/thread-switch abort). The turn keeps
        // running server-side and persists atomically, so nothing is
        // lost: keep the optimistic user message, freeze the partial
        // draft, and poll the thread until the recorded reply lands.
        if (mountedRef.current) {
          setStopped({ text: draftText });
          if (turnThreadId) {
            schedulePostStopRefresh(turnThreadId, baselineCount);
          }
        }
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        // The optimistic message is gone — give the user their prompt back
        // in the composer so a failed send never eats the text. Attached
        // docs are untouched (selection only clears on explicit remove).
        setInput(content);
        if (err instanceof ProviderKeyMissingError) {
          setKeyMissingProvider(err.provider);
        } else {
          setError(formatError(err));
        }
      }
    } finally {
      if (mountedRef.current) {
        setPending(false);
        setThinking(false);
        setAgentSteps([]);
        setStreamActive(false);
        // A partial draft never persists as a message: the final message
        // already replaced it on success, a failed turn discards it, and
        // a stopped turn froze its copy into `stopped` above.
        setDraft(null);
      }
    }
  };

  // After a user Stop, the turn is still finishing on the server. Refresh
  // the thread after ~2s and keep checking until the persisted reply
  // (user + assistant rows commit together) replaces the frozen draft.
  const schedulePostStopRefresh = (threadId: string, baselineCount: number) => {
    const token = stopPollToken.current;
    let attempt = 0;
    const tick = async () => {
      if (!mountedRef.current || stopPollToken.current !== token) return;
      try {
        const msgs = await getThreadMessages(matter.slug, threadId);
        if (!mountedRef.current || stopPollToken.current !== token) return;
        const last = msgs[msgs.length - 1];
        if (msgs.length >= baselineCount + 2 && last?.role === "assistant") {
          setMessages(msgs);
          setActiveThreadId((current) => current ?? threadId);
          setStopped(null);
          void refreshThreads();
          return;
        }
      } catch {
        // transient — try again on the next tick
      }
      attempt += 1;
      if (attempt < 24) {
        stopPollTimer.current = window.setTimeout(() => void tick(), 2500);
      }
    };
    stopPollTimer.current = window.setTimeout(() => void tick(), 2000);
  };

  const onSend = async () => {
    await sendMessage(input);
  };

  const onStop = () => {
    abortRef.current?.abort();
  };

  // Regenerate: resend the last user prompt as a brand-new turn through
  // the normal send path. The earlier answer stays in the transcript —
  // the record is append-only and the UI matches. Only offered on the
  // last assistant message, and only when no turn is in flight (a
  // stopped turn is still finishing server-side, so it counts).
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  }, [messages]);
  const regenerateContent = useMemo(() => {
    for (let i = lastAssistantIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return null;
  }, [messages, lastAssistantIndex]);
  const canRegenerate =
    !disabled && !pending && stopped === null && regenerateContent !== null;

  // Enter sends; Shift+Enter inserts a newline (the universal chat
  // convention). ⌘/Ctrl+Enter still sends. The isComposing guard keeps
  // IME confirmation (e.g. Japanese input) from firing a send.
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    onSend();
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

  // Header document popover: the doc count opens a list of the matter's
  // documents with their index status, so grounding is visible before an
  // answer — and a stuck "Indexing…" document has a user-visible surface.
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsFilter, setDocsFilter] = useState("");
  const filteredHeaderDocs = useMemo(() => {
    const q = docsFilter.trim().toLowerCase();
    if (!q) return sortedDocs;
    return sortedDocs.filter((d) => (d.filename ?? "").toLowerCase().includes(q));
  }, [sortedDocs, docsFilter]);

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

  const showThreadRail = !disabled && !initialMessages;

  return (
    <div
      className={
        "mx-auto flex min-h-[calc(100vh-96px)] w-full gap-6 px-1 " +
        (showThreadRail ? "max-w-[1000px]" : "max-w-[760px]")
      }
      data-testid="chat-led-workspace"
    >
      {showThreadRail && (
        <ThreadRail
          threads={threads}
          activeThreadId={activeThreadId}
          disabled={pending}
          onSwitch={switchThread}
          onNewChat={startNewChat}
        />
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-6 pt-1">
          <h1 className="max-w-2xl text-[30px] font-semibold leading-[1.05] tracking-tight2 text-ink sm:text-[34px]">
            {matter.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {docs !== null && docs.length > 0 ? (
              <span className="relative inline-flex">
                <button
                  type="button"
                  onClick={() => setDocsOpen((v) => !v)}
                  aria-expanded={docsOpen}
                  aria-haspopup="menu"
                  data-testid="docs-context-status"
                  className="hit underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                >
                  {docs.length} document{docs.length === 1 ? "" : "s"}
                </button>
                {docsOpen && (
                  <div
                    className="absolute top-full left-0 mt-2 rounded-item border border-rule bg-paper p-2 w-[280px] z-10 text-left"
                    data-testid="chat-docs-popover"
                  >
                    {sortedDocs.length > 5 && (
                      <input
                        type="text"
                        value={docsFilter}
                        onChange={(e) => setDocsFilter(e.target.value)}
                        placeholder="Filter documents"
                        aria-label="Filter documents"
                        data-testid="chat-docs-filter"
                        className="mb-2 w-full rounded-item border border-rule bg-paper px-2 py-1 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-hidden"
                      />
                    )}
                    <ul className="max-h-56 space-y-1 overflow-y-auto">
                      {filteredHeaderDocs.map((d) => {
                        const chip = indexStatusChip(d.index_status);
                        return (
                          <li key={d.id}>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setDocsOpen(false);
                                dispatchDocChip(d.id);
                              }}
                              className="flex w-full items-baseline justify-between gap-2 rounded-item px-2 py-1.5 text-left text-xs hover:bg-panel-hover"
                              data-testid={`chat-docs-row-${d.id}`}
                            >
                              <span className="tech-token min-w-0 truncate text-ink">
                                {d.filename}
                              </span>
                              {chip && (
                                <span
                                  className={`shrink-0 text-[11px] ${chip.className}`}
                                  title={chip.title}
                                >
                                  {chip.label}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                      {filteredHeaderDocs.length === 0 && (
                        <li className="px-1 py-0.5 text-xs text-muted">
                          No documents match.
                        </li>
                      )}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setDocsOpen(false)}
                      className="mt-3 tech-token text-[10px] text-muted hover:text-ink"
                    >
                      Close
                    </button>
                  </div>
                )}
              </span>
            ) : (
              <span data-testid="docs-context-status">
                {docs === null ? "Loading documents…" : "No documents yet"}
              </span>
            )}
            {showContextRail && (
              <>
                <span aria-hidden="true">·</span>
                <span>{runnableSkillCount} runnable skill{runnableSkillCount === 1 ? "" : "s"}</span>
              </>
            )}
            {matter.required_provider && hasRequiredKey === false && (
              <>
                <span aria-hidden="true">·</span>
                {/* Passive notice: this matter's model needs a key the user
                    hasn't added. Same muted register as the rest of the
                    meta line — the hard stop stays with the send-time banner. */}
                <span data-testid="chat-no-key-notice">
                  No {providerLabel(matter.required_provider)} key yet —{" "}
                  <a
                    href="/settings/keys"
                    className="hit underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                  >
                    add one in Settings
                  </a>
                </span>
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
                    className="hit underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal disabled:opacity-50"
                    data-testid="chat-pause-toggle"
                  >
                    {posturePaused(matter.privilege_posture) ? "Resume AI" : "Pause AI"}
                  </button>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Mobile thread control — the left ThreadRail is desktop-only
            (md:flex), so below md a compact dropdown + New chat keeps thread
            switching reachable on phones. */}
        {showThreadRail && (
          <div
            className="mb-4 flex items-center gap-2 border-b border-rule pb-3 md:hidden"
            data-testid="chat-thread-mobile"
          >
            <select
              value={activeThreadId ?? "__new__"}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== "__new__" && v !== activeThreadId) switchThread(v);
              }}
              disabled={pending}
              aria-label="Switch conversation"
              className="min-w-0 flex-1 rounded-item border border-rule bg-paper px-2.5 py-1.5 text-[13px] text-ink disabled:opacity-50"
            >
              {activeThreadId === null && <option value="__new__">New chat</option>}
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title ?? "Untitled chat"}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={startNewChat}
              disabled={pending || activeThreadId === null}
              data-testid="chat-new-thread-mobile"
              className="shrink-0 rounded-item border border-ink px-2.5 py-1.5 text-[13px] text-ink transition-colors hover:bg-paper-sunken disabled:opacity-50"
            >
              + New
            </button>
          </div>
        )}

        <div
          ref={scrollRef}
          className={
            "min-h-0 flex-1 space-y-6 overflow-y-auto border-t border-rule py-6" +
            // An empty thread is chips top-left, composer bottom, and a
            // dead panel between. Centre the empty state vertically at
            // md+; small screens have no void to fill and stay
            // top-anchored. Normal flow returns with the first message.
            (loaded && messages.length === 0
              ? " md:flex md:flex-col md:justify-center"
              : "")
          }
        >
        {!loaded && (
          <p className="tech-token text-xs text-muted flex items-center gap-2">
            <InlineSpinner />
            loading conversation
          </p>
        )}
        {loaded && messages.length === 0 && docs !== null && docs.length === 0 && (
          // With no documents, "Summarise the witness statement" is a doomed
          // prompt — route to the Documents tab instead. The starter chips
          // return once the matter has files.
          <div className="grid gap-2 sm:grid-cols-2" data-testid="chat-empty-state-no-docs">
            <button
              type="button"
              onClick={() => setTabAndHash("documents")}
              className="group flex min-h-[44px] items-center justify-between gap-3 rounded-item border border-rule bg-paper px-3 text-left text-[14px] leading-5 text-ink transition-colors hover:border-ink hover:bg-paper-sunken"
            >
              <span>Upload your first document</span>
              <span className="text-muted transition-colors group-hover:text-ink" aria-hidden>
                →
              </span>
            </button>
          </div>
        )}
        {loaded && messages.length === 0 && (docs === null || docs.length > 0) && (
          <div className="max-w-md" data-testid="chat-empty-state">
            <p className="mb-3 text-sm text-muted">
              Ask about the documents in this matter.
            </p>
            <div className="grid gap-2">
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
          </div>
        )}
        {messages.map((m, i) => {
          const note = m.role === "assistant" ? retrievalNotes.get(m.id) : undefined;
          return (
            <div key={m.id}>
              <MessageBubble
                message={m}
                docs={docs}
                chronology={chronology}
                onRegenerate={
                  canRegenerate && i === lastAssistantIndex && regenerateContent
                    ? () => void sendMessage(regenerateContent)
                    : undefined
                }
                onDocChip={dispatchDocChip}
                onChronChip={dispatchChronChip}
                onAction={dispatchAction}
                onSources={(message) => setWorkPane({ kind: "sources", message })}
                onVersions={(message) => setWorkPane({ kind: "versions", message })}
                onRecord={(message) => setWorkPane({ kind: "activity", message })}
                onSaveDraft={
                  disabled
                    ? undefined
                    : (message) =>
                        saveMessageAsDraft(matter.slug, message.id).then(
                          (r) => r.artifact_id,
                        )
                }
                onOpenDraft={(artifactId) =>
                  void navigate({
                    to: "/matters/$slug/artifacts/$artifactId",
                    params: { slug: matter.slug, artifactId },
                  })
                }
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
        {stopped && (
          // A user-stopped turn: the partial draft, frozen, with an honest
          // line about what happens next. The persisted reply replaces
          // this via the post-stop thread refresh.
          <div className="flex justify-start" data-testid="chat-stopped-bubble">
            <div className="flex w-full flex-col gap-2">
              {stopped.text.length > 0 && (
                <>
                  <div className="tech-token text-[11px] text-muted">
                    Assistant · stopped
                  </div>
                  <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
                    {stopped.text}
                  </div>
                </>
              )}
              <p className="text-xs text-muted" data-testid="chat-stopped-note">
                Stopped. The full answer is still being recorded.
              </p>
            </div>
          </div>
        )}
        {thinking && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-start">
              <InlineAgentStatus steps={agentSteps} />
            </div>
            {/* Token-streamed draft. Plain text while writing — markdown,
                citation chips, and the action row belong to the final
                message, which replaces this bubble on result. */}
            {draft !== null && draft.length > 0 && (
              <div className="flex justify-start" data-testid="chat-draft-bubble">
                <div className="flex w-full flex-col gap-2">
                  <div className="tech-token text-[11px] text-muted">
                    Assistant · writing
                  </div>
                  <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
                    {draft}
                  </div>
                </div>
              </div>
            )}
            {longWait && !draft && (
              <p className="text-xs text-muted" data-testid="chat-long-wait-note">
                Long answers can take up to a minute.
              </p>
            )}
          </div>
        )}
        </div>

        {keyMissingProvider && <ProviderKeyMissingBanner provider={keyMissingProvider} />}
        {error && (
          <div className="bg-paper border border-seal text-seal text-sm p-3 mt-3">
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
          {/* Context attachments as chips ABOVE the composer — the single
              attached-doc surface (the duplicate row above the message list
              was cut, launch punch list 2026-07-02). */}
          {attachedDocs.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2"
              data-testid="chat-attached-document-context"
            >
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
              {attachedDocs.length === 1 && (
                <button
                  type="button"
                  onClick={() => dispatchDocChip(attachedDocs[0].id)}
                  className="text-xs text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                >
                  Preview →
                </button>
              )}
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
            className="w-full resize-none rounded-item border border-rule bg-paper px-4 py-3 text-[17px] leading-6 text-ink transition-colors placeholder:text-muted focus:border-ink focus:outline-hidden disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted"
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
                                    Ready in this matter
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
              {attachOpen && sortedDocs.length > 0 && (
                <div
                  className="absolute bottom-full left-0 mb-2 rounded-item border border-rule bg-paper p-2 w-[280px] z-10"
                  data-testid="chat-attach-popover"
                >
                  {/* Every matter document is attachable; the filter keeps
                      long lists workable without changing the popover shape. */}
                  {sortedDocs.length > 5 && (
                    <input
                      type="text"
                      value={attachFilter}
                      onChange={(e) => setAttachFilter(e.target.value)}
                      placeholder="Filter documents"
                      aria-label="Filter documents"
                      data-testid="chat-attach-filter"
                      className="mb-2 w-full rounded-item border border-rule bg-paper px-2 py-1 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-hidden"
                    />
                  )}
                  <ul className="max-h-56 space-y-2 overflow-y-auto">
                    {filteredAttachDocs.map((d) => {
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
                    {filteredAttachDocs.length === 0 && (
                      <li className="px-1 py-0.5 text-xs text-muted">
                        No documents match.
                      </li>
                    )}
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

            {/* Right: Send, or Stop while an answer is streaming. Stop is
                the same geometry as Send but bordered, not dark — a stop
                is a small verdict, so seal text is allowed. It only
                appears while model.delta events are arriving; keyless
                turns never stream, so they never show it. */}
            <div className="flex items-center gap-3">
              {streamActive ? (
                <button
                  type="button"
                  onClick={onStop}
                  data-testid="chat-composer-stop"
                  className="rounded-item border border-ink bg-paper px-4 py-1.5 text-[14px] font-medium text-seal transition-colors hover:bg-paper-sunken min-h-[44px]"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={pending || !input.trim()}
                  data-testid="chat-composer-send"
                  className={primaryBtn + " px-4 py-1.5 text-[14px]"}
                >
                  {pending ? "Sending…" : "Send"}
                </button>
              )}
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

// Group a matter's threads into recency buckets (Today / Yesterday /
// Previous 7 days / Older), ordered most-recently-active first within each
// bucket. A thread's recency is its last message, or its creation time if it
// has no messages yet. Mirrors the ChatGPT/Grok conversation-sidebar pattern.
const _THREAD_BUCKETS = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Older",
] as const;

function groupThreadsByRecency(
  threads: AssistantThread[],
): { label: string; threads: AssistantThread[] }[] {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const dayMs = 86_400_000;

  const recency = (t: AssistantThread) =>
    new Date(t.last_message_at ?? t.created_at).getTime();
  const bucketOf = (t: AssistantThread): (typeof _THREAD_BUCKETS)[number] => {
    const ts = recency(t);
    if (ts >= startOfToday) return "Today";
    if (ts >= startOfToday - dayMs) return "Yesterday";
    if (ts >= startOfToday - 7 * dayMs) return "Previous 7 days";
    return "Older";
  };

  const byBucket = new Map<string, AssistantThread[]>();
  for (const t of threads) {
    const b = bucketOf(t);
    (byBucket.get(b) ?? byBucket.set(b, []).get(b)!).push(t);
  }
  return _THREAD_BUCKETS.filter((label) => byBucket.has(label)).map((label) => ({
    label,
    threads: byBucket
      .get(label)!
      .sort((a, b) => recency(b) - recency(a)),
  }));
}

// Left sub-rail of the matter's chat conversations — the ChatGPT/Grok
// sidebar pattern, scoped to one matter (chats live inside a matter, like a
// project). "+ New chat" pinned to the top; conversations grouped by recency
// below. Swiss/minimal, shares the chat rail tokens (rule/ink/seal/paper).
// Hidden on narrow viewports and in demo / read-only shells.
function ThreadRail({
  threads,
  activeThreadId,
  disabled,
  onSwitch,
  onNewChat,
}: {
  threads: AssistantThread[];
  activeThreadId: string | null;
  disabled: boolean;
  onSwitch: (threadId: string) => void;
  onNewChat: () => void;
}) {
  const groups = groupThreadsByRecency(threads);
  const startingNew = activeThreadId === null;
  return (
    <aside
      className="hidden w-56 shrink-0 flex-col border-r border-rule pr-4 pt-1 md:flex"
      data-testid="chat-thread-rail"
      aria-label="Conversations in this matter"
    >
      <button
        type="button"
        onClick={onNewChat}
        disabled={disabled || startingNew}
        data-testid="chat-new-thread"
        className="mb-4 flex items-center gap-2 rounded-item border border-rule bg-paper px-2.5 py-1.5 text-[13px] text-ink transition-colors hover:border-ink disabled:opacity-50"
      >
        <span aria-hidden="true" className="text-base leading-none">+</span>
        New chat
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {startingNew && (
          <div
            className="truncate rounded-item bg-paper-sunken px-2.5 py-1.5 text-[13px] text-ink"
            data-testid="chat-thread-draft"
          >
            New chat
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="mb-1 px-2.5 text-[11px] uppercase tracking-wide text-muted">
              {group.label}
            </div>
            <div className="flex flex-col">
              {group.threads.map((thread) => {
                const active = thread.id === activeThreadId;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => onSwitch(thread.id)}
                    disabled={disabled}
                    title={thread.title ?? "Untitled chat"}
                    data-testid={`chat-thread-${thread.id}`}
                    aria-current={active ? "true" : undefined}
                    className={
                      "truncate rounded-item px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:opacity-50 " +
                      (active
                        ? "bg-paper-sunken text-ink"
                        : "text-muted hover:bg-paper-sunken hover:text-ink")
                    }
                  >
                    {thread.title ?? "Untitled chat"}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
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
  return new Error(
    event.data.message ||
      "The assistant could not complete this turn. If you have a provider key, check it in Settings.",
  );
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
          <p className="text-sm text-muted">Loading matter documents…</p>
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
