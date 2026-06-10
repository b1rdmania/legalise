import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CapabilityDeniedError,
  InvocationInvalidArgsError,
  Phase1BlockedError,
  PostureBlockedError,
  ProviderKeyMissingForInvokeError,
  ProviderUpstreamInvokeError,
  invokeCapability,
  readArtifact,
  type ArtifactRead,
  type InvocationResponse,
  type MatterDocument,
} from "../lib/api";
import { ArtifactPreview } from "./ArtifactPreview";
import {
  shortCapabilityList,
  type RunnableMatterSkill,
} from "./skillRunnerModel";

type RunnerState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "success"; response: InvocationResponse; artifacts: ArtifactRead[] }
  | { kind: "blocked"; title: string; body: string; detail?: string }
  | { kind: "error"; title: string; body: string; detail?: string };

export function GenericSkillRunner({
  slug,
  skill,
  documents,
  initialDocumentIds,
  initialInput,
  onClose,
  onRunComplete,
  compact = false,
}: {
  slug: string;
  skill: RunnableMatterSkill;
  documents?: MatterDocument[] | null;
  initialDocumentIds?: string[];
  initialInput?: string;
  onClose?: () => void;
  onRunComplete?: (response: InvocationResponse, artifacts: ArtifactRead[]) => void;
  compact?: boolean;
}) {
  const availableDocs = documents ?? [];
  const initialDocs = useMemo(() => {
    if (initialDocumentIds?.length) return new Set(initialDocumentIds);
    if (skill.reads.includes("document.body.read") && availableDocs[0]) {
      return new Set([availableDocs[0].id]);
    }
    return new Set<string>();
  }, [availableDocs, initialDocumentIds, skill.reads]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(initialDocs);
  const [input, setInput] = useState(
    initialInput ?? defaultPromptFor(skill, availableDocs, initialDocs),
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      skill.inputFields.map((field) => [field.key, field.defaultValue]),
    ),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedJson, setAdvancedJson] = useState("{}");
  const [state, setState] = useState<RunnerState>({ kind: "idle" });

  const needsDocument = skill.reads.includes("document.body.read");
  const requiredFieldsFilled = skill.inputFields.every(
    (field) => !field.required || fieldValues[field.key]?.trim(),
  );
  const canRun = (!needsDocument || selectedDocIds.size > 0) && requiredFieldsFilled;

  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onRun = async () => {
    if (!canRun || state.kind === "running") return;
    let extraArgs: Record<string, unknown> = {};
    if (advancedOpen) {
      try {
        extraArgs = JSON.parse(advancedJson) as Record<string, unknown>;
      } catch (err) {
        setState({
          kind: "error",
          title: "Args are not valid JSON",
          body: String(err),
        });
        return;
      }
    }
    const docIds = Array.from(selectedDocIds);
    const args: Record<string, unknown> = {
      ...extraArgs,
      ...Object.fromEntries(
        Object.entries(fieldValues).filter(([, value]) => value.trim()),
      ),
      ...(input.trim() ? { input: input.trim() } : {}),
      ...(docIds.length === 1
        ? { document_id: docIds[0] }
        : docIds.length > 1
          ? { document_ids: docIds }
          : {}),
    };

    setState({ kind: "running" });
    try {
      const response = await invokeCapability(slug, {
        module_id: skill.moduleId,
        capability_id: skill.capabilityId,
        args,
      });
      const artifactIds = artifactIdsFromResult(response.result);
      const artifacts = await Promise.all(
        artifactIds.map((artifactId) => readArtifact(slug, artifactId)),
      );
      setState({ kind: "success", response, artifacts });
      onRunComplete?.(response, artifacts);
    } catch (err) {
      setState(errorToState(err));
    }
  };

  return (
    <section
      className={compact ? "rounded-card border border-rule bg-paper p-3" : "rounded-card border border-rule bg-paper p-4"}
      data-testid={`generic-runner-${skill.moduleId}-${skill.capabilityId}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{skill.title}</p>
          <p className="mt-1 max-w-xl text-xs text-muted">
            {skill.description || "Runs against this project and writes an output to Activity."}
          </p>
        </div>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
          Ready in this project
        </span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr]">
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-muted">Request</span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={compact ? 2 : 3}
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm focus:border-ink focus:outline-none"
            placeholder="Tell the skill what to do."
          />
        </label>

        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted">
            {needsDocument ? "Documents selected" : "Project material"}
          </p>
          {documents === null ? (
            <p className="mt-2 text-xs text-muted">Loading documents…</p>
          ) : availableDocs.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              No documents loaded. This skill can still run if it does not need a document.
            </p>
          ) : needsDocument ? (
            <div className="mt-1 max-h-28 overflow-auto rounded-md border border-line">
              {availableDocs.map((doc) => (
                <label key={doc.id} className="flex items-center gap-2 border-b border-line px-2 py-1.5 last:border-b-0">
                  <input
                    type="checkbox"
                    checked={selectedDocIds.has(doc.id)}
                    onChange={() => toggleDoc(doc.id)}
                  />
                  <span className="truncate tech-token text-xs">{doc.filename}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">
              This skill does not require a document selection.
            </p>
          )}
        </div>
      </div>

      {skill.inputFields.length > 0 && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {skill.inputFields.map((field) => (
            <label key={field.key} className="block">
              <span className="text-[11px] uppercase tracking-widest text-muted">
                {field.label}{field.required ? " *" : ""}
              </span>
              {field.kind === "select" ? (
                <select
                  value={fieldValues[field.key] ?? ""}
                  onChange={(e) =>
                    setFieldValues((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm focus:border-ink focus:outline-none"
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={fieldValues[field.key] ?? ""}
                  onChange={(e) =>
                    setFieldValues((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm focus:border-ink focus:outline-none"
                />
              )}
              {field.description && (
                <span className="mt-1 block text-xs text-muted">
                  {field.description}
                </span>
              )}
            </label>
          ))}
        </div>
      )}

      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer hover:text-ink">Details</summary>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          <Pair label="Reads" value={shortCapabilityList(skill.reads)} />
          <Pair label="Writes" value={shortCapabilityList(skill.writes)} />
          <Pair label="Signature" value={skill.signatureStatus} />
          <Pair label="Module" value={`${skill.moduleId} / ${skill.capabilityId}`} />
        </dl>
        <button
          type="button"
          className="mt-3 underline underline-offset-4 hover:text-ink"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          {advancedOpen ? "Hide advanced args" : "Advanced args"}
        </button>
        {advancedOpen && (
          <textarea
            value={advancedJson}
            onChange={(e) => setAdvancedJson(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-md border border-line bg-paper px-2 py-1 tech-token text-xs"
          />
        )}
      </details>

      {!canRun && (
        <p className="mt-3 text-xs text-seal">
          {needsDocument && selectedDocIds.size === 0
            ? "Select at least one document before running this skill."
            : "Complete the required fields before running this skill."}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onRun()}
          disabled={!canRun || state.kind === "running"}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
          data-testid={`generic-run-${skill.moduleId}-${skill.capabilityId}`}
        >
          {state.kind === "running" ? "Running…" : "Run skill"}
        </button>
        <Link
          to="/matters/$slug/audit"
          params={{ slug }}
          className="text-xs text-muted underline underline-offset-4 hover:text-ink"
        >
          View Activity →
        </Link>
      </div>

      <RunnerResult
        state={state}
        slug={slug}
        onClose={onClose ?? (() => setState({ kind: "idle" }))}
      />
    </section>
  );
}

function RunnerResult({
  state,
  slug,
  onClose,
}: {
  state: RunnerState;
  slug: string;
  onClose: () => void;
}) {
  if (state.kind === "idle") return null;
  if (state.kind === "running") {
    return <p className="mt-3 text-xs text-muted">Running skill…</p>;
  }
  if (state.kind === "blocked" || state.kind === "error") {
    return (
      <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2">
        <p className="text-sm font-medium text-ink">{state.title}</p>
        <p className="mt-1 text-sm text-muted">{state.body}</p>
        {state.detail && <p className="mt-1 text-xs text-muted">{state.detail}</p>}
      </div>
    );
  }
  const { response, artifacts } = state;
  return (
    <div className="mt-4 rounded-md border border-rule p-3" data-testid="generic-runner-result">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-widest text-muted">
          {artifacts.length === 1
            ? "Output written"
            : artifacts.length > 1
              ? `${artifacts.length} outputs written`
              : "Run complete"}
        </p>
        <p className="tech-token text-[11px] text-muted">{response.invocation_id}</p>
      </div>
      {artifacts.length > 0 ? (
        <div className="mt-3 space-y-4">
          {artifacts.map((artifact, index) => (
            <section
              key={artifact.id}
              className={artifacts.length > 1 ? "border-t border-line pt-3 first:border-t-0 first:pt-0" : undefined}
              data-testid={`generic-runner-output-${artifact.id}`}
            >
              {artifacts.length > 1 && (
                <p className="mb-2 text-[11px] uppercase tracking-widest text-muted">
                  Output {index + 1}
                </p>
              )}
              <ArtifactPreview
                payload={artifact.payload}
                kindHint={artifact.kind}
                matterSlug={slug}
              />
              <div
                className="mt-3 border border-ink bg-paper-sunken p-3"
                data-testid={`generic-runner-next-steps-${artifact.id}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                  Next step
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">
                  Review the output, sign it if you stand behind it, then use Activity as
                  the receipt.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Link
                    to="/matters/$slug/artifacts/$artifactId/sign"
                    params={{ slug, artifactId: artifact.id }}
                    className="rounded-item border border-ink bg-ink px-3 py-2 font-semibold text-paper hover:bg-black"
                  >
                    Review & sign
                  </Link>
                  <Link
                    to="/matters/$slug/artifacts/$artifactId"
                    params={{ slug, artifactId: artifact.id }}
                    className="rounded-item border border-rule bg-paper px-3 py-2 font-semibold text-ink hover:border-ink"
                  >
                    Open output
                  </Link>
                  <a
                    href={`/matters/${encodeURIComponent(slug)}/audit?invocation_id=${encodeURIComponent(response.invocation_id)}`}
                    className="rounded-item border border-rule bg-paper px-3 py-2 font-semibold text-ink hover:border-ink"
                  >
                    View Activity
                  </a>
                </div>
              </div>
            </section>
          ))}
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted underline underline-offset-4 hover:text-ink"
          >
            Close run
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <ArtifactPreview payload={response.result} kindHint={null} matterSlug={slug} />
          <p className="mt-2 text-xs text-muted">
            This run returned a result but did not expose an artifact id.
          </p>
        </div>
      )}
    </div>
  );
}

