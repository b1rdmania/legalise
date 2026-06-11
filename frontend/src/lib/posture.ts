// User-facing posture vocabulary. The backend enum (A_cleared /
// B_mixed / C_paused) is untouched — audit rows and API payloads keep
// the raw value. Presentation collapses it to two states:
// Active (A_cleared, B_mixed) and Paused (C_paused).

export function posturePaused(p: string): boolean {
  return p === "C_paused";
}

export function postureLabel(p: string): "Active" | "Paused" {
  return posturePaused(p) ? "Paused" : "Active";
}

export const POSTURE_DOT_COLOR = {
  active: "#3F7A5A",
  paused: "#8B0000",
} as const;

export function postureDot(p: string): string {
  return posturePaused(p) ? POSTURE_DOT_COLOR.paused : POSTURE_DOT_COLOR.active;
}
