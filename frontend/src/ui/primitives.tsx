import type { ReactNode } from "react";

export const inputCls =
  "bg-paper border border-rule px-4 py-3 text-[16px] sm:text-[17px] focus:border-ink focus:outline-none transition-colors min-h-[44px] font-sans text-ink w-full";

export const primaryBtn =
  "bg-ink text-paper px-4 py-2 hover:bg-black transition-colors text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed";

export function ErrorCallout({ message, compact = false }: { message: string; compact?: boolean }) {
  const { status, body } = parseError(message);
  return (
    <div className={`bg-red-50 border border-red-700 ${compact ? "p-3" : "p-4"} text-red-700 text-sm my-3`}>
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

export function LoadingLine({ label }: { label: string }) {
  return (
    <p className="font-mono text-xs text-muted flex items-center gap-2">
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
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="eyebrow-sm">
        {label}
        {hint && <span className="text-muted text-xs normal-case tracking-normal ml-2">({hint})</span>}
      </span>
      {children}
    </label>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colour =
    status === "open"
      ? "#00A35C"
      : status === "closed" || status === "paused"
        ? "#D9304F"
        : "#181818";
  return (
    <span
      className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono uppercase text-[10px] tracking-track2 font-bold"
      style={{ borderColor: colour, color: colour }}
    >
      <span className="w-1.5 h-1.5" style={{ backgroundColor: colour }} />
      {status.toUpperCase()}
    </span>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="border border-rule text-ink text-[10px] font-mono uppercase tracking-track2 px-2 py-0.5 inline-flex items-center gap-1.5">
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
        "font-mono uppercase text-[11px] tracking-track2 font-bold border-b-2 h-full pt-1 -mb-px transition-colors " +
        (active
          ? "text-ink border-ink"
          : "text-muted hover:text-ink border-transparent")
      }
    >
      {children}
    </button>
  );
}
