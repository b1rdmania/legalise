/**
 * Certificate + ledger primitives — the register idiom (DESIGN.md P27).
 *
 * Lifted exactly from /register (CounselRegister.tsx), the ratified
 * reference: content renders as certificates and ledger entries, placed
 * like a clerk filled them in. Three letterspacing tiers, never mixed:
 * masthead rows 0.3em, card eyebrows 0.25em, ledger labels 0.18em.
 */

import type { ReactNode } from "react";

/** Ruled section header — a schedule line: small caps left, count/right
 * counterpart in ink. */
export function SectionRule({
  label,
  right,
}: {
  label: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-ink pb-2">
      <h2 className="text-[10px] uppercase tracking-[0.25em] text-muted">
        {label}
      </h2>
      {right && (
        <span className="text-[10px] uppercase tracking-[0.25em] text-ink">
          {right}
        </span>
      )}
    </div>
  );
}

/** Certificate card shell. `tone="seal"` for revoked/refused entries. */
export function CertCard({
  children,
  tone = "ink",
  testid,
}: {
  children: ReactNode;
  tone?: "ink" | "seal";
  testid?: string;
}) {
  return (
    <article
      className={
        "relative border bg-paper p-5 " +
        (tone === "seal" ? "border-seal/40" : "border-ink/70")
      }
      data-testid={testid}
    >
      {children}
    </article>
  );
}

/** Index eyebrow row: "SKILL 01" left, category/state right. */
export function CertEyebrow({
  left,
  right,
  rightTone = "muted",
}: {
  left: ReactNode;
  right?: ReactNode;
  rightTone?: "muted" | "ink" | "seal";
}) {
  const toneCls =
    rightTone === "seal"
      ? "text-seal"
      : rightTone === "ink"
        ? "text-ink"
        : "text-muted";
  return (
    <div className="flex items-baseline justify-between">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted">{left}</p>
      {right != null && (
        <p className={"text-[10px] uppercase tracking-[0.25em] " + toneCls}>
          {right}
        </p>
      )}
    </div>
  );
}

/** Ledger label/value row inside a certificate dl. */
export function LedgerRow({
  label,
  children,
  tone = "muted",
}: {
  label: ReactNode;
  children: ReactNode;
  tone?: "muted" | "ink" | "seal";
}) {
  const toneCls =
    tone === "seal" ? "text-seal" : tone === "ink" ? "text-ink" : "";
  return (
    <div className={"flex justify-between gap-3 " + toneCls}>
      <dt className="uppercase tracking-[0.18em]">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

/** Solid ink bands — what the entry may read/write, as material. */
export function InkBands({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      {values.length === 0 ? (
        <span className="text-[11px] text-muted">—</span>
      ) : (
        <span
          className="flex min-w-0 flex-1 flex-wrap gap-1"
          title={values.join(", ")}
        >
          {values.map((v) => (
            <span
              key={v}
              className="h-2.5 bg-ink"
              style={{ width: `${Math.min(96, 18 + v.length * 4)}px` }}
              title={v}
            />
          ))}
        </span>
      )}
    </div>
  );
}

/** Numbered ledger line for list pages — the admission-scan rhythm. */
export function LedgerLine({
  index,
  label,
  children,
  right,
  testid,
}: {
  index: number;
  label?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  testid?: string;
}) {
  return (
    <div
      className="flex items-baseline gap-4 border-b border-rule/60 py-2.5"
      data-testid={testid}
    >
      <span className="tech-token w-10 shrink-0 text-[11px] text-muted">
        {String(index).padStart(4, "0")}
      </span>
      {label != null && (
        <span className="w-40 shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
      )}
      <span className="min-w-0 flex-1 text-sm text-ink">{children}</span>
      {right != null && <span className="shrink-0">{right}</span>}
    </div>
  );
}

/** Closing colophon — one institutional sentence, only where earned. */
export function Colophon({ children }: { children: ReactNode }) {
  return (
    <p className="mt-14 border-t border-rule pt-3 text-[10px] uppercase tracking-[0.2em] text-muted">
      {children}
    </p>
  );
}
