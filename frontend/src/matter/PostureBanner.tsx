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
 *   B_mixed   : banner ONLY when actor is not qualified_solicitor/admin
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

import type { CurrentUser } from "../lib/api";

type Posture = "A_cleared" | "B_mixed" | "C_paused" | string;

interface Props {
  posture: Posture;
  user: CurrentUser | null;
}

const ROLES_THAT_SATISFY_B_MIXED = new Set([
  "qualified_solicitor",
  "workspace_admin",
]);

export function PostureBanner({ posture, user }: Props) {
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
          {user?.is_superuser && (
            <>
              {" "}
              An administrator can unpause via{" "}
              <code className="font-mono text-xs">
                PATCH /api/matters/&#123;slug&#125;/privilege
              </code>
              .
            </>
          )}
        </p>
      </BannerShell>
    );
  }

  // B_mixed (or any unknown posture — fail closed). Only show the
  // banner when the actor's role doesn't satisfy the requirement.
  if (posture === "B_mixed") {
    const satisfies =
      !!user &&
      (user.is_superuser || ROLES_THAT_SATISFY_B_MIXED.has(user.role));
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
