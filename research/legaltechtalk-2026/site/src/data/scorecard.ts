// Shape of each row in /public/data/scorecard.json (copied from
// dataset/scorecard.json — the single source of truth for the screen).
export interface ScoreRow {
  id: string;
  name: string;
  cat: string;
  site: string; // official site, or a working source link where the site is unconfirmed
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
  return (await res.json()) as ScoreRow[];
}

// Thesis-2 cohort (read on the regulated-firm lens, not the interop rubric).
export const THESIS2_IDS = new Set(["K56", "S25"]); // Moritz, Cicero

// Display labels + ordering for the niche selector. Order = how the buckets
// read down the page (rails first, dead-ish last).
export const NICHE_LABEL: Record<string, string> = {
  "infra-platform": "Infrastructure",
  knowledge: "Knowledge / KM",
  research: "Legal research",
  "drafting-redline": "Drafting & redline",
  clm: "CLM",
  ip: "IP",
  ediscovery: "eDiscovery & litigation",
  "agentic-horizontal": "Agentic / horizontal",
  "compliance-risk": "Compliance & risk",
  "practice-mgmt": "Practice management",
  "services-consulting": "Services / firm model",
  other: "Other",
};

const NICHE_ORDER = Object.keys(NICHE_LABEL);

export function nicheLabel(cat: string): string {
  return NICHE_LABEL[cat] ?? cat;
}

// Niches present in the data, in display order, with counts.
export function nichesIn(rows: ScoreRow[]): { cat: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.cat, (counts.get(r.cat) ?? 0) + 1);
  return NICHE_ORDER.filter((c) => counts.has(c)).map((c) => ({
    cat: c,
    count: counts.get(c)!,
  }));
}
