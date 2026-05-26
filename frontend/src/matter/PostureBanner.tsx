/**
 * Phase 14 C — PostureBanner.
 *
 * Renders the (actor role × matter posture) cell from POSTURE_GATE_UX.md.
 *
 * Substrate truth (app/core/posture_gate.py:POSTURE_POLICY):
 *   A_cleared → any_authenticated
 *   B_mixed   → qualified_solicitor
 *   C_paused  → matter_paused (sentinel; nobody satisfies)
 *
 * UX matrix (rows = actor role; cols = posture):
 *   A_cleared : no banner, full UI
 *   B_mixed   : banner unless actor.role === "qualified_solicitor"
 *               (substrate uses the role string verbatim; is_superuser
 *               does NOT bypass the posture check — Phase 10 builds
 *               InvocationContext.actor_role from user.role only, not
 *               from is_superuser)
 *   C_paused  : banner ALWAYS — even admins can't run on paused matters
 *
 * Reviewer-narrow per the Phase 14 C brief: no reconstruction deep-link
 * here. The matter audit reconstruction view is still a placeholder
 * (Phase 14 E target). When E lands, the banner can carry the link the
 * spec describes without churn. Tracked as BACKEND_GAP_AUDIT 14-B-#2 +
 * Phase 14 E.
 *
 * No "Change posture" admin shortcut here either — that's a Phase 14 G
 * settings touchpoint per the build plan.
 */

import { useState } from "react";
import type { CurrentUser } from "../lib/api";

type Posture = "A_cleared" | "B_mixed" | "C_paused" | string;

interface Props {
  posture: Posture;
  user: CurrentUser | null;
  // Phase 14 G — admin posture change. Optional so non-matter
  // callers (tests, future surfaces) can omit. When provided AND
  // the viewer is a superuser, an inline "Change posture" control
  // renders inside the banner. The callback receives the new
  // posture string and is responsible for the PATCH + refetch.
  onChangePosture?: (next: Posture) => Promise<void>;
}

const ALL_POSTURES: ReadonlyArray<Posture> = [
  "A_cleared",
  "B_mixed",
  "C_paused",
];

// Only `qualified_solicitor` satisfies B_mixed in the substrate.
// `workspace_admin` / `is_superuser` is NOT a bypass — Phase 10
// posture_gate.check_posture compares POSTURE_POLICY[posture] against
// the actor_role string only. Anything else here would diverge from
// substrate behaviour (ACCEPTANCE.md §14).
const ROLE_THAT_SATISFIES_B_MIXED = "qualified_solicitor";

export function PostureBanner({ posture, user, onChangePosture }: Props) {
  const adminCanChange =
    onChangePosture !== undefined && user?.is_superuser === true;

  // A_cleared is the no-banner case. Anyone authenticated may run; the
  // banner is intentionally silent.
  if (posture === "A_cleared") return null;

  // C_paused is the always-banner case. Even admins see it.
  if (posture === "C_paused") {
    return (
      <BannerShell tone="paused" badge="C_paused" badgeLabel="Paused">
        <p className="font-medium text-ink">
          This matter is paused. No modules can run regardless of role.
        </p>
        <p className="mt-1 text-sm text-muted">
          Requires <code className="font-mono text-xs">matter_paused</code>{" "}
          (no role satisfies — this is a hard stop).
        </p>
        {adminCanChange && (
          <ChangePostureControl
            current={posture}
            onChange={onChangePosture!}
          />
        )}
      </BannerShell>
    );
  }

  // B_mixed (or any unknown posture — fail closed). Only show the
  // banner when the actor's role doesn't satisfy the requirement.
  if (posture === "B_mixed") {
    const satisfies = !!user && user.role === ROLE_THAT_SATISFIES_B_MIXED;
    if (satisfies) return null;

    return (
      <BannerShell tone="mixed" badge="B_mixed" badgeLabel="Mixed">
        <p className="font-medium text-ink">
          This matter is marked <code className="font-mono text-xs">B_mixed</code>.
          Only qualified solicitors can run modules.
        </p>
        <p className="mt-1 text-sm text-muted">
          Requires{" "}
          <code className="font-mono text-xs">qualified_solicitor</code>.
          {user && (
            <>
              {" "}
              Your role:{" "}
              <code className="font-mono text-xs">{user.role}</code>.
            </>
          )}
        </p>
        {adminCanChange && (
          <ChangePostureControl
            current={posture}
            onChange={onChangePosture!}
          />
        )}
      </BannerShell>
    );
  }

  // Unknown posture — show a generic block. Substrate-side
  // POSTURE_POLICY would default to deny, so the UI mirrors that.
  return (
    <BannerShell tone="mixed" badge={posture} badgeLabel="Unknown">
      <p className="font-medium text-ink">
        Unknown posture <code className="font-mono text-xs">{posture}</code>.
        Module invocation will fail until the matter posture is
        recognised.
      </p>
    </BannerShell>
  );
}

// ---------------------------------------------------------------------------
// Banner shell — colour-coded by tone.
// ---------------------------------------------------------------------------

// Phase 14 G — admin-only inline posture change. Wired against the
// existing `PATCH /api/matters/{slug}/privilege` (Phase 4) via the
// onChangePosture callback. Banner re-renders against the new
// posture once the parent refetches the matter.
function ChangePostureControl({
  current,
  onChange,
}: {
  current: Posture;
  onChange: (next: Posture) => Promise<void>;
}) {
  const [next, setNext] = useState<Posture>(current);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    if (next === current) return;
    setErr(null);
    setSubmitting(true);
    try {
      await onChange(next);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2" data-testid="change-posture-control">
      <label className="flex flex-col text-xs text-muted">
        <span className="mb-1">Change posture</span>
        <select
          data-testid="change-posture-select"
          value={next}
          onChange={(e) => setNext(e.target.value as Posture)}
          className="rounded-md border border-line bg-paper px-3 py-1 text-sm text-ink"
        >
          {ALL_POSTURES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        data-testid="change-posture-submit"
        onClick={onSubmit}
        disabled={next === current || submitting}
        className="inline-flex items-center rounded-md border border-ink px-3 py-1 text-xs text-ink hover:bg-ink hover:text-paper disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Apply"}
      </button>
      {err && (
        <p className="text-xs text-seal" data-testid="change-posture-error">
          {err}
        </p>
      )}
    </div>
  );
}

function BannerShell({
  tone,
  badge,
  badgeLabel,
  children,
}: {
  tone: "mixed" | "paused";
  badge: string;
  badgeLabel: string;
  children: React.ReactNode;
}) {
  const toneClasses =
    tone === "paused"
      ? "border-seal/40 bg-seal/5"
      : "border-amber-500/40 bg-amber-50";
  const pillClasses =
    tone === "paused"
      ? "bg-seal text-paper"
      : "bg-amber-500 text-paper";
  return (
    <div
      data-testid="posture-banner"
      className={`mb-6 rounded-md border px-4 py-3 ${toneClasses}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${pillClasses}`}
          title={badge}
        >
          {badgeLabel}
        </span>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
