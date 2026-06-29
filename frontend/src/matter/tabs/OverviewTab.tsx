import { useEffect, useState } from "react";
import {
  listModels,
  updateMatterModel,
  type Matter,
  type ModelOption,
} from "../../lib/api";
import { useAuth } from "../../auth/AuthProvider";
import { postureExplain, postureLabel } from "../../lib/posture";
import { DescItem, ErrorCallout } from "../../ui/primitives";

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

export function OverviewTab({
  matter,
  onMatterUpdated,
}: {
  matter: Matter;
  onMatterUpdated?: (m: Matter) => void;
}) {
  const auth = useAuth();
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [modelId, setModelId] = useState(matter.default_model_id);
  const [editingModel, setEditingModel] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

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

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink">Overview</h1>
        <p className="mt-1 text-sm text-muted">
          The matter at a glance. Everything below is recorded against this matter.
        </p>
      </div>

      <div className="rounded-card border border-rule bg-paper p-5">
        {/* Case — where the matter is in its lifecycle. */}
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <h2 className="text-xs uppercase tracking-widest text-muted">Case</h2>
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
          <DescItem label="Title">{matter.title}</DescItem>
          <DescItem label="Matter type">{humanise(matter.matter_type)}</DescItem>
          <DescItem label="Status">
            {humanise(matter.status)}
            <p className="mt-1 text-xs text-muted">{statusExplain(matter.status)}</p>
          </DescItem>
          <DescItem label="Opened">{formatDate(matter.opened_at)}</DescItem>
          <DescItem label="Retention until">
            {formatDate(matter.retention_until)}
          </DescItem>
        </dl>

        {/* AI access — which models may run on this matter, and which one. */}
        <div className="mt-6 border-t border-rule pt-6">
          <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">AI access</h2>
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
          </dl>
          {modelError && <ErrorCallout message={modelError} compact />}
        </div>

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
