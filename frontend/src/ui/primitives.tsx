import type { ReactNode } from "react";

export const inputCls =
  "bg-paper border border-rule rounded-item px-4 py-3 text-[16px] sm:text-[17px] focus:border-ink focus:outline-none transition-colors min-h-[44px] font-sans text-ink w-full";

export const primaryBtn =
  "bg-ink text-paper rounded-item px-4 py-2 hover:bg-seal transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed";

// Inline banner for the canonical `provider_key_missing` 422 error.
// Border + text tokens only. No fill, no radius, no shadow. The deep
// link to `#/settings` is what makes this a one-click resolution
// instead of a dead-end blob.
export function ProviderKeyMissingBanner({ provider }: { provider: string }) {
  const label = provider.charAt(0).toUpperCase() + provider.slice(1);
  return (
    <div className="border border-ink p-3 my-3 text-sm">
      <div className="font-semibold text-ink mb-1">{label} API key required</div>
      <p className="leading-relaxed text-prose m-0">
        Add a {label} API key in Settings to use this model. Or switch to stub-echo for the demo.
      </p>
      <a
        href="/settings"
        className="inline-block mt-2 text-ink underline underline-offset-2 hover:text-prose transition-colors"
      >
        Open Settings
      </a>
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
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-rule p-8 text-center max-w-2xl mx-auto">
      <div className="eyebrow mb-3">Empty</div>
      <div className="text-sm font-semibold text-ink">{title}</div>
      {body && <p className="text-sm text-prose mt-2">{body}</p>}
      {action && <div className="mt-6 flex items-center justify-center gap-3">{action}</div>}
    </div>
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
// Standing Order masthead (DESIGN.md P26). Every page opens like a page
// from the register: a ruled eyebrow line (letterspaced small caps left,
// optional counterpart right), then the headline in Redaction display.
// `display` escalates to the monument tier for section homes.
export function PageHeader({
  eyebrow,
  eyebrowRight,
  title,
  whisper,
  subId,
  description,
  actions,
  display = false,
  children,
}: {
  eyebrow?: string;
  eyebrowRight?: string;
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
      {eyebrow && (
        <div className="flex items-baseline justify-between border-b border-ink pb-2">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
            {eyebrow}
          </p>
          {eyebrowRight && (
            <p className="text-[10px] uppercase tracking-[0.3em] text-ink">
              {eyebrowRight}
            </p>
          )}
        </div>
      )}
      <div className="mt-5 flex items-end justify-between gap-4">
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
