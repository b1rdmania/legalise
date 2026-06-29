import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  listModels,
  updateMatterModel,
  listDocuments,
  listArtifacts,
  listSignoffs,
  listAssistantMessages,
  listAudit,
  type Matter,
  type ModelOption,
  type MatterDocument,
  type ArtifactSummary,
  type Signoff,
  type AuditEntry,
} from "../../lib/api";
import { useAuth } from "../../auth/AuthProvider";
import { postureExplain, postureLabel } from "../../lib/posture";
import { DescItem, ErrorCallout } from "../../ui/primitives";
import { narrateEntry } from "../auditNarrate";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Whole days from now until an ISO date. Negative = already past.
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

// "2026-04-04T13:02:09Z" → "2h ago" / "3d ago" / a short date for older.
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 0) return "just now";
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

// Turn a snake_case / lower token into a Title Case label.
function humanise(value: string): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Plain one-liner for the case lifecycle status.
function statusExplain(status: string): string {
  switch (status) {
    case "open":
      return "The matter is live and being worked.";
    case "settlement":
      return "The matter is in settlement.";
    case "closed":
      return "The matter is closed; it is kept for the record.";
    case "archived":
      return "The matter is archived.";
    default:
      return "Where the case currently stands.";
  }
}

// Read an optional string off the matter's free-form facts bag.
function factStr(facts: Record<string, unknown>, key: string): string | null {
  const v = facts?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

const SIGNED_DECISIONS = new Set(["signed", "signed_with_observations"]);

// Loadable wrapper so each section can degrade on its own without
// crashing the tab when one fetch fails.
type Loadable<T> =
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "error" };

