import type { ReactNode } from "react";

/**
 * Auth shell — light Standing Order alignment (DESIGN.md P27).
 * Ruled eyebrow row above the title (masthead tier, 0.3em), then the
 * heading and a bordered card. Quiet by design: no monument headline,
 * no seal — the registrar's desk, not the register itself.
 */
export function AuthCard({
  eyebrow,
  heading,
  intro,
  children,
}: {
  eyebrow?: string;
  heading: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
      {eyebrow && (
        <div className="mb-8 flex items-baseline justify-between border-b border-ink pb-2">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
            {eyebrow}
          </p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-ink">
            Legalise
          </p>
        </div>
      )}
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight2 text-ink mb-4 leading-[1.1]">
        {heading}
      </h1>
      {intro && <p className="prose-p mb-8">{intro}</p>}
      <div className="border border-rule p-6 sm:p-8">{children}</div>
    </div>
  );
}

/** Form field with a ledger-tier label (0.18em — the dl-label tier). */
export function LedgerField({
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
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
        {label}
        {hint && (
          <span className="ml-2 text-xs normal-case tracking-normal">
            ({hint})
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
