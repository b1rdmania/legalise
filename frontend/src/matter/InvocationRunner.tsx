/**
 * InvocationRunner.
 *
 * Renders a single granted (module_id, capability_id) pair as a "Run"
 * affordance with an inline result panel. Each panel owns its own
 * lifecycle — the matter workspace may host several runners
 * concurrently (one per granted capability), but they don't share
 * state.
 *
 * Substrate truth (backend/app/api/invocations.py):
 *   POST /api/matters/{slug}/invocations with {module_id, capability_id, args}
 *   Error paths are typed (see invokeCapability in lib/api.ts):
 *     - 403 posture_gate_blocked
 *     - 403 capability_denied
 *     - 403 phase1_blocked (advice-boundary gate)
 *     - 422 provider_key_missing (→ /settings/keys)
 *     - 502 provider_upstream_error
 *     - 422 invalid_args
 *
 * Per Reviewer-narrow brief, this component handles invocation +
 * result rendering only. No reconstruction inline, no admin, no
 * settings, no async. The "View in Record" link from the result
 * panel points at /matters/{slug}/audit?invocation_id=…, preserving the
 * reconstruction deep-link for the output chain.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CapabilityDeniedError,
  invokeCapability,
  InvocationInvalidArgsError,
  Phase1BlockedError,
  PostureBlockedError,
  ProviderKeyMissingForInvokeError,
  ProviderUpstreamInvokeError,
  type InvocationResponse,
} from "../lib/api";
import { ArtifactPreview } from "./ArtifactPreview";

type RunnerState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "success"; response: InvocationResponse }
  | { kind: "posture_blocked"; err: PostureBlockedError }
  | { kind: "capability_denied"; err: CapabilityDeniedError }
  | { kind: "phase1_blocked"; err: Phase1BlockedError }
  | { kind: "key_missing"; err: ProviderKeyMissingForInvokeError }
  | { kind: "upstream"; err: ProviderUpstreamInvokeError }
  | { kind: "invalid_args"; err: InvocationInvalidArgsError }
  | { kind: "error"; message: string };

interface Props {
  slug: string;
  moduleId: string;
  capabilityId: string;
  readiness?: {
    disabled: boolean;
    title: string;
    body: string;
    provider?: string | null;
  };
}

export function InvocationRunner({ slug, moduleId, capabilityId, readiness }: Props) {
  const [state, setState] = useState<RunnerState>({ kind: "idle" });
  const [argsOpen, setArgsOpen] = useState(false);
  const [argsJson, setArgsJson] = useState("{}");

  const onRun = async () => {
    if (readiness?.disabled) return;
    let parsedArgs: Record<string, unknown> = {};
    if (argsOpen) {
      try {
        parsedArgs = JSON.parse(argsJson) as Record<string, unknown>;
      } catch (err) {
        setState({
          kind: "error",
          message: `Args is not valid JSON: ${String(err)}`,
        });
        return;
      }
    }
    setState({ kind: "running" });
    try {
      const response = await invokeCapability(slug, {
        module_id: moduleId,
        capability_id: capabilityId,
        args: parsedArgs,
      });
      setState({ kind: "success", response });
    } catch (err) {
      if (err instanceof PostureBlockedError) {
        setState({ kind: "posture_blocked", err });
        return;
      }
      if (err instanceof CapabilityDeniedError) {
        setState({ kind: "capability_denied", err });
        return;
      }
      if (err instanceof Phase1BlockedError) {
        setState({ kind: "phase1_blocked", err });
        return;
      }
      if (err instanceof ProviderKeyMissingForInvokeError) {
        setState({ kind: "key_missing", err });
        return;
      }
      if (err instanceof ProviderUpstreamInvokeError) {
        setState({ kind: "upstream", err });
        return;
      }
      if (err instanceof InvocationInvalidArgsError) {
        setState({ kind: "invalid_args", err });
        return;
      }
      setState({ kind: "error", message: String(err) });
    }
  };

  return (
    <div className="text-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={state.kind === "running" || readiness?.disabled}
          className="inline-flex items-center rounded-md bg-ink px-3 py-1 text-xs text-paper hover:opacity-90 disabled:opacity-50"
          data-testid={`run-${moduleId}-${capabilityId}`}
        >
          {state.kind === "running" ? "Running…" : "Run"}
        </button>
        <button
          type="button"
          onClick={() => setArgsOpen((v) => !v)}
          className="text-xs text-muted hover:text-ink underline underline-offset-4"
        >
          {argsOpen ? "Hide args" : "Args"}
        </button>
      </div>
      {readiness && (
        <div
          className={`mt-2 rounded-md border px-3 py-2 text-xs ${
            readiness.disabled
              ? "border-amber-500/40 bg-amber-50 text-ink"
              : "border-line bg-paper-sunken text-muted"
          }`}
          data-testid={`run-readiness-${moduleId}-${capabilityId}`}
        >
          <p className="font-medium text-ink">{readiness.title}</p>
          <p className="mt-1">{readiness.body}</p>
          {readiness.disabled && (
            <p className="mt-2">
              <a
                href="/settings/keys"
                className="underline underline-offset-4 hover:text-ink"
              >
                Configure provider keys →
              </a>
            </p>
          )}
        </div>
      )}
      {argsOpen && (
        <div className="mt-2">
          <textarea
            value={argsJson}
            onChange={(e) => setArgsJson(e.target.value)}
            rows={4}
            spellCheck={false}
            className="w-full rounded-md border border-line bg-paper px-2 py-1 tech-token text-xs"
            placeholder='{"claim_type":"unfair_dismissal","document_ids":["doc-1","doc-2"]}'
          />
          <p className="mt-1 text-xs text-muted">
            JSON args passed to the capability. Defaults to{" "}
            <code className="tech-token">&#123;&#125;</code>; the
            capability returns a structured 422 if required args are
            missing.
          </p>
        </div>
      )}
      <ResultPanel state={state} slug={slug} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result panel — pending / success / structured-error states.
// ---------------------------------------------------------------------------

function ResultPanel({
  state,
  slug,
}: {
  state: RunnerState;
  slug: string;
}) {
  if (state.kind === "idle") return null;

  if (state.kind === "running") {
    return (
      <div className="mt-3 rounded-md border border-line px-3 py-2 text-xs text-muted">
        <span
          className="mr-2 inline-block h-2 w-2 rounded-full border border-muted border-t-transparent animate-spin align-middle"
          aria-hidden="true"
        />
        Run in flight…
      </div>
    );
  }

  if (state.kind === "success") {
    const r = state.response;
    return (
      <div className="mt-3 rounded-md border border-line p-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-muted">
            Run complete
          </p>
          <p className="text-xs tech-token text-muted">{r.invocation_id}</p>
        </div>
        <ArtifactPreview payload={r.result} kindHint={null} />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <Link
            to="/matters/$slug/artifacts"
            params={{ slug }}
            className="text-muted underline underline-offset-4 hover:text-ink"
          >
            See all signed outputs on this matter
          </Link>
          <a
            href={`/matters/${encodeURIComponent(slug)}/audit?invocation_id=${encodeURIComponent(r.invocation_id)}`}
            className="text-muted underline underline-offset-4 hover:text-ink"
          >
            See Activity for this run
          </a>
        </div>
      </div>
    );
  }

  if (state.kind === "posture_blocked") {
    return (
      <Banner tone="amber" title="Privilege gate blocked invocation">
        <p>
          This matter's privilege state (
          <code className="tech-token text-xs">{state.err.posture}</code>)
          requires role{" "}
          <code className="tech-token text-xs">{state.err.requiredRole}</code>.
          Your role is{" "}
          <code className="tech-token text-xs">{state.err.actorRole}</code>.
        </p>
        <p className="mt-1 text-xs">
          Audit row:{" "}
          <code className="tech-token">posture_gate.check.blocked</code>.
        </p>
      </Banner>
    );
  }

  if (state.kind === "capability_denied") {
    return (
      <Banner tone="seal" title="Permission denied">
        <p>
          The runtime denied{" "}
          <code className="tech-token text-xs">{state.err.plugin}</code>/
          <code className="tech-token text-xs">{state.err.skill}</code>/
          <code className="tech-token text-xs">{state.err.capability}</code>.
          A permission exists in policy but `require_capability` rejected at
          dispatch time.
        </p>
        <p className="mt-1 text-xs">
          Audit row:{" "}
          <code className="tech-token">module.capability.denied</code>.
        </p>
      </Banner>
    );
  }

  if (state.kind === "phase1_blocked") {
    return (
      <Banner tone="seal" title="Advice-boundary gate blocked invocation">
        <p>
          Blocked reason:{" "}
          <code className="tech-token text-xs">
            {state.err.blockedReason}
          </code>
          .
        </p>
        <p className="mt-1 text-xs">
          Audit row:{" "}
          <code className="tech-token">advice_boundary.check.blocked</code>.
        </p>
      </Banner>
    );
  }

  if (state.kind === "key_missing") {
    return (
      <Banner tone="amber" title="Provider API key not configured">
        <p>
          {state.err.provider
            ? `No key on file for provider ${state.err.provider}. `
            : "No provider key on file. "}
          BYO-key models can't run without a configured key.
        </p>
        <p className="mt-2 text-xs">
          <Link
            to="/settings/keys"
            className="underline underline-offset-4 hover:text-ink"
          >
            Configure a provider key in settings →
          </Link>
        </p>
      </Banner>
    );
  }

  if (state.kind === "upstream") {
    return (
      <Banner tone="seal" title="Provider upstream error">
        <p>
          Provider{" "}
          {state.err.provider ? (
            <code className="tech-token text-xs">{state.err.provider}</code>
          ) : (
            "upstream"
          )}{" "}
          returned an error.
          {state.err.upstreamStatus ? ` HTTP ${state.err.upstreamStatus}.` : ""}
          {state.err.code ? (
            <>
              {" "}
              Code:{" "}
              <code className="tech-token text-xs">{state.err.code}</code>.
            </>
          ) : null}
        </p>
        <p className="mt-1 text-xs">
          Audit row:{" "}
          <code className="tech-token">model.call.error</code>.
        </p>
      </Banner>
    );
  }

  if (state.kind === "invalid_args") {
    return (
      <Banner tone="amber" title="Invalid args">
        <p>{state.err.message}</p>
        <p className="mt-1 text-xs">
          Open the Args panel above to provide the required JSON.
        </p>
      </Banner>
    );
  }

  // Unknown runtime envelope.
  return (
    <Banner tone="seal" title="Run failed">
      <p>{state.message}</p>
    </Banner>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "amber" | "seal";
  title: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === "seal"
      ? "border-seal/40 bg-seal/5 text-ink"
      : "border-amber-500/40 bg-amber-50 text-ink";
  return (
    <div className={`mt-3 rounded-md border px-3 py-2 ${cls}`}>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-1 text-sm text-muted">{children}</div>
    </div>
  );
}
