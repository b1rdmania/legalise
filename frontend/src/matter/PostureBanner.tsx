/**
 * PostureBanner.
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
 *               does NOT bypass the posture check — InvocationContext
 *               is built from user.role only, not from is_superuser)
 *   C_paused  : banner ALWAYS — even admins can't run on paused matters
 *
 * Superusers see a "Change posture" admin shortcut rendered by
 * `ChangePostureControl` below; non-admins do not see it.
 */

import { useState } from "react";
import type { CurrentUser } from "../lib/api";
import { postureLabel, posturePaused } from "../lib/posture";

type Posture = "A_cleared" | "B_mixed" | "C_paused" | string;

interface Props {
  posture: Posture;
  user: CurrentUser | null;
  // When the firm role hierarchy is dormant (default
  // hosted/eval mode), B_mixed does NOT require qualified_solicitor, so
  // the role-blocker banner is suppressed. C_paused still always shows
  // (it's a hard stop, not a role tier). Defaults to true (enforced) so
  // omitting it preserves firm-mode behaviour for existing callers/tests.
  firmRoleGatesEnabled?: boolean;
  // Admin posture change. Optional so non-matter
  // callers (tests, future surfaces) can omit. When provided AND
  // the viewer is a superuser, an inline "Change posture" control
  // renders inside the banner. The callback receives the new
  // posture string and is responsible for the PATCH + refetch.
  onChangePosture?: (next: Posture) => Promise<void>;
}

// Only `qualified_solicitor` satisfies B_mixed in the substrate.
// `workspace_admin` / `is_superuser` is NOT a bypass —
// posture_gate.check_posture compares POSTURE_POLICY[posture] against
// the actor_role string only. Anything else here would diverge from
// substrate behaviour.
const ROLE_THAT_SATISFIES_B_MIXED = "qualified_solicitor";

// Display words for the substrate role tokens (ALLOWED_ROLES,
// lib/api/admin.ts). Banner copy ONLY — role comparisons above and
// anything sent to the API keep the raw token. This banner renders
// role copy only in firm-role-gated mode (dormant on hosted).
const ROLE_DISPLAY_WORDS: Record<string, string> = {
  solicitor: "solicitor",
  qualified_solicitor: "qualified solicitor",
  workspace_admin: "workspace admin",
};

function roleDisplayWord(role: string): string {
  return ROLE_DISPLAY_WORDS[role] ?? role.replace(/_/g, " ");
}

export function PostureBanner({
  posture,
  user,
  firmRoleGatesEnabled = true,
  onChangePosture,
}: Props) {
  const adminCanChange =
    onChangePosture !== undefined && user?.is_superuser === true;

  // A_cleared is the no-banner case. Anyone authenticated may run; the
  // banner is intentionally silent.
  if (posture === "A_cleared") return null;

  // C_paused is the always-banner case. Even admins see it.
  if (posture === "C_paused") {
    return (
      <BannerShell tone="paused" badge="C_paused" badgeLabel={postureLabel("C_paused")}>
        <p className="font-medium text-ink">
          AI is paused on this matter. No skills can run regardless of role.
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
    // Dormant mode: B_mixed doesn't enforce the firm role
    // hierarchy, so any authenticated user runs it; no blocker banner.
    if (!firmRoleGatesEnabled) return null;
    const satisfies = !!user && user.role === ROLE_THAT_SATISFIES_B_MIXED;
    if (satisfies) return null;

    return (
      <BannerShell tone="mixed" badge="B_mixed" badgeLabel={postureLabel("B_mixed")}>
        <p className="font-medium text-ink">
          Only qualified solicitors can run skills on this matter.
        </p>
        <p className="mt-1 text-sm text-muted">
          Requires the {roleDisplayWord(ROLE_THAT_SATISFIES_B_MIXED)} role.
          {user && <> Your role: {roleDisplayWord(user.role)}.</>}
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
        Unknown privilege <code className="tech-token text-xs">{posture}</code>.
        Skill runs will fail until the matter privilege state is
        recognised.
      </p>
    </BannerShell>
  );
}

// ---------------------------------------------------------------------------
// Banner shell — colour-coded by tone.
// ---------------------------------------------------------------------------

// Admin-only pause/resume toggle. Wired against the existing
// `PATCH /api/matters/{slug}/privilege` via the onChangePosture
// callback. One action: paused matters resume to B_mixed; anything
// else pauses to C_paused. Banner re-renders against the new posture
// once the parent refetches the matter.
function ChangePostureControl({
  current,
  onChange,
}: {
  current: Posture;
  onChange: (next: Posture) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const paused = posturePaused(current);
  const next: Posture = paused ? "B_mixed" : "C_paused";
  const label = paused ? "Resume AI" : "Pause AI on this matter";

  const onSubmit = async () => {
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
      <button
        type="button"
        data-testid="change-posture-submit"
        onClick={onSubmit}
        disabled={submitting}
        className="inline-flex items-center border border-ink px-3 py-1 text-xs text-ink hover:bg-seal hover:border-seal hover:text-paper transition-colors disabled:opacity-50"
      >
        {submitting ? "Submitting…" : label}
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
      className={`mb-6 rounded-card border px-4 py-3 ${toneClasses}`}
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