export function artifactIdsFromResult(result: InvocationResponse["result"]): string[] {
  if (!result || typeof result !== "object") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
    if (
      typeof value === "string" &&
      (key === "artifact_id" || key.endsWith("_artifact_id")) &&
      !seen.has(value)
    ) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-xs text-ink">{value}</dd>
    </div>
  );
}

function defaultPromptFor(
  skill: RunnableMatterSkill,
  docs: MatterDocument[],
  selectedDocIds: Set<string>,
): string {
  const selected = docs.find((d) => selectedDocIds.has(d.id)) ?? docs[0];
  if (skill.defaultRequest) {
    return skill.defaultRequest.replaceAll(
      "{filename}",
      selected?.filename ?? "the selected document",
    );
  }
  if (skill.reads.includes("document.body.read")) {
    return "Run this skill on the selected document.";
  }
  return "Run this skill on the project.";
}

function errorToState(err: unknown): RunnerState {
  if (err instanceof PostureBlockedError) {
    return {
      kind: "blocked",
      title: "Privilege state blocks this skill",
      body: "This project is not currently allowed to run that skill.",
      detail: err.reason,
    };
  }
  if (err instanceof CapabilityDeniedError) {
    return {
      kind: "blocked",
      title: "This skill needs setup",
      body: "A required project permission is missing. Open Skills to enable it.",
    };
  }
  if (err instanceof Phase1BlockedError) {
    return {
      kind: "blocked",
      title: "Advice boundary blocked this run",
      body: "The requested output is beyond the allowed advice level for this skill.",
      detail: err.blockedReason,
    };
  }
  if (err instanceof ProviderKeyMissingForInvokeError) {
    return {
      kind: "blocked",
      title: "Provider key needed",
      body: err.provider
        ? `Add a ${err.provider} key in Settings, or use a keyless demo model.`
        : "Add a provider key in Settings, or use a keyless demo model.",
    };
  }
  if (err instanceof ProviderUpstreamInvokeError) {
    return {
      kind: "error",
      title: "Provider error",
      body: err.provider
        ? `${err.provider} returned an error.`
        : "The provider returned an error.",
      detail: err.code ?? undefined,
    };
  }
  if (err instanceof InvocationInvalidArgsError) {
    return { kind: "error", title: "Invalid input", body: err.message };
  }
  return {
    kind: "error",
    title: "Run failed",
    body: err instanceof Error ? err.message : String(err),
  };
}
