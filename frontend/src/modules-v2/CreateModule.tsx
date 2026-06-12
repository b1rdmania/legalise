/**
 * /modules/create — Create Module v1 (validate-and-explain, NOT a
 * visual builder).
 *
 * Helps a developer/operator understand what a module is, what its
 * manifest must declare, and whether a candidate manifest validates —
 * using the SAME validator as the add-skill path (read-only; no DB write,
 * ceremony, trust, or audit). Signing stays deploy-time / CLI: this page
 * explains a module must be signed before adding and points at the
 * local tooling. In-app signing is a future module-DX phase.
 */

import { useState } from "react";
import {
  validateManifest,
  type ValidateManifestResult,
} from "../lib/api";
import { PageHeader } from "../ui/primitives";
import { SectionRule } from "../ui/certificate";

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
        title="Create a skill"
        description="Build your own Legalise skill. This page explains the manifest and validates a candidate against the same rules the add-skill path uses — it does not add or sign."
      />

      <section>
        <SectionRule label="What a skill is" />
        <p className="mt-2 text-sm text-muted">
          A skill is a signed, governed unit of legal work. Its manifest
          declares what it may touch; the runtime enforces those declarations on
          every call, and every run lands in the matter record. Skills are
          added at the workspace and enabled per matter.
        </p>
      </section>

      <section className="mt-8">
        <SectionRule label="Required manifest fields" />
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {REQUIRED_FIELDS.map((f) => (
            <div key={f.field}>
              <dt className="tech-token text-xs text-ink">{f.field}</dt>
              <dd className="text-xs text-muted">{f.what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          Each permission set declares its <span className="tech-token">reads</span> /{" "}
          <span className="tech-token">writes</span>, <span className="tech-token">gates</span>,{" "}
          <span className="tech-token">advice_tier_max</span>, and the{" "}
          <span className="tech-token">audit_events</span> it emits — that
          declaration is what the runtime gates and the audit trail records.
        </p>
      </section>

      <section className="mt-8">
        <SectionRule label="Validate a manifest" />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          spellCheck={false}
          placeholder='{ "schema_version": "2.0.0", "id": "...", "version": "...", "publisher": "...", "visibility": "...", "runtime": "...", "entrypoint": {...}, "capabilities": [...] }'
          className="mt-3 w-full rounded-md border border-rule bg-paper px-3 py-2 tech-token text-xs"
          data-testid="manifest-input"
        />
        <button
          type="button"
          onClick={onValidate}
          disabled={result.kind === "busy" || !text.trim()}
          className="mt-3 inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-seal disabled:opacity-50"
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
            Valid — this manifest passes the same checks the add-skill path runs.
            Sign and add it locally (below) to use it.
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
                  <span className="tech-token text-muted">{e.path || "/"}</span>
                  {" — "}
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-8">
        <SectionRule label="Sign & add locally" />
        <p className="mt-2 text-sm text-muted">
          A skill must be <span className="text-ink">signed</span> before it can
          be added — signing is a deploy-time / CLI step, not done in the
          browser. Once your manifest validates, sign it and add it with the
          Legalise CLI, then it appears under Reference skills. See the
          skill-authoring docs in the repository for the exact commands.
        </p>
      </section>
    </div>
  );
}
