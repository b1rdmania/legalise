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

// Distinct tone per AI-access state, so the three read apart at a glance
// (postureDot only distinguishes paused from active, collapsing cleared and
// mixed into the same green). cleared = green, mixed = neutral/amber,
// paused = seal/red. Used for the readable text chip in the matter list.
export const POSTURE_TONE = {
  A_cleared: { color: "#3F7A5A", bg: "rgba(63,122,90,0.10)" },
  B_mixed: { color: "#8A6D1A", bg: "rgba(138,109,26,0.10)" },
  C_paused: { color: "#8B0000", bg: "rgba(139,0,0,0.10)" },
} as const;

export function postureTone(p: string): { color: string; bg: string } {
  if (p === "A_cleared") return POSTURE_TONE.A_cleared;
  if (posturePaused(p)) return POSTURE_TONE.C_paused;
  return POSTURE_TONE.B_mixed;
}
