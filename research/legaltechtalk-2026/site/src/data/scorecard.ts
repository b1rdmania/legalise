// Single data source for the site: /public/data/companies.json — the scorecard
// merged with each company's dossier (scores+justifications, facts, red flags,
// cited sources). Regenerate from dataset/ + dossiers/ if the research changes.

export interface ScoreDim {
  score: number;
  justification: string;
}
export interface Source {
  url: string;
  accessed: string;
  what_it_supports: string;
}
export type Tier = "scorecard" | "featured" | "parked";

export interface Company {
  id: string;
  name: string;
  cat: string;
  site: string;
  // Editorial tier: the 20 that carry the screen ("scorecard"), the four read
  // outside the table ("featured" — Moritz, Cicero, KomplyAI, ACT), and the
  // rest-of-the-floor parking lot ("parked"). Absent = scorecard.
  tier?: Tier;
  comp: number;
  conf: "low" | "medium" | "high" | string;
  verdict: string;
  U: number;
  T: number;
  I: number;
  D: number;
  X: number;
  Tm: number;
  scores: Record<string, ScoreDim>;
  facts: Record<string, string | string[]>;
  red_flags: string[];
  sources: Source[];
}

export async function loadCompanies(): Promise<Company[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/companies.json`);
  if (!res.ok) throw new Error(`companies.json: ${res.status}`);
  const rows = (await res.json()) as Company[];
  return rows.slice().sort((a, b) => b.comp - a.comp);
}

export const tierOf = (c: Company): Tier => c.tier ?? "scorecard";
export const byTier = (rows: Company[], tier: Tier): Company[] =>
  rows.filter((c) => tierOf(c) === tier);

// Thesis-2 cohort (read on the regulated-firm lens, not the interop rubric).
export const THESIS2_IDS = new Set(["K56", "S25"]); // Moritz, Cicero

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

export function nichesIn(rows: Company[]): { cat: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.cat, (counts.get(r.cat) ?? 0) + 1);
  return NICHE_ORDER.filter((c) => counts.has(c)).map((c) => ({
    cat: c,
    count: counts.get(c)!,
  }));
}

// Pretty labels + order for the dossier facts block on a detail page.
export const FACT_LABEL: [string, string][] = [
  ["founded", "Founded"],
  ["hq", "HQ"],
  ["total_funding", "Total funding"],
  ["last_round", "Last round"],
  ["lead_investor", "Lead investor"],
  ["headcount", "Headcount"],
  ["customers", "Customers"],
  ["integrations", "Integrations"],
  ["agentic_interop", "Agentic / interop"],
  ["tech_model", "Tech model"],
  ["pricing", "Pricing"],
  ["name_collision_check", "Name-collision check"],
];

export const DIM_LABEL: [string, string][] = [
  ["uniqueness", "Uniqueness"],
  ["thesis_fit", "Thesis-fit"],
  ["investability", "Investability"],
  ["defensibility", "Defensibility"],
  ["interoperability", "Interoperability"],
  ["team", "Team"],
];
