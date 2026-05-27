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

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">Matter</p>
      <h1 className="mt-2 text-3xl font-serif">Reconstruction</h1>
      <p className="mt-1 text-xs font-mono text-muted">{slug}</p>
      <p className="mt-3 text-sm text-muted">
        Canonical timeline of every audited event on this matter. Rows
        are union-ed from three substrate tables — audit entries,
        state-machine transitions, and advice-boundary decisions — and
        ordered by occurrence.
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

          {/* Phase 14.5 A — substrate now applies filters before
              pagination. The partial-page advisory the Phase 14 E
              P1 redline added is no longer needed; an empty filtered
              page accurately means "no matching rows in window." */}

          {visibleEntries.length === 0 ? (
            <EmptyState
              filtersActive={!!(invocationFilter || actionFilter)}
            />
          ) : (
            <ol className="mt-4 space-y-3">
              {visibleEntries.map((e) => (
                <TimelineRow key={`${e.source}::${e.source_row_id}`} entry={e} />
              ))}
            </ol>
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

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const [expanded, setExpanded] = useState(false);
  const tone = sourceTone(entry.source);
  return (
    <li
      className="rounded-md border border-line p-3"
      data-testid={`timeline-row-${entry.source_row_id}`}
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

