/**
 * Audit Decision Timeline (AT-1) — the load-bearing row-class mapping.
 *
 * Several actions match more than one class; `classifyEntry` returns the
 * FIRST match in a pinned precedence so the taxonomy never drifts. Real
 * action strings verified against the backend. There is deliberately NO
 * `artifact` class: artifact writes emit no audit row, and the only rows
 * carrying an artifact_id are `review.*` — the artifact is surfaced as an
 * invocation-chain output node, not a timeline class. See
 * the AUDIT_DECISION_TIMELINE_V1_PLAN plan (repo history).
 */

import type { TimelineEntry } from "../lib/api";

export type RowClass =
  | "error"
  | "signed"
  | "review"
  | "blocked_denied"
  | "grant_role"
  | "advice"
  | "model"
  | "module"
  | "system";

// Classes that count as "decision points" (the foreground lane).
// Sign-off is THE decision event — promote it hard.
const DECISION_CLASSES: ReadonlySet<RowClass> = new Set<RowClass>([
  "error",
  "signed",
  "review",
  "blocked_denied",
  "grant_role",
  "advice",
]);

const GRANT_ROLE_ACTIONS: ReadonlySet<string> = new Set([
  "module.grant.created",
  "module.grant.revoked",
  "user.role.changed",
]);

function hasError(entry: TimelineEntry): boolean {
  if (entry.action.endsWith(".failed")) return true;
  const p = entry.payload ?? {};
  return "error" in p || "error_code" in p;
}

export function classifyEntry(entry: TimelineEntry): RowClass {
  const a = entry.action;

  // 1. error — failure provenance, regardless of which subsystem.
  if (hasError(entry)) return "error";

  // 2. signed — Professional Sign-Off decision rows (output.signed /
  //    .signed_with_observations / .sign_rejected). Highest non-error
  //    priority: the solicitor taking ownership is the matter's key event,
  //    and output.sign_rejected must classify here, not as blocked_denied.
  if (a.startsWith("output.")) return "signed";

  // 3. review — the supervised-autonomy decision rows (review.rejected
  //    is a review, not a denial: review precedes blocked_denied).
  if (a.startsWith("review.")) return "review";

  // 3. blocked_denied — a gate refused (module.ceremony.rejected,
  //    module.denied, advice_boundary.*.blocked/.denied, etc.).
  if (a.endsWith(".blocked") || a.endsWith(".denied") || a.endsWith(".rejected")) {
    return "blocked_denied";
  }

  // 4. grant_role — permission / role changes (exact real action names).
  if (GRANT_ROLE_ACTIONS.has(a)) return "grant_role";

  // 5. advice — both the audit (check.*) and reconstruction (decision.*)
  //    naming live in the repo; match both.
  if (
    a.startsWith("advice_boundary.check.") ||
    a.startsWith("advice_boundary.decision.")
  ) {
    return "advice";
  }

  // 6. model — model invocations.
  if (a.startsWith("model.")) return "model";

  // 7. module — lifecycle not already caught (install, module.enabled, …).
  if (a.startsWith("module.")) return "module";

  // 8. system — http.*, reads, routine state-machine transitions, the
  //    reconstruction-viewed self-row, etc.
  return "system";
}

/**
 * Decision points are the foreground lane. Class membership covers most;
 * `module.enabled` is a module-class row that is also a decision (a
 * module was trusted + turned on), so it is included explicitly.
 */
export function isDecisionRow(entry: TimelineEntry): boolean {
  if (entry.action === "module.enabled") return true;
  return DECISION_CLASSES.has(classifyEntry(entry));
}

/** The invocation a row belongs to, for chain grouping. */
export function invocationIdOf(entry: TimelineEntry): string | null {
  const fromPayload = entry.payload?.["invocation_id"];
  if (typeof fromPayload === "string") return fromPayload;
  const fromRefs = entry.refs?.["invocation_id"];
  if (typeof fromRefs === "string") return fromRefs;
  return null;
}

/** Artifact a `review.*` row references, for the chain output node. */
export function artifactIdOf(entry: TimelineEntry): string | null {
  const v = entry.payload?.["artifact_id"];
  return typeof v === "string" ? v : null;
}
