import type { ReactNode } from "react";
import { providerLabel } from "../lib/api/_core";

export const inputCls =
  "bg-paper border border-rule rounded-item px-4 py-3 text-[16px] sm:text-[17px] focus:border-ink focus:outline-hidden transition-colors min-h-[44px] font-sans text-ink w-full";

export const primaryBtn =
  "bg-ink text-paper rounded-item px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed";

export const secondaryBtn =
  "border border-rule rounded-item px-4 py-2 hover:border-ink hover:bg-wash transition-colors text-sm font-medium min-h-[44px] text-ink disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center";

// Inline banner for the canonical `provider_key_missing` 422 error.
// Border + text tokens only. No fill, no radius, no shadow. The deep
// link to `/settings/keys` is what makes this a one-click resolution
// instead of a dead-end blob.
export function ProviderKeyMissingBanner({ provider }: { provider: string }) {
  const label = providerLabel(provider);
  return (
    <div className="border border-ink p-3 my-3 text-sm">
      <div className="font-semibold text-ink mb-1">{label} API key required</div>
      <p className="leading-relaxed text-prose m-0">
        No model key yet. Add your {label} key in Settings to get written
        answers — or walk the guided demo.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <a
          href="/settings/keys"
          className="text-ink underline underline-offset-2 hover:text-prose transition-colors"
        >
          Open Settings
        </a>
        <a
          href="/guided-demo"
          className="text-muted underline underline-offset-2 hover:text-prose transition-colors"
        >
          Walk the demo
        </a>
      </div>
    </div>
  );
}

export function ErrorCallout({ message, compact = false }: { message: string; compact?: boolean }) {
  const { status, body } = parseError(message);
  return (
    <div className={`bg-paper border border-seal ${compact ? "p-3" : "p-4"} text-seal text-sm my-3`}>
      <div className="font-semibold mb-1">
        Error{status ? ` · HTTP ${status}` : ""}
      </div>
      <p className="leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  );
}

export function parseError(err: string): { status: string | null; body: string } {
  const m = err.match(/^Error:\s*(\d{3})\s+([^:]+):\s*(.*)$/s);
  if (!m) {
    return { status: null, body: err.replace(/^Error:\s*/, "") };
  }
  const [, status, , raw] = m;
  let body = raw.trim();
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.detail === "string") body = parsed.detail;
  } catch {
    // not JSON
  }
  return { status, body };
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-rule bg-paper px-8 py-14 text-center max-w-md mx-auto">
      <div className="mx-auto mb-6 text-muted/40" aria-hidden="true">
        {icon ?? <EmptyStateMark />}
      </div>
      <h3 className="font-redaction35 text-[22px] leading-tight text-ink">{title}</h3>
      {body && (
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-prose">{body}</p>
      )}
      {action && (
        <div className="mt-8 flex items-center justify-center gap-3">{action}</div>
      )}
    </div>
  );
}

// Default restrained mark for EmptyState — a single thin-stroke document
// glyph in currentColor so it inherits the muted wrapper tint. Never the
// seal (wax red); an empty state is neutral, not a verdict.
function EmptyStateMark() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mx-auto"
    >
      <path d="M7 3.5h6.5L18 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
      <path d="M13 3.75V8h4.25" />
    </svg>
  );
}

export function LoadingLine({ label }: { label: string }) {
  return (
    <p className="tech-token text-xs text-muted flex items-center gap-2">
      <InlineSpinner />
      {label}
    </p>
  );
}

export function InlineSpinner() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-2">
      <span className="eyebrow-sm">
        {label}
        {hint && <span className="text-muted text-xs normal-case tracking-normal ml-2">({hint})</span>}
      </span>
      {children}
    </label>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="border border-rule rounded-item text-ink text-[10px] tech-token uppercase tracking-track2 px-2 py-0.5 inline-flex items-center gap-1.5">
      {children}
    </span>
  );
}

export function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "tech-token uppercase text-[11px] tracking-track2 font-bold border-b-2 h-full pt-1 -mb-px transition-colors " +
        (active
          ? "text-ink border-ink"
          : "text-muted hover:text-ink border-transparent")
      }
    >
      {children}
    </button>
  );
}

// Label-over-value pair — cross-screen duplication consolidated
// here (InstallCeremony, ArtifactDetail, AdminUserDetail each had
// an identical local `DT`). No visual change. Used by detail/record
// pages for metadata grids.
export function DescItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

// The one logged-in page-header pattern. Bold-sans
// tracking-tight2 heading (serif is retired on operator/admin/settings
// screens per the ratified design rules; serif stays for marketing /
// editorial only). eyebrow + h1 + optional mono sub-id + optional
// description + optional right-aligned actions slot. `children` renders
// below the header for an optional metadata strip.
// Standing Order masthead (DESIGN.md P26, revised P30): the headline in
// Redaction display carries the page alone — the ruled eyebrow row was
// cut 2026-06-12 (it only repeated the page name above the monument).
// `display` escalates to the monument tier for section homes.
export function PageHeader({
  title,
  whisper,
  subId,
  description,
  actions,
  display = false,
  children,
}: {
  title: ReactNode;
  whisper?: string;
  subId?: string;
  description?: ReactNode;
  actions?: ReactNode;
  display?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1
            className={
              display
                ? "font-redaction35 text-[52px] leading-none tracking-tight2 text-ink sm:text-[64px]"
                : "text-[26px] leading-tight tracking-tight2 text-ink sm:text-[30px]"
            }
          >
            {title}
          </h1>
          {whisper && (
            <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-muted">
              {whisper}
            </p>
          )}
          {subId && <p className="mt-2 tech-token text-xs text-muted">{subId}</p>}
          {description && (
            <p
              className={
                display
                  ? "mt-7 max-w-xl text-sm leading-relaxed text-prose"
                  : "mt-3 max-w-2xl text-sm leading-relaxed text-muted"
              }
            >
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0 pb-1">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
