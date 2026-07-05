// Supervisor reviews + professional sign-offs over matter artifacts.
// Moved verbatim from `lib/api.ts` (Fluff C1 / audit M2.1).

import { API, apiFetch, jsonOrThrow } from "./_core";

// ---------------------------------------------------------------------------
// Supervisor Review v1 — review/approval over a matter artifact
// ---------------------------------------------------------------------------

export type ReviewState =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "overridden";

export type ReviewDecision = "approve" | "reject" | "request_changes" | "override";

export interface SupervisorReview {
  id: string;
  matter_id: string;
  artifact_id: string;
  invocation_id: string;
  module_id: string;
  capability_id: string;
  kind: string;
  artifact_hash: string;
  state: ReviewState;
  requested_by_id: string;
  requested_at: string;
  decided_by_id: string | null;
  decided_at: string | null;
  note: string | null;
}

export const listSupervisorReviews = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/reviews`).then((r) =>
    jsonOrThrow<{ matter_id: string; reviews: SupervisorReview[] }>(r),
  );

// Artifact kinds the backend supervisor-review API accepts. Mirrors
// `backend/app/models/matter_review.py:REVIEW_ELIGIBLE_KINDS`. Keep these
// in sync — the frontend only offers "Request review" for kinds the
// backend will accept (no dead buttons).
export const REVIEW_ELIGIBLE_KINDS: readonly string[] = [
  "findings_pack",
  "skill_response",
  "chat_draft",
];

export const requestReview = (slug: string, artifactId: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifact_id: artifactId }),
  }).then((r) => jsonOrThrow<SupervisorReview>(r));

// ---------------------------------------------------------------------------
// Professional Sign-Off v1 — author sign-off over a matter artifact
// ---------------------------------------------------------------------------

export type SignoffDecision = "signed" | "signed_with_observations" | "rejected";

export interface Signoff {
  id: string;
  matter_id: string;
  artifact_id: string;
  invocation_id: string;
  module_id: string;
  capability_id: string;
  kind: string;
  artifact_hash: string;
  decision: SignoffDecision;
  reasoning: string | null;
  signer_id: string;
  signer_email: string | null;
  signer_is_author: boolean;
  signed_at: string;
  is_current: boolean;
  // Review window (M13): seconds between the signer's first open of the
  // sign surface and the decision. null = no open-event (legacy) —
  // render "—", never 0.
  review_seconds: number | null;
  // Recorded at sign time against the artifact's word count. Recorded,
  // not blocked — surfaces show a seal-toned "signed in 94s" note.
  implausible_speed: boolean;
}

// Plain-English review duration. null/undefined renders "—" (a missing
// open-event is not a 0-second review).
export function formatReviewDuration(
  seconds: number | null | undefined,
): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 120) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hours`;
}

// Record the first open of an artifact's sign surface (starts the
// review window; idempotent server-side — first open wins).
export const openSignoffReview = (slug: string, artifactId: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/signoffs/review-open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifact_id: artifactId }),
  }).then((r) => jsonOrThrow<{ artifact_id: string; recorded: boolean }>(r));

export const createSignoff = (
  slug: string,
  body: { artifact_id: string; decision: SignoffDecision; reasoning?: string },
) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/signoffs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => jsonOrThrow<Signoff>(r));

export const listSignoffs = (slug: string) =>
  apiFetch(`${API}/matters/${encodeURIComponent(slug)}/signoffs`).then((r) =>
    jsonOrThrow<{ matter_id: string; signoffs: Signoff[] }>(r),
  );

export const getSignoff = (slug: string, signoffId: string) =>
  apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/signoffs/${encodeURIComponent(signoffId)}`,
  ).then((r) => jsonOrThrow<Signoff>(r));

export const decideReview = (
  slug: string,
  reviewId: string,
  decision: ReviewDecision,
  note?: string,
) =>
  apiFetch(
    `${API}/matters/${encodeURIComponent(slug)}/reviews/${encodeURIComponent(reviewId)}/decide`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: note ?? null }),
    },
  ).then((r) => jsonOrThrow<SupervisorReview>(r));
