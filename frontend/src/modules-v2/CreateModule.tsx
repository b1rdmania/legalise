/**
 * /modules/create — Create Module v1 (validate-and-explain, NOT a
 * visual builder).
 *
 * Helps a developer/operator understand what a module is, what its
 * manifest must declare, and whether a candidate manifest validates —
 * using the SAME validator as the install path (read-only; no DB write,
 * ceremony, trust, or audit). Signing stays deploy-time / CLI: this page
 * explains a module must be signed before install and points at the
 * local tooling. In-app signing is a future module-DX phase.
 */

import { useState } from "react";
import {
  validateManifest,
  type ValidateManifestResult,
} from "../lib/api";
import { PageHeader } from "../ui/primitives";

const REQUIRED_FIELDS: { field: string; what: string }[] = [
  { field: "schema_version", what: 'manifest schema, e.g. "2.0.0"' },
  { field: "id", what: "stable skill id" },
  { field: "version", what: "skill version" },
  { field: "publisher", what: "who publishes it" },
  { field: "visibility", what: "first_party / community / private" },
  { field: "runtime", what: "how the skill executes — native, mcp, or prompt" },
  { field: "entrypoint", what: 'what the runtime invokes (prompt runtime: { "prompt_source": "manifest", "instructions": "..." })' },
  { field: "capabilities", what: "permission sets, advice tier, and declared audit events" },
];

type Result =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "parse_error"; message: string }
  | { kind: "validated"; result: ValidateManifestResult }
  | { kind: "error"; message: string };

export function CreateModule() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });

  const onValidate = async () => {
    let manifest: unknown;
    try {
      manifest = JSON.parse(text);
    } catch (err) {
      setResult({ kind: "parse_error", message: `Not valid JSON: ${String(err)}` });
      return;
    }
    setResult({ kind: "busy" });
    try {
      const res = await validateManifest(manifest);
      setResult({ kind: "validated", result: res });
    } catch (err) {
      setResult({ kind: "error", message: String(err) });
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-ink">
      <PageHeader
        eyebrow="Skills"
        title="Create a skill"
        description="Build your own Legalise skill. This page explains the manifest and validates a candidate against the same rules the install path uses — it does not install or sign."
      />

      <section>
        <h2 className="text-sm uppercase tracking-widest text-muted">
          What a skill is
        </h2>
        <p className="mt-2 text-sm text-muted">
          A skill is a signed, governed unit of legal work. Its manifest
          declares what it may touch; the runtime enforces those declarations on
          every call, and every run lands in the matter record. Skills are
          installed at the workspace and enabled per matter.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Required manifest fields
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {REQUIRED_FIELDS.map((f) => (
            <div key={f.field}>
              <dt className="font-mono text-xs text-ink">{f.field}</dt>
              <dd className="text-xs text-muted">{f.what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          Each permission set declares its <span className="font-mono">reads</span> /{" "}
          <span className="font-mono">writes</span>, <span className="font-mono">gates</span>,{" "}
          <span className="font-mono">advice_tier_max</span>, and the{" "}
          <span className="font-mono">audit_events</span> it emits — that
          declaration is what the runtime gates and the audit trail records.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Validate a manifest
        </h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          spellCheck={false}
          placeholder='{ "schema_version": "2.0.0", "id": "...", "version": "...", "publisher": "...", "visibility": "...", "runtime": "...", "entrypoint": {...}, "capabilities": [...] }'
          className="mt-3 w-full rounded-md border border-rule bg-paper px-3 py-2 font-mono text-xs"
          data-testid="manifest-input"
        />
        <button
          type="button"
          onClick={onValidate}
          disabled={result.kind === "busy" || !text.trim()}
          className="mt-3 inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-50"
        >
          {result.kind === "busy" ? "Validating…" : "Validate"}
        </button>

        {result.kind === "parse_error" && (
          <p className="mt-3 text-sm text-seal" data-testid="validate-parse-error">
            {result.message}
          </p>
        )}
        {result.kind === "error" && (
          <p className="mt-3 text-sm text-seal">{result.message}</p>
        )}
        {result.kind === "validated" && result.result.valid && (
          <p className="mt-3 text-sm text-ink" data-testid="validate-ok">
            Valid — this manifest passes the same checks the install path runs.
            Sign and install it locally (below) to use it.
          </p>
        )}
        {result.kind === "validated" && !result.result.valid && (
          <div className="mt-3" data-testid="validate-errors">
            <p className="text-sm text-seal">
              {result.result.errors.length} validation error
              {result.result.errors.length === 1 ? "" : "s"}:
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {result.result.errors.map((e, i) => (
                <li key={i}>
                  <span className="font-mono text-muted">{e.path || "/"}</span>
                  {" — "}
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Sign &amp; install locally
        </h2>
        <p className="mt-2 text-sm text-muted">
          A skill must be <span className="text-ink">signed</span> before it can
          be installed — signing is a deploy-time / CLI step, not done in the
          browser. Once your manifest validates, sign it and install it with the
          Legalise CLI, then it appears under Reference skills. See the
          skill-authoring docs in the repository for the exact commands.
        </p>
      </section>
    </div>
  );
}
