// User-facing AI-access vocabulary. The backend enum (A_cleared /
// B_mixed / C_paused) is untouched — audit rows and API payloads keep
// the raw value. This is presentation only.
//
// The three values are an *AI access* axis (which models may run on the
// matter's content), distinct from the case lifecycle status
// (open/settlement/closed/archived). Earlier copy collapsed A_cleared and
// B_mixed both to "Active", which read as a second status word; the labels
// below keep the three states meaningful and distinct.

export function posturePaused(p: string): boolean {
  return p === "C_paused";
}

export function postureLabel(p: string): string {
  switch (p) {
    case "A_cleared":
      return "Cloud cleared";
    case "B_mixed":
      return "Mixed (default)";
    case "C_paused":
      return "Paused (no AI)";
    default:
      return "Unknown";
  }
}

// One-line plain explanation of what each AI-access state means.
export function postureExplain(p: string): string {
  switch (p) {
    case "A_cleared":
      return "Cleared for the cloud — any model may run on this matter's content.";
    case "B_mixed":
      return "Default access — models may run, with a qualified-solicitor check when firm roles are enforced.";
    case "C_paused":
      return "No model may run on this matter's content.";
    default:
      return "Unrecognised AI-access state — model runs will fail until it is set.";
  }
}

export const POSTURE_DOT_COLOR = {
  active: "#3F7A5A",
  paused: "#8B0000",
} as const;

export function postureDot(p: string): string {
  return posturePaused(p) ? POSTURE_DOT_COLOR.paused : POSTURE_DOT_COLOR.active;
}