export function OverviewTab({
  matter,
  onMatterUpdated,
}: {
  matter: Matter;
  onMatterUpdated?: (m: Matter) => void;
}) {
  const auth = useAuth();
  const slug = matter.slug;

  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [modelId, setModelId] = useState(matter.default_model_id);
  const [editingModel, setEditingModel] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // Dashboard data — each fetched independently and degraded on its own.
  const [docs, setDocs] = useState<Loadable<MatterDocument[]>>({ state: "loading" });
  const [artifacts, setArtifacts] = useState<Loadable<ArtifactSummary[]>>({ state: "loading" });
  const [signoffs, setSignoffs] = useState<Loadable<Signoff[]>>({ state: "loading" });
  const [messageCount, setMessageCount] = useState<Loadable<number>>({ state: "loading" });
  const [audit, setAudit] = useState<Loadable<AuditEntry[]>>({ state: "loading" });

  // Keep the displayed model in sync if the parent reloads the matter.
  useEffect(() => {
    setModelId(matter.default_model_id);
  }, [matter.default_model_id]);

  useEffect(() => {
    let live = true;
    listModels()
      .then((rows) => live && setModels(rows))
      .catch(() => live && setModels([]));
    return () => {
      live = false;
    };
  }, []);

  // Fetch the dashboard data on mount (and when the matter changes). Each
  // promise resolves into its own slot; a rejection only marks that slot
  // as unavailable.
  useEffect(() => {
    let live = true;
    setDocs({ state: "loading" });
    setArtifacts({ state: "loading" });
    setSignoffs({ state: "loading" });
    setMessageCount({ state: "loading" });
    setAudit({ state: "loading" });

    listDocuments(slug)
      .then((rows) => live && setDocs({ state: "ready", data: rows }))
      .catch(() => live && setDocs({ state: "error" }));
    listArtifacts(slug)
      .then((rows) => live && setArtifacts({ state: "ready", data: rows }))
      .catch(() => live && setArtifacts({ state: "error" }));
    listSignoffs(slug)
      .then((res) => live && setSignoffs({ state: "ready", data: res.signoffs }))
      .catch(() => live && setSignoffs({ state: "error" }));
    listAssistantMessages(slug)
      .then((rows) => live && setMessageCount({ state: "ready", data: rows.length }))
      .catch(() => live && setMessageCount({ state: "error" }));
    listAudit(slug, 50)
      .then((rows) => live && setAudit({ state: "ready", data: rows }))
      .catch(() => live && setAudit({ state: "error" }));

    return () => {
      live = false;
    };
  }, [slug]);

  // Only the matter's owner may change the model. Mirrors how the rest of
  // the workspace gates write actions to the authenticated owner.
  const isOwner = !!auth.user && auth.user.id === matter.created_by_id;

  const modelLabel =
    models?.find((m) => m.id === modelId)?.label ?? modelId;

  const onModelChange = async (next: string) => {
    if (!next || next === matter.default_model_id) {
      setEditingModel(false);
      return;
    }
    setSavingModel(true);
    setModelError(null);
    try {
      const updated = await updateMatterModel(matter.slug, next);
      setModelId(updated.default_model_id);
      setEditingModel(false);
      onMatterUpdated?.(updated);
    } catch (err) {
      setModelError(String(err));
    } finally {
      setSavingModel(false);
    }
  };

  // --- Derived dashboard figures -----------------------------------------
  const docRows = docs.state === "ready" ? docs.data : null;
  const docCount = docRows?.length ?? 0;
  const searchableCount =
    docRows?.filter((d) => d.index_status === "indexed").length ?? 0;

  const artifactRows = artifacts.state === "ready" ? artifacts.data : null;
  const signoffRows = signoffs.state === "ready" ? signoffs.data : null;

  // An output is "signed" when a current sign-off carries a signed decision.
  const signedArtifactIds = new Set(
    (signoffRows ?? [])
      .filter((s) => s.is_current && SIGNED_DECISIONS.has(s.decision))
      .map((s) => s.artifact_id),
  );
  // Outstanding = outputs that exist but carry no current signed sign-off.
  const awaitingReview =
    artifactRows?.filter((a) => !signedArtifactIds.has(a.id)).length ?? 0;

  const auditRows = audit.state === "ready" ? audit.data : null;
  const recentActivity = (auditRows ?? [])
    .filter((e) => e.module != null) // human story, not http/middleware rows
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5);

  // --- Happy-path checklist ----------------------------------------------
  // Each step is ticked only when its state is positively detected from the
  // data already fetched; anything we cannot cheaply detect stays unticked.
  const hasDocuments = docCount > 0;
  const hasMessages = messageCount.state === "ready" && messageCount.data > 0;
  const hasOutput = (artifactRows?.length ?? 0) > 0;
  const hasSignedOutput = signedArtifactIds.size > 0;
  const hasExport =
    auditRows?.some((e) => e.action.includes("export")) ?? false;

  const checklist = [
    { label: "Add documents", done: hasDocuments },
    { label: "Ask the assistant", done: hasMessages },
    { label: "Run a skill", done: hasOutput },
    { label: "Sign an output", done: hasSignedOutput },
    { label: "Export the working pack", done: hasExport },
  ];
  const allDataReady =
    docs.state !== "loading" &&
    artifacts.state !== "loading" &&
    signoffs.state !== "loading" &&
    messageCount.state !== "loading" &&
    audit.state !== "loading";
  const checklistComplete = checklist.every((s) => s.done);
  // Hide once every step is done. Keep it visible while data is still
  // arriving so it doesn't flash in as "nothing done yet".
  const showChecklist = !(allDataReady && checklistComplete);

  // Parties / cause, pulled from the matter's free-form facts bag.
  const client = factStr(matter.facts ?? {}, "client");
  const counterparty = factStr(matter.facts ?? {}, "counterparty");

  const retentionDays = daysUntil(matter.retention_until);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink">Overview</h1>
        <p className="mt-1 text-sm text-muted">
          Where this matter stands, and what to do next.
        </p>
      </div>

      {/* Orientation — parties, dates, and where the work is up to. */}
      <div className="rounded-card border border-rule bg-paper p-5">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-xs uppercase tracking-widest text-muted">Matter</h2>
          <span className="text-xs text-muted">{humanise(matter.matter_type)}</span>
        </div>

        <dl className="grid gap-5 sm:grid-cols-2">
          <DescItem label="Title">{matter.title}</DescItem>
          <DescItem label="Status">
            {humanise(matter.status)}
            <p className="mt-1 text-xs text-muted">{statusExplain(matter.status)}</p>
          </DescItem>
          {matter.cause && <DescItem label="Cause">{matter.cause}</DescItem>}
          {(client || counterparty) && (
            <DescItem label="Parties">
              {client && <span className="block text-ink">{client}</span>}
              {counterparty && (
                <span className="block text-ink">v {counterparty}</span>
              )}
            </DescItem>
          )}
          <DescItem label="Opened">{formatDate(matter.opened_at)}</DescItem>
          <DescItem label="Retention">
            {formatDate(matter.retention_until)}
            {retentionDays != null && (
              <p className="mt-1 text-xs text-muted">
                {retentionDays > 0
                  ? `${retentionDays} day${retentionDays === 1 ? "" : "s"} remaining`
                  : retentionDays === 0
                    ? "Retention clock ends today"
                    : `Retention lapsed ${-retentionDays} day${retentionDays === -1 ? "" : "s"} ago`}
              </p>
            )}
          </DescItem>
        </dl>

        {/* Where the work is up to — counts that link to their sections. */}
        <dl className="mt-6 grid gap-5 border-t border-rule pt-6 sm:grid-cols-2">
          <DescItem label="Documents">
            {docs.state === "error" ? (
              <span className="text-muted">Unavailable</span>
            ) : docs.state === "loading" ? (
              <span className="text-muted">Loading…</span>
            ) : (
              <span className="inline-flex items-baseline gap-3">
                <span>
                  {docCount} document{docCount === 1 ? "" : "s"}
                  {docCount > 0 && (
                    <span className="text-muted"> · {searchableCount} searchable</span>
                  )}
                </span>
                <Link
                  to="/matters/$slug/$tab"
                  params={{ slug, tab: "documents" }}
                  className="text-xs text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                >
                  Open →
                </Link>
              </span>
            )}
          </DescItem>
          <DescItem label="Awaiting review">
            {artifacts.state === "error" ? (
              <span className="text-muted">Unavailable</span>
            ) : artifacts.state === "loading" ? (
              <span className="text-muted">Loading…</span>
            ) : (
              <span className="inline-flex items-baseline gap-3">
                <span>
                  {awaitingReview === 0
                    ? "Nothing outstanding"
                    : `${awaitingReview} output${awaitingReview === 1 ? "" : "s"} awaiting review`}
                </span>
                <Link
                  to="/matters/$slug/artifacts"
                  params={{ slug }}
                  className="text-xs text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                >
                  Outputs →
                </Link>
              </span>
            )}
          </DescItem>
        </dl>
      </div>

      {/* Recent activity — the last few audit events, in plain English. */}
      <div className="mt-6 rounded-card border border-rule bg-paper p-5">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-xs uppercase tracking-widest text-muted">Recent activity</h2>
          <Link
            to="/matters/$slug/audit"
            params={{ slug }}
            className="text-xs text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
          >
            Activity →
          </Link>
        </div>
        {audit.state === "error" ? (
          <p className="text-sm text-muted">Activity is unavailable right now.</p>
        ) : audit.state === "loading" ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : recentActivity.length === 0 ? (
          <p className="text-sm text-muted">Nothing recorded yet.</p>
        ) : (
          <ol className="divide-y divide-rule/60">
            {recentActivity.map((e) => (
              <li key={e.id} className="flex items-baseline gap-4 py-2">
                <span className="text-sm leading-snug text-ink">
                  {narrateEntry(e)}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-muted tabular-nums">
                  {relativeTime(e.timestamp)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Happy-path checklist — self-completing, hides once every step is done. */}
      {showChecklist && (
        <div className="mt-6 rounded-card border border-rule bg-paper p-5">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted">
            Getting started
          </p>
          <ol className="mt-4 space-y-3">
            {checklist.map((step, i) => (
              <li key={step.label} className="flex items-baseline gap-3">
                <span
                  className={
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] " +
                    (step.done
                      ? "border-seal bg-seal/10 text-seal"
                      : "border-rule text-muted")
                  }
                  aria-hidden="true"
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <span
                  className={
                    "text-sm " + (step.done ? "text-muted line-through" : "text-ink")
                  }
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Matter settings — the demoted spec sheet. */}
      <div className="mt-6 rounded-card border border-rule bg-paper p-5">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-xs uppercase tracking-widest text-muted">Matter settings</h2>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer list-none hover:text-ink">
              What's the difference?
            </summary>
            <p className="mt-2 max-w-md font-normal normal-case tracking-normal text-muted">
              Status is where the case is (open/closed). AI access controls
              which models may run on this matter's content. They are two
              separate things.
            </p>
          </details>
        </div>
        <dl className="grid gap-5 sm:grid-cols-2">
          <DescItem label="AI access">
            {postureLabel(matter.privilege_posture)}
            <p className="mt-1 text-xs text-muted">
              {postureExplain(matter.privilege_posture)}
            </p>
          </DescItem>
          <DescItem label="Model">
            {editingModel && models && models.length > 0 ? (
              <select
                autoFocus
                disabled={savingModel}
                defaultValue={modelId}
                onChange={(e) => void onModelChange(e.target.value)}
                className="bg-paper border border-rule rounded-item px-3 py-2 text-sm focus:border-ink focus:outline-none text-ink"
              >
                {models.map((m) => {
                  const needsKey = m.requires_key && !m.key_configured;
                  return (
                    <option key={m.id} value={m.id} disabled={needsKey}>
                      {m.label}
                      {needsKey ? " (needs provider key — add in Settings)" : ""}
                    </option>
                  );
                })}
              </select>
            ) : (
              <span className="inline-flex items-center gap-3">
                <span>{modelLabel}</span>
                {isOwner && models && models.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditingModel(true)}
                    className="text-xs text-muted underline underline-offset-4 decoration-rule hover:decoration-seal hover:text-seal"
                  >
                    Change
                  </button>
                )}
              </span>
            )}
            {savingModel && (
              <p className="mt-1 text-xs text-muted">Saving…</p>
            )}
            <p className="mt-1 text-xs text-muted">
              Runs this matter's skills. Fixed unless you change it here.
            </p>
          </DescItem>
          <DescItem label="Retention until">
            {formatDate(matter.retention_until)}
          </DescItem>
        </dl>
        {modelError && <ErrorCallout message={modelError} compact />}

        {(matter.case_theory || matter.pivot_fact) && (
          <dl className="mt-6 grid gap-5 border-t border-rule pt-6">
            {matter.case_theory && (
              <DescItem label="Case theory">
                <p className="text-sm text-ink">{matter.case_theory}</p>
              </DescItem>
            )}
            {matter.pivot_fact && (
              <DescItem label="Pivot fact">
                <p className="text-sm text-ink">{matter.pivot_fact}</p>
              </DescItem>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}
