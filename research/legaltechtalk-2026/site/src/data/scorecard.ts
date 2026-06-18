// Shape of each row in /public/data/scorecard.json (copied from
// dataset/scorecard.json — the single source of truth for the screen).
export interface ScoreRow {
  id: string;
  name: string;
  cat: string;
  U: number; // Uniqueness
  T: number; // Thesis-fit (weighted x2 in composite)
  I: number; // Investability
  D: number; // Defensibility
  X: number; // Interoperability
  Tm: number; // Team
  comp: number; // composite /35
  conf: "low" | "medium" | "high" | string;
  verdict: string;
}

export async function loadScorecard(): Promise<ScoreRow[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/scorecard.json`);
  if (!res.ok) throw new Error(`scorecard.json: ${res.status}`);
  const rows = (await res.json()) as ScoreRow[];
  return rows.slice().sort((a, b) => b.comp - a.comp);
}

// Thesis-2 cohort (read on the regulated-firm lens, not the interop rubric).
export const THESIS2_IDS = new Set(["K56", "S25"]); // Moritz, Cicero
