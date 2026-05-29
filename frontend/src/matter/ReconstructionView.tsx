/**
 * Phase 14 E — /matters/{slug}/audit.
 *
 * Reconstruction timeline against `GET /api/matters/{slug}/audit/reconstruction`
 * (Phase 5 endpoint). The page is the deep-link target every prior
 * Phase 14 sub-step pinned its links to:
 *   - InstallCeremony's 409 banner names module.ceremony.rejected
 *   - PostureBanner / posture-blocked invocation runner banner cites
 *     posture_gate.check.blocked
 *   - InvocationRunner success panel + ArtifactDetail page link
 *     here with ?invocation_id=…
 *   - InvocationRunner failure banners cite the specific substrate
 *     audit action (capability_denied, advice_boundary.check.blocked,
 *     model.call.error)
 *
 * Each entry renders source, action, actor, timestamp, and an
 * expandable payload + refs block. Filters:
 *   - source chips (audit / state_machine / advice_boundary)
 *   - ?action=<string> filters by exact action match
 *   - ?invocation_id=<id> filters client-side (substrate does not
 *     yet honour the param — see BACKEND_GAP_AUDIT finding 14-E-#1)
 *
 * Visiting this page emits one `audit.reconstruction.viewed` row
 * (substrate-side; the UI does NOT emit). That row will show up on
 * subsequent visits — "who looked at the trail when" is itself
 * provenance.
 *
 * Reviewer-narrow: no admin filter (Phase 14 F surface), no
 * settings export (Phase 14 G), no async polling.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ALL_RECONSTRUCTION_SOURCES,
  getReconstruction,
  type ReconstructionSource,
  type TimelineEntry,
} from "../lib/api";
import { matterAuditRoute } from "../router";
import {
  artifactIdOf,
  classifyEntry,
  invocationIdOf,
  isDecisionRow,
  type RowClass,
} from "./auditClassify";

// Class filter chips (AT-2). No `artifact` chip — artifacts are not an
// audit class; they surface as the chain output node (AT-3). `system`
// is the collapsed background, not a chip.
const CLASS_CHIPS: { key: RowClass; label: string }[] = [
  { key: "signed", label: "Sign-off" },
  { key: "review", label: "Review" },
  { key: "blocked_denied", label: "Blocked / denied" },
  { key: "grant_role", label: "Grant / role" },
  { key: "advice", label: "Advice" },
  { key: "model", label: "Model" },
  { key: "module", label: "Module" },
  { key: "error", label: "Error" },
];

const CLASS_LABEL: Record<RowClass, string> = {
  error: "Error",
  signed: "Sign-off",
  review: "Review",
  blocked_denied: "Blocked / denied",
  grant_role: "Grant / role",
  advice: "Advice",
  model: "Model",
  module: "Module",
  system: "System",
};

const STORY_LABEL: Record<RowClass, string> = {
  error: "Error raised",
  signed: "Signed off",
  review: "Human review",
  blocked_denied: "Blocked or denied",
  grant_role: "Permission changed",
  advice: "Advice boundary checked",
  model: "Model used",
  module: "Action ran",
  system: "System activity",
};

type FetchState =
  | { status: "loading" }
  | { status: "ready"; entries: TimelineEntry[]; nextCursor: string | null; totalEstimate: number; loadingMore: boolean }
  | { status: "error"; message: string };

const SOURCE_LABEL: Record<ReconstructionSource, string> = {
  audit: "Audit",
  state_machine: "State machine",
  advice_boundary: "Advice boundary",
};

function sourceTone(source: ReconstructionSource): string {
  switch (source) {
    case "audit":
      return "bg-ink/10 text-ink";
    case "state_machine":
      return "bg-amber-500/15 text-amber-700";
    case "advice_boundary":
      return "bg-seal/10 text-seal";
  }
}

export function ReconstructionView({ slug }: { slug: string }) {
  const search = matterAuditRoute.useSearch();
  const invocationFilter = search.invocation_id ?? null;
  const actionFilter = search.action ?? null;

  const [sources, setSources] = useState<ReconstructionSource[]>(
    ALL_RECONSTRUCTION_SOURCES,
  );
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });
  // AT-2: client-side class facet (loaded page only) + background toggle.
  const [classFilter, setClassFilter] = useState<RowClass | null>(null);
  const [showBackground, setShowBackground] = useState(false);

  // When a precise deep-link filter is active, render the returned rows
  // flat — the user asked for an exact invocation/action, so the
  // decision-lane split would only get in the way (and class chips
  // can't pretend to be exhaustive across unloaded pages anyway).
  const deepLinked = !!(invocationFilter || actionFilter);

  const loadPage = useCallback(
    async (cursor: string | null) => {
      try {
        // Phase 14.5 A — filters are server-pushdown now. The client
        // no longer over-fetches and filters; the substrate applies
        // invocation_id + action BEFORE pagination, so a deep-linked
        // row enters page 1 even on dense timelines.
        const page = await getReconstruction(slug, {
          include: sources.length === 3 ? undefined : sources,
          cursor: cursor ?? undefined,
          invocation_id: invocationFilter ?? undefined,
          action: actionFilter ?? undefined,
        });
        if (cursor === null) {
          setFetchState({
            status: "ready",
            entries: page.entries,
            nextCursor: page.next_cursor,
            totalEstimate: page.total_in_window_estimate,
            loadingMore: false,
          });
        } else {
          setFetchState((prev) => {
            if (prev.status !== "ready") return prev;
            return {
              ...prev,
              entries: [...prev.entries, ...page.entries],
              nextCursor: page.next_cursor,
              loadingMore: false,
            };
          });
        }
      } catch (err) {
        setFetchState({ status: "error", message: String(err) });
      }
    },
    [slug, sources, invocationFilter, actionFilter],
  );

  useEffect(() => {
    setFetchState({ status: "loading" });
    void loadPage(null);
  }, [loadPage]);

  const toggleSource = (s: ReconstructionSource) => {
    setSources((prev) => {
      if (prev.includes(s)) {
        // Keep at least one source so the page never empties to
        // "loading" indefinitely.
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== s);
      }
      return [...prev, s];
    });
  };

  // Phase 14.5 A — filtering is server-authoritative. The substrate
  // knows the per-source carrier columns (payload.invocation_id for
  // audit, output_id for advice_boundary, etc.); the previous
  // client-side defence-in-depth filter checked only
  // payload.invocation_id + refs.invocation_id and would have
  // dropped valid advice_boundary rows. Reviewer P1: remove the
  // client filter entirely rather than enumerate every substrate
  // carrier column on the frontend.
  const visibleEntries = useMemo(() => {
    if (fetchState.status !== "ready") return [];
    return fetchState.entries;
  }, [fetchState]);

  // AT-2/AT-3 — split the loaded page into a decision foreground
  // (invocation chains that contain a decision row, plus standalone
  // decision rows) and a collapsed background. Class filter applies to
  // the loaded page only. Skipped entirely when deep-linked.
  const lanes = useMemo(() => {
    const rows = visibleEntries.filter(
      (e) => classFilter === null || classifyEntry(e) === classFilter,
    );
    const byInvocation = new Map<string, TimelineEntry[]>();
    const ungrouped: TimelineEntry[] = [];
    for (const e of rows) {
      const inv = invocationIdOf(e);
      if (inv) {
        const arr = byInvocation.get(inv) ?? [];
        arr.push(e);
        byInvocation.set(inv, arr);
      } else {
        ungrouped.push(e);
      }
    }
    const chains: {
      invocationId: string;
      entries: TimelineEntry[];
      artifactId: string | null;
    }[] = [];
    const backgroundRows: TimelineEntry[] = [];
    for (const [inv, es] of byInvocation) {
      if (es.some(isDecisionRow)) {
        const artifactId =
          es.map(artifactIdOf).find((x): x is string => !!x) ?? null;
        chains.push({ invocationId: inv, entries: es, artifactId });
      } else {
        backgroundRows.push(...es);
      }
    }
    const standaloneDecisions: TimelineEntry[] = [];
    for (const e of ungrouped) {
      if (isDecisionRow(e)) standaloneDecisions.push(e);
      else backgroundRows.push(e);
    }
    return { chains, standaloneDecisions, backgroundRows };
  }, [visibleEntries, classFilter]);

  const foregroundCount = lanes.chains.length + lanes.standaloneDecisions.length;
  const storyCounts = useMemo(() => {
    const counts = new Map<RowClass, number>();
    for (const entry of visibleEntries) {
      const key = classifyEntry(entry);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [visibleEntries]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">Matter</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight2">Activity Trail</h1>
      <p className="mt-1 text-xs font-mono text-muted">{slug}</p>
      <p className="mt-3 text-sm text-muted">
        The main record of what happened on this matter: documents
        touched, actions run, models called, outputs written, human
        reviews, and blocked attempts. Raw substrate rows stay
        expandable; the first view is the story.
      </p>

      {/* Active query-param filters */}
      {(invocationFilter || actionFilter) && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-muted">
            Filtered by
          </span>
          {invocationFilter && (
            <FilterChip
              label="invocation_id"
              value={invocationFilter}
              clearHref={`/matters/${encodeURIComponent(slug)}/audit${
                actionFilter
                  ? `?action=${encodeURIComponent(actionFilter)}`
                  : ""
              }`}
            />
          )}
          {actionFilter && (
            <FilterChip
              label="action"
              value={actionFilter}
              clearHref={`/matters/${encodeURIComponent(slug)}/audit${
                invocationFilter
                  ? `?invocation_id=${encodeURIComponent(invocationFilter)}`
                  : ""
              }`}
            />
          )}
        </div>
      )}

      <details className="mt-5 rounded-md border border-line bg-paper-sunken p-3">
        <summary className="cursor-pointer text-xs uppercase tracking-widest text-muted">
          Filters and raw sources
        </summary>
        {/* Source chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-muted">
            Sources
          </span>
          {ALL_RECONSTRUCTION_SOURCES.map((s) => {
            const active = sources.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSource(s)}
                className={
                  "rounded-full border px-3 py-1 text-xs transition-colors " +
                  (active
                    ? "border-ink bg-ink text-paper"
                    : "border-line text-muted hover:border-ink")
                }
                data-testid={`source-chip-${s}`}
                aria-pressed={active}
              >
                {SOURCE_LABEL[s]}
              </button>
            );
          })}
        </div>

        {/* Class facet chips (AT-2) — loaded page only, hidden when a
            precise deep-link filter is active. */}
        {!deepLinked && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-muted">
              Decision type
            </span>
            {CLASS_CHIPS.map((c) => {
              const active = classFilter === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setClassFilter(active ? null : c.key)}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition-colors " +
                    (active
                      ? "border-ink bg-ink text-paper"
                      : "border-line text-muted hover:border-ink")
                  }
                  data-testid={`class-chip-${c.key}`}
                  aria-pressed={active}
                >
                  {c.label}
                </button>
              );
            })}
            {classFilter && (
              <span className="text-[11px] text-muted">filters the loaded page only</span>
            )}
          </div>
        )}
      </details>

      {/* Timeline */}
      {fetchState.status === "loading" && (
        <p className="mt-8 text-sm text-muted">Loading timeline…</p>
      )}
      {fetchState.status === "error" && (
        <p className="mt-8 text-sm text-seal">
          Could not load reconstruction: {fetchState.message}
        </p>
      )}
      {fetchState.status === "ready" && (
        <>
          <p className="mt-6 text-xs text-muted">
            {visibleEntries.length} of {fetchState.entries.length} loaded
            {fetchState.totalEstimate > fetchState.entries.length
              ? ` · ~${fetchState.totalEstimate} in window`
              : ""}
          </p>
          {visibleEntries.length > 0 && !deepLinked && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from(storyCounts.entries())
                .filter(([key]) => key !== "system")
                .map(([key, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setClassFilter(classFilter === key ? null : key)}
                    className={
                      "rounded-md border px-3 py-2 text-left text-xs transition-colors " +
                      (classFilter === key
                        ? "border-ink bg-ink text-paper"
                        : "border-line bg-paper hover:border-ink")
                    }
                    aria-pressed={classFilter === key}
                  >
                    <span className="block font-medium">{STORY_LABEL[key]}</span>
                    <span className="mt-1 block text-muted">{count} event{count === 1 ? "" : "s"}</span>
                  </button>
                ))}
            </div>
          )}

          {/* Phase 14.5 A — substrate now applies filters before
              pagination. The partial-page advisory the Phase 14 E
              P1 redline added is no longer needed; an empty filtered
              page accurately means "no matching rows in window." */}

          {visibleEntries.length === 0 ? (
            <EmptyState filtersActive={deepLinked} />
          ) : deepLinked ? (
            /* Precise deep-link: flat list of exactly what the server
               returned, no lane split. */
            <ol className="mt-4 space-y-3">
              {visibleEntries.map((e) => (
                <TimelineRow key={`${e.source}::${e.source_row_id}`} entry={e} />
              ))}
            </ol>
          ) : (
            <div className="mt-4">
              {/* Decision foreground */}
              {foregroundCount === 0 ? (
                <p className="text-sm text-muted" data-testid="no-decision-points">
                  No decision points on the loaded page
                  {classFilter ? " for this decision type" : ""}.
                </p>
              ) : (
                <ol className="space-y-3" data-testid="decision-lane">
                  {lanes.chains.map((c) => (
                    <InvocationChain
                      key={c.invocationId}
                      slug={slug}
                      invocationId={c.invocationId}
                      entries={c.entries}
                      artifactId={c.artifactId}
                    />
                  ))}
                  {lanes.standaloneDecisions.map((e) => (
                    <TimelineRow key={`${e.source}::${e.source_row_id}`} entry={e} />
                  ))}
                </ol>
              )}

              {/* Background activity — collapsed by default (ratified Q3) */}
              {lanes.backgroundRows.length > 0 && (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setShowBackground((v) => !v)}
                    className="text-xs uppercase tracking-widest text-muted hover:text-ink"
                    data-testid="toggle-background"
                    aria-expanded={showBackground}
                  >
                    {showBackground ? "Hide" : "Show"} background activity (
                    {lanes.backgroundRows.length})
                  </button>
                  {showBackground && (
                    <ol className="mt-3 space-y-3" data-testid="background-lane">
                      {lanes.backgroundRows.map((e) => (
                        <TimelineRow
                          key={`${e.source}::${e.source_row_id}`}
                          entry={e}
                        />
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          )}
          {fetchState.nextCursor && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setFetchState((prev) =>
                    prev.status === "ready"
                      ? { ...prev, loadingMore: true }
                      : prev,
                  );
                  void loadPage(fetchState.nextCursor);
                }}
                disabled={fetchState.loadingMore}
                className="inline-flex items-center rounded-md border border-line px-4 py-1.5 text-sm hover:border-ink disabled:opacity-50"
              >
                {fetchState.loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function EmptyState({ filtersActive }: { filtersActive: boolean }) {
  // Phase 14.5 A — substrate filters before paginating, so an
  // empty filtered page is now substrate-truthful. No more
  // partial-page disclaimer needed.
  if (filtersActive) {
    return (
      <p
        className="mt-4 text-sm text-muted"
        data-testid="empty-filter-no-match"
      >
        No timeline rows match the current filters.
      </p>
    );
  }
  return (
    <p className="mt-4 text-sm text-muted" data-testid="empty-no-rows">
      No timeline rows recorded for this matter yet.
    </p>
  );
}

function FilterChip({
  label,
  value,
  clearHref,
}: {
  label: string;
  value: string;
  clearHref: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper-sunken px-3 py-1 text-xs">
      <span className="font-mono text-muted">{label}=</span>
      <span className="font-mono text-ink">{value}</span>
      <a
        href={clearHref}
        className="text-muted hover:text-seal"
        title={`Clear ${label} filter`}
        aria-label={`Clear ${label} filter`}
      >
        ×
      </a>
    </span>
  );
}

// AT-3 — a grouped invocation chain (module → model → output → review →
// decision). The artifact output node is resolved from a review row's
// artifact_id (AT-1 artifactIdOf); if none resolves, the chain renders
// without an output node — never invents one.
function InvocationChain({
  slug,
  invocationId,
  entries,
  artifactId,
}: {
  slug: string;
  invocationId: string;
  entries: TimelineEntry[];
  artifactId: string | null;
}) {
  const [open, setOpen] = useState(true);
  const ordered = [...entries].sort((a, b) =>
    a.occurred_at.localeCompare(b.occurred_at),
  );
  const decisions = ordered.filter(isDecisionRow);
  const outcome = decisions.length
    ? classifyEntry(decisions[decisions.length - 1])
    : null;
  return (
    <li
      className="rounded-md border border-line p-3"
      data-testid={`chain-${invocationId}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-widest text-muted">
            Invocation
          </span>
          <code className="font-mono text-sm">{invocationId.slice(0, 8)}…</code>
          <span className="text-xs text-muted">{ordered.length} events</span>
        </span>
        {outcome && (
          <span className="shrink-0 rounded-full border border-ink px-2 py-0.5 text-xs">
            {CLASS_LABEL[outcome]}
          </span>
        )}
      </button>
      {open && (
        <ol className="mt-3 space-y-2 border-l border-line pl-3">
          {ordered.map((e) => (
            <TimelineRow key={`${e.source}::${e.source_row_id}`} entry={e} />
          ))}
          {artifactId && (
            <li className="text-xs" data-testid="chain-output-node">
              <span className="uppercase tracking-widest text-muted">Output</span>{" "}
              <a
                href={`/matters/${encodeURIComponent(slug)}/artifacts/${encodeURIComponent(artifactId)}`}
                className="font-mono underline underline-offset-4 hover:text-ink"
              >
                artifact {artifactId.slice(0, 8)}…
              </a>
            </li>
          )}
        </ol>
      )}
    </li>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const [expanded, setExpanded] = useState(false);
  const tone = sourceTone(entry.source);
  const isReview = classifyEntry(entry) === "review";
  return (
    <li
      className={
        "rounded-md border border-line p-3 " +
        (isReview ? "border-l-2 border-l-seal" : "")
      }
      data-testid={`timeline-row-${entry.source_row_id}`}
      data-row-class={classifyEntry(entry)}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex flex-1 flex-wrap items-baseline gap-3">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${tone}`}
            data-testid="row-source-pill"
          >
            {SOURCE_LABEL[entry.source]}
          </span>
          <code className="font-mono text-sm">{entry.action}</code>
          {entry.module_id && (
            <span className="text-xs text-muted">
              · <code className="font-mono">{entry.module_id}</code>
            </span>
          )}
          {entry.capability_id && (
            <span className="text-xs text-muted">
              <code className="font-mono">{entry.capability_id}</code>
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs font-mono text-muted">
          {entry.occurred_at.replace("T", " ").slice(0, 19)}
        </span>
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {entry.actor.role && (
          <span>
            role: <code className="font-mono">{String(entry.actor.role)}</code>
          </span>
        )}
        {entry.actor.user_id && (
          <span>
            user:{" "}
            <code className="font-mono">
              {String(entry.actor.user_id).slice(0, 8)}…
            </code>
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          <ExpandedBlock label="payload" data={entry.payload} />
          <ExpandedBlock label="refs" data={entry.refs} />
        </div>
      )}
    </li>
  );
}

function ExpandedBlock({
  label,
  data,
}: {
  label: string;
  data: Record<string, unknown>;
}) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div>
        <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
        <p className="mt-1 text-xs text-muted">empty</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <pre className="mt-1 max-h-[40vh] overflow-auto rounded-md border border-line bg-paper px-2 py-1 text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
