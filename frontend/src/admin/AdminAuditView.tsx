/**
 * /admin/audit.
 *
 * Workspace / admin audit reconstruction. Structurally mirrors
 * `/matters/{slug}/audit` but with no matter scope.
 *
 * Substrate truth:
 *   - Only `source="audit"` returns rows. state_machine +
 *     advice_boundary are matter-bound; request is accepted but
 *     returns empty for those values.
 *   - Frontend chip UX renders the two non-audit chips as disabled
 *     with a tooltip naming the substrate constraint.
 *   - Same `audit.reconstruction.viewed` action emitted; payload
 *     carries `scope: "workspace"` + `matter_id: null`.
 *
 * UI gating: substrate enforces superuser-only; this page mirrors
 * the AdminUsersList belt-and-braces pattern — render
 * AdminAuditRequiredShell for non-superusers without calling the
 * endpoint.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ALL_RECONSTRUCTION_SOURCES,
  AdminRequiredError,
  getAdminReconstruction,
  type ReconstructionSource,
  type TimelineEntry,
} from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { adminAuditRoute } from "../router";
import { PageHeader } from "../ui/primitives";

type FetchState =
  | { status: "loading" }
  | { status: "ready"; entries: TimelineEntry[]; nextCursor: string | null; totalEstimate: number; loadingMore: boolean }
  | { status: "admin_required" }
  | { status: "error"; message: string };

const SOURCE_LABEL: Record<ReconstructionSource, string> = {
  audit: "Audit",
  state_machine: "State machine",
  advice_boundary: "Advice boundary",
};

const WORKSPACE_BOUND_SOURCES: ReadonlySet<ReconstructionSource> = new Set([
  "state_machine",
  "advice_boundary",
]);

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

export function AdminAuditView() {
  const auth = useAuth();
  const search = adminAuditRoute.useSearch();
  const invocationFilter = search.invocation_id ?? null;
  const actionFilter = search.action ?? null;
  // Workspace-bound sources can be flipped on for honesty's sake
  // but always return empty server-side. UX-wise we render them
  // disabled.
  const [sources, setSources] = useState<ReconstructionSource[]>(["audit"]);
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });

  const loadPage = useCallback(
    async (cursor: string | null) => {
      try {
        const page = await getAdminReconstruction({
          include: sources.length === 1 && sources[0] === "audit"
            ? undefined  // default == all three on server; we only
                         // pass include= when narrowing
            : sources,
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
        if (err instanceof AdminRequiredError) {
          setFetchState({ status: "admin_required" });
          return;
        }
        setFetchState({ status: "error", message: String(err) });
      }
    },
    [sources, invocationFilter, actionFilter],
  );

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user || !auth.user.is_superuser) {
      setFetchState({ status: "admin_required" });
      return;
    }
    setFetchState({ status: "loading" });
    void loadPage(null);
  }, [auth.loading, auth.user, loadPage]);

  if (!auth.loading && auth.user && !auth.user.is_superuser) {
    return <AdminRequiredShell />;
  }
  if (fetchState.status === "admin_required") {
    return <AdminRequiredShell />;
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 text-ink">
      <PageHeader
        eyebrow="Admin"
        title="Workspace audit"
        description="Workspace-scoped audit rows — events that are not bound to a specific matter (install ceremonies, settings key operations, admin role changes, this very view, etc.). Matter rows are reachable via the per-matter reconstruction page."
      />

      {(invocationFilter || actionFilter) && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-muted">
            Filtered by
          </span>
          {invocationFilter && (
            <FilterChip
              label="invocation_id"
              value={invocationFilter}
              clearHref={`/admin/audit${
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
              clearHref={`/admin/audit${
                invocationFilter
                  ? `?invocation_id=${encodeURIComponent(invocationFilter)}`
                  : ""
              }`}
            />
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-widest text-muted">
          Sources
        </span>
        {ALL_RECONSTRUCTION_SOURCES.map((s) => {
          const isBoundToMatter = WORKSPACE_BOUND_SOURCES.has(s);
          const active = sources.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (isBoundToMatter) return; // disabled per substrate
                setSources((prev) => {
                  if (prev.includes(s)) {
                    if (prev.length === 1) return prev;
                    return prev.filter((x) => x !== s);
                  }
                  return [...prev, s];
                });
              }}
              disabled={isBoundToMatter}
              title={
                isBoundToMatter
                  ? `${SOURCE_LABEL[s]} rows are matter-bound by substrate design and don't appear in workspace scope`
                  : undefined
              }
              className={
                "rounded-full border px-3 py-1 text-xs transition-colors " +
                (isBoundToMatter
                  ? "border-line text-muted/60 cursor-not-allowed line-through"
                  : active
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

      {fetchState.status === "loading" && (
        <p className="mt-8 text-sm text-muted">Loading workspace audit…</p>
      )}
      {fetchState.status === "error" && (
        <p className="mt-8 text-sm text-seal">
          Could not load workspace audit: {fetchState.message}
        </p>
      )}
      {fetchState.status === "ready" && (
        <>
          <p className="mt-6 text-xs text-muted">
            {fetchState.entries.length} loaded
            {fetchState.totalEstimate > fetchState.entries.length
              ? ` · ~${fetchState.totalEstimate} in window`
              : ""}
          </p>

          {fetchState.entries.length === 0 ? (
            <p
              className="mt-4 text-sm text-muted"
              data-testid="empty-admin-audit"
            >
              {invocationFilter || actionFilter
                ? "No workspace audit rows match the current filters."
                : "No workspace audit rows yet."}
            </p>
          ) : (
            <ol className="mt-4 space-y-3">
              {fetchState.entries.map((e) => (
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

function AdminRequiredShell() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <p className="text-xs uppercase tracking-widest text-muted">Admin</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight2">Admin required</h1>
      <p className="mt-3 text-sm text-muted">
        The workspace audit surface requires superuser. Ask your
        workspace administrator if you need access.
      </p>
    </div>
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
      data-testid={`admin-timeline-row-${entry.source_row_id}`}
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
        </div>
        <span className="shrink-0 text-xs font-mono text-muted">
          {entry.occurred_at.replace("T", " ").slice(0, 19)}
        </span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          <Block label="payload" data={entry.payload} />
          <Block label="refs" data={entry.refs} />
        </div>
      )}
    </li>
  );
}

function Block({ label, data }: { label: string; data: Record<string, unknown> }) {
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
