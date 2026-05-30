import { useEffect, useMemo, useRef, useState } from "react";
import {
  SUBMISSION_CAPABILITIES,
  SUBMISSION_TRUST_POSTURES,
  type ModuleSubmissionRequest,
  type ModuleSubmissionResponse,
  type SubmissionCapability,
  type SubmissionConfig,
  type SubmissionTrustPosture,
  getSubmissionConfig,
  submitModule,
} from "../lib/api";
import { Footer } from "../ui/Footer";

// Pre-login community submission surface — distinct from /modules/create.
//
//   /modules/submit (this file): anyone submits a SKILL.md for review;
//                                 backend opens a draft PR on the
//                                 b1rdmania/claude-for-uk-legal repo.
//   /modules/create:              operator manifest validator used to
//                                 install a manifest you already have.
//
// They serve different audiences and are not redundant — do not collapse.
//
// Turnstile widget + per-IP token bucket gate the POST. SKILL.md
// frontmatter is synthesised authoritatively server-side; this client
// preview is a UX aid only.

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const KEBAB_HINT = "kebab-case: lowercase letters, digits, hyphens";

function isKebab(v: string): boolean {
  return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(v);
}

function isGhHandle(v: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(v);
}

// Tiny client-side YAML stringify for the preview pane. Not
// wire-format-identical with the backend's `frontmatter.dump` - the
// backend is authoritative. This exists so the submitter can sanity-
// check shape before sending.
function previewYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") {
    // Quote any string that contains characters that would confuse YAML.
    if (/[:#\n"'\\-]/.test(value) || value.trim() !== value || value === "") {
      return JSON.stringify(value);
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return (
      "\n" +
      value
        .map((item) => `${pad}- ${previewYaml(item, indent + 1).replace(/^\n/, "")}`)
        .join("\n")
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return (
      "\n" +
      entries
        .map(([k, v]) => `${pad}${k}: ${previewYaml(v, indent + 1).replace(/^\n/, "")}`)
        .join("\n")
    );
  }
  return JSON.stringify(value);
}

function previewSkillMd(form: {
  plugin_name: string;
  skill_name: string;
  description: string;
  body_markdown: string;
  capabilities: SubmissionCapability[];
  trust_posture: SubmissionTrustPosture;
  submitter_handle: string;
  submitter_contact: string;
}): string {
  const fm = {
    name: form.skill_name || "(skill-name)",
    plugin: form.plugin_name || "(plugin-name)",
    description: form.description || "(description)",
    trust_posture: form.trust_posture,
    capabilities: form.capabilities,
    submitter: {
      handle: form.submitter_handle || "(handle)",
      contact: form.submitter_contact || "(contact)",
    },
  };
  const yamlBody = Object.entries(fm)
    .map(([k, v]) => `${k}: ${previewYaml(v, 1).replace(/^\n/, "")}`)
    .join("\n");
  return `---\n${yamlBody}\n---\n${form.body_markdown || "(body markdown)"}\n`;
}

type ErrorState =
  | { kind: "none" }
  | { kind: "validation"; message: string }
  | { kind: "disabled"; message: string }
  | { kind: "captcha"; message: string }
  | { kind: "rate_limited"; retryAfter: number }
  | { kind: "upstream"; status: number; message: string }
  | { kind: "unknown"; message: string };

export function SubmitModule() {
  const [config, setConfig] = useState<SubmissionConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [pluginName, setPluginName] = useState("");
  const [skillName, setSkillName] = useState("");
  const [description, setDescription] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [capabilities, setCapabilities] = useState<SubmissionCapability[]>([]);
  const [trustPosture, setTrustPosture] = useState<SubmissionTrustPosture>("experimental");
  const [submitterHandle, setSubmitterHandle] = useState("");
  const [submitterContact, setSubmitterContact] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ModuleSubmissionResponse | null>(null);
  const [errorState, setErrorState] = useState<ErrorState>({ kind: "none" });
  const widgetMountRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Load config + the Turnstile script. The site key from
  // `VITE_TURNSTILE_SITE_KEY` is preferred at build time; the backend
  // also surfaces it via /config so a missing build env doesn't break
  // the live deploy.
  useEffect(() => {
    getSubmissionConfig()
      .then(setConfig)
      .catch((e: unknown) => setConfigError(e instanceof Error ? e.message : String(e)));
  }, []);

  const siteKey =
    (config?.turnstile_site_key as string | null | undefined) ||
    (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ||
    null;

  // Inject the Turnstile script tag once and render the widget when
  // the script + site key are both available.
  useEffect(() => {
    if (!config?.submission_enabled || !siteKey) return;
    const existing = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    if (!existing) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      if (!window.turnstile || !widgetMountRef.current) {
        window.setTimeout(tryRender, 200);
        return;
      }
      if (widgetIdRef.current !== null) return;
      widgetIdRef.current = window.turnstile.render(widgetMountRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setTurnstileToken(token),
        "error-callback": () => setTurnstileToken(null),
        "expired-callback": () => setTurnstileToken(null),
        theme: "light",
      });
    };
    tryRender();
    return () => {
      cancelled = true;
    };
  }, [config?.submission_enabled, siteKey]);

  const previewText = useMemo(
    () =>
      previewSkillMd({
        plugin_name: pluginName,
        skill_name: skillName,
        description,
        body_markdown: bodyMarkdown,
        capabilities,
        trust_posture: trustPosture,
        submitter_handle: submitterHandle,
        submitter_contact: submitterContact,
      }),
    [
      pluginName,
      skillName,
      description,
      bodyMarkdown,
      capabilities,
      trustPosture,
      submitterHandle,
      submitterContact,
    ],
  );

  const formValid =
    isKebab(pluginName) &&
    isKebab(skillName) &&
    description.trim().length >= 10 &&
    bodyMarkdown.trim().length >= 20 &&
    isGhHandle(submitterHandle) &&
    submitterContact.trim().length >= 3;

  const canSubmit = !submitting && formValid && !!turnstileToken;

  const toggleCapability = (c: SubmissionCapability) => {
    setCapabilities((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !turnstileToken) return;
    setSubmitting(true);
    setErrorState({ kind: "none" });
    const body: ModuleSubmissionRequest = {
      plugin_name: pluginName,
      skill_name: skillName,
      description: description.trim(),
      body_markdown: bodyMarkdown,
      capabilities,
      trust_posture: trustPosture,
      submitter_handle: submitterHandle,
      submitter_contact: submitterContact.trim(),
      turnstile_token: turnstileToken,
    };
    try {
      const resp = await submitModule(body);
      setResult(resp);
    } catch (err) {
      const e = err as Error & { status?: number; detail?: unknown };
      const detail = (e.detail as { error?: string; message?: string; retry_after_seconds?: number } | null) ?? null;
      if (e.status === 503) {
        setErrorState({
          kind: "disabled",
          message: detail?.message || "Module submissions are currently closed.",
        });
      } else if (e.status === 403) {
        setErrorState({
          kind: "captcha",
          message: detail?.message || "Captcha verification failed. Try again.",
        });
        // reset widget so the user can re-solve
        if (window.turnstile && widgetIdRef.current !== null) {
          window.turnstile.reset(widgetIdRef.current);
        }
        setTurnstileToken(null);
      } else if (e.status === 429) {
        setErrorState({
          kind: "rate_limited",
          retryAfter: detail?.retry_after_seconds ?? 3600,
        });
      } else if (e.status === 502) {
        setErrorState({
          kind: "upstream",
          status: 502,
          message: detail?.message || "GitHub rejected the request.",
        });
      } else if (e.status === 400 || e.status === 422) {
        setErrorState({
          kind: "validation",
          message: detail?.message || "Submission was rejected by the server.",
        });
      } else {
        setErrorState({ kind: "unknown", message: e.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (configError) {
    return (
      <SubmitShell>
        <p className="prose-p">
          Could not load submission configuration. Try again later.
        </p>
      </SubmitShell>
    );
  }

  if (config === null) {
    return (
      <SubmitShell>
        <p className="text-sm text-muted">Loading…</p>
      </SubmitShell>
    );
  }

  if (!config.submission_enabled) {
    return (
      <SubmitShell>
        <div className="bg-wash p-8 border-l-4 border-ink my-4">
          <p className="text-sm font-medium m-0">
            Module submissions are currently closed.
          </p>
          <p className="text-sm text-muted mt-2 mb-0">
            Visit the catalogue of installed skills, or fork{" "}
            <a
              href="https://github.com/b1rdmania/claude-for-uk-legal"
              target="_blank"
              rel="noreferrer"
              className="text-[#0066CC] hover:underline"
            >
              claude-for-uk-legal
            </a>{" "}
            and open a PR directly.
          </p>
        </div>
      </SubmitShell>
    );
  }

  if (result) {
    return (
      <SubmitShell>
        <div className="bg-wash p-8 border-l-4 border-ink my-4">
          <h2 className="text-2xl font-bold tracking-tight2 text-ink mb-3">
            Submission opened
          </h2>
          <p className="prose-p mb-4">
            A draft pull request is open against{" "}
            <code className="font-mono text-sm">b1rdmania/claude-for-uk-legal</code>.
            The maintainer reviews submissions before merge.
          </p>
          <a
            href={result.pull_request_url}
            target="_blank"
            rel="noreferrer"
            className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] inline-flex items-center"
          >
            View on GitHub →
          </a>
          <p className="text-xs text-muted mt-4 mb-0 font-mono">
            branch: {result.branch_name}
          </p>
        </div>
      </SubmitShell>
    );
  }

  return (
    <SubmitShell>
      <p className="prose-p mb-8">
        Propose a new skill for the{" "}
        <code className="font-mono text-sm">claude-for-uk-legal</code>{" "}
        catalogue. The form opens a draft pull request. Declared capabilities
        are surfaced for review; v0.1 does not enforce them at the call site.
      </p>

      <form className="grid grid-cols-1 lg:grid-cols-2 gap-10" onSubmit={onSubmit}>
        <div className="space-y-6">
          <Field
            label="Plugin name"
            hint={KEBAB_HINT}
            invalid={pluginName !== "" && !isKebab(pluginName)}
          >
            <input
              type="text"
              value={pluginName}
              onChange={(e) => setPluginName(e.target.value)}
              placeholder="uk-litigation-legal"
              className="w-full border border-rule px-3 py-2 text-sm font-mono"
              required
            />
          </Field>

          <Field
            label="Skill name"
            hint={KEBAB_HINT}
            invalid={skillName !== "" && !isKebab(skillName)}
          >
            <input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="letter-before-action"
              className="w-full border border-rule px-3 py-2 text-sm font-mono"
              required
            />
          </Field>

          <Field
            label="One-line description"
            hint="Min 10 characters, max 500."
            invalid={description !== "" && description.trim().length < 10}
          >
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Drafts a UK letter before action with CPR pre-action context."
              className="w-full border border-rule px-3 py-2 text-sm"
              maxLength={500}
              required
            />
          </Field>

          <Field
            label="SKILL.md body (markdown)"
            hint="Min 20 characters. The backend wraps it in YAML frontmatter authoritatively - do not paste your own frontmatter here."
            invalid={bodyMarkdown !== "" && bodyMarkdown.trim().length < 20}
          >
            <textarea
              value={bodyMarkdown}
              onChange={(e) => setBodyMarkdown(e.target.value)}
              placeholder={"# Letter Before Action\n\n## When to use\n…\n"}
              className="w-full border border-rule px-3 py-2 text-sm font-mono min-h-[180px]"
              rows={8}
              required
            />
          </Field>

          <Field label="Declared capabilities" hint="Closed set; for review, not enforced.">
            <div className="grid grid-cols-2 gap-2">
              {SUBMISSION_CAPABILITIES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm font-mono">
                  <input
                    type="checkbox"
                    checked={capabilities.includes(c)}
                    onChange={() => toggleCapability(c)}
                    className="h-4 w-4"
                  />
                  {c}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Trust posture" hint="Declarative only in v0.1.">
            <div className="flex flex-wrap gap-4">
              {SUBMISSION_TRUST_POSTURES.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm font-mono">
                  <input
                    type="radio"
                    name="trust_posture"
                    value={p}
                    checked={trustPosture === p}
                    onChange={() => setTrustPosture(p)}
                    className="h-4 w-4"
                  />
                  {p}
                </label>
              ))}
            </div>
          </Field>

          <Field
            label="Your GitHub handle"
            hint="For credit on the draft PR."
            invalid={submitterHandle !== "" && !isGhHandle(submitterHandle)}
          >
            <input
              type="text"
              value={submitterHandle}
              onChange={(e) => setSubmitterHandle(e.target.value)}
              placeholder="octocat"
              className="w-full border border-rule px-3 py-2 text-sm font-mono"
              required
            />
          </Field>

          <Field label="Contact" hint="Email or any contact line for the PR description.">
            <input
              type="text"
              value={submitterContact}
              onChange={(e) => setSubmitterContact(e.target.value)}
              placeholder="octocat@example.com"
              className="w-full border border-rule px-3 py-2 text-sm"
              required
            />
          </Field>

          <div className="pt-2">
            <div ref={widgetMountRef} />
            {!siteKey && (
              <p className="text-xs text-muted mt-2">
                Turnstile site key not configured; submissions are
                administratively disabled.
              </p>
            )}
          </div>

          {errorState.kind === "validation" && (
            <ErrorBanner message={errorState.message} />
          )}
          {errorState.kind === "captcha" && (
            <ErrorBanner message={errorState.message} />
          )}
          {errorState.kind === "rate_limited" && (
            <ErrorBanner
              message={`Too many submissions from this network. Try again in ${Math.ceil(
                errorState.retryAfter / 60,
              )} minute(s).`}
            />
          )}
          {errorState.kind === "upstream" && (
            <ErrorBanner message={`GitHub upstream: ${errorState.message}`} />
          )}
          {errorState.kind === "disabled" && (
            <ErrorBanner message={errorState.message} />
          )}
          {errorState.kind === "unknown" && (
            <ErrorBanner message={errorState.message} />
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting…" : "Open draft pull request"}
          </button>
        </div>

        <div>
          <div className="eyebrow font-mono text-muted mb-3">
            PREVIEW · SKILL.md (server is authoritative)
          </div>
          <pre className="bg-wash border border-rule p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto min-h-[300px]">
            {previewText}
          </pre>
        </div>
      </form>
    </SubmitShell>
  );
}

function SubmitShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-10 py-16">
      <div className="max-w-5xl">
        <div className="mb-10">
          <div className="eyebrow font-mono text-muted mb-4">PUBLIC SUBMISSION</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight2 text-ink mb-4 leading-[1.1]">
            Submit a skill to claude-for-uk-legal.
          </h1>
          <p className="text-base text-muted leading-relaxed max-w-2xl">
            This is the public catalogue's submission flow. Submissions open
            as draft pull requests. Maintainer reviews before merge.
          </p>
        </div>
        {children}
        <Footer />
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  invalid,
  children,
}: {
  label: string;
  hint?: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow font-mono text-muted mb-1.5 block">{label}</span>
      {children}
      {hint && (
        <span
          className={`text-xs mt-1 block ${
            invalid ? "text-seal" : "text-muted"
          }`}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-paper border border-rule border-l-[3px] border-l-seal px-4 py-3 text-sm text-seal">
      {message}
    </div>
  );
}
